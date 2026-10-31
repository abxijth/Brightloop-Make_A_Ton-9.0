"""Subscription creation, editing, status transitions and response shaping."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors import AppError
from app.models import (
    Customer,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    Subscription,
    SubscriptionLine,
    SubscriptionStatus,
    ValueType,
)
from app.schemas.subscription import (
    SubscriptionCreate,
    SubscriptionLineIn,
    SubscriptionLineOut,
    SubscriptionOut,
    SubscriptionTemplateLineOut,
    SubscriptionTemplateOut,
    SubscriptionUpdate,
)
from app.services.numbering import next_subscription_number

_CENT = Decimal("0.01")

_EDITABLE_STATUSES = {
    SubscriptionStatus.DRAFT,
    SubscriptionStatus.QUOTATION,
    SubscriptionStatus.CONFIRMED,
}

_ALLOWED_TRANSITIONS: dict[SubscriptionStatus, tuple[SubscriptionStatus, ...]] = {
    SubscriptionStatus.DRAFT: (
        SubscriptionStatus.QUOTATION,
        SubscriptionStatus.CONFIRMED,
        SubscriptionStatus.CLOSED,
    ),
    SubscriptionStatus.QUOTATION: (
        SubscriptionStatus.CONFIRMED,
        SubscriptionStatus.CLOSED,
    ),
    SubscriptionStatus.CONFIRMED: (
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.CLOSED,
    ),
    SubscriptionStatus.ACTIVE: (SubscriptionStatus.CLOSED,),
    SubscriptionStatus.CLOSED: (),
}


def _money(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def _invalid(message: str, field: str) -> AppError:
    return AppError(
        "Please fix the highlighted fields.",
        code="validation_error",
        status_code=400,
        fields={field: message},
    )


def _get_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise _invalid("Unknown customer", "customer_id")
    return customer


def _get_plan(db: Session, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None or not plan.is_active:
        raise _invalid("Unknown or inactive plan", "plan_id")
    return plan


def _validate_plan_dates(plan: Plan, start: date) -> None:
    if start < plan.available_from:
        raise _invalid(
            f"This plan is available from {plan.available_from.isoformat()}",
            "start_date",
        )
    if plan.available_to is not None and start > plan.available_to:
        raise _invalid(
            f"This plan is only available until {plan.available_to.isoformat()}",
            "start_date",
        )


def _validate_expiry(start: date, expiry: date | None) -> None:
    if expiry is not None and expiry < start:
        raise _invalid("Expiry date must be on or after the start date", "expiry_date")


def _resolve_line(db: Session, line: SubscriptionLineIn) -> SubscriptionLine:
    product = db.get(Product, line.product_id)
    if product is None or not product.is_active:
        raise _invalid("Unknown or inactive product", "lines")

    variant = None
    if line.variant_id is not None:
        variant = db.get(ProductVariant, line.variant_id)
        if variant is None or variant.product_id != product.id:
            raise _invalid("Variant does not belong to that product", "lines")

    if line.unit_price is not None:
        unit_price = _money(line.unit_price)
    else:
        extra = variant.extra_price if variant is not None else Decimal("0")
        unit_price = _money(product.sales_price + extra)

    return SubscriptionLine(
        product=product,
        variant=variant,
        quantity=line.quantity,
        unit_price=unit_price,
    )


def _resolve_lines(
    db: Session, line_inputs: list[SubscriptionLineIn], plan: Plan
) -> list[SubscriptionLine]:
    if not line_inputs:
        raise _invalid("Add at least one line", "lines")

    lines = [_resolve_line(db, line) for line in line_inputs]
    quantity = sum(line.quantity for line in lines)
    if quantity < plan.min_quantity:
        raise _invalid(
            f"This plan needs at least {plan.min_quantity} unit(s)",
            "lines",
        )
    return lines


def allowed_transitions(
    subscription: Subscription,
) -> tuple[SubscriptionStatus, ...]:
    return _ALLOWED_TRANSITIONS.get(subscription.status, ())


def can_close(subscription: Subscription, *, as_customer: bool) -> bool:
    if subscription.status == SubscriptionStatus.CLOSED:
        return False
    if not as_customer:
        return True
    plan = subscription.plan
    return (
        subscription.status == SubscriptionStatus.ACTIVE
        and plan is not None
        and plan.allow_early_close
    )


def create_subscription(
    db: Session,
    body: SubscriptionCreate,
    *,
    today: date | None = None,
) -> Subscription:
    customer = _get_customer(db, body.customer_id)

    template = None
    if body.template_id is not None:
        template = db.scalar(
            select(QuotationTemplate)
            .where(QuotationTemplate.id == body.template_id)
            .options(selectinload(QuotationTemplate.lines))
        )
        if template is None:
            raise AppError("Template not found.", code="not_found", status_code=404)

    plan_id = body.plan_id if body.plan_id is not None else (
        template.plan_id if template is not None else None
    )
    if plan_id is None:
        raise _invalid("Choose a template or a plan", "plan_id")
    plan = _get_plan(db, plan_id)
    _validate_plan_dates(plan, body.start_date)

    expiry = body.expiry_date
    if expiry is None and template is not None:
        expiry = (today or date.today()) + timedelta(days=template.validity_days)
    _validate_expiry(body.start_date, expiry)

    if body.lines is not None:
        line_inputs = body.lines
    elif template is not None:
        line_inputs = [
            SubscriptionLineIn(
                product_id=line.product_id,
                variant_id=line.variant_id,
                quantity=line.quantity,
            )
            for line in template.lines
        ]
    else:
        line_inputs = []

    subscription = Subscription(
        number=next_subscription_number(db),
        customer=customer,
        plan=plan,
        status=SubscriptionStatus.DRAFT,
        start_date=body.start_date,
        expiry_date=expiry,
        payment_terms_days=body.payment_terms_days,
        next_billing_date=None,
        lines=_resolve_lines(db, line_inputs, plan),
    )
    db.add(subscription)
    db.flush()
    return subscription


def update_subscription(
    db: Session, subscription: Subscription, body: SubscriptionUpdate
) -> Subscription:
    if subscription.status not in _EDITABLE_STATUSES:
        raise AppError(
            "Only draft, quotation or confirmed subscriptions can be edited.",
            code="invalid_status",
            status_code=400,
        )

    if body.customer_id is not None:
        subscription.customer = _get_customer(db, body.customer_id)

    plan = subscription.plan
    if body.plan_id is not None:
        plan = _get_plan(db, body.plan_id)
        subscription.plan = plan

    start = body.start_date if body.start_date is not None else subscription.start_date
    _validate_plan_dates(plan, start)

    expiry = subscription.expiry_date
    if "expiry_date" in body.model_fields_set:
        expiry = body.expiry_date
    _validate_expiry(start, expiry)

    subscription.start_date = start
    subscription.expiry_date = expiry
    if body.payment_terms_days is not None:
        subscription.payment_terms_days = body.payment_terms_days

    if body.lines is not None:
        lines = _resolve_lines(db, body.lines, plan)
        subscription.lines.clear()
        subscription.lines.extend(lines)
    elif sum(line.quantity for line in subscription.lines) < plan.min_quantity:
        raise _invalid(
            f"This plan needs at least {plan.min_quantity} unit(s)",
            "lines",
        )

    db.flush()
    return subscription


def transition_subscription(
    db: Session,
    subscription: Subscription,
    target: SubscriptionStatus,
    *,
    today: date | None = None,
) -> Subscription:
    current = subscription.status
    if target == current:
        raise AppError(
            f"Subscription is already {current.value}.",
            code="invalid_transition",
            status_code=400,
            fields={"target_status": "Already in that status"},
        )
    if target not in allowed_transitions(subscription):
        raise AppError(
            f"Cannot move a {current.value} subscription to {target.value}.",
            code="invalid_transition",
            status_code=400,
            fields={"target_status": "Choose one of the allowed next steps"},
        )

    if target == SubscriptionStatus.ACTIVE:
        _validate_plan_dates(subscription.plan, subscription.start_date)
        if subscription.expiry_date is not None and subscription.expiry_date < (
            today or date.today()
        ):
            raise _invalid("This subscription has already expired", "target_status")
        subscription.next_billing_date = subscription.start_date

    subscription.status = target
    db.flush()
    return subscription


def close_subscription(
    db: Session, subscription: Subscription, *, as_customer: bool = False
) -> Subscription:
    if subscription.status == SubscriptionStatus.CLOSED:
        raise AppError(
            "Subscription is already closed.",
            code="invalid_status",
            status_code=400,
        )
    if as_customer:
        plan = subscription.plan
        if (
            subscription.status != SubscriptionStatus.ACTIVE
            or plan is None
            or not plan.allow_early_close
        ):
            raise AppError(
                "This plan does not allow early close.",
                code="not_allowed",
                status_code=403,
            )

    subscription.status = SubscriptionStatus.CLOSED
    db.flush()
    return subscription


def _line_out(line: SubscriptionLine) -> SubscriptionLineOut:
    product = line.product
    line_total = _money(line.unit_price * line.quantity)
    tax = product.tax
    if tax is None:
        tax_name = None
        tax_rate = None
        tax_amount = _money(Decimal("0"))
    elif tax.type == ValueType.PERCENT:
        tax_name = tax.name
        tax_rate = tax.value
        tax_amount = _money(line_total * tax.value / Decimal("100"))
    else:
        tax_name = tax.name
        tax_rate = None
        tax_amount = _money(tax.value)

    variant = line.variant
    return SubscriptionLineOut(
        id=line.id,
        product_id=line.product_id,
        product_name=product.name,
        variant_id=line.variant_id,
        variant_label=(
            f"{variant.attribute}: {variant.value}" if variant is not None else None
        ),
        quantity=line.quantity,
        unit_price=line.unit_price,
        line_total=line_total,
        tax_name=tax_name,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
    )


def subscription_out(
    subscription: Subscription, *, as_customer: bool = False
) -> SubscriptionOut:
    lines = [
        _line_out(line)
        for line in sorted(subscription.lines, key=lambda line: line.id or 0)
    ]
    subtotal = _money(sum((line.line_total for line in lines), Decimal("0")))
    tax_total = _money(sum((line.tax_amount for line in lines), Decimal("0")))
    plan = subscription.plan

    return SubscriptionOut(
        id=subscription.id,
        number=subscription.number,
        customer_id=subscription.customer_id,
        customer_name=subscription.customer.name,
        customer_email=subscription.customer.email,
        plan_id=subscription.plan_id,
        plan_name=plan.name,
        billing_period=plan.billing_period,
        plan_allow_early_close=plan.allow_early_close,
        plan_auto_close=plan.auto_close,
        status=subscription.status,
        start_date=subscription.start_date,
        expiry_date=subscription.expiry_date,
        payment_terms_days=subscription.payment_terms_days,
        next_billing_date=subscription.next_billing_date,
        lines=lines,
        subtotal=subtotal,
        tax_total=tax_total,
        total=_money(subtotal + tax_total),
        allowed_transitions=(
            [] if as_customer else list(allowed_transitions(subscription))
        ),
        can_close=can_close(subscription, as_customer=as_customer),
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
    )


def template_out(template: QuotationTemplate) -> SubscriptionTemplateOut:
    return SubscriptionTemplateOut(
        id=template.id,
        name=template.name,
        plan_id=template.plan_id,
        plan_name=template.plan.name,
        validity_days=template.validity_days,
        lines=[
            SubscriptionTemplateLineOut(
                product_id=line.product_id,
                product_name=line.product.name,
                variant_id=line.variant_id,
                variant_label=(
                    f"{line.variant.attribute}: {line.variant.value}"
                    if line.variant is not None
                    else None
                ),
                quantity=line.quantity,
            )
            for line in sorted(template.lines, key=lambda line: line.id or 0)
        ],
    )

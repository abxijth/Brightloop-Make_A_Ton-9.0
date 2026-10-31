"""Small object factories for billing tests.

Not a conftest fixture: tests import these helpers directly so they can build
only the rows each case needs.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.catalog import Plan, Product
from app.models.customer import Customer
from app.models.discount import DiscountRule
from app.models.enums import (
    BillingPeriod,
    DiscountScope,
    SubscriptionStatus,
    ValueType,
)
from app.models.quotation import QuotationTemplate, QuotationTemplateLine
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import Tax
from app.services.numbering import next_subscription_number


def make_customer(
    db: Session, *, name: str = "Acme Ltd", email: str = "billing@acme.test"
) -> Customer:
    customer = Customer(name=name, email=email)
    db.add(customer)
    db.flush()
    return customer


def make_tax(
    db: Session,
    *,
    name: str = "VAT",
    type: ValueType = ValueType.PERCENT,
    value: Decimal = Decimal("20.00"),
) -> Tax:
    tax = Tax(name=name, type=type, value=value, is_active=True)
    db.add(tax)
    db.flush()
    return tax


def make_product(
    db: Session,
    *,
    name: str = "Widget",
    price: Decimal = Decimal("100.00"),
    tax: Tax | None = None,
) -> Product:
    product = Product(
        name=name,
        type="software",
        sales_price=price,
        tax=tax,
        is_active=True,
    )
    db.add(product)
    db.flush()
    return product


def make_discount(
    db: Session,
    *,
    name: str = "Ten percent",
    type: ValueType = ValueType.PERCENT,
    value: Decimal = Decimal("10.00"),
    scope: DiscountScope = DiscountScope.SUBSCRIPTION,
    product: Product | None = None,
    start_date: date = date(2020, 1, 1),
    end_date: date | None = None,
    usage_limit: int | None = None,
    min_purchase: Decimal | None = None,
    min_quantity: int | None = None,
    is_active: bool = True,
) -> DiscountRule:
    rule = DiscountRule(
        name=name,
        type=type,
        value=value,
        scope=scope,
        product_id=product.id if product is not None else None,
        start_date=start_date,
        end_date=end_date,
        usage_limit=usage_limit,
        min_purchase=min_purchase,
        min_quantity=min_quantity,
        is_active=is_active,
    )
    db.add(rule)
    db.flush()
    return rule


def make_plan(
    db: Session,
    *,
    name: str = "Monthly",
    billing_period: BillingPeriod = BillingPeriod.MONTHLY,
    price: Decimal = Decimal("100.00"),
    available_from: date = date(2020, 1, 1),
    available_to: date | None = None,
    auto_close: bool = False,
    allow_early_close: bool = False,
) -> Plan:
    plan = Plan(
        name=name,
        price=price,
        billing_period=billing_period,
        min_quantity=1,
        available_from=available_from,
        available_to=available_to,
        auto_close=auto_close,
        allow_early_close=allow_early_close,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    return plan


def make_template(
    db: Session,
    *,
    plan: Plan,
    lines: list[tuple[Product, int]],
    name: str = "Starter",
    validity_days: int = 30,
) -> QuotationTemplate:
    template = QuotationTemplate(
        name=name,
        plan=plan,
        validity_days=validity_days,
    )
    db.add(template)
    db.flush()

    for product, quantity in lines:
        db.add(
            QuotationTemplateLine(
                template_id=template.id,
                product_id=product.id,
                quantity=quantity,
            )
        )
    db.flush()
    return template


def make_subscription(
    db: Session,
    *,
    customer: Customer,
    plan: Plan,
    lines: list[tuple[Product, int, Decimal]],
    next_billing_date: date | None = None,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    start_date: date | None = None,
    expiry_date: date | None = None,
    payment_terms_days: int = 15,
) -> Subscription:
    subscription = Subscription(
        number=next_subscription_number(db),
        customer_id=customer.id,
        plan_id=plan.id,
        status=status,
        start_date=start_date or next_billing_date or date.today(),
        expiry_date=expiry_date,
        payment_terms_days=payment_terms_days,
        next_billing_date=next_billing_date,
    )
    db.add(subscription)
    db.flush()

    for product, quantity, unit_price in lines:
        db.add(
            SubscriptionLine(
                subscription_id=subscription.id,
                product_id=product.id,
                quantity=quantity,
                unit_price=unit_price,
            )
        )
    db.flush()
    return subscription

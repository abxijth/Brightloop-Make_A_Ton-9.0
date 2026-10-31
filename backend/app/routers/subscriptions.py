"""Subscriptions: list, create, edit, status transitions and close."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import get_current_user, require_staff_or_admin
from app.db import get_db
from app.errors import AppError
from app.models import (
    Customer,
    Plan,
    Product,
    QuotationTemplate,
    QuotationTemplateLine,
    Subscription,
    SubscriptionLine,
    SubscriptionStatus,
    User,
    UserRole,
)
from app.schemas.subscription import (
    SubscriptionCreate,
    SubscriptionOut,
    SubscriptionPage,
    SubscriptionTemplateOut,
    SubscriptionTransition,
    SubscriptionUpdate,
)
from app.services.subscriptions import (
    close_subscription,
    create_subscription,
    subscription_out,
    template_out,
    transition_subscription,
    update_subscription,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
StaffUser = Annotated[User, Depends(require_staff_or_admin)]


def _role(user: User) -> str:
    return getattr(user.role, "value", user.role)


def _customer_scope(user: User) -> int | None:
    """Return the customer id for a portal user, or None for staff/admin."""
    if _role(user) != UserRole.CUSTOMER.value:
        return None
    customer = user.customer
    if customer is None:
        raise AppError(
            "Customer profile not found.",
            code="forbidden",
            status_code=403,
        )
    return customer.id


def _load_subscription(db: Session, subscription_id: int) -> Subscription:
    row = db.scalars(
        select(Subscription)
        .where(Subscription.id == subscription_id)
        .options(
            joinedload(Subscription.customer),
            joinedload(Subscription.plan),
            selectinload(Subscription.lines)
            .joinedload(SubscriptionLine.product)
            .joinedload(Product.tax),
            selectinload(Subscription.lines).joinedload(SubscriptionLine.variant),
        )
    ).unique().one_or_none()
    if row is None:
        raise AppError(
            "Subscription not found.",
            code="not_found",
            status_code=404,
        )
    return row


def _visible_or_404(subscription: Subscription, customer_id: int | None) -> None:
    if customer_id is not None and subscription.customer_id != customer_id:
        # Do not reveal that another customer's subscription exists.
        raise AppError(
            "Subscription not found.",
            code="not_found",
            status_code=404,
        )


@router.get("", response_model=SubscriptionPage)
def list_subscriptions(
    db: DbSession,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    status: SubscriptionStatus | None = None,
    customer_id: int | None = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
):
    own_customer_id = _customer_scope(user)
    query = (
        select(Subscription)
        .join(Customer, Customer.id == Subscription.customer_id)
        .join(Plan, Plan.id == Subscription.plan_id)
    )

    if own_customer_id is not None:
        query = query.where(Subscription.customer_id == own_customer_id)
    elif customer_id is not None:
        query = query.where(Subscription.customer_id == customer_id)

    if status is not None:
        query = query.where(Subscription.status == status)

    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            or_(
                Subscription.number.ilike(like),
                Customer.name.ilike(like),
                Customer.email.ilike(like),
                Plan.name.ilike(like),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    created = Subscription.created_at.asc() if order == "asc" else Subscription.created_at.desc()
    id_order = Subscription.id.asc() if order == "asc" else Subscription.id.desc()
    rows = db.scalars(
        query.order_by(created, id_order)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(
            joinedload(Subscription.customer),
            joinedload(Subscription.plan),
            selectinload(Subscription.lines)
            .joinedload(SubscriptionLine.product)
            .joinedload(Product.tax),
            selectinload(Subscription.lines).joinedload(SubscriptionLine.variant),
        )
    ).unique().all()

    return SubscriptionPage(
        items=[
            subscription_out(row, as_customer=own_customer_id is not None)
            for row in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/templates",
    response_model=list[SubscriptionTemplateOut],
    dependencies=[Depends(require_staff_or_admin)],
)
def list_templates(db: DbSession):
    rows = db.scalars(
        select(QuotationTemplate)
        .options(
            joinedload(QuotationTemplate.plan),
            selectinload(QuotationTemplate.lines).joinedload(
                QuotationTemplateLine.product
            ),
            selectinload(QuotationTemplate.lines).joinedload(
                QuotationTemplateLine.variant
            ),
        )
        .order_by(QuotationTemplate.name, QuotationTemplate.id)
    ).unique().all()
    return [template_out(template) for template in rows]


@router.get("/{subscription_id}", response_model=SubscriptionOut)
def get_subscription(subscription_id: int, db: DbSession, user: CurrentUser):
    own_customer_id = _customer_scope(user)
    subscription = _load_subscription(db, subscription_id)
    _visible_or_404(subscription, own_customer_id)
    return subscription_out(subscription, as_customer=own_customer_id is not None)


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create(body: SubscriptionCreate, db: DbSession, user: StaffUser):
    subscription = create_subscription(db, body)
    db.commit()
    return subscription_out(_load_subscription(db, subscription.id))


@router.patch("/{subscription_id}", response_model=SubscriptionOut)
def update(
    subscription_id: int,
    body: SubscriptionUpdate,
    db: DbSession,
    user: StaffUser,
):
    subscription = _load_subscription(db, subscription_id)
    update_subscription(db, subscription, body)
    db.commit()
    return subscription_out(_load_subscription(db, subscription.id))


@router.post("/{subscription_id}/transition", response_model=SubscriptionOut)
def transition(
    subscription_id: int,
    body: SubscriptionTransition,
    db: DbSession,
    user: StaffUser,
):
    subscription = _load_subscription(db, subscription_id)
    transition_subscription(db, subscription, body.target_status)
    db.commit()
    return subscription_out(_load_subscription(db, subscription.id))


@router.post("/{subscription_id}/close", response_model=SubscriptionOut)
def close(subscription_id: int, db: DbSession, user: CurrentUser):
    own_customer_id = _customer_scope(user)
    subscription = _load_subscription(db, subscription_id)
    _visible_or_404(subscription, own_customer_id)
    close_subscription(db, subscription, as_customer=own_customer_id is not None)
    db.commit()
    return subscription_out(
        _load_subscription(db, subscription.id),
        as_customer=own_customer_id is not None,
    )

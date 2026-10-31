"""Finance dashboard summary (Staff and Admin).

Every figure is one aggregate SQL query, so the endpoint stays fast with
thousands of subscriptions, invoices and payments.
"""

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_staff_or_admin
from app.db import get_db
from app.errors import AppError
from app.models import (
    BillingPeriod,
    Customer,
    Invoice,
    InvoiceStatus,
    Payment,
    Plan,
    Subscription,
    SubscriptionLine,
    SubscriptionStatus,
)
from app.schemas.reports import (
    DashboardSummaryOut,
    MonthlyRevenueOut,
    OverdueInvoiceOut,
)

router = APIRouter(
    prefix="/reports",
    tags=["reports"],
    dependencies=[Depends(require_staff_or_admin)],
)

DbSession = Annotated[Session, Depends(get_db)]

ZERO = Decimal("0")
CENT = Decimal("0.01")

# Factor that turns one billing period's amount into a monthly amount.
_MONTHLY_FACTOR = {
    BillingPeriod.DAILY: Decimal("30"),
    BillingPeriod.WEEKLY: Decimal("52") / Decimal("12"),
    BillingPeriod.MONTHLY: Decimal("1"),
    BillingPeriod.YEARLY: Decimal("1") / Decimal("12"),
}

# Statuses that count as a real (not draft/quotation) subscription.
_LIVE_SUBSCRIPTION = (
    SubscriptionStatus.CONFIRMED,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CLOSED,
)
# Invoices that represent money billed to a customer.
_BILLED_INVOICE = (InvoiceStatus.CONFIRMED, InvoiceStatus.PAID)


def _shift_month(d: date, months: int) -> date:
    idx = d.year * 12 + (d.month - 1) + months
    return date(idx // 12, idx % 12 + 1, 1)


@router.get("/summary", response_model=DashboardSummaryOut)
def dashboard_summary(
    db: DbSession,
    date_from: date | None = Query(default=None, description="Period start (default: first day of this month)."),
    date_to: date | None = Query(default=None, description="Period end, inclusive (default: today)."),
    as_of: date | None = Query(default=None, description="Snapshot date for balances and overdue (default: today)."),
    overdue_limit: Annotated[int, Query(ge=0, le=500)] = 50,
    months: Annotated[int, Query(ge=1, le=24)] = 6,
):
    today = as_of or date.today()
    date_to = date_to or today
    date_from = date_from or date_to.replace(day=1)
    if date_from > date_to:
        raise AppError(
            "date_from must be on or before date_to.",
            code="validation_error",
            status_code=422,
            fields={"date_from": "Must be on or before date_to"},
        )

    # ── Subscriptions ────────────────────────────────────────────────────
    active_subscriptions = db.scalar(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
    ) or 0

    new_subscriptions = db.scalar(
        select(func.count(Subscription.id)).where(
            Subscription.status.in_(_LIVE_SUBSCRIPTION),
            Subscription.start_date >= date_from,
            Subscription.start_date <= date_to,
        )
    ) or 0

    recurring_by_period = db.execute(
        select(
            Plan.billing_period,
            func.coalesce(func.sum(SubscriptionLine.quantity * SubscriptionLine.unit_price), 0),
        )
        .select_from(SubscriptionLine)
        .join(Subscription, Subscription.id == SubscriptionLine.subscription_id)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Plan.billing_period)
    ).all()
    mrr = sum(
        (Decimal(amount) * _MONTHLY_FACTOR[BillingPeriod(period)] for period, amount in recurring_by_period),
        ZERO,
    ).quantize(CENT)

    # ── Money in the period ──────────────────────────────────────────────
    revenue_collected = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.payment_date >= date_from,
            Payment.payment_date <= date_to,
        )
    )
    invoiced_total = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.status.in_(_BILLED_INVOICE),
            Invoice.issue_date >= date_from,
            Invoice.issue_date <= date_to,
        )
    )

    # ── Balances as of `today` ───────────────────────────────────────────
    balance = Invoice.total - Invoice.amount_paid
    outstanding_count, outstanding_amount = db.execute(
        select(func.count(Invoice.id), func.coalesce(func.sum(balance), 0)).where(
            Invoice.status == InvoiceStatus.CONFIRMED
        )
    ).one()

    overdue_filter = (Invoice.status == InvoiceStatus.CONFIRMED, Invoice.due_date < today)
    overdue_count, overdue_amount = db.execute(
        select(func.count(Invoice.id), func.coalesce(func.sum(balance), 0)).where(*overdue_filter)
    ).one()

    overdue_rows = db.execute(
        select(
            Invoice.id,
            Invoice.number,
            Invoice.customer_id,
            Customer.name,
            Customer.email,
            Invoice.due_date,
            Invoice.total,
            balance.label("amount_due"),
        )
        .join(Customer, Customer.id == Invoice.customer_id)
        .where(*overdue_filter)
        .order_by(Invoice.due_date.asc(), Invoice.id.asc())
        .limit(overdue_limit)
    ).all()

    # ── Monthly trend (collected vs invoiced) ───────────────────────────
    trend_start = _shift_month(date_to, -(months - 1))
    pay_month = func.to_char(Payment.payment_date, "YYYY-MM")
    collected_by_month = dict(
        db.execute(
            select(pay_month, func.sum(Payment.amount))
            .where(Payment.payment_date >= trend_start, Payment.payment_date <= date_to)
            .group_by(pay_month)
        ).all()
    )
    inv_month = func.to_char(Invoice.issue_date, "YYYY-MM")
    invoiced_by_month = dict(
        db.execute(
            select(inv_month, func.sum(Invoice.total))
            .where(
                Invoice.status.in_(_BILLED_INVOICE),
                Invoice.issue_date >= trend_start,
                Invoice.issue_date <= date_to,
            )
            .group_by(inv_month)
        ).all()
    )
    revenue_by_month = []
    for i in range(months):
        key = _shift_month(trend_start, i).strftime("%Y-%m")
        revenue_by_month.append(
            MonthlyRevenueOut(
                month=key,
                collected=collected_by_month.get(key) or ZERO,
                invoiced=invoiced_by_month.get(key) or ZERO,
            )
        )

    return DashboardSummaryOut(
        date_from=date_from,
        date_to=date_to,
        as_of=today,
        active_subscriptions=active_subscriptions,
        new_subscriptions=new_subscriptions,
        mrr=mrr,
        revenue_collected=revenue_collected,
        invoiced_total=invoiced_total,
        outstanding_amount=outstanding_amount,
        outstanding_count=outstanding_count,
        overdue_count=overdue_count,
        overdue_amount=overdue_amount,
        overdue_invoices=[
            OverdueInvoiceOut(
                id=row.id,
                number=row.number,
                customer_id=row.customer_id,
                customer_name=row.name,
                customer_email=row.email,
                due_date=row.due_date,
                days_overdue=(today - row.due_date).days,
                total=row.total,
                amount_due=row.amount_due,
            )
            for row in overdue_rows
        ],
        revenue_by_month=revenue_by_month,
    )

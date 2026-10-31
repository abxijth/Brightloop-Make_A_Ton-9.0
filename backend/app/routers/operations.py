"""Billing run endpoints (Staff and Admin)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_staff_or_admin
from app.db import get_db
from app.models.user import User
from app.schemas.billing import (
    BillingDueListOut,
    BillingRunRequest,
    BillingRunResultOut,
    DueSubscriptionOut,
)
from app.services.billing import list_due_subscriptions, run_billing

router = APIRouter(prefix="/billing", tags=["billing"], dependencies=[Depends(require_staff_or_admin)])

DbSession = Annotated[Session, Depends(get_db)]
StaffOrAdmin = Annotated[User, Depends(require_staff_or_admin)]


@router.get("/due", response_model=BillingDueListOut)
def get_due_subscriptions(
    db: DbSession,
    as_of: date | None = Query(
        default=None,
        description="Billing date to evaluate (defaults to today).",
    ),
):
    """Return every active subscription due for billing, with expected amounts.

    ``already_billed`` is True when an invoice already exists for that period —
    re-running the billing would skip these.
    """
    items = list_due_subscriptions(db, today=as_of)
    out = [
        DueSubscriptionOut(
            subscription_id=item.subscription_id,
            subscription_number=item.subscription_number,
            customer_name=item.customer_name,
            plan_name=item.plan_name,
            next_billing_date=item.next_billing_date,
            period_start=item.period_start,
            period_end=item.period_end,
            estimated_total=item.estimated_total,
            already_billed=item.already_billed,
        )
        for item in items
    ]
    return BillingDueListOut(items=out, count=len(out))


@router.post("/run", response_model=BillingRunResultOut)
def trigger_billing_run(body: BillingRunRequest, db: DbSession):
    res = run_billing(
        db,
        subscription_ids=body.subscription_ids,
        confirm=body.confirm,
    )
    db.commit()

    return BillingRunResultOut(
        created=[item.__dict__ for item in res.created],
        skipped=[item.__dict__ for item in res.skipped],
        failed=[item.__dict__ for item in res.failed],
    )

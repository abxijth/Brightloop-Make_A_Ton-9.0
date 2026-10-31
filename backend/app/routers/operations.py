"""Billing run endpoints (Staff and Admin)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_staff_or_admin
from app.db import get_db
from app.models.user import User
from app.schemas.billing import BillingRunRequest, BillingRunResultOut
from app.services.billing import run_billing

router = APIRouter(prefix="/billing", tags=["billing"], dependencies=[Depends(require_staff_or_admin)])

DbSession = Annotated[Session, Depends(get_db)]
StaffOrAdmin = Annotated[User, Depends(require_staff_or_admin)]


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

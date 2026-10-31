from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class BillingRunItemOut(BaseModel):
    subscription_id: int
    subscription_number: str
    outcome: str
    reason: str | None = None
    invoice_id: int | None = None
    invoice_number: str | None = None


class BillingRunResultOut(BaseModel):
    created: list[BillingRunItemOut] = []
    skipped: list[BillingRunItemOut] = []
    failed: list[BillingRunItemOut] = []


class BillingRunRequest(BaseModel):
    subscription_ids: list[int] | None = None
    confirm: bool = False


class DueSubscriptionOut(BaseModel):
    """One subscription that is due for billing today."""

    subscription_id: int
    subscription_number: str
    customer_name: str
    plan_name: str
    next_billing_date: date
    period_start: date
    period_end: date
    estimated_total: Decimal
    already_billed: bool


class BillingDueListOut(BaseModel):
    items: list[DueSubscriptionOut]
    count: int

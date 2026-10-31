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

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class OutboxItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    to_email: str
    subject: str
    invoice_id: int | None
    created_at: datetime

    @field_validator("type", mode="before")
    @classmethod
    def _type_value(cls, v):
        return getattr(v, "value", v)


class OutboxDetail(OutboxItem):
    body_html: str


class OutboxPage(BaseModel):
    items: list[OutboxItem]
    total: int
    page: int
    page_size: int

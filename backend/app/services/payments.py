"""Payment service: record_payment with row locking, balance check, amount_paid increment, and Paid status.

Per TEAM_PLAN.md:
"The payment service (row lock, balance check, update amount_paid, set Paid) is shared
by staff payments and the mock checkout."
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models.enums import InvoiceStatus, PaymentMethod
from app.models.invoice import Invoice
from app.models.payment import Payment


def record_payment(
    db: Session,
    *,
    invoice_id: int,
    amount: Decimal,
    method: PaymentMethod,
    payment_date: date | None = None,
    note: str | None = None,
    recorded_by_id: int | None = None,
) -> Payment:
    if amount <= Decimal("0"):
        raise AppError("Payment amount must be greater than zero.", code="invalid_amount", status_code=400)

    # Row lock on the invoice to ensure concurrent payment safety
    invoice = db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .with_for_update()
    )
    if not invoice:
        raise AppError("Invoice not found.", code="not_found", status_code=404)

    if invoice.status == InvoiceStatus.DRAFT:
        raise AppError(
            "Cannot record payment for a draft invoice. Confirm invoice first.",
            code="invalid_state",
            status_code=400,
        )

    if invoice.status == InvoiceStatus.CANCELLED:
        raise AppError(
            "Cannot record payment for a cancelled invoice.",
            code="invalid_state",
            status_code=400,
        )

    remaining_due = invoice.total - invoice.amount_paid
    if amount > remaining_due:
        raise AppError(
            f"Payment amount ({amount}) exceeds remaining balance due ({remaining_due}).",
            code="amount_exceeded",
            status_code=400,
        )

    effective_date = payment_date or date.today()

    payment = Payment(
        invoice_id=invoice.id,
        customer_id=invoice.customer_id,
        method=method,
        amount=amount,
        payment_date=effective_date,
        note=note,
        recorded_by_id=recorded_by_id,
    )
    db.add(payment)

    invoice.amount_paid += amount
    if invoice.amount_paid >= invoice.total:
        invoice.status = InvoiceStatus.PAID

    db.commit()
    db.refresh(payment)
    return payment

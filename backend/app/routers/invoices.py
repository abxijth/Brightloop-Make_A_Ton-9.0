"""Invoices and payments back-office & portal endpoints."""

from decimal import Decimal
from typing import Annotated
from html import escape

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import get_current_user, require_staff_or_admin
from app.db import get_db
from app.errors import AppError
from app.models.customer import Customer
from app.models.enums import EmailType, InvoiceStatus
from app.models.invoice import Invoice
from app.models.outbox import Outbox
from app.models.payment import Payment
from app.models.user import User
from app.schemas.invoice import (
    InvoiceDetailOut,
    InvoiceOut,
    InvoicePage,
    PaymentOut,
    PaymentPage,
    PaymentWithMetaOut,
    RecordPaymentRequest,
)
from app.services.payments import record_payment as service_record_payment

router = APIRouter(tags=["invoices"])

DbSession = Annotated[Session, Depends(get_db)]
StaffOrAdmin = Annotated[User, Depends(require_staff_or_admin)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _to_invoice_out(inv: Invoice) -> InvoiceOut:
    amount_due = max(Decimal("0"), inv.total - inv.amount_paid)
    cust_name = inv.customer.name if inv.customer else None
    cust_email = inv.customer.email if inv.customer else None
    return InvoiceOut(
        id=inv.id,
        number=inv.number,
        subscription_id=inv.subscription_id,
        customer_id=inv.customer_id,
        customer_name=cust_name,
        customer_email=cust_email,
        period_start=inv.period_start,
        period_end=inv.period_end,
        status=inv.status,
        issue_date=inv.issue_date,
        due_date=inv.due_date,
        subtotal=inv.subtotal,
        discount_total=inv.discount_total,
        tax_total=inv.tax_total,
        total=inv.total,
        amount_paid=inv.amount_paid,
        amount_due=amount_due,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


# ---------------------------------------------------------
# Staff & Admin Invoices List & Details
# ---------------------------------------------------------
@router.get("/invoices", response_model=InvoicePage, dependencies=[Depends(require_staff_or_admin)])
def list_invoices(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    status: InvoiceStatus | None = None,
    customer_id: int | None = None,
    subscription_id: int | None = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
):
    query = select(Invoice).join(Customer, Invoice.customer_id == Customer.id, isouter=True)

    if status is not None:
        query = query.where(Invoice.status == status)
    if customer_id is not None:
        query = query.where(Invoice.customer_id == customer_id)
    if subscription_id is not None:
        query = query.where(Invoice.subscription_id == subscription_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            or_(
                Invoice.number.ilike(like),
                Customer.name.ilike(like),
                Customer.email.ilike(like),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    sort_col = Invoice.issue_date.asc() if order == "asc" else Invoice.issue_date.desc()
    id_order = Invoice.id.asc() if order == "asc" else Invoice.id.desc()

    invoices = (
        db.scalars(
            query.options(joinedload(Invoice.customer))
            .order_by(sort_col, id_order)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )

    items = [_to_invoice_out(inv) for inv in invoices]
    return InvoicePage(items=items, total=total, page=page, page_size=page_size)


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailOut)
def get_invoice(invoice_id: int, current_user: CurrentUser, db: DbSession):
    invoice = db.scalar(
        select(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.lines),
            selectinload(Invoice.payments),
        )
        .where(Invoice.id == invoice_id)
    )
    if not invoice:
        raise AppError("Invoice not found.", code="not_found", status_code=404)

    # Customer isolation
    if getattr(current_user.role, "value", current_user.role) == "customer":
        customer = db.scalar(select(Customer).where(Customer.user_id == current_user.id))
        if not customer or customer.id != invoice.customer_id:
            raise AppError("You do not have access to this invoice.", code="forbidden", status_code=403)

    base = _to_invoice_out(invoice)
    return InvoiceDetailOut(
        **base.model_dump(),
        lines=invoice.lines,
        payments=invoice.payments,
    )


@router.post("/invoices/{invoice_id}/confirm", response_model=InvoiceDetailOut, dependencies=[Depends(require_staff_or_admin)])
def confirm_invoice(invoice_id: int, db: DbSession):
    invoice = db.scalar(
        select(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.lines),
            selectinload(Invoice.payments),
        )
        .where(Invoice.id == invoice_id)
        .with_for_update()
    )
    if not invoice:
        raise AppError("Invoice not found.", code="not_found", status_code=404)

    if invoice.status != InvoiceStatus.DRAFT:
        raise AppError(
            f"Cannot confirm invoice with status '{invoice.status.value}'.",
            code="invalid_state",
            status_code=400,
        )

    invoice.status = InvoiceStatus.CONFIRMED
    db.commit()
    db.refresh(invoice)

    base = _to_invoice_out(invoice)
    return InvoiceDetailOut(
        **base.model_dump(),
        lines=invoice.lines,
        payments=invoice.payments,
    )


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceDetailOut, dependencies=[Depends(require_staff_or_admin)])
def cancel_invoice(invoice_id: int, db: DbSession):
    invoice = db.scalar(
        select(Invoice)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.lines),
            selectinload(Invoice.payments),
        )
        .where(Invoice.id == invoice_id)
        .with_for_update()
    )
    if not invoice:
        raise AppError("Invoice not found.", code="not_found", status_code=404)

    if invoice.amount_paid > Decimal("0"):
        raise AppError("Cannot cancel an invoice with payments applied.", code="invalid_state", status_code=400)

    invoice.status = InvoiceStatus.CANCELLED
    db.commit()
    db.refresh(invoice)

    base = _to_invoice_out(invoice)
    return InvoiceDetailOut(
        **base.model_dump(),
        lines=invoice.lines,
        payments=invoice.payments,
    )


@router.post("/invoices/{invoice_id}/send", dependencies=[Depends(require_staff_or_admin)])
def send_invoice_email(invoice_id: int, db: DbSession):
    invoice = db.scalar(
        select(Invoice)
        .options(joinedload(Invoice.customer))
        .where(Invoice.id == invoice_id)
    )
    if not invoice:
        raise AppError("Invoice not found.", code="not_found", status_code=404)

    to_email = invoice.customer.email if invoice.customer else "customer@example.com"
    cust_name = invoice.customer.name if invoice.customer else "Customer"

    db.add(
        Outbox(
            type=EmailType.INVOICE,
            to_email=to_email,
            subject=f"Invoice {invoice.number} from Brightloop",
            body_html=(
                f"<p>Dear {escape(cust_name)},</p>"
                f"<p>Your invoice <strong>{invoice.number}</strong> for total amount ₹{invoice.total} is ready.</p>"
                f"<p>Due date: {invoice.due_date}. Balance due: ₹{invoice.total - invoice.amount_paid}.</p>"
            ),
            invoice_id=invoice.id,
        )
    )
    db.commit()
    return {"message": f"Invoice {invoice.number} queued to outbox."}


# ---------------------------------------------------------
# Payment Registration (Shared by Back-office and Portal Checkout)
# ---------------------------------------------------------
@router.post("/invoices/{invoice_id}/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def record_invoice_payment(
    invoice_id: int,
    body: RecordPaymentRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    is_customer = getattr(current_user.role, "value", current_user.role) == "customer"
    recorded_by_id = None if is_customer else current_user.id

    if is_customer:
        customer = db.scalar(select(Customer).where(Customer.user_id == current_user.id))
        inv = db.get(Invoice, invoice_id)
        if not inv or not customer or customer.id != inv.customer_id:
            raise AppError("You do not have access to pay this invoice.", code="forbidden", status_code=403)

    return service_record_payment(
        db,
        invoice_id=invoice_id,
        amount=body.amount,
        method=body.method,
        payment_date=body.payment_date,
        note=body.note,
        recorded_by_id=recorded_by_id,
    )


# ---------------------------------------------------------
# Global Payments Ledger (Admin & Staff)
# ---------------------------------------------------------
@router.get("/payments", response_model=PaymentPage, dependencies=[Depends(require_staff_or_admin)])
def list_payments(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    customer_id: int | None = None,
    invoice_id: int | None = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
):
    query = (
        select(Payment)
        .join(Customer, Payment.customer_id == Customer.id, isouter=True)
        .join(Invoice, Payment.invoice_id == Invoice.id, isouter=True)
    )

    if customer_id is not None:
        query = query.where(Payment.customer_id == customer_id)
    if invoice_id is not None:
        query = query.where(Payment.invoice_id == invoice_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            or_(
                Customer.name.ilike(like),
                Invoice.number.ilike(like),
                Payment.note.ilike(like),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    sort_col = Payment.payment_date.asc() if order == "asc" else Payment.payment_date.desc()
    id_order = Payment.id.asc() if order == "asc" else Payment.id.desc()

    payments = (
        db.scalars(
            query.options(joinedload(Payment.customer), joinedload(Payment.invoice))
            .order_by(sort_col, id_order)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .unique()
        .all()
    )

    items = [
        PaymentWithMetaOut(
            id=p.id,
            invoice_id=p.invoice_id,
            customer_id=p.customer_id,
            method=p.method,
            amount=p.amount,
            payment_date=p.payment_date,
            note=p.note,
            recorded_by_id=p.recorded_by_id,
            created_at=p.created_at,
            invoice_number=p.invoice.number if p.invoice else None,
            customer_name=p.customer.name if p.customer else None,
        )
        for p in payments
    ]

    return PaymentPage(items=items, total=total, page=page, page_size=page_size)

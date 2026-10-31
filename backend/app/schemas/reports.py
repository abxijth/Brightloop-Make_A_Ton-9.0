from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class OverdueInvoiceOut(BaseModel):
    id: int
    number: str
    customer_id: int
    customer_name: str
    customer_email: str
    due_date: date
    days_overdue: int
    total: Decimal
    amount_due: Decimal


class MonthlyRevenueOut(BaseModel):
    month: str  # "YYYY-MM"
    collected: Decimal
    invoiced: Decimal


class DashboardSummaryOut(BaseModel):
    """Finance summary.

    Period figures (`revenue_collected`, `invoiced_total`, `new_subscriptions`)
    respect `date_from`/`date_to`. Balance figures (`active_subscriptions`,
    `mrr`, `outstanding_amount`, overdue) are a snapshot as of `as_of`.
    """

    date_from: date
    date_to: date
    as_of: date
    active_subscriptions: int
    new_subscriptions: int
    mrr: Decimal
    revenue_collected: Decimal
    invoiced_total: Decimal
    outstanding_amount: Decimal
    outstanding_count: int
    overdue_count: int
    overdue_amount: Decimal
    overdue_invoices: list[OverdueInvoiceOut]
    revenue_by_month: list[MonthlyRevenueOut]

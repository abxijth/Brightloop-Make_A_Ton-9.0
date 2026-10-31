import { apiGet, apiPatch, apiPost } from './api';
import type { CustomerInvoice, InvoiceLineItem, PaymentMethod, PaymentRecord } from '../types/invoice';
import type { SubscriptionDetail, SubscriptionStatus, SubscriptionTemplate } from '../types/subscription';

// The API sends money as decimal strings. These adapters turn them into numbers
// so pages can format and compare them directly.

type Money = string | number;
const n = (v: Money | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
const nOrNull = (v: Money | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

type Params = Record<string, string | number | undefined>;

// ── Subscriptions ─────────────────────────────────────────────────────────

type MoneyKeys = 'subtotal' | 'tax_total' | 'total';
type LineRow = Omit<SubscriptionDetail['lines'][number], 'unit_price' | 'line_total' | 'tax_rate' | 'tax_amount'> & {
  unit_price: Money; line_total: Money; tax_rate: Money | null; tax_amount: Money;
};
type SubscriptionRow = Omit<SubscriptionDetail, MoneyKeys | 'lines'> & Record<MoneyKeys, Money> & { lines: LineRow[] };

const toSubscription = (r: SubscriptionRow): SubscriptionDetail => ({
  ...r,
  subtotal: n(r.subtotal),
  tax_total: n(r.tax_total),
  total: n(r.total),
  lines: r.lines.map((l) => ({
    ...l,
    unit_price: n(l.unit_price),
    line_total: n(l.line_total),
    tax_rate: nOrNull(l.tax_rate),
    tax_amount: n(l.tax_amount),
  })),
});

export interface SubscriptionLineInput {
  product_id: number;
  variant_id?: number | null;
  quantity: number;
  unit_price?: number | null;
}

export interface SubscriptionInput {
  customer_id: number;
  template_id?: number | null;
  plan_id?: number | null;
  start_date: string;
  expiry_date?: string | null;
  payment_terms_days: number;
  lines?: SubscriptionLineInput[] | null;
}

export const subscriptionsApi = {
  list: (params: Params = {}) =>
    apiGet<Page<SubscriptionRow>>('/subscriptions', params).then((p) => ({ ...p, items: p.items.map(toSubscription) })),
  get: (id: number) => apiGet<SubscriptionRow>(`/subscriptions/${id}`).then(toSubscription),
  templates: () => apiGet<SubscriptionTemplate[]>('/subscriptions/templates'),
  create: (body: SubscriptionInput) => apiPost<SubscriptionRow>('/subscriptions', body).then(toSubscription),
  update: (id: number, body: Partial<SubscriptionInput>) =>
    apiPatch<SubscriptionRow>(`/subscriptions/${id}`, body).then(toSubscription),
  transition: (id: number, target: SubscriptionStatus) =>
    apiPost<SubscriptionRow>(`/subscriptions/${id}/transition`, { target_status: target }).then(toSubscription),
  close: (id: number) => apiPost<SubscriptionRow>(`/subscriptions/${id}/close`).then(toSubscription),
};

// ── Invoices & payments ───────────────────────────────────────────────────

type InvoiceMoney = 'subtotal' | 'discount_total' | 'tax_total' | 'total' | 'amount_paid' | 'amount_due';
type InvoiceLineRow = Omit<InvoiceLineItem, 'unit_price' | 'tax_rate' | 'tax_amount' | 'line_total'> & {
  unit_price: Money; tax_rate?: Money | null; tax_amount: Money; line_total: Money;
};
type PaymentRow = Omit<PaymentRecord, 'amount'> & { amount: Money };
type InvoiceRow = Omit<CustomerInvoice, InvoiceMoney | 'lines' | 'payments' | 'customer_name' | 'customer_email'> &
  Record<InvoiceMoney, Money> & {
    customer_name: string | null;
    customer_email: string | null;
    lines?: InvoiceLineRow[];
    payments?: PaymentRow[];
  };

const toPayment = (p: PaymentRow): PaymentRecord => ({ ...p, amount: n(p.amount) });

const toInvoice = (r: InvoiceRow): CustomerInvoice => ({
  ...r,
  customer_name: r.customer_name ?? '',
  customer_email: r.customer_email ?? '',
  subtotal: n(r.subtotal),
  discount_total: n(r.discount_total),
  tax_total: n(r.tax_total),
  total: n(r.total),
  amount_paid: n(r.amount_paid),
  amount_due: n(r.amount_due),
  lines: (r.lines ?? []).map((l) => ({
    ...l,
    unit_price: n(l.unit_price),
    tax_rate: nOrNull(l.tax_rate),
    tax_amount: n(l.tax_amount),
    line_total: n(l.line_total),
  })),
  payments: (r.payments ?? []).map(toPayment),
});

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  payment_date?: string;
  note?: string;
}

export const invoicesApi = {
  list: (params: Params = {}) =>
    apiGet<Page<InvoiceRow>>('/invoices', params).then((p) => ({ ...p, items: p.items.map(toInvoice) })),
  get: (id: number) => apiGet<InvoiceRow>(`/invoices/${id}`).then(toInvoice),
  confirm: (id: number) => apiPost<InvoiceRow>(`/invoices/${id}/confirm`).then(toInvoice),
  cancel: (id: number) => apiPost<InvoiceRow>(`/invoices/${id}/cancel`).then(toInvoice),
  send: (id: number) => apiPost<{ message: string }>(`/invoices/${id}/send`),
  recordPayment: (id: number, body: PaymentInput) =>
    apiPost<PaymentRow>(`/invoices/${id}/payments`, {
      ...body,
      payment_date: body.payment_date || undefined,
      note: body.note?.trim() || undefined,
    }).then(toPayment),
};

export const paymentsApi = {
  list: (params: Params = {}) =>
    apiGet<Page<PaymentRow> & { amount_total: Money }>('/payments', params).then((p) => ({
      ...p,
      amount_total: n(p.amount_total),
      items: p.items.map(toPayment),
    })),
};

// ── Customers (picker) ────────────────────────────────────────────────────

export interface CustomerOption {
  id: number;
  name: string;
  email: string;
  company: string | null;
}

export const customersApi = {
  search: (search = '') => apiGet<Page<CustomerOption>>('/customers', { search, page_size: 50 }).then((p) => p.items),
};

// ── Finance dashboard ─────────────────────────────────────────────────────

export interface OverdueInvoice {
  id: number;
  number: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  due_date: string;
  days_overdue: number;
  total: number;
  amount_due: number;
}

export interface DashboardSummary {
  date_from: string;
  date_to: string;
  as_of: string;
  active_subscriptions: number;
  new_subscriptions: number;
  mrr: number;
  revenue_collected: number;
  invoiced_total: number;
  outstanding_amount: number;
  outstanding_count: number;
  overdue_count: number;
  overdue_amount: number;
  overdue_invoices: OverdueInvoice[];
  revenue_by_month: { month: string; collected: number; invoiced: number }[];
}

type SummaryRow = Omit<DashboardSummary, 'mrr' | 'revenue_collected' | 'invoiced_total' | 'outstanding_amount' | 'overdue_amount' | 'overdue_invoices' | 'revenue_by_month'> & {
  mrr: Money; revenue_collected: Money; invoiced_total: Money; outstanding_amount: Money; overdue_amount: Money;
  overdue_invoices: (Omit<OverdueInvoice, 'total' | 'amount_due'> & { total: Money; amount_due: Money })[];
  revenue_by_month: { month: string; collected: Money; invoiced: Money }[];
};

export const reportsApi = {
  summary: (params: { date_from?: string; date_to?: string } = {}) =>
    apiGet<SummaryRow>('/reports/summary', params).then((r): DashboardSummary => ({
      ...r,
      mrr: n(r.mrr),
      revenue_collected: n(r.revenue_collected),
      invoiced_total: n(r.invoiced_total),
      outstanding_amount: n(r.outstanding_amount),
      overdue_amount: n(r.overdue_amount),
      overdue_invoices: r.overdue_invoices.map((o) => ({ ...o, total: n(o.total), amount_due: n(o.amount_due) })),
      revenue_by_month: r.revenue_by_month.map((m) => ({ month: m.month, collected: n(m.collected), invoiced: n(m.invoiced) })),
    })),
};

/** Today as YYYY-MM-DD in the browser's local time zone. */
export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** An invoice is overdue when it is confirmed, still owes money and is past its due date. */
export const isInvoiceOverdue = (inv: Pick<CustomerInvoice, 'status' | 'amount_due' | 'due_date'>): boolean =>
  inv.status === 'confirmed' && inv.amount_due > 0 && inv.due_date < todayIso();

/** Best message to show for a failed API call. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: string; fields?: Record<string, string> };
    const fieldMsgs = e.fields ? Object.values(e.fields) : [];
    return fieldMsgs.length ? fieldMsgs.join(' ') : e.message || fallback;
  }
  return fallback;
};

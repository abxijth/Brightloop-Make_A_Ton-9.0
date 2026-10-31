export type SubscriptionStatus =
  | 'draft'
  | 'quotation'
  | 'confirmed'
  | 'active'
  | 'closed';

export type InvoiceStatus = 'draft' | 'confirmed' | 'paid';

export type BillingPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface PlanSummary {
  id: number;
  name: string;
  price: number;
  billing_period: BillingPeriod;
  min_quantity: number;
  available_from: string;
  available_to: string | null;
  auto_close: boolean;
  allow_early_close: boolean;
  is_active: boolean;
}

export interface SubscriptionLineItem {
  id: number;
  subscription_id: number;
  product_id: number;
  product_name: string;
  variant_id: number | null;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface SubscriptionDetail {
  id: number;
  number: string;
  customer_id: number;
  customer_name?: string;
  plan_id: number;
  plan_name: string;
  plan: PlanSummary;
  status: SubscriptionStatus;
  start_date: string;
  expiry_date: string | null;
  payment_terms_days: number;
  next_billing_date: string | null;
  total_recurring_amount: number;
  lines: SubscriptionLineItem[];
  created_at: string;
}

export interface SubscriptionInvoiceSummary {
  id: number;
  number: string;
  subscription_id: number;
  period_start: string;
  period_end: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  amount_due: number;
}

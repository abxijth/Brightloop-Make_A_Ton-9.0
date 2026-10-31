export type SubscriptionStatus =
  | 'draft'
  | 'quotation'
  | 'confirmed'
  | 'active'
  | 'closed';

export type BillingPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface SubscriptionLineItem {
  id: number;
  product_id: number;
  product_name: string;
  variant_id: number | null;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_name: string | null;
  tax_rate: number | null;
  tax_amount: number;
}

/** Mirrors the backend `SubscriptionOut` (amounts converted to numbers). */
export interface SubscriptionDetail {
  id: number;
  number: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  plan_id: number;
  plan_name: string;
  billing_period: BillingPeriod;
  plan_allow_early_close: boolean;
  plan_auto_close: boolean;
  status: SubscriptionStatus;
  start_date: string;
  expiry_date: string | null;
  payment_terms_days: number;
  next_billing_date: string | null;
  lines: SubscriptionLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  allowed_transitions: SubscriptionStatus[];
  can_close: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionTemplate {
  id: number;
  name: string;
  plan_id: number;
  plan_name: string;
  validity_days: number;
  lines: {
    product_id: number;
    product_name: string;
    variant_id: number | null;
    variant_label: string | null;
    quantity: number;
  }[];
}

export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'online' | 'other';

export interface InvoiceLineItem {
  id: number;
  invoice_id: number;
  line_type: 'product' | 'discount';
  description: string;
  quantity: number;
  unit_price: number;
  tax_name?: string | null;
  tax_rate?: number | null;
  tax_amount: number;
  line_total: number;
  discount_rule_id?: number | null;
}

export interface PaymentRecord {
  id: number;
  invoice_id: number;
  customer_id: number;
  method: PaymentMethod;
  amount: number;
  payment_date: string;
  note: string | null;
  recorded_by_id: number | null;
  created_at: string;
  invoice_number?: string | null;
  customer_name?: string | null;
}

/**
 * Mirrors the backend `InvoiceOut` / `InvoiceDetailOut`. List rows come back
 * without `lines` and `payments`; fetch the detail to fill them.
 */
export interface CustomerInvoice {
  id: number;
  number: string;
  subscription_id: number;
  subscription_number?: string | null;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  customer_address?: string | null;
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
  lines: InvoiceLineItem[];
  payments: PaymentRecord[];
}

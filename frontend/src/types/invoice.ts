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

export interface CustomerInvoice {
  id: number;
  number: string;
  subscription_id: number;
  subscription_number?: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  customer_address?: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'confirmed' | 'paid';
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  lines: InvoiceLineItem[];
}

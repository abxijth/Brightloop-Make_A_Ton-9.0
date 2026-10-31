import React, { useEffect, useState } from 'react';
import { Drawer } from '../shared/Drawer';
import { useToast } from '../shared/Toast';
import { errorMessage, invoicesApi, todayIso } from '../../lib/billingApi';
import { useDebounced } from '../../lib/useDebounced';
import { formatCurrency } from '../../lib/utils';
import type { CustomerInvoice, PaymentMethod, PaymentRecord } from '../../types/invoice';

/** The invoice fields the drawer needs. */
export interface PayableInvoice {
  id: number;
  number: string;
  customer_name: string;
  total: number;
  amount_due: number;
}

interface RecordPaymentDrawerProps {
  isOpen: boolean;
  /** Invoice to pay. When omitted, the drawer lets staff search for an unpaid invoice. */
  invoice?: PayableInvoice | null;
  onClose: () => void;
  onRecorded: (payment: PaymentRecord, invoice: PayableInvoice) => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer (NEFT/RTGS/IMPS)' },
  { value: 'card', label: 'Credit / Debit Card' },
  { value: 'online', label: 'Online' },
  { value: 'cash', label: 'Cash / Cheque' },
  { value: 'other', label: 'Other' },
];

const inputCls =
  'w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden';

export const RecordPaymentDrawer: React.FC<RecordPaymentDrawerProps> = ({ isOpen, invoice, onClose, onRecorded }) => {
  const { toast } = useToast();
  const [picked, setPicked] = useState<PayableInvoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Invoice search (only when no invoice was passed in)
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [options, setOptions] = useState<CustomerInvoice[]>([]);

  const target = invoice ?? picked;

  useEffect(() => {
    if (!isOpen) return;
    setPicked(null);
    setQuery('');
    setMethod('bank_transfer');
    setPaymentDate(todayIso());
    setNote(invoice ? `Payment for ${invoice.number}` : '');
    setAmount(invoice ? String(invoice.amount_due) : '');
    setError(null);
  }, [isOpen, invoice]);

  useEffect(() => {
    if (!isOpen || invoice) return;
    let cancelled = false;
    invoicesApi
      .list({ status: 'confirmed', search: debouncedQuery.trim() || undefined, page_size: 20, order: 'asc' })
      .then((p) => !cancelled && setOptions(p.items))
      .catch(() => !cancelled && setOptions([]));
    return () => {
      cancelled = true;
    };
  }, [isOpen, invoice, debouncedQuery]);

  const pick = (inv: CustomerInvoice) => {
    setPicked(inv);
    setAmount(String(inv.amount_due));
    setNote(`Payment for ${inv.number}`);
    setError(null);
  };

  const submit = async () => {
    if (!target) {
      setError('Choose the invoice this payment is for.');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (value > target.amount_due + 1e-9) {
      setError(`Amount cannot exceed the balance due (${formatCurrency(target.amount_due)}).`);
      return;
    }
    if (paymentDate > todayIso()) {
      setError('Payment date cannot be in the future.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payment = await invoicesApi.recordPayment(target.id, { amount: value, method, payment_date: paymentDate, note });
      const fullyPaid = value >= target.amount_due;
      toast({
        type: 'success',
        title: fullyPaid ? 'Payment recorded: invoice paid' : 'Partial payment recorded',
        message: `${formatCurrency(value)} recorded against ${target.number}.`,
      });
      onRecorded(payment, target);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not record the payment.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment"
      description={target ? `Record a payment against invoice ${target.number}` : 'Record a payment against an unpaid invoice'}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={submitting || !target}
            onClick={submit}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {submitting ? 'Recording...' : 'Confirm Payment'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!invoice && (
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Invoice</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search unpaid invoices by number or customer..."
              className={inputCls}
            />
            <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {options.length === 0 ? (
                <div className="p-3 text-[11px] text-muted-foreground text-center">No unpaid invoices found.</div>
              ) : (
                options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => pick(o)}
                    className={`w-full text-left p-2.5 text-xs hover:bg-muted/40 flex justify-between gap-2 ${
                      picked?.id === o.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <span>
                      <span className="font-mono font-semibold text-foreground">{o.number}</span>
                      <span className="text-muted-foreground"> · {o.customer_name}</span>
                    </span>
                    <span className="font-mono text-foreground">{formatCurrency(o.amount_due)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {target && (
          <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer:</span>
              <span className="font-semibold text-foreground">{target.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Invoiced:</span>
              <span className="font-mono text-foreground">{formatCurrency(target.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Balance Due:</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-400">{formatCurrency(target.amount_due)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Payment Amount (₹)</label>
          <input
            type="number"
            min={0.01}
            max={target?.amount_due}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} font-mono`}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Prefilled with the balance due. Enter a smaller amount to record a partial payment.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Payment Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Payment Date</label>
          <input
            type="date"
            max={todayIso()}
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Note / Reference</label>
          <textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional payment note or transaction reference..."
            className={inputCls}
          />
        </div>

        {error && (
          <div className="p-2.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </Drawer>
  );
};

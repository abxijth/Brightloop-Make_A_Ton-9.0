import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
} from 'lucide-react';
import { CustomerInvoice } from '../../types/invoice';
import { formatCurrency } from '../../lib/utils';

interface MockCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: CustomerInvoice | null;
  onPaymentSuccess: (invoiceId: number, paidAmount: number) => void;
}

export const MockCheckoutModal: React.FC<MockCheckoutModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onPaymentSuccess,
}) => {
  if (!isOpen || !invoice) return null;

  const [paymentAmount, setPaymentAmount] = useState<number>(invoice.amount_due);
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [cardHolder, setCardHolder] = useState('Acme Billing Team');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) {
      setPaymentAmount(0);
    } else {
      setPaymentAmount(Math.min(Math.max(0, val), invoice.amount_due));
    }
  };

  const handleSimulatePayment = (outcome: 'success' | 'failure') => {
    if (isSubmitting) return;

    if (paymentAmount <= 0) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid payment amount greater than ₹0.',
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    setTimeout(() => {
      if (outcome === 'success') {
        setStatusMessage({
          type: 'success',
          text: `Payment of ${formatCurrency(paymentAmount)} processed successfully.`,
        });
        setTimeout(() => {
          setIsSubmitting(false);
          onPaymentSuccess(invoice.id, paymentAmount);
          onClose();
        }, 1200);
      } else {
        setIsSubmitting(false);
        setStatusMessage({
          type: 'error',
          text: 'Payment failed: Card was declined by test issuer (Simulated Decline: 51 - Insufficient Funds).',
        });
      }
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Test mode, no real money is charged.</span>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h2 className="text-lg font-bold text-foreground">Pay Invoice</h2>
              <p className="text-xs text-muted-foreground">
                Invoice {invoice.number} &bull; Total Balance:{' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(invoice.amount_due)}
                </span>
              </p>
            </div>
            <div className="p-2 bg-primary/10 rounded-full text-primary">
              <Lock className="w-5 h-5" />
            </div>
          </div>

          {statusMessage && (
            <div
              className={`p-3 rounded-lg flex items-start gap-2.5 text-xs font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Balance Amount & Partial Payment option */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Payment Amount (₹)
              </label>
              <button
                type="button"
                onClick={() => setPaymentAmount(invoice.amount_due)}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Pay Full Balance
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-muted-foreground font-semibold">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="1"
                max={invoice.amount_due}
                value={paymentAmount}
                onChange={handleAmountChange}
                disabled={isSubmitting}
                className="w-full pl-8 pr-3 py-2 text-base font-semibold rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can modify this amount for partial payments up to the balance of{' '}
              {formatCurrency(invoice.amount_due)}.
            </p>
          </div>

          {/* Card-Style Form */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-primary" />
                Payment Card
              </span>
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">
                TEST GATEWAY
              </span>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                Cardholder Name
              </label>
              <input
                type="text"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                disabled={isSubmitting}
                className="w-full mt-1 px-2.5 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                Card Number
              </label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                disabled={isSubmitting}
                className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Expires
                </label>
                <input
                  type="text"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Security Code (CVV)
                </label>
                <input
                  type="password"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-muted/20 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSimulatePayment('failure')}
              className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 active:scale-95"
            >
              Simulate Failure
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSimulatePayment('success')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Simulate Success
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

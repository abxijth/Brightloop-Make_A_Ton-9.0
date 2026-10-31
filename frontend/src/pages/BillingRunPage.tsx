import { useState, useMemo } from 'react';
import {
  PlayCircle,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useToast } from '../components/shared/Toast';
import { formatCurrency, cn } from '../lib/utils';

interface BillingRunItem {
  subscriptionId: number;
  subscriptionNumber: string;
  customerName: string;
  planName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: 'due' | 'created' | 'skipped' | 'failed';
  reason?: string;
  generatedInvoiceNumber?: string;
}

export function BillingRunPage() {
  const { toast } = useToast();
  const [autoConfirmInvoices, setAutoConfirmInvoices] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSubIds, setSelectedSubIds] = useState<number[]>([1, 2]);

  // Seeded due subscriptions for demonstration
  const [items, setItems] = useState<BillingRunItem[]>([
    {
      subscriptionId: 1,
      subscriptionNumber: 'SUB-0001',
      customerName: 'Acme Technologies Pvt Ltd',
      planName: 'Enterprise Cloud Pro',
      periodStart: '2026-11-15',
      periodEnd: '2026-12-14',
      amount: 32499,
      status: 'due',
    },
    {
      subscriptionId: 2,
      subscriptionNumber: 'SUB-0002',
      customerName: 'Nexus Global Logistics',
      planName: 'Startup Growth Suite Standard',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      amount: 4999,
      status: 'due',
    },
    {
      subscriptionId: 4,
      subscriptionNumber: 'SUB-0004',
      customerName: 'Aura Media Studio',
      planName: 'Enterprise Cloud Pro',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      amount: 12500,
      status: 'skipped',
      reason: 'subscription already closed',
    },
  ]);

  const dueItems = useMemo(() => items.filter((i) => i.status === 'due'), [items]);

  const toggleSelectAll = () => {
    if (selectedSubIds.length === dueItems.length) {
      setSelectedSubIds([]);
    } else {
      setSelectedSubIds(dueItems.map((i) => i.subscriptionId));
    }
  };

  const toggleSelectItem = (id: number) => {
    setSelectedSubIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRunBatchBilling = () => {
    if (selectedSubIds.length === 0) {
      toast({
        type: 'error',
        title: 'No Subscriptions Selected',
        message: 'Please select at least one due subscription to generate invoices.',
      });
      return;
    }

    setIsRunning(true);
    setTimeout(() => {
      let createdCount = 0;
      let skippedCount = 0;

      setItems((prev) =>
        prev.map((item) => {
          if (selectedSubIds.includes(item.subscriptionId)) {
            if (item.status === 'created') {
              skippedCount++;
              return { ...item, status: 'skipped', reason: 'already billed for this period (idempotent)' };
            }
            createdCount++;
            return {
              ...item,
              status: 'created',
              generatedInvoiceNumber: `INV-0${Math.floor(125 + Math.random() * 20)}`,
            };
          }
          return item;
        })
      );

      setIsRunning(false);
      toast({
        type: 'success',
        title: 'Billing Run Completed',
        message: `Batch finished: ${createdCount} invoices created, ${skippedCount} skipped. Status: ${
          autoConfirmInvoices ? 'Confirmed' : 'Draft'
        }.`,
      });
    }, 900);
  };

  const createdTotal = items.filter((i) => i.status === 'created').length;
  const skippedTotal = items.filter((i) => i.status === 'skipped').length;
  const failedTotal = items.filter((i) => i.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Billing Run
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Trigger batch invoice generation for all subscriptions due for their next billing cycle.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoConfirmInvoices}
              onChange={(e) => setAutoConfirmInvoices(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary w-4 h-4"
            />
            <span>Confirm invoices after creating</span>
          </label>

          <button
            onClick={handleRunBatchBilling}
            disabled={isRunning || dueItems.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Batch...</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                <span>Execute Billing Run</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Due Subscriptions
          </span>
          <div className="text-xl font-bold text-foreground mt-1">{dueItems.length}</div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Ready for invoicing</span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Invoices Created
          </span>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {createdTotal}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Generated in session</span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Skipped / Idempotent
          </span>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {skippedTotal}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Already billed / ended</span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Failures
          </span>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{failedTotal}</div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Savepoint isolated</span>
        </div>
      </div>

      {/* Due Subscriptions Queue Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
        <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-foreground">Subscriptions Queue</h3>
            <span className="text-xs text-muted-foreground">
              ({selectedSubIds.length} of {dueItems.length} selected)
            </span>
          </div>

          {dueItems.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:underline font-medium"
            >
              {selectedSubIds.length === dueItems.length ? 'Deselect All' : 'Select All Due'}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={dueItems.length > 0 && selectedSubIds.length === dueItems.length}
                    onChange={toggleSelectAll}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                </th>
                <th className="py-3 px-4">Subscription #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4 text-right">Recurring Amount</th>
                <th className="py-3 px-4 text-center">Batch Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr
                  key={item.subscriptionId}
                  className={cn(
                    'transition-colors',
                    selectedSubIds.includes(item.subscriptionId) ? 'bg-primary/5' : 'hover:bg-muted/20'
                  )}
                >
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedSubIds.includes(item.subscriptionId)}
                      onChange={() => toggleSelectItem(item.subscriptionId)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-foreground">
                    {item.subscriptionNumber}
                  </td>
                  <td className="py-3 px-4 font-medium text-foreground">{item.customerName}</td>
                  <td className="py-3 px-4 text-muted-foreground">{item.planName}</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {item.periodStart} &rarr; {item.periodEnd}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-foreground">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.status === 'due' ? (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-900">
                        Due for Billing
                      </span>
                    ) : item.status === 'created' ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900 flex items-center justify-center gap-1">
                        <Check className="w-3 h-3" /> {item.generatedInvoiceNumber}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Skipped ({item.reason})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

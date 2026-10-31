import { useCallback, useEffect, useState } from 'react';
import { Search, Filter, Receipt, Plus } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { errorMessage, paymentsApi } from '../lib/billingApi';
import { useDebounced } from '../lib/useDebounced';
import { useToast } from '../components/shared/Toast';
import { RecordPaymentDrawer } from '../components/invoices/RecordPaymentDrawer';
import type { PaymentRecord } from '../types/invoice';

const PAGE_SIZE = 10;

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer (NEFT/RTGS)',
  card: 'Credit / Debit Card',
  online: 'Online',
  cash: 'Cash / Cheque',
  other: 'Other',
};

export function PaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [amountTotal, setAmountTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounced(searchQuery);
  const [methodFilter, setMethodFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRecordOpen, setIsRecordOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    paymentsApi
      .list({
        page: currentPage,
        page_size: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        method: methodFilter === 'all' ? undefined : methodFilter,
      })
      .then((p) => {
        setPayments(p.items);
        setTotalCount(p.total);
        setAmountTotal(p.amount_total);
      })
      .catch((err) => toast({ type: 'error', title: 'Could not load payments', message: errorMessage(err) }))
      .finally(() => setLoading(false));
  }, [currentPage, debouncedSearch, methodFilter, toast]);

  useEffect(load, [load]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstRow = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Payments Ledger</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Every payment recorded against an invoice, with its method, date and reference note.
          </p>
        </div>
        <button
          onClick={() => setIsRecordOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Collected</span>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(amountTotal)}</div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Matching the current filters</span>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</span>
          <div className="text-xl font-bold text-foreground mt-1">{totalCount.toLocaleString('en-IN')}</div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">All tied to an invoice</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by invoice #, customer, reference note..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0 mr-1" />
          {[
            { id: 'all', label: 'All Methods' },
            { id: 'bank_transfer', label: 'Bank Transfer' },
            { id: 'card', label: 'Card' },
            { id: 'online', label: 'Online' },
            { id: 'cash', label: 'Cash' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setMethodFilter(tab.id);
                setCurrentPage(1);
              }}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg font-medium whitespace-nowrap transition-colors',
                methodFilter === tab.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Reference Note</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">Loading payments...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    No payments found.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className={cn('hover:bg-muted/20 transition-colors', loading && 'opacity-60')}>
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">REC-{p.id}</td>
                    <td className="py-3 px-4 font-semibold text-foreground">{p.invoice_number ?? '—'}</td>
                    <td className="py-3 px-4 font-medium text-foreground">{p.customer_name ?? '—'}</td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{p.payment_date}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">{p.note || '-'}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Showing {firstRow} to {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} payment transactions
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Previous
            </button>
            <span className="font-semibold text-foreground">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <RecordPaymentDrawer isOpen={isRecordOpen} onClose={() => setIsRecordOpen(false)} onRecorded={load} />
    </div>
  );
}

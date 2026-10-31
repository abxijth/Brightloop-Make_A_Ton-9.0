import React, { useEffect, useState } from 'react';
import {
  FileText,
  Printer,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import { CustomerInvoice } from '../types/invoice';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Stepper } from '../components/shared/Stepper';
import { Drawer } from '../components/shared/Drawer';
import { useToast } from '../components/shared/Toast';
import { formatCurrency, cn } from '../lib/utils';
import { errorMessage, invoicesApi, isInvoiceOverdue as isOverdue } from '../lib/billingApi';
import { useDebounced } from '../lib/useDebounced';
import { InvoicePrintView } from '../components/invoices/InvoicePrintView';

const PAGE_SIZE = 5;

export const InvoicesPage: React.FC = () => {
  const { toast } = useToast();
  // The API only returns the logged-in customer's own (non-draft) invoices.
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearch = useDebounced(searchQuery);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoicesApi
      .list({
        page: currentPage,
        page_size: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === 'all' || statusFilter === 'overdue' ? undefined : statusFilter,
        overdue: statusFilter === 'overdue' ? 'true' : undefined,
      })
      .then((p) => {
        if (cancelled) return;
        setInvoices(p.items);
        setTotalCount(p.total);
      })
      .catch((err) => !cancelled && toast({ type: 'error', title: 'Could not load invoices', message: errorMessage(err) }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [currentPage, debouncedSearch, statusFilter, toast]);

  useEffect(() => {
    if (selectedInvoiceId === null) {
      setSelectedInvoice(null);
      return;
    }
    let cancelled = false;
    setSelectedInvoice(null);
    invoicesApi
      .get(selectedInvoiceId)
      .then((inv) => !cancelled && setSelectedInvoice(inv))
      .catch((err) => {
        if (cancelled) return;
        toast({ type: 'error', title: 'Could not load invoice', message: errorMessage(err) });
        setSelectedInvoiceId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedInvoiceId, toast]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedInvoices = invoices;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Invoices
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            View your billing history, print tax invoices, and check what is still due.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by invoice # or subscription..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          {[
            { id: 'all', label: 'All Invoices' },
            { id: 'confirmed', label: 'Unpaid / Confirmed' },
            { id: 'paid', label: 'Paid' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setCurrentPage(1);
              }}
              className={cn(
                'px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap transition-colors',
                statusFilter === tab.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices List / Cards */}
      <div className="grid grid-cols-1 gap-3">
        {loading && invoices.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Loading invoices...</div>
        ) : paginatedInvoices.length === 0 ? (
          <div className="py-12 text-center border border-dashed rounded-xl border-border bg-card">
            <Receipt className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold text-foreground">No invoices found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search criteria or status filter.
            </p>
          </div>
        ) : (
          paginatedInvoices.map((inv) => {
            const overdue = isOverdue(inv);
            const isSelected = selectedInvoiceId === inv.id;

            return (
              <div
                key={inv.id}
                onClick={() => setSelectedInvoiceId(inv.id)}
                className={cn(
                  'p-4 rounded-xl border bg-card text-card-foreground shadow-xs transition-all cursor-pointer hover:border-primary/50 relative overflow-hidden',
                  isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
                )}
              >
                {overdue && (
                  <div className="absolute top-0 right-0 w-2 h-full bg-red-500" />
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">
                          {inv.number}
                        </span>
                        {inv.subscription_number && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                            {inv.subscription_number}
                          </span>
                        )}
                        <StatusBadge status={inv.status} />
                        {overdue && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-300 dark:border-red-800 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Overdue
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Issue Date: {inv.issue_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Due Date: {inv.due_date}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amounts & Pay CTA */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Total / Balance Due</div>
                      <div className="flex items-baseline gap-1.5 justify-end mt-0.5">
                        <span className="text-xs text-muted-foreground line-through">
                          {inv.amount_paid > 0 ? formatCurrency(inv.total) : ''}
                        </span>
                        <span
                          className={cn(
                            'font-bold text-sm sm:text-base',
                            inv.amount_due > 0 ? 'text-foreground' : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {inv.amount_due > 0 ? formatCurrency(inv.amount_due) : 'Paid in Full'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedInvoiceId(inv.id);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        title="View Details"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
            {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} invoices
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Invoice Detail Drawer */}
      <Drawer
        isOpen={selectedInvoiceId !== null}
        onClose={() => setSelectedInvoiceId(null)}
        title={selectedInvoice ? `Invoice ${selectedInvoice.number}` : 'Invoice Detail'}
        description={
          selectedInvoice
            ? `Issued on ${selectedInvoice.issue_date} • Due on ${selectedInvoice.due_date}`
            : undefined
        }
        footer={
          selectedInvoice && (
            <div className="flex items-center justify-between w-full gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
              </button>

              {selectedInvoice.status === 'paid' ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Paid in Full</span>
                </div>
              ) : selectedInvoice.amount_due > 0 && selectedInvoice.status === 'confirmed' ? (
                <div className="text-xs text-muted-foreground text-right">
                  Balance due <span className="font-semibold text-foreground">{formatCurrency(selectedInvoice.amount_due)}</span>
                  <br />
                  Please pay by bank transfer quoting {selectedInvoice.number}.
                </div>
              ) : null}
            </div>
          )
        }
      >
        {selectedInvoice && (
          <div className="space-y-6">
            {/* Status Stepper */}
            <div className="p-4 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status Progression
                </span>
                {isOverdue(selectedInvoice) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-300 dark:border-red-800 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Past Due (Overdue)
                  </span>
                )}
              </div>
              <Stepper
                steps={selectedInvoice.status === 'cancelled' ? ['Confirmed', 'Cancelled'] : ['Confirmed', 'Paid']}
                currentStep={
                  selectedInvoice.status === 'cancelled'
                    ? 'Cancelled'
                    : selectedInvoice.status === 'paid'
                    ? 'Paid'
                    : 'Confirmed'
                }
              />
            </div>

            {/* Billing Breakdown Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Line Items
              </h4>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border bg-card">
                {selectedInvoice.lines.map((line) => (
                  <div key={line.id} className="p-3 text-xs flex justify-between items-start">
                    <div className="space-y-0.5 pr-2">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>{line.description}</span>
                        {line.line_type === 'discount' && (
                          <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5">
                            <Tag className="w-2.5 h-2.5" /> Discount
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {line.quantity} &times; {formatCurrency(line.unit_price)}
                        {line.tax_rate ? ` (+${line.tax_rate}% ${line.tax_name})` : ''}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'font-semibold text-right',
                        line.line_total < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-foreground'
                      )}
                    >
                      {formatCurrency(line.line_total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown Summary Box */}
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(selectedInvoice.subtotal)}</span>
              </div>

              {selectedInvoice.discount_total > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Discount</span>
                  <span>-{formatCurrency(selectedInvoice.discount_total)}</span>
                </div>
              )}

              <div className="flex justify-between text-muted-foreground">
                <span>Estimated Tax (GST)</span>
                <span>{formatCurrency(selectedInvoice.tax_total)}</span>
              </div>

              <div className="pt-2 border-t border-border flex justify-between font-bold text-sm text-foreground">
                <span>Total Amount</span>
                <span>{formatCurrency(selectedInvoice.total)}</span>
              </div>

              <div className="flex justify-between text-muted-foreground pt-1">
                <span>Amount Paid</span>
                <span>{formatCurrency(selectedInvoice.amount_paid)}</span>
              </div>

              <div className="pt-2 border-t border-border flex justify-between font-bold text-sm">
                <span>Balance Due</span>
                <span
                  className={
                    selectedInvoice.amount_due > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }
                >
                  {formatCurrency(selectedInvoice.amount_due)}
                </span>
              </div>
            </div>

            {/* Metadata & Billing details */}
            <div className="text-xs space-y-1.5 p-3 rounded-lg bg-card border border-border text-muted-foreground">
              <div className="flex justify-between">
                <span>Customer</span>
                <span className="font-medium text-foreground">{selectedInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Billing Period</span>
                <span className="font-medium text-foreground">
                  {selectedInvoice.period_start} &rarr; {selectedInvoice.period_end}
                </span>
              </div>
              {selectedInvoice.subscription_number && (
                <div className="flex justify-between">
                  <span>Subscription #</span>
                  <span className="font-medium text-foreground font-mono">
                    {selectedInvoice.subscription_number}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Hidden Printable Invoice for native window.print() */}
      {selectedInvoice && <InvoicePrintView invoice={selectedInvoice} />}
    </div>
  );
};

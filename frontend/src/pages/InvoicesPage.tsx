import React, { useState } from 'react';
import {
  FileText,
  Printer,
  CreditCard,
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
import { MOCK_CUSTOMER_INVOICES } from '../lib/mockInvoices';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Stepper } from '../components/shared/Stepper';
import { Drawer } from '../components/shared/Drawer';
import { useToast } from '../components/shared/Toast';
import { formatCurrency, cn } from '../lib/utils';
import { MockCheckoutModal } from '../components/invoices/MockCheckoutModal';
import { InvoicePrintView } from '../components/invoices/InvoicePrintView';

export const InvoicesPage: React.FC = () => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<CustomerInvoice[]>(MOCK_CUSTOMER_INVOICES);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<CustomerInvoice | null>(null);

  // Today reference date for overdue check
  const todayStr = '2026-10-31';

  const isOverdue = (invoice: CustomerInvoice) => {
    return (
      invoice.status !== 'paid' &&
      invoice.amount_due > 0 &&
      invoice.due_date < todayStr
    );
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    const overdue = isOverdue(inv);
    let matchesStatus = true;
    if (statusFilter === 'overdue') {
      matchesStatus = overdue;
    } else if (statusFilter !== 'all') {
      matchesStatus = inv.status.toLowerCase() === statusFilter.toLowerCase();
    }

    const matchesSearch =
      inv.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.subscription_number &&
        inv.subscription_number.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  // Pagination calculation
  const totalCount = filteredInvoices.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId) || null;

  const handlePrint = () => {
    window.print();
  };

  const handleOpenCheckout = (invoice: CustomerInvoice) => {
    setPayingInvoice(invoice);
    setIsCheckoutOpen(true);
  };

  const handlePaymentSuccess = (invoiceId: number, paidAmount: number) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === invoiceId) {
          const newPaid = inv.amount_paid + paidAmount;
          const newDue = Math.max(0, inv.total - newPaid);
          const newStatus = newDue <= 0 ? 'paid' : inv.status;
          return {
            ...inv,
            amount_paid: newPaid,
            amount_due: newDue,
            status: newStatus,
          };
        }
        return inv;
      })
    );

    toast({
      type: 'success',
      title: 'Payment Successful',
      message: `Payment of ${formatCurrency(paidAmount)} processed. Invoice status updated.`,
    });
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
            View your billing history, download tax invoices, and complete pending payments.
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
            { id: 'draft', label: 'Draft' },
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
        {paginatedInvoices.length === 0 ? (
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
                      {inv.amount_due > 0 && inv.status !== 'draft' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCheckout(inv);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pay Now</span>
                        </button>
                      )}

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
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} invoices
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
              disabled={currentPage === totalPages}
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
            ? `Issued on ${selectedInvoice.issue_date} &bull; Due on ${selectedInvoice.due_date}`
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

              {selectedInvoice.amount_due > 0 && selectedInvoice.status !== 'draft' ? (
                <button
                  type="button"
                  onClick={() => handleOpenCheckout(selectedInvoice)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pay Now ({formatCurrency(selectedInvoice.amount_due)})</span>
                </button>
              ) : selectedInvoice.status === 'paid' ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Paid in Full</span>
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
                steps={['Draft', 'Confirmed', 'Paid']}
                currentStep={
                  selectedInvoice.status === 'draft'
                    ? 'Draft'
                    : selectedInvoice.status === 'confirmed'
                    ? 'Confirmed'
                    : 'Paid'
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

      {/* Pay Now Mock Checkout Modal */}
      <MockCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        invoice={payingInvoice}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Hidden Printable Invoice for native window.print() */}
      {selectedInvoice && <InvoicePrintView invoice={selectedInvoice} />}
    </div>
  );
};

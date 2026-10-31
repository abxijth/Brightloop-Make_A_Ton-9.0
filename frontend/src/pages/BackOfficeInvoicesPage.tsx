import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  FileText,
  Printer,
  CreditCard,
  AlertCircle,
  Eye,
  Check,
  Send,
  XCircle,
} from 'lucide-react';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Stepper } from '../components/shared/Stepper';
import { Drawer } from '../components/shared/Drawer';
import { useToast } from '../components/shared/Toast';
import { formatCurrency, cn } from '../lib/utils';
import { CustomerInvoice } from '../types/invoice';
import { MOCK_CUSTOMER_INVOICES } from '../lib/mockInvoices';
import { InvoicePrintView } from '../components/invoices/InvoicePrintView';

export function BackOfficeInvoicesPage() {
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<CustomerInvoice[]>(MOCK_CUSTOMER_INVOICES);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  // Filters & pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Actions state
  const [isConfirmingDraft, setIsConfirmingDraft] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'card' | 'cash' | 'online'>('bank_transfer');
  const [paymentNote, setPaymentNote] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId) || null;

  // Today reference date for overdue calculations
  const todayStr = '2026-10-31';
  const isOverdue = (inv: CustomerInvoice) => {
    return inv.status !== 'paid' && inv.amount_due > 0 && inv.due_date < todayStr;
  };

  // Filtered & Searched data
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const overdue = isOverdue(inv);
      let matchesStatus = true;
      if (statusFilter === 'overdue') {
        matchesStatus = overdue;
      } else if (statusFilter !== 'all') {
        matchesStatus = inv.status.toLowerCase() === statusFilter.toLowerCase();
      }

      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        inv.number.toLowerCase().includes(query) ||
        inv.customer_name.toLowerCase().includes(query) ||
        inv.customer_email.toLowerCase().includes(query) ||
        (inv.subscription_number && inv.subscription_number.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [invoices, searchQuery, statusFilter]);

  const totalCount = filteredInvoices.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Status progression stepper step
  const getStepperIndex = (inv: CustomerInvoice) => {
    if (inv.status === 'draft') return 'Draft';
    if (inv.status === 'confirmed') return 'Confirmed';
    return 'Paid';
  };

  // Handlers
  const handleConfirmDraft = () => {
    if (!selectedInvoice) return;
    setIsConfirmingDraft(true);
    setTimeout(() => {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === selectedInvoice.id
            ? { ...inv, status: 'confirmed' }
            : inv
        )
      );
      setIsConfirmingDraft(false);
      toast({
        type: 'success',
        title: 'Invoice Confirmed',
        message: `Invoice ${selectedInvoice.number} has been transitioned from Draft to Confirmed.`,
      });
    }, 400);
  };

  const handleSendToOutbox = () => {
    if (!selectedInvoice) return;
    toast({
      type: 'success',
      title: 'Invoice Sent',
      message: `Invoice ${selectedInvoice.number} has been queued into the Outbox for ${selectedInvoice.customer_email}.`,
    });
  };

  const handleCancelInvoice = () => {
    if (!selectedInvoice) return;
    if (selectedInvoice.amount_paid > 0) {
      toast({
        type: 'error',
        title: 'Cannot Cancel',
        message: 'Cannot cancel an invoice with payments applied.',
      });
      return;
    }
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === selectedInvoice.id ? { ...inv, status: 'draft', amount_due: 0 } : inv
      )
    );
    toast({
      type: 'info',
      title: 'Invoice Cancelled',
      message: `Invoice ${selectedInvoice.number} has been cancelled.`,
    });
  };

  const handleOpenRecordPayment = () => {
    if (!selectedInvoice) return;
    setPaymentAmount(selectedInvoice.amount_due);
    setPaymentMethod('bank_transfer');
    setPaymentNote('');
    setIsRecordPaymentOpen(true);
  };

  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    if (paymentAmount <= 0) {
      toast({
        type: 'error',
        title: 'Invalid Amount',
        message: 'Payment amount must be greater than ₹0.',
      });
      return;
    }

    if (paymentAmount > selectedInvoice.amount_due) {
      toast({
        type: 'error',
        title: 'Amount Exceeded',
        message: `Amount cannot exceed balance due (${formatCurrency(selectedInvoice.amount_due)}).`,
      });
      return;
    }

    setIsRecordingPayment(true);
    setTimeout(() => {
      setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id === selectedInvoice.id) {
            const newPaid = inv.amount_paid + paymentAmount;
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
      setIsRecordingPayment(false);
      setIsRecordPaymentOpen(false);
      toast({
        type: 'success',
        title: 'Payment Recorded',
        message: `Payment of ${formatCurrency(paymentAmount)} recorded for invoice ${selectedInvoice.number}.`,
      });
    }, 500);
  };

  const handlePrint = () => {
    window.print();
  };

  // Metrics overview
  const totalBilled = useMemo(() => invoices.reduce((sum, inv) => sum + inv.total, 0), [invoices]);
  const totalOutstanding = useMemo(() => invoices.reduce((sum, inv) => sum + inv.amount_due, 0), [invoices]);
  const overdueCount = useMemo(() => invoices.filter(isOverdue).length, [invoices]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Invoices Ledger
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Manage customer billings, confirm draft cycles, inspect itemized taxes, and record manual payments.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Invoiced
          </span>
          <div className="text-xl font-bold text-foreground mt-1">
            {formatCurrency(totalBilled)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Across {invoices.length} total invoices
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Outstanding Receivables
          </span>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(totalOutstanding)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Awaiting settlement
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overdue Invoices
          </span>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
            {overdueCount}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Require follow-up notice
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by invoice #, customer name, email, subscription..."
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
            { id: 'all', label: 'All' },
            { id: 'draft', label: 'Draft' },
            { id: 'confirmed', label: 'Confirmed' },
            { id: 'paid', label: 'Paid' },
            { id: 'overdue', label: 'Overdue' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setCurrentPage(1);
              }}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg font-medium whitespace-nowrap transition-colors',
                statusFilter === tab.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Subscription</th>
                <th className="py-3 px-4">Issue Date</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    No invoices match your search or filter.
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv) => {
                  const overdue = isOverdue(inv);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {inv.number}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{inv.customer_name}</div>
                        <div className="text-[11px] text-muted-foreground">{inv.customer_email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                        {inv.subscription_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{inv.issue_date}</td>
                      <td className="py-3 px-4">
                        <span className={cn(overdue && 'text-red-600 dark:text-red-400 font-semibold')}>
                          {inv.due_date}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={inv.status} />
                          {overdue && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-300 dark:border-red-800">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-foreground">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={cn(
                            'font-bold',
                            inv.amount_due > 0
                              ? overdue
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-foreground'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {inv.amount_due > 0 ? formatCurrency(inv.amount_due) : 'Settled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer / Pagination */}
        <div className="p-3 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} invoices
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Previous
            </button>
            <span className="font-semibold text-foreground">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Detail Drawer */}
      <Drawer
        isOpen={selectedInvoiceId !== null}
        onClose={() => {
          setSelectedInvoiceId(null);
          setIsRecordPaymentOpen(false);
        }}
        title={selectedInvoice ? `Invoice ${selectedInvoice.number}` : 'Invoice Details'}
        description={
          selectedInvoice
            ? `Customer: ${selectedInvoice.customer_name} &bull; Period: ${selectedInvoice.period_start} to ${selectedInvoice.period_end}`
            : undefined
        }
        footer={
          selectedInvoice && (
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendToOutbox}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1.5 transition-colors"
                  title="Send email notification"
                >
                  <Send className="w-3.5 h-3.5 text-blue-500" />
                  <span>Send</span>
                </button>

                {selectedInvoice.status !== 'paid' && selectedInvoice.amount_paid === 0 && (
                  <button
                    type="button"
                    onClick={handleCancelInvoice}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                )}

                {selectedInvoice.status === 'draft' && (
                  <button
                    type="button"
                    onClick={handleConfirmDraft}
                    disabled={isConfirmingDraft}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Invoice</span>
                  </button>
                )}

                {selectedInvoice.status !== 'draft' && selectedInvoice.amount_due > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenRecordPayment}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                )}
              </div>
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
                  Workflow Lifecycle
                </span>
                {isOverdue(selectedInvoice) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-300 dark:border-red-800 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Past Due
                  </span>
                )}
              </div>
              <Stepper
                steps={['Draft', 'Confirmed', 'Paid']}
                currentStep={getStepperIndex(selectedInvoice)}
              />
            </div>

            {/* Quick Actions (if draft or awaiting payment) */}
            {selectedInvoice.status === 'draft' && (
              <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-xs flex items-center justify-between gap-3">
                <div className="text-amber-800 dark:text-amber-300">
                  <span className="font-semibold block">Draft Invoice</span>
                  Customer cannot make payment until this invoice is confirmed.
                </div>
                <button
                  type="button"
                  onClick={handleConfirmDraft}
                  disabled={isConfirmingDraft}
                  className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded-md shadow-xs shrink-0"
                >
                  Confirm Now
                </button>
              </div>
            )}

            {/* Record Manual Payment Form in Drawer */}
            {isRecordPaymentOpen && (
              <form
                onSubmit={handleRecordPaymentSubmit}
                className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> Record Customer Payment
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsRecordPaymentOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Payment Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={selectedInvoice.amount_due}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-semibold text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Outstanding balance: {formatCurrency(selectedInvoice.amount_due)}
                  </span>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="bank_transfer">Bank Transfer (NEFT / RTGS)</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="online">Online Payment Gateway</option>
                    <option value="cash">Cash / Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Reference Note / Transaction ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-90238129, Bank reference"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isRecordingPayment}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {isRecordingPayment ? 'Recording...' : `Record Payment of ${formatCurrency(paymentAmount)}`}
                </button>
              </form>
            )}

            {/* Line items table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Itemized Line Breakdown
              </h4>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border bg-card">
                {selectedInvoice.lines.map((line) => (
                  <div key={line.id} className="p-3 text-xs flex justify-between items-start">
                    <div className="space-y-0.5 pr-2">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>{line.description}</span>
                        {line.line_type === 'discount' && (
                          <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded font-medium">
                            Discount
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

            {/* Financial Summary */}
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(selectedInvoice.subtotal)}</span>
              </div>

              {selectedInvoice.discount_total > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Discount Total</span>
                  <span>-{formatCurrency(selectedInvoice.discount_total)}</span>
                </div>
              )}

              <div className="flex justify-between text-muted-foreground">
                <span>Tax Total (GST)</span>
                <span>{formatCurrency(selectedInvoice.tax_total)}</span>
              </div>

              <div className="pt-2 border-t border-border flex justify-between font-bold text-sm text-foreground">
                <span>Invoice Total</span>
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

            {/* Customer & Period Metadata */}
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Customer</span>
                <span className="font-semibold text-foreground">{selectedInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Email</span>
                <span className="font-medium text-foreground">{selectedInvoice.customer_email}</span>
              </div>
              <div className="flex justify-between">
                <span>Subscription</span>
                <span className="font-mono text-foreground font-semibold">
                  {selectedInvoice.subscription_number || 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Period</span>
                <span className="font-medium text-foreground">
                  {selectedInvoice.period_start} &rarr; {selectedInvoice.period_end}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Issue &bull; Due Date</span>
                <span className="font-medium text-foreground">
                  {selectedInvoice.issue_date} &bull; {selectedInvoice.due_date}
                </span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Hidden Print Invoice View for native browser printing */}
      {selectedInvoice && <InvoicePrintView invoice={selectedInvoice} />}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CreditCard,
  Clock,
  Layers,
  ArrowRight,
  Filter,
  AlertCircle,
  Search,
} from 'lucide-react';
import { StatusBadge } from '../components/shared/StatusBadge';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { formatCurrency, cn } from '../lib/utils';
import { SubscriptionDetail } from '../types/subscription';
import { CustomerInvoice } from '../types/invoice';
import { errorMessage, invoicesApi, subscriptionsApi } from '../lib/billingApi';

export const MySubscriptionsPage: React.FC = () => {
  const { toast } = useToast();
  // The API scopes this list to the logged-in customer's own subscriptions.
  const [subscriptions, setSubscriptions] = useState<SubscriptionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<number | null>(null);
  const [linkedInvoices, setLinkedInvoices] = useState<CustomerInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    subscriptionsApi
      .list({ page_size: 100 })
      .then((p) => setSubscriptions(p.items))
      .catch((err) => toast({ type: 'error', title: 'Could not load subscriptions', message: errorMessage(err) }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    if (selectedSubscriptionId === null) {
      setLinkedInvoices([]);
      return;
    }
    let cancelled = false;
    setInvoicesLoading(true);
    invoicesApi
      .list({ subscription_id: selectedSubscriptionId, page_size: 100 })
      .then((p) => !cancelled && setLinkedInvoices(p.items))
      .catch(() => !cancelled && setLinkedInvoices([]))
      .finally(() => !cancelled && setInvoicesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedSubscriptionId]);

  // Filter subscriptions by status and search keyword
  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesStatus =
      statusFilter === 'all' ? true : sub.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch =
      sub.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.plan_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const selectedSubscription = subscriptions.find((s) => s.id === selectedSubscriptionId) || null;

  const handleCloseEarlyClick = () => {
    setIsCloseModalOpen(true);
  };

  const handleConfirmCloseEarly = async () => {
    if (!selectedSubscription) return;
    setIsClosing(true);
    try {
      const updated = await subscriptionsApi.close(selectedSubscription.id);
      setSubscriptions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setIsCloseModalOpen(false);
      toast({
        type: 'success',
        title: 'Subscription Closed',
        message: `Subscription ${updated.number} has been closed.`,
      });
    } catch (err) {
      toast({ type: 'error', title: 'Could not close subscription', message: errorMessage(err) });
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            My Subscriptions
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Manage your recurring plans, view line breakdown, and inspect billing cycles.
          </p>
        </div>

        {/* Global Action / Quick Summary Badge */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-card border border-border shadow-xs flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Active Subscriptions:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {subscriptions.filter((s) => s.status === 'active').length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Upper Column: List Cards (Grid View) */}
        <div className={cn('space-y-4', selectedSubscription ? 'lg:col-span-5' : 'lg:col-span-12')}>
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search plan or SUB-ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-2 px-2.5 text-xs rounded-lg bg-card border border-border text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer transition-all"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="confirmed">Confirmed</option>
                <option value="closed">Closed</option>
                <option value="quotation">Quotation</option>
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          <div
            className={cn(
              'grid gap-3.5',
              selectedSubscription
                ? 'grid-cols-1'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            )}
          >
            {loading ? (
              <div className="col-span-full py-12 text-center text-xs text-muted-foreground">
                Loading subscriptions...
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl bg-card/40 p-6">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-foreground">No subscriptions found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search query or status filter.
                </p>
              </div>
            ) : (
              filteredSubscriptions.map((sub) => {
                const isSelected = selectedSubscriptionId === sub.id;

                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSubscriptionId(sub.id)}
                    className={cn(
                      'p-4 rounded-xl border bg-card text-card-foreground shadow-xs cursor-pointer transition-all hover:shadow-md relative group',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 shadow-primary/5 bg-primary/2'
                        : 'border-border hover:border-border/80'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[11px] font-mono font-medium text-muted-foreground">
                          {sub.number}
                        </span>
                        <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                          {sub.plan_name}
                        </h3>
                      </div>
                      <StatusBadge status={sub.status} />
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/60 flex items-end justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {sub.next_billing_date ? (
                              <>
                                Next Billing:{' '}
                                <strong className="text-foreground font-medium">
                                  {sub.next_billing_date}
                                </strong>
                              </>
                            ) : (
                              <span>No scheduled billing</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Terms: Net {sub.payment_terms_days} days</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground uppercase font-medium block">
                          Amount / {sub.billing_period}
                        </span>
                        <span className="text-base font-bold text-foreground tracking-tight">
                          {formatCurrency(sub.total)}
                        </span>
                      </div>
                    </div>

                    {/* View Details Prompt Button */}
                    <div className="mt-3 pt-2 flex items-center justify-end text-xs font-medium text-primary gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>View details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Subscription Detail View */}
        {selectedSubscription && (
          <div className="lg:col-span-7 space-y-5 animate-in fade-in-50 duration-200">
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-6">
              {/* Header with Title and Close Early button */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-muted-foreground">
                      {selectedSubscription.number}
                    </span>
                    <StatusBadge status={selectedSubscription.status} />
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-foreground mt-1">
                    {selectedSubscription.plan_name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Billed{' '}
                    <span className="capitalize font-medium text-foreground">
                      {selectedSubscription.billing_period}
                    </span>{' '}
                    &middot; Customer: {selectedSubscription.customer_name}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start">
                  {/* Close Early Action: conditionally shown only if plan allows early closing & not already closed */}
                  {selectedSubscription.can_close && (
                      <button
                        onClick={handleCloseEarlyClick}
                        className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/70 text-red-700 dark:text-red-400 text-xs font-semibold shadow-xs transition-all active:scale-95"
                      >
                        Close Early
                      </button>
                    )}

                  <button
                    onClick={() => setSelectedSubscriptionId(null)}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
                    title="Close details panel"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Core Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/80">
                <div>
                  <span className="text-[11px] text-muted-foreground block font-medium">
                    Start Date
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {selectedSubscription.start_date}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block font-medium">
                    Expiry Date
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {selectedSubscription.expiry_date || 'Ongoing (No Expiry)'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block font-medium">
                    Payment Terms
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    Net {selectedSubscription.payment_terms_days} Days
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block font-medium">
                    Next Billing
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {selectedSubscription.next_billing_date || 'None'}
                  </span>
                </div>
              </div>

              {/* Subscription Lines Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Subscription Lines</h3>
                </div>

                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="px-3.5 py-2">Product / Service</th>
                        <th className="px-3.5 py-2 text-center">Qty</th>
                        <th className="px-3.5 py-2 text-right">Unit Price</th>
                        <th className="px-3.5 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedSubscription.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3.5 py-2.5">
                            <div className="font-medium text-foreground">
                              {line.product_name}
                            </div>
                            {line.variant_label && (
                              <div className="text-[10px] text-muted-foreground">
                                {line.variant_label}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-center font-mono">
                            {line.quantity}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-muted-foreground">
                            {formatCurrency(line.unit_price)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-foreground">
                            {formatCurrency(line.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t border-border font-semibold text-foreground">
                      <tr>
                        <td colSpan={3} className="px-3.5 py-2 text-right text-muted-foreground">
                          Total Recurring Price ({selectedSubscription.billing_period}):
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono text-primary text-sm font-bold">
                          {formatCurrency(selectedSubscription.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Linked Invoices History */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Linked Invoice History
                    </h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {linkedInvoices.length} {linkedInvoices.length === 1 ? 'invoice' : 'invoices'}
                  </span>
                </div>

                {invoicesLoading ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">Loading invoices...</div>
                ) : linkedInvoices.length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-border rounded-lg bg-card/30">
                    <p className="text-xs text-muted-foreground">
                      No invoices have been generated for this subscription yet.
                    </p>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2">Invoice #</th>
                          <th className="px-3 py-2">Billing Period</th>
                          <th className="px-3 py-2">Due Date</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {linkedInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                              {inv.number}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {inv.period_start} to {inv.period_end}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {inv.due_date}
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={inv.status} />
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                              {formatCurrency(inv.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Close Early Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isCloseModalOpen}
        title="Confirm Early Closure"
        description={`Are you sure you want to close subscription "${selectedSubscription?.number} (${selectedSubscription?.plan_name})"? This action will terminate recurring renewals immediately and prevent any future automated billing cycles.`}
        confirmLabel="Yes, Close Subscription"
        cancelLabel="Keep Active"
        isDestructive={true}
        isLoading={isClosing}
        onConfirm={handleConfirmCloseEarly}
        onCancel={() => setIsCloseModalOpen(false)}
      />
    </div>
  );
};

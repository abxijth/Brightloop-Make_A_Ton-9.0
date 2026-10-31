import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Eye, Printer, ChevronRight, Pencil } from 'lucide-react';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Stepper } from '../components/shared/Stepper';
import { Drawer } from '../components/shared/Drawer';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { SubscriptionFormDrawer } from '../components/subscriptions/SubscriptionFormDrawer';
import { errorMessage, subscriptionsApi } from '../lib/billingApi';
import { useDebounced } from '../lib/useDebounced';
import { SubscriptionDetail, SubscriptionStatus } from '../types/subscription';
import { cn, formatCurrency } from '../lib/utils';

const STEPS = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];
const PAGE_SIZE = 15;
const EDITABLE: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed'];

const TRANSITION_LABELS: Partial<Record<SubscriptionStatus, string>> = {
  quotation: 'Send Quotation',
  confirmed: 'Confirm Subscription',
  active: 'Activate Subscription',
};

export const SubscriptionsBackOfficePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [subscriptions, setSubscriptions] = useState<SubscriptionDetail[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounced(searchQuery);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedSub, setSelectedSub] = useState<SubscriptionDetail | null>(null);
  const [formState, setFormState] = useState<{ open: boolean; editing: SubscriptionDetail | null }>({ open: false, editing: null });
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    subscriptionsApi
      .list({
        page: currentPage,
        page_size: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: debouncedSearch.trim() || undefined,
      })
      .then((p) => {
        setSubscriptions(p.items);
        setTotalCount(p.total);
      })
      .catch((err) => toast({ type: 'error', title: 'Could not load subscriptions', message: errorMessage(err) }))
      .finally(() => setLoading(false));
  }, [currentPage, statusFilter, debouncedSearch, toast]);

  useEffect(load, [load]);

  const applyUpdate = (updated: SubscriptionDetail) => {
    setSelectedSub(updated);
    setSubscriptions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstRow = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;

  // The forward step (never "closed": closing has its own confirmation).
  const nextStatus = (sub: SubscriptionDetail): SubscriptionStatus | null =>
    sub.allowed_transitions.find((s) => s !== 'closed') ?? null;

  const handleAdvanceStatus = async () => {
    if (!selectedSub) return;
    const next = nextStatus(selectedSub);
    if (!next) return;
    setBusy(true);
    try {
      const updated = await subscriptionsApi.transition(selectedSub.id, next);
      applyUpdate(updated);
      toast({ type: 'success', title: 'Status Updated', message: `Subscription ${updated.number} is now ${updated.status}.` });
    } catch (err) {
      toast({ type: 'error', title: 'Could not change status', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleCloseSubscription = async () => {
    if (!selectedSub) return;
    setBusy(true);
    try {
      const updated = await subscriptionsApi.close(selectedSub.id);
      applyUpdate(updated);
      setIsCloseDialogOpen(false);
      toast({ type: 'info', title: 'Subscription Closed', message: `Subscription ${updated.number} has been closed.` });
    } catch (err) {
      toast({ type: 'error', title: 'Could not close subscription', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleSaved = (saved: SubscriptionDetail) => {
    if (formState.editing) {
      applyUpdate(saved);
    } else {
      setSelectedSub(saved);
      load();
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Subscriptions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create quotations, move subscriptions through their lifecycle, and close contracts
          </p>
        </div>

        <button
          onClick={() => setFormState({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Subscription</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by SUB-0001, customer name, plan..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border overflow-x-auto">
          {['all', 'draft', 'quotation', 'confirmed', 'active', 'closed'].map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status);
                setCurrentPage(1);
              }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md capitalize font-medium transition-all whitespace-nowrap',
                statusFilter === status
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                <th className="py-3 px-4">Number</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Start Date</th>
                <th className="py-3 px-4">Next Billing</th>
                <th className="py-3 px-4 text-right">Recurring Amount</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    Loading subscriptions...
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No subscriptions found matching the selected filter.
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => setSelectedSub(sub)}
                    className={cn('hover:bg-muted/20 transition-colors cursor-pointer', loading && 'opacity-60')}
                  >
                    <td className="py-3.5 px-4 font-mono font-medium text-foreground">{sub.number}</td>
                    <td className="py-3.5 px-4 font-medium text-foreground">{sub.customer_name}</td>
                    <td className="py-3.5 px-4 text-muted-foreground">{sub.plan_name}</td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-muted-foreground">{sub.start_date}</td>
                    <td className="py-3.5 px-4 font-mono text-muted-foreground">{sub.next_billing_date || '—'}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-foreground">
                      {formatCurrency(sub.total)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSub(sub);
                        }}
                        className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Showing {firstRow} to {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} subscriptions
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
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Detail & Stepper Drawer */}
      <Drawer
        isOpen={selectedSub !== null && !formState.open}
        onClose={() => setSelectedSub(null)}
        title={selectedSub ? `${selectedSub.number} — ${selectedSub.customer_name}` : ''}
        description="Subscription quotation & contract lifecycle overview"
        footer={
          selectedSub && (
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                {EDITABLE.includes(selectedSub.status) && (
                  <button
                    onClick={() => setFormState({ open: true, editing: selectedSub })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedSub.can_close && (
                  <button
                    onClick={() => setIsCloseDialogOpen(true)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Close
                  </button>
                )}

                {nextStatus(selectedSub) && (
                  <button
                    onClick={handleAdvanceStatus}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-xs disabled:opacity-50"
                  >
                    <span>{busy ? 'Working...' : TRANSITION_LABELS[nextStatus(selectedSub)!]}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedSub && (
          <div className="space-y-6">
            <div className="p-3 bg-muted/20 border border-border rounded-xl">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block">
                Contract Lifecycle
              </span>
              <Stepper steps={STEPS} currentStep={selectedSub.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Customer</span>
                <span className="font-semibold text-foreground">{selectedSub.customer_name}</span>
              </div>
              <div className="p-3 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Plan</span>
                <span className="font-semibold text-foreground">{selectedSub.plan_name}</span>
              </div>
              <div className="p-3 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Start Date</span>
                <span className="font-mono text-foreground">{selectedSub.start_date}</span>
              </div>
              <div className="p-3 bg-muted/20 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Expiry Date</span>
                <span className="font-mono text-foreground">{selectedSub.expiry_date || 'No expiry'}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Lines</h4>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3 text-left">Product</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Price</th>
                      <th className="py-2 px-3 text-right">Tax</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedSub.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-foreground">{line.product_name}</div>
                          {line.variant_label && (
                            <div className="text-[11px] text-muted-foreground">{line.variant_label}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">{line.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(line.unit_price)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                          {line.tax_name ? `${formatCurrency(line.tax_amount)} (${line.tax_name})` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium">{formatCurrency(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Payment Terms:</span>
                <span className="font-medium text-foreground">{selectedSub.payment_terms_days} days</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Billing Period:</span>
                <span className="capitalize font-medium text-foreground">{selectedSub.billing_period}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Next Billing:</span>
                <span className="font-mono font-medium text-foreground">{selectedSub.next_billing_date || '—'}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal / Tax:</span>
                <span className="font-mono text-foreground">
                  {formatCurrency(selectedSub.subtotal)} + {formatCurrency(selectedSub.tax_total)}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between text-sm font-bold text-foreground">
                <span>Total Recurring / Period:</span>
                <span className="font-mono text-primary">{formatCurrency(selectedSub.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <SubscriptionFormDrawer
        isOpen={formState.open}
        subscription={formState.editing}
        onClose={() => setFormState({ open: false, editing: null })}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={isCloseDialogOpen}
        onCancel={() => setIsCloseDialogOpen(false)}
        onConfirm={handleCloseSubscription}
        isLoading={busy}
        title="Close Subscription?"
        description={`Closing ${selectedSub?.number} stops all future billing runs for it. This cannot be undone.`}
        confirmLabel="Yes, Close Subscription"
        isDestructive={true}
      />
    </div>
  );
};
export default SubscriptionsBackOfficePage;

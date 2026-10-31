import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Eye,
  Printer,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Stepper } from '../components/shared/Stepper';
import { Drawer } from '../components/shared/Drawer';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { MOCK_SUBSCRIPTIONS } from '../lib/mockSubscriptions';
import { SubscriptionDetail, SubscriptionStatus } from '../types/subscription';
import { cn } from '../lib/utils';

const STEPS = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];

interface QuotationTemplate {
  id: string;
  name: string;
  description: string;
  planName: string;
  defaultPrice: number;
  validDays: number;
  lines: Array<{
    productName: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
  }>;
}

const SEEDED_TEMPLATES: QuotationTemplate[] = [
  {
    id: 'tmpl-1',
    name: 'Enterprise Cloud Pro Template',
    description: 'High-availability compute cluster with automated backup snapshots.',
    planName: 'Enterprise Cloud Pro',
    defaultPrice: 32499,
    validDays: 30,
    lines: [
      {
        productName: 'Dedicated Cloud Core Instance',
        variantName: 'Compute: 16 vCPU, 64GB RAM',
        quantity: 1,
        unitPrice: 24999,
      },
      {
        productName: 'Automated Snapshot & Backup Vault',
        quantity: 3,
        unitPrice: 2500,
      },
    ],
  },
  {
    id: 'tmpl-2',
    name: 'Developer Startup Bundle',
    description: 'Quick-start developer sandbox environment with standard telemetry.',
    planName: 'Developer Sandbox Tier',
    defaultPrice: 4999,
    validDays: 15,
    lines: [
      {
        productName: 'Shared Multi-tenant Cluster',
        quantity: 1,
        unitPrice: 4999,
      },
    ],
  },
  {
    id: 'tmpl-blank',
    name: 'Blank Subscription',
    description: 'Build a custom quotation from scratch with arbitrary line items.',
    planName: 'Custom Agreement',
    defaultPrice: 0,
    validDays: 30,
    lines: [],
  },
];

export const SubscriptionsBackOfficePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialStatusFilter = searchParams.get('status') || 'all';

  const { toast } = useToast();

  const [subscriptions, setSubscriptions] = useState<SubscriptionDetail[]>(MOCK_SUBSCRIPTIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);

  // Selected subscription for detail view / drawer
  const [selectedSub, setSelectedSub] = useState<SubscriptionDetail | null>(null);

  // Template picker dialog
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

  // Close subscription confirmation dialog
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);

  // Filtered subscriptions
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      const matchesSearch =
        sub.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sub.customer_name && sub.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        sub.plan_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ? true : sub.status.toLowerCase() === statusFilter.toLowerCase();

      return Boolean(matchesSearch && matchesStatus);
    });
  }, [subscriptions, searchQuery, statusFilter]);

  // Stepper advancement logic
  const getNextStatus = (current: SubscriptionStatus): SubscriptionStatus | null => {
    switch (current) {
      case 'draft':
        return 'quotation';
      case 'quotation':
        return 'confirmed';
      case 'confirmed':
        return 'active';
      default:
        return null;
    }
  };

  const getNextButtonLabel = (current: SubscriptionStatus): string => {
    switch (current) {
      case 'draft':
        return 'Send Quotation';
      case 'quotation':
        return 'Confirm Subscription';
      case 'confirmed':
        return 'Activate Subscription';
      default:
        return '';
    }
  };

  const handleAdvanceStatus = () => {
    if (!selectedSub) return;
    const next = getNextStatus(selectedSub.status);
    if (!next) return;

    const updated: SubscriptionDetail = { ...selectedSub, status: next };
    setSubscriptions((prev) => prev.map((s) => (s.id === selectedSub.id ? updated : s)));
    setSelectedSub(updated);

    toast({
      type: 'success',
      title: 'Status Updated',
      message: `Subscription ${selectedSub.number} transitioned to ${next.toUpperCase()}.`,
    });
  };

  const handleCloseSubscription = () => {
    if (!selectedSub) return;
    const updated: SubscriptionDetail = { ...selectedSub, status: 'closed' };
    setSubscriptions((prev) => prev.map((s) => (s.id === selectedSub.id ? updated : s)));
    setSelectedSub(updated);
    setIsCloseDialogOpen(false);

    toast({
      type: 'info',
      title: 'Subscription Closed',
      message: `Subscription ${selectedSub.number} has been closed.`,
    });
  };

  const handleSelectTemplate = (template: QuotationTemplate) => {
    const nextNumber = `SUB-${String(subscriptions.length + 1).padStart(4, '0')}`;
    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + template.validDays);

    const newSub: SubscriptionDetail = {
      id: Date.now(),
      number: nextNumber,
      customer_id: 102,
      customer_name: 'Nexus Global Logistics',
      plan_id: 10,
      plan_name: template.planName,
      plan: {
        id: 10,
        name: template.planName,
        price: template.defaultPrice,
        billing_period: 'monthly',
        min_quantity: 1,
        available_from: today,
        available_to: null,
        auto_close: false,
        allow_early_close: true,
        is_active: true,
      },
      status: template.id === 'tmpl-blank' ? 'draft' : 'quotation',
      start_date: today,
      expiry_date: expiry.toISOString().split('T')[0],
      payment_terms_days: 15,
      next_billing_date: today,
      total_recurring_amount: template.defaultPrice,
      lines: template.lines.map((l, idx) => ({
        id: Date.now() + idx,
        subscription_id: Date.now(),
        product_id: 100 + idx,
        product_name: l.productName,
        variant_id: l.variantName ? 200 + idx : null,
        variant_name: l.variantName || null,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.quantity * l.unitPrice,
      })),
      created_at: new Date().toISOString(),
    };

    setSubscriptions([newSub, ...subscriptions]);
    setIsTemplatePickerOpen(false);
    setSelectedSub(newSub);

    toast({
      type: 'success',
      title: 'Quotation Created',
      message: `Created ${newSub.number} using template "${template.name}".`,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Subscriptions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage quotation templates, active subscription agreements, and contract lifecycles
          </p>
        </div>

        <button
          onClick={() => setIsTemplatePickerOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Subscription</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by SUB-0001, customer name, plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border overflow-x-auto">
          {['all', 'draft', 'quotation', 'confirmed', 'active', 'closed'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
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
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No subscriptions found matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => setSelectedSub(sub)}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                      {sub.number}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-foreground">
                      {sub.customer_name}
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {sub.plan_name}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-muted-foreground">
                      {sub.start_date}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-muted-foreground">
                      {sub.next_billing_date || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-foreground">
                      ₹{sub.total_recurring_amount.toLocaleString('en-IN')}
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
      </div>

      {/* Subscription Detail & Stepper Drawer */}
      <Drawer
        isOpen={selectedSub !== null}
        onClose={() => setSelectedSub(null)}
        title={selectedSub ? `${selectedSub.number} — ${selectedSub.customer_name}` : ''}
        description="Subscription quotation & contract lifecycle overview"
        footer={
          selectedSub && (
            <div className="flex items-center justify-between w-full">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>

              <div className="flex items-center gap-2">
                {selectedSub.status !== 'closed' && (
                  <button
                    onClick={() => setIsCloseDialogOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Close
                  </button>
                )}

                {getNextStatus(selectedSub.status) && (
                  <button
                    onClick={handleAdvanceStatus}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-xs"
                  >
                    <span>{getNextButtonLabel(selectedSub.status)}</span>
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
            {/* Status Stepper (UX_DESIGN.md Section 3.3) */}
            <div className="p-3 bg-muted/20 border border-border rounded-xl">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block">
                Contract Lifecycle Stepper
              </span>
              <Stepper steps={STEPS} currentStep={selectedSub.status} />
            </div>

            {/* General Info Grid */}
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

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                Quotation Line Items
              </h4>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3 text-left">Product</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Price</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedSub.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-foreground">{line.product_name}</div>
                          {line.variant_name && (
                            <div className="text-[11px] text-muted-foreground">{line.variant_name}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">{line.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          ₹{line.unit_price.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium">
                          ₹{line.line_total.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sticky Totals Panel (UX_DESIGN.md Section 3.3) */}
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Payment Terms:</span>
                <span className="font-medium text-foreground">{selectedSub.payment_terms_days} days</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Billing Period:</span>
                <span className="capitalize font-medium text-foreground">
                  {selectedSub.plan.billing_period}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between text-sm font-bold text-foreground">
                <span>Total Recurring / Period:</span>
                <span className="font-mono text-primary">
                  ₹{selectedSub.total_recurring_amount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Quotation Template Picker Modal (UX_DESIGN.md Section 3.3) */}
      {isTemplatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base text-foreground">New Subscription Quotation</h3>
              </div>
              <button
                onClick={() => setIsTemplatePickerOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Select a seeded quotation template to prefill standard plans and line items, or start blank:
            </p>

            <div className="space-y-3">
              {SEEDED_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className="p-3.5 rounded-lg border border-border bg-card hover:border-primary hover:bg-muted/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {tmpl.name}
                    </h4>
                    {tmpl.defaultPrice > 0 && (
                      <span className="text-xs font-mono font-medium text-foreground">
                        ₹{tmpl.defaultPrice.toLocaleString('en-IN')}/mo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{tmpl.description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-muted">Valid {tmpl.validDays} days</span>
                    <span>•</span>
                    <span>{tmpl.lines.length} default line items</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Close Subscription Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isCloseDialogOpen}
        onCancel={() => setIsCloseDialogOpen(false)}
        onConfirm={handleCloseSubscription}
        title="Close Subscription?"
        description={`Closing ${selectedSub?.number} will terminate recurring billing runs. This action is recorded in the audit trail.`}
        confirmLabel="Yes, Close Subscription"
        isDestructive={true}
      />
    </div>
  );
};
export default SubscriptionsBackOfficePage;
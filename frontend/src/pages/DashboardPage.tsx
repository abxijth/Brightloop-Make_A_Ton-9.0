import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  CreditCard,
  AlertCircle,
  Clock,
  ArrowRight,
  CheckCircle2,
  Calendar,
  DollarSign,
  Plus,
} from 'lucide-react';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useToast } from '../components/shared/Toast';
import { RecordPaymentDrawer } from '../components/invoices/RecordPaymentDrawer';
import { errorMessage, reportsApi, type DashboardSummary, type OverdueInvoice } from '../lib/billingApi';
import { cn, formatCurrency } from '../lib/utils';

type RangeId = 'this_month' | 'last_month' | 'quarter' | 'ytd';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Date window for each period preset, ending today at the latest. */
function rangeFor(id: RangeId, now = new Date()): { date_from: string; date_to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (id) {
    case 'last_month':
      return { date_from: iso(new Date(y, m - 1, 1)), date_to: iso(new Date(y, m, 0)) };
    case 'quarter':
      return { date_from: iso(new Date(y, Math.floor(m / 3) * 3, 1)), date_to: iso(now) };
    case 'ytd':
      return { date_from: iso(new Date(y, 0, 1)), date_to: iso(now) };
    case 'this_month':
    default:
      return { date_from: iso(new Date(y, m, 1)), date_to: iso(now) };
  }
}

const RANGE_OPTIONS: { id: RangeId; label: string }[] = (() => {
  const now = new Date();
  return [
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'quarter', label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` },
    { id: 'ytd', label: `YTD ${now.getFullYear()}` },
  ];
})();

const monthLabel = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleString('en-IN', { month: 'short' });

interface DashboardPageProps {
  role?: 'admin' | 'staff';
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ role = 'admin' }) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<RangeId>('this_month');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentDrawerInvoice, setPaymentDrawerInvoice] = useState<OverdueInvoice | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    reportsApi
      .summary(rangeFor(dateRange))
      .then(setSummary)
      .catch((err) => toast({ type: 'error', title: 'Could not load dashboard', message: errorMessage(err) }))
      .finally(() => setLoading(false));
  }, [dateRange, toast]);

  useEffect(load, [load]);

  const overdueInvoices = summary?.overdue_invoices ?? [];
  const metrics = {
    activeSubscriptions: summary?.active_subscriptions ?? 0,
    newSubscriptions: summary?.new_subscriptions ?? 0,
    mrr: summary?.mrr ?? 0,
    revenueCollected: summary?.revenue_collected ?? 0,
    invoicedTotal: summary?.invoiced_total ?? 0,
    outstanding: summary?.outstanding_amount ?? 0,
    outstandingCount: summary?.outstanding_count ?? 0,
    overdueCount: summary?.overdue_count ?? 0,
    overdueAmount: summary?.overdue_amount ?? 0,
  };

  const revenueChartData = useMemo(
    () =>
      (summary?.revenue_by_month ?? []).map((m) => ({
        month: monthLabel(m.month),
        revenue: m.collected,
        target: m.invoiced,
      })),
    [summary]
  );
  const chartMax = Math.max(1, ...revenueChartData.flatMap((d) => [d.revenue, d.target]));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Date-range filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {role === 'admin' ? 'Finance & Operations Dashboard' : 'Operational Dashboard'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {role === 'admin'
              ? 'Real-time billing, recurring revenue, and subscription health'
              : 'Operational status of subscriptions and overdue invoices'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border rounded-lg p-1 text-xs font-medium">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
            <span className="text-muted-foreground text-[11px] font-semibold mr-1">Period:</span>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setDateRange(opt.id)}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-all text-xs',
                  dateRange === opt.id
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {role === 'staff' && (
            <button
              onClick={() => navigate('/sales/subscriptions')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-xs hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Subscription</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {role === 'admin' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* KPI 1: Active Subscriptions */}
          <div
            onClick={() => navigate('/sales/subscriptions?status=active')}
            className="p-4 rounded-xl bg-card border border-border shadow-xs hover:border-primary/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">Active Subscriptions</span>
              <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <TrendingUp className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {metrics.activeSubscriptions.toLocaleString()}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                +{metrics.newSubscriptions} started in period
              </span>
              <span className="text-muted-foreground group-hover:text-primary flex items-center gap-0.5 transition-colors">
                View list <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* KPI 2: MRR */}
          <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">Monthly Rec. Revenue</span>
              <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(metrics.mrr)}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-muted-foreground">Active subscriptions, before tax</span>
            </div>
          </div>

          {/* KPI 3: Revenue Collected */}
          <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">Revenue Collected</span>
              <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <CreditCard className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(metrics.revenueCollected)}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-muted-foreground">Invoiced {formatCurrency(metrics.invoicedTotal)}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">In period</span>
            </div>
          </div>

          {/* KPI 4: Outstanding */}
          <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">Outstanding Balance</span>
              <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(metrics.outstanding)}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-muted-foreground">{metrics.outstandingCount} unpaid invoices</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">As of today</span>
            </div>
          </div>

          {/* KPI 5: Overdue count */}
          <div
            onClick={() => {
              const el = document.getElementById('overdue-invoices-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-4 rounded-xl bg-card border border-red-200 dark:border-red-950/80 shadow-xs hover:border-red-400 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                Overdue Invoices
              </span>
              <span className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 group-hover:scale-105 transition-transform">
                <AlertCircle className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {metrics.overdueCount}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-red-600 dark:text-red-400 font-semibold">
                {formatCurrency(metrics.overdueAmount)}
              </span>
              <span className="text-muted-foreground group-hover:text-red-600 flex items-center gap-0.5 transition-colors">
                Action needed <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Staff Operational Widgets */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            onClick={() => navigate('/sales/subscriptions?status=active')}
            className="p-5 rounded-xl bg-card border border-border shadow-xs hover:border-primary/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium">Active Subscriptions</span>
              <span className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </span>
            </div>
            <div className="text-3xl font-bold text-foreground">
              {metrics.activeSubscriptions.toLocaleString()}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-emerald-600 font-medium">All live contracts</span>
              <span className="text-primary group-hover:underline flex items-center gap-1">
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          <div
            onClick={() => {
              const el = document.getElementById('overdue-invoices-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-5 rounded-xl bg-card border border-red-200 dark:border-red-950/80 shadow-xs hover:border-red-400 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                Overdue Invoices
              </span>
              <span className="p-2 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                <AlertCircle className="w-5 h-5" />
              </span>
            </div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {metrics.overdueCount}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-red-600 dark:text-red-400 font-semibold">
                {formatCurrency(metrics.overdueAmount)} total due
              </span>
              <span className="text-red-600 group-hover:underline flex items-center gap-1">
                Resolve now <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-xs font-medium text-muted-foreground">Quick Staff Actions</span>
              <p className="text-sm font-semibold text-foreground mt-1">Operational Shortcuts</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => navigate('/sales/subscriptions')}
                className="flex-1 py-2 px-3 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors text-center"
              >
                + New Subscription
              </button>
              <button
                onClick={() => navigate('/customers')}
                className="flex-1 py-2 px-3 text-xs rounded-lg border border-border bg-card text-foreground font-medium hover:bg-muted transition-colors text-center"
              >
                Customers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart Section (Admin Only per UX_DESIGN.md) */}
      {role === 'admin' && (
        <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Revenue Over Time</h2>
              <p className="text-xs text-muted-foreground">
                Payments collected vs amount invoiced, last 6 months
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-primary" />
                <span className="text-muted-foreground">Collected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-muted-foreground/30" />
                <span className="text-muted-foreground">Invoiced</span>
              </div>
            </div>
          </div>

          {/* SVG Bar Chart Visualization */}
          <div className="pt-4">
            <div className="h-56 flex items-end justify-between gap-3 sm:gap-6 px-2">
              {revenueChartData.map((item) => {
                const maxVal = chartMax;
                const heightPct = Math.round((item.revenue / maxVal) * 100);
                const targetHeightPct = Math.round((item.target / maxVal) * 100);

                return (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                    <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      {formatCurrency(item.revenue)}
                    </div>
                    <div className="w-full max-w-[48px] h-full flex items-end justify-center gap-1.5 relative">
                      {/* Target Indicator Bar */}
                      <div
                        style={{ height: `${targetHeightPct}%` }}
                        className="w-1.5 bg-muted-foreground/20 rounded-t-xs"
                        title={`Invoiced: ${formatCurrency(item.target)}`}
                      />
                      {/* Revenue Bar */}
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-primary/80 group-hover:bg-primary rounded-t-md transition-all shadow-xs"
                        title={`Collected: ${formatCurrency(item.revenue)}`}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Overdue Invoices Table Section */}
      <div id="overdue-invoices-section" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>Overdue Invoices</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
                {metrics.overdueCount}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Invoices past due date requiring collection or payment registration
              {metrics.overdueCount > overdueInvoices.length && (
                <>
                  {' '}(showing the oldest {overdueInvoices.length};{' '}
                  <button onClick={() => navigate('/billing/invoices')} className="text-primary hover:underline">
                    see all
                  </button>
                  )
                </>
              )}
            </p>
          </div>
          {metrics.overdueCount > 0 && (
            <div className="text-xs text-muted-foreground">
              Total overdue:{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(metrics.overdueAmount)}
              </span>
            </div>
          )}
        </div>

        {loading && !summary ? (
          <div className="p-8 text-center bg-card border border-border rounded-xl text-xs text-muted-foreground">
            Loading...
          </div>
        ) : overdueInvoices.length === 0 ? (
          <div className="p-8 text-center bg-card border border-border rounded-xl">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-foreground">All Invoices Up to Date</h3>
            <p className="text-xs text-muted-foreground mt-1">
              There are currently no overdue invoices.
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overdueInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        {inv.number}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground">{inv.customer_name}</div>
                        <div className="text-[11px] text-muted-foreground">{inv.customer_email}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground">
                        {inv.due_date}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status="overdue" daysOverdue={inv.days_overdue} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-red-600 dark:text-red-400">
                        {formatCurrency(inv.amount_due)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setPaymentDrawerInvoice(inv)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                        >
                          Register payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Side Drawer: Register Payment (UX_DESIGN.md Section 3.6) */}
      <RecordPaymentDrawer
        isOpen={paymentDrawerInvoice !== null}
        invoice={paymentDrawerInvoice}
        onClose={() => setPaymentDrawerInvoice(null)}
        onRecorded={load}
      />
    </div>
  );
};
export default DashboardPage;
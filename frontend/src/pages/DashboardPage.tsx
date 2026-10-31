import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  CreditCard,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  Calendar,
  DollarSign,
  Plus,
} from 'lucide-react';
import { StatusBadge } from '../components/shared/StatusBadge';
import { Drawer } from '../components/shared/Drawer';
import { useToast } from '../components/shared/Toast';
import { cn } from '../lib/utils';

interface OverdueInvoice {
  id: number;
  number: string;
  customerName: string;
  customerEmail: string;
  dueDate: string;
  daysOverdue: number;
  totalAmount: number;
  amountDue: number;
  status: 'overdue';
}

const INITIAL_OVERDUE_INVOICES: OverdueInvoice[] = [
  {
    id: 501,
    number: 'INV-0104',
    customerName: 'Acme Technologies Pvt Ltd',
    customerEmail: 'billing@acmetech.com',
    dueDate: '2026-10-15',
    daysOverdue: 16,
    totalAmount: 38348.82,
    amountDue: 38348.82,
    status: 'overdue',
  },
  {
    id: 498,
    number: 'INV-0101',
    customerName: 'Nexus Global Logistics',
    customerEmail: 'finance@nexusglobal.io',
    dueDate: '2026-10-18',
    daysOverdue: 13,
    totalAmount: 14500.0,
    amountDue: 14500.0,
    status: 'overdue',
  },
  {
    id: 489,
    number: 'INV-0096',
    customerName: 'Aura Media Studio',
    customerEmail: 'accounts@auramedia.net',
    dueDate: '2026-10-22',
    daysOverdue: 9,
    totalAmount: 7800.0,
    amountDue: 3900.0,
    status: 'overdue',
  },
  {
    id: 482,
    number: 'INV-0091',
    customerName: 'Quantum Biotech Labs',
    customerEmail: 'payables@quantumbiotech.org',
    dueDate: '2026-10-25',
    daysOverdue: 6,
    totalAmount: 22000.0,
    amountDue: 22000.0,
    status: 'overdue',
  },
];

interface DashboardPageProps {
  role?: 'admin' | 'staff';
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ role = 'admin' }) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<'this_month' | 'last_month' | 'quarter' | 'ytd'>('this_month');
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>(INITIAL_OVERDUE_INVOICES);

  // Register payment drawer state
  const [paymentDrawerInvoice, setPaymentDrawerInvoice] = useState<OverdueInvoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'bank_transfer' | 'card' | 'cash'>('online');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Metrics based on dateRange filter
  const metrics = useMemo(() => {
    switch (dateRange) {
      case 'last_month':
        return {
          activeSubscriptions: 1380,
          subscriptionsChange: '+8.1%',
          mrr: 452000,
          mrrChange: '+6.2%',
          revenueCollected: 1620000,
          outstanding: 184000,
          overdueCount: overdueInvoices.length,
          overdueAmount: overdueInvoices.reduce((acc, inv) => acc + inv.amountDue, 0),
        };
      case 'quarter':
        return {
          activeSubscriptions: 1450,
          subscriptionsChange: '+14.5%',
          mrr: 495000,
          mrrChange: '+11.8%',
          revenueCollected: 4890000,
          outstanding: 245000,
          overdueCount: overdueInvoices.length,
          overdueAmount: overdueInvoices.reduce((acc, inv) => acc + inv.amountDue, 0),
        };
      case 'ytd':
        return {
          activeSubscriptions: 1520,
          subscriptionsChange: '+28.4%',
          mrr: 512000,
          mrrChange: '+19.6%',
          revenueCollected: 14200000,
          outstanding: 310000,
          overdueCount: overdueInvoices.length,
          overdueAmount: overdueInvoices.reduce((acc, inv) => acc + inv.amountDue, 0),
        };
      case 'this_month':
      default:
        return {
          activeSubscriptions: 1420,
          subscriptionsChange: '+12.3%',
          mrr: 485250,
          mrrChange: '+8.4%',
          revenueCollected: 1842800,
          outstanding: 215400,
          overdueCount: overdueInvoices.length,
          overdueAmount: overdueInvoices.reduce((acc, inv) => acc + inv.amountDue, 0),
        };
    }
  }, [dateRange, overdueInvoices]);

  const revenueChartData = useMemo(() => {
    return [
      { month: 'May', revenue: 1120000, target: 1000000 },
      { month: 'Jun', revenue: 1250000, target: 1150000 },
      { month: 'Jul', revenue: 1380000, target: 1300000 },
      { month: 'Aug', revenue: 1540000, target: 1450000 },
      { month: 'Sep', revenue: 1620000, target: 1600000 },
      { month: 'Oct', revenue: 1842800, target: 1750000 },
    ];
  }, []);

  const openRegisterPayment = (inv: OverdueInvoice) => {
    setPaymentDrawerInvoice(inv);
    setPaymentAmount(inv.amountDue);
    setPaymentMethod('online');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentNote(`Payment for ${inv.number}`);
  };

  const handleConfirmPayment = () => {
    if (!paymentDrawerInvoice) return;
    setIsSubmittingPayment(true);

    setTimeout(() => {
      const isFullPayment = paymentAmount >= paymentDrawerInvoice.amountDue;
      if (isFullPayment) {
        setOverdueInvoices((prev) => prev.filter((i) => i.id !== paymentDrawerInvoice.id));
        toast({
          type: 'success',
          title: 'Payment Registered',
          message: `Recorded payment of ₹${paymentAmount.toLocaleString('en-IN')} for ${paymentDrawerInvoice.number}. Invoice is marked as Paid.`,
        });
      } else {
        setOverdueInvoices((prev) =>
          prev.map((i) =>
            i.id === paymentDrawerInvoice.id
              ? { ...i, amountDue: i.amountDue - paymentAmount }
              : i
          )
        );
        toast({
          type: 'success',
          title: 'Partial Payment Registered',
          message: `Recorded partial payment of ₹${paymentAmount.toLocaleString('en-IN')} for ${paymentDrawerInvoice.number}.`,
        });
      }

      setIsSubmittingPayment(false);
      setPaymentDrawerInvoice(null);
    }, 400);
  };

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
            {(
              [
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'quarter', label: 'Q4 2026' },
                { id: 'ytd', label: 'YTD 2026' },
              ] as const
            ).map((opt) => (
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
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center">
                {metrics.subscriptionsChange}
                <ArrowUpRight className="w-3 h-3 ml-0.5 inline" />
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
              ₹{metrics.mrr.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center">
                {metrics.mrrChange}
                <ArrowUpRight className="w-3 h-3 ml-0.5 inline" />
              </span>
              <span className="text-muted-foreground">vs previous</span>
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
              ₹{metrics.revenueCollected.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-muted-foreground">Period actuals</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Paid</span>
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
              ₹{metrics.outstanding.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className="text-muted-foreground">Unbilled & pending</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">In grace</span>
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
                ₹{metrics.overdueAmount.toLocaleString('en-IN')}
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
                ₹{metrics.overdueAmount.toLocaleString('en-IN')} total due
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
                Monthly revenue progression vs plan target
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-primary" />
                <span className="text-muted-foreground">Actual Revenue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-muted-foreground/30" />
                <span className="text-muted-foreground">Target</span>
              </div>
            </div>
          </div>

          {/* SVG Bar Chart Visualization */}
          <div className="pt-4">
            <div className="h-56 flex items-end justify-between gap-3 sm:gap-6 px-2">
              {revenueChartData.map((item) => {
                const maxVal = 2000000;
                const heightPct = Math.round((item.revenue / maxVal) * 100);
                const targetHeightPct = Math.round((item.target / maxVal) * 100);

                return (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                    <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      ₹{(item.revenue / 100000).toFixed(1)}L
                    </div>
                    <div className="w-full max-w-[48px] h-full flex items-end justify-center gap-1.5 relative">
                      {/* Target Indicator Bar */}
                      <div
                        style={{ height: `${targetHeightPct}%` }}
                        className="w-1.5 bg-muted-foreground/20 rounded-t-xs"
                        title={`Target: ₹${item.target.toLocaleString('en-IN')}`}
                      />
                      {/* Revenue Bar */}
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-primary/80 group-hover:bg-primary rounded-t-md transition-all shadow-xs"
                        title={`Actual: ₹${item.revenue.toLocaleString('en-IN')}`}
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
                {overdueInvoices.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Invoices past due date requiring collection or payment registration
            </p>
          </div>
          {overdueInvoices.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Total overdue:{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">
                ₹{overdueInvoices.reduce((acc, i) => acc + i.amountDue, 0).toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        {overdueInvoices.length === 0 ? (
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
                        <div className="font-medium text-foreground">{inv.customerName}</div>
                        <div className="text-[11px] text-muted-foreground">{inv.customerEmail}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground">
                        {inv.dueDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status="overdue" daysOverdue={inv.daysOverdue} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                        ₹{inv.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-red-600 dark:text-red-400">
                        ₹{inv.amountDue.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openRegisterPayment(inv)}
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
      <Drawer
        isOpen={paymentDrawerInvoice !== null}
        onClose={() => setPaymentDrawerInvoice(null)}
        title="Register Payment"
        description={
          paymentDrawerInvoice
            ? `Record a payment against invoice ${paymentDrawerInvoice.number}`
            : ''
        }
        footer={
          <>
            <button
              onClick={() => setPaymentDrawerInvoice(null)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              disabled={isSubmittingPayment || paymentAmount <= 0}
              onClick={handleConfirmPayment}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {isSubmittingPayment ? 'Recording...' : 'Confirm Payment'}
            </button>
          </>
        }
      >
        {paymentDrawerInvoice && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-muted/30 border border-border space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">
                  {paymentDrawerInvoice.customerName}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Invoiced:</span>
                <span className="font-mono text-foreground">
                  ₹{paymentDrawerInvoice.totalAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Balance Due:</span>
                <span className="font-mono font-bold text-red-600 dark:text-red-400">
                  ₹{paymentDrawerInvoice.amountDue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Payment Amount (₹)
              </label>
              <input
                type="number"
                min={1}
                max={paymentDrawerInvoice.amountDue}
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card font-mono text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Prefilled with balance due. Enter a smaller amount to record a partial payment.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'online' | 'bank_transfer' | 'card' | 'cash')
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              >
                <option value="online">Online (Mock Checkout / Gateway)</option>
                <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="card">Credit / Debit Card</option>
                <option value="cash">Cash / Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card font-mono text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Note / Reference
              </label>
              <textarea
                rows={2}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Optional payment notes or transaction reference..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
export default DashboardPage;
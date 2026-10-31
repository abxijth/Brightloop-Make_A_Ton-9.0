import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatusBadge } from '../components/shared/StatusBadge';
import { apiGet } from '../lib/api';
import { cn, formatCurrency } from '../lib/utils';

interface CustomerDetail {
  id: number;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  outstanding_balance: string;
}

interface Invoice {
  id: number;
  number: string;
  status: string;
  issue_date: string;
  due_date: string;
  total: string;
  amount_due: string;
}

interface Payment {
  id: number;
  invoice_number: string | null;
  method: string;
  amount: string;
  payment_date: string;
  note: string | null;
}

const PAGE_SIZE = 25;
const TABS = [
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const invoiceColumns: Column<Invoice>[] = [
  { key: 'number', header: 'Invoice' },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'issue_date', header: 'Issued' },
  { key: 'due_date', header: 'Due' },
  { key: 'total', header: 'Total', render: (r) => formatCurrency(r.total) },
  { key: 'amount_due', header: 'Balance due', render: (r) => formatCurrency(r.amount_due) },
];

const paymentColumns: Column<Payment>[] = [
  { key: 'payment_date', header: 'Date' },
  { key: 'invoice_number', header: 'Invoice', render: (r) => r.invoice_number ?? '—' },
  { key: 'method', header: 'Method', render: (r) => <span className="capitalize">{r.method.replace('_', ' ')}</span> },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount) },
  { key: 'note', header: 'Note', render: (r) => r.note ?? '—' },
];

function RelatedList<T extends { id: number }>({
  path,
  customerId,
  columns,
  empty,
}: {
  path: string;
  customerId: number;
  columns: Column<T>[];
  empty: string;
}) {
  const [params] = useSearchParams();
  const page = parseInt(params.get('page') || '1', 10);
  const [data, setData] = useState<{ items: T[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiGet<{ items: T[]; total: number }>(path, {
      customer_id: customerId,
      page,
      page_size: PAGE_SIZE,
    })
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path, customerId, page]);

  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DataTable
        columns={columns}
        data={data.items}
        totalCount={data.total}
        pageSize={PAGE_SIZE}
        isLoading={loading}
        emptyMessage={empty}
      />
    </>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'invoices') as Tab;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCustomer(null);
    setError('');
    apiGet<CustomerDetail>(`/customers/${customerId}`)
      .then(setCustomer)
      .catch((e) => setError(e.status === 404 ? 'Customer not found.' : e.message));
  }, [customerId]);

  const selectTab = (key: Tab) => setParams({ tab: key });

  return (
    <div className="space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Customers
      </Link>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!customer && !error && <div className="h-20 rounded-xl bg-muted animate-pulse" />}

      {customer && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">{customer.name}</h1>
              {customer.company && <p className="text-sm">{customer.company}</p>}
              <p className="text-sm text-muted-foreground">
                {[customer.email, customer.phone].filter(Boolean).join(' · ')}
              </p>
              {customer.address && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{customer.address}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Outstanding balance</p>
              <p
                className={cn(
                  'text-2xl font-semibold',
                  Number(customer.outstanding_balance) > 0 && 'text-red-600',
                )}
              >
                {formatCurrency(customer.outstanding_balance)}
              </p>
            </div>
          </div>

          <div role="tablist" className="flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => selectTab(t.key)}
                className={cn(
                  'px-4 py-2 text-sm font-medium -mb-px border-b-2',
                  tab === t.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'subscriptions' && (
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Subscriptions will appear here once the subscriptions API is available.
            </div>
          )}
          {tab === 'invoices' && (
            <RelatedList<Invoice>
              path="/invoices"
              customerId={customerId}
              columns={invoiceColumns}
              empty="No invoices yet."
            />
          )}
          {tab === 'payments' && (
            <RelatedList<Payment>
              path="/payments"
              customerId={customerId}
              columns={paymentColumns}
              empty="No payments yet."
            />
          )}
        </>
      )}
    </div>
  );
}

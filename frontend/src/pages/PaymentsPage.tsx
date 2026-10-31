import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Receipt,
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

interface PaymentRecord {
  id: number;
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  method: 'bank_transfer' | 'card' | 'online' | 'cash';
  amount: number;
  payment_date: string;
  note?: string;
  status: 'completed';
}

const MOCK_PAYMENTS: PaymentRecord[] = [
  {
    id: 901,
    invoice_id: 480,
    invoice_number: 'INV-0089',
    customer_id: 101,
    customer_name: 'Acme Technologies Pvt Ltd',
    customer_email: 'billing@acmetech.io',
    method: 'bank_transfer',
    amount: 38348.82,
    payment_date: '2026-09-28',
    note: 'NEFT Transaction REF-9831049281',
    status: 'completed',
  },
  {
    id: 902,
    invoice_id: 512,
    invoice_number: 'INV-0112',
    customer_id: 101,
    customer_name: 'Acme Technologies Pvt Ltd',
    customer_email: 'billing@acmetech.io',
    method: 'card',
    amount: 5898.82,
    payment_date: '2026-10-05',
    note: 'Online Gateway: VISA ending 4242',
    status: 'completed',
  },
  {
    id: 903,
    invoice_id: 520,
    invoice_number: 'INV-0120',
    customer_id: 101,
    customer_name: 'Acme Technologies Pvt Ltd',
    customer_email: 'billing@acmetech.io',
    method: 'bank_transfer',
    amount: 1500.0,
    payment_date: '2026-10-26',
    note: 'Advance installment UTR-09418290',
    status: 'completed',
  },
  {
    id: 904,
    invoice_id: 450,
    invoice_number: 'INV-0062',
    customer_id: 101,
    customer_name: 'Acme Technologies Pvt Ltd',
    customer_email: 'billing@acmetech.io',
    method: 'online',
    amount: 37168.82,
    payment_date: '2026-08-25',
    note: 'Portal Mock Checkout Settlement',
    status: 'completed',
  },
];

export function PaymentsPage() {
  const [payments] = useState<PaymentRecord[]>(MOCK_PAYMENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesMethod = methodFilter === 'all' || p.method === methodFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        p.invoice_number.toLowerCase().includes(query) ||
        p.customer_name.toLowerCase().includes(query) ||
        (p.note && p.note.toLowerCase().includes(query));
      return matchesMethod && matchesSearch;
    });
  }, [payments, searchQuery, methodFilter]);

  const totalCollected = useMemo(() => payments.reduce((acc, p) => acc + p.amount, 0), [payments]);
  const totalCount = filteredPayments.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginated = filteredPayments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'bank_transfer':
        return 'Bank Transfer (NEFT/RTGS)';
      case 'card':
        return 'Credit / Debit Card';
      case 'online':
        return 'Online Gateway';
      case 'cash':
        return 'Cash / Cheque';
      default:
        return method;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Payments Ledger
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Audit trail of all customer settlements, gateway transactions, and manual receipts.
          </p>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Settled Volume
          </span>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(totalCollected)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Across {payments.length} transactions
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Payment Gateways
          </span>
          <div className="text-xl font-bold text-foreground mt-1">4 Methods</div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            NEFT, Card, Online, Cheque
          </span>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Reconciliation Rate
          </span>
          <div className="text-xl font-bold text-foreground mt-1">100%</div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            All records tied to invoices
          </span>
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
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    No payments found.
                  </td>
                </tr>
              ) : (
                paginated.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">
                      REC-{p.id}
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {p.invoice_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{p.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.customer_email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {getMethodBadge(p.method)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{p.payment_date}</td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                      {p.note || '-'}
                    </td>
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
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount} payment transactions
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
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

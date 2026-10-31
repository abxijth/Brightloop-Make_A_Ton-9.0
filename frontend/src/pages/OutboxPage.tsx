import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { apiGet } from '../lib/api';

interface OutboxItem {
  id: number;
  type: 'password_reset' | 'invoice';
  to_email: string;
  subject: string;
  invoice_id: number | null;
  created_at: string;
}
interface OutboxPageData {
  items: OutboxItem[];
  total: number;
}

const PAGE_SIZE = 25;
const TYPE_LABEL = { password_reset: 'Password reset', invoice: 'Invoice' };

/** Email body in a sandboxed iframe: links open in a new tab, scripts never run. */
function EmailBody({ id }: { id: number }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<{ body_html: string }>(`/outbox/${id}`)
      .then((d) => setHtml(d.body_html))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (html === null) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <iframe
      title={`Email ${id}`}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={`<base target="_blank"><body style="font-family:sans-serif;font-size:14px">${html}</body>`}
      className="w-full h-48 rounded-md border border-border bg-white"
    />
  );
}

export function OutboxPage() {
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') || '1', 10);
  const type = params.get('type') || '';
  const search = params.get('search') || '';
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';

  const [data, setData] = useState<OutboxPageData>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<OutboxPageData>('/outbox', { page, page_size: PAGE_SIZE, type, search, order })
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, type, search, order]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  };

  const columns: Column<OutboxItem>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {openId === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {new Date(r.created_at).toLocaleString()}
        </span>
      ),
    },
    { key: 'to_email', header: 'Recipient' },
    { key: 'subject', header: 'Subject' },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABEL[r.type] },
  ];

  // DataTable renders flat rows; the expanded email is shown in a panel below it.
  const open = data.items.find((i) => i.id === openId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Outbox</h1>
        <p className="text-sm text-muted-foreground">
          Emails are log-only; nothing is sent. Click a row to read it and use its links.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            defaultValue={search}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('search', e.currentTarget.value)}
            placeholder="Search recipient or subject"
            className="pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-card w-72"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setFilter('type', e.target.value)}
          className="px-3 py-2 text-sm rounded-md border border-border bg-card"
        >
          <option value="">All types</option>
          <option value="password_reset">Password reset</option>
          <option value="invoice">Invoice</option>
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={data.items}
        totalCount={data.total}
        pageSize={PAGE_SIZE}
        isLoading={loading}
        onRowClick={(r) => setOpenId(openId === r.id ? null : r.id)}
        emptyMessage="No emails yet."
      />

      {open && (
        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <div className="text-sm">
            <div className="font-medium">{open.subject}</div>
            <div className="text-muted-foreground">To: {open.to_email}</div>
          </div>
          <EmailBody id={open.id} />
        </div>
      )}
    </div>
  );
}

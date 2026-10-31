import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { Drawer } from '../components/shared/Drawer';
import { FormField } from '../components/shared/FormField';
import { useToast } from '../components/shared/Toast';
import { ApiError, apiGet, apiPatch, apiPost } from '../lib/api';

interface Customer {
  id: number;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;
const EMPTY_FORM = { name: '', email: '', company: '', phone: '', address: '' };
type Form = typeof EMPTY_FORM;
const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background';

export function CustomersPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = parseInt(params.get('page') || '1', 10);
  const search = params.get('search') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState<{ items: Customer[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: Customer[]; total: number }>('/customers', {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
    })
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(load, [load]);

  // Debounce typing into the URL so filter state is shareable and each keystroke isn't a request.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      next.set('page', '1');
      setParams(next);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, params, setParams]);

  const openDrawer = (customer: Customer | null) => {
    setEditing(customer);
    setForm(
      customer
        ? {
            name: customer.name,
            email: customer.email,
            company: customer.company ?? '',
            phone: customer.phone ?? '',
            address: customer.address ?? '',
          }
        : EMPTY_FORM,
    );
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setSaving(true);
    setFieldErrors({});
    try {
      if (editing) await apiPatch(`/customers/${editing.id}`, form);
      else await apiPost('/customers', form);
      setDrawerOpen(false);
      toast({
        type: 'success',
        title: editing ? 'Customer updated' : 'Customer added',
        message: form.email,
      });
      load();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(e.fields);
        if (!Object.keys(e.fields).length) toast({ type: 'error', title: e.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Name' },
    { key: 'company', header: 'Company', render: (r) => r.company ?? '—' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    {
      key: 'created_at',
      header: 'Added',
      render: (r) => new Date(r.created_at).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openDrawer(r);
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Edit
        </button>
      ),
    },
  ];

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Create a profile before someone signs up; it links to them by email when they do.
          </p>
        </div>
        <button
          onClick={() => openDrawer(null)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground"
        >
          <Plus className="w-4 h-4" /> Add customer
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, company or email"
          aria-label="Search customers"
          className={`${inputClass} pl-9`}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={data.items}
        totalCount={data.total}
        pageSize={PAGE_SIZE}
        isLoading={loading}
        onRowClick={(r) => navigate(`/customers/${r.id}`)}
        emptyMessage={search ? 'No customers match your search.' : 'No customers yet.'}
      />

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Edit customer' : 'Add customer'}
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="px-3 py-2 text-sm rounded-md border border-border">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
            </button>
          </>
        }
      >
        <FormField label="Name" required htmlFor="cf-name" error={fieldErrors.name}>
          <input id="cf-name" className={inputClass} value={form.name} onChange={set('name')} />
        </FormField>
        <FormField label="Email" required htmlFor="cf-email" error={fieldErrors.email}>
          <input id="cf-email" type="email" className={inputClass} value={form.email} onChange={set('email')} />
        </FormField>
        <FormField label="Company" htmlFor="cf-company" error={fieldErrors.company}>
          <input id="cf-company" className={inputClass} value={form.company} onChange={set('company')} />
        </FormField>
        <FormField label="Phone" htmlFor="cf-phone" error={fieldErrors.phone}>
          <input id="cf-phone" className={inputClass} value={form.phone} onChange={set('phone')} />
        </FormField>
        <FormField label="Address" htmlFor="cf-address" error={fieldErrors.address}>
          <textarea id="cf-address" rows={3} className={inputClass} value={form.address} onChange={set('address')} />
        </FormField>
      </Drawer>
    </div>
  );
}

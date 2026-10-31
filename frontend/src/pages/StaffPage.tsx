import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { Drawer } from '../components/shared/Drawer';
import { FormField } from '../components/shared/FormField';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { ApiError, apiGet, apiPost } from '../lib/api';

interface StaffMember {
  id: number;
  email: string;
  full_name: string;
  role: 'admin' | 'staff';
  is_active: boolean;
  created_at: string;
}

const PAGE_SIZE = 25;
const EMPTY_FORM = { full_name: '', email: '', password: '', role: 'staff' };
const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background';

export function StaffPage() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const page = parseInt(params.get('page') || '1', 10);

  const [data, setData] = useState<{ items: StaffMember[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [target, setTarget] = useState<StaffMember | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: StaffMember[]; total: number }>('/staff', { page, page_size: PAGE_SIZE })
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.status === 403 ? 'Only admins can manage staff.' : e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(load, [load]);

  const openDrawer = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const create = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      await apiPost('/staff', form);
      setDrawerOpen(false);
      toast({ type: 'success', title: 'Staff member added', message: form.email });
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

  const toggleActive = async () => {
    if (!target) return;
    setActing(true);
    try {
      await apiPost(`/staff/${target.id}/${target.is_active ? 'deactivate' : 'activate'}`);
      toast({ type: 'success', title: target.is_active ? 'Staff member deactivated' : 'Staff member reactivated' });
      setTarget(null);
      load();
    } catch (e) {
      toast({ type: 'error', title: (e as Error).message });
      setTarget(null);
    } finally {
      setActing(false);
    }
  };

  const columns: Column<StaffMember>[] = [
    { key: 'full_name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (r) => <span className="capitalize">{r.role}</span> },
    {
      key: 'is_active',
      header: 'Status',
      render: (r) => (
        <span className={r.is_active ? 'text-emerald-600' : 'text-muted-foreground'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          onClick={() => setTarget(r)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {r.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      ),
    },
  ];

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">
            Staff are deactivated, never deleted. A deactivated person can no longer log in.
          </p>
        </div>
        <button
          onClick={openDrawer}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground"
        >
          <Plus className="w-4 h-4" /> Add staff
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={data.items}
        totalCount={data.total}
        pageSize={PAGE_SIZE}
        isLoading={loading}
        emptyMessage="No staff yet."
      />

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Add staff member"
        description="They can log in straight away with this password."
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="px-3 py-2 text-sm rounded-md border border-border">
              Cancel
            </button>
            <button
              onClick={create}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add staff'}
            </button>
          </>
        }
      >
        <FormField label="Full name" required htmlFor="sf-name" error={fieldErrors.full_name}>
          <input id="sf-name" className={inputClass} value={form.full_name} onChange={set('full_name')} />
        </FormField>
        <FormField label="Email" required htmlFor="sf-email" error={fieldErrors.email}>
          <input id="sf-email" type="email" className={inputClass} value={form.email} onChange={set('email')} />
        </FormField>
        <FormField
          label="Password"
          required
          htmlFor="sf-pw"
          error={fieldErrors.password}
          description="8+ characters with upper and lower case, a number and a special character."
        >
          <input id="sf-pw" type="password" className={inputClass} value={form.password} onChange={set('password')} />
        </FormField>
        <FormField label="Role" htmlFor="sf-role" error={fieldErrors.role}>
          <select id="sf-role" className={inputClass} value={form.role} onChange={set('role')}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </FormField>
      </Drawer>

      <ConfirmDialog
        isOpen={target !== null}
        title={target?.is_active ? 'Deactivate staff member?' : 'Reactivate staff member?'}
        description={
          target?.is_active
            ? `${target.full_name} will no longer be able to log in. Their history is kept.`
            : `${target?.full_name} will be able to log in again.`
        }
        confirmLabel={target?.is_active ? 'Deactivate' : 'Reactivate'}
        isDestructive={target?.is_active}
        isLoading={acting}
        onConfirm={toggleActive}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}

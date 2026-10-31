import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Percent, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { Drawer } from '../components/shared/Drawer';
import { FormField } from '../components/shared/FormField';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { Tax } from '../types/catalog';
import { ApiError } from '../lib/api';
import { taxesApi, camelFields } from '../lib/catalogApi';

const PAGE_SIZE = 10;
const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

interface TaxFormData {
  id?: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  isActive: boolean;
}

const EMPTY_FORM: TaxFormData = {
  name: '',
  type: 'percent',
  value: 18,
  isActive: true,
};

export function TaxesPage() {
  const { toast } = useToast();
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    taxesApi.list().then(setTaxes).catch((e) => toast({ type: 'error', title: e.message })).finally(() => setLoading(false));
  }, [toast]);
  useEffect(reload, [reload]);

  const fail = (e: unknown, fallback: string) => {
    if (e instanceof ApiError) {
      setFieldErrors(camelFields(e.fields));
      toast({ type: 'error', title: e.message });
    } else {
      toast({ type: 'error', title: fallback });
    }
  };
  const [searchTerm, setSearchTerm] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<TaxFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Tax | null>(null);

  const filteredTaxes = useMemo(() => {
    return taxes.filter((t) => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [taxes, searchTerm]);

  const handleOpenAdd = () => {
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const handleOpenEdit = (tax: Tax) => {
    setFormData({
      id: tax.id,
      name: tax.name,
      type: tax.type,
      value: tax.value,
      isActive: tax.isActive,
    });
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const handleToggleActive = async (taxId: string) => {
    const t = taxes.find((x) => x.id === taxId);
    if (!t) return;
    try {
      await taxesApi.save({ ...t, isActive: !t.isActive });
      reload();
      toast({ type: 'success', title: 'Tax status updated' });
    } catch (e) {
      fail(e, 'Could not update tax');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Tax name is required';
    if (formData.value < 0) errors.value = 'Value cannot be negative';
    if (formData.type === 'percent' && formData.value > 100) {
      errors.value = 'Percentage cannot exceed 100%';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await taxesApi.save({
        id: formData.id,
        name: formData.name.trim(),
        type: formData.type,
        value: Number(formData.value),
        isActive: formData.isActive,
      });
      toast({ type: 'success', title: formData.id ? 'Tax updated successfully' : 'New tax rule registered' });
      setDrawerOpen(false);
      reload();
    } catch (err) {
      fail(err, 'Could not save tax');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await taxesApi.remove(deleteTarget.id);
      toast({ type: 'success', title: `Tax "${deleteTarget.name}" deleted` });
      reload();
    } catch (e) {
      fail(e, 'Could not delete tax');
    }
    setDeleteTarget(null);
  };

  const columns: Column<Tax>[] = [
    {
      key: 'name',
      header: 'Tax Name',
      sortable: true,
      render: (t) => <span className="font-medium text-foreground">{t.name}</span>,
    },
    {
      key: 'type',
      header: 'Computation Type',
      sortable: true,
      render: (t) => (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
          {t.type === 'percent' ? <Percent className="w-3 h-3 text-muted-foreground" /> : <DollarSign className="w-3 h-3 text-muted-foreground" />}
          {t.type === 'percent' ? 'Percentage Rate' : 'Fixed Surcharge'}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Rate / Amount',
      sortable: true,
      render: (t) => (
        <span className="font-semibold text-foreground">
          {t.type === 'percent' ? `${t.value.toFixed(2)}%` : `$${t.value.toFixed(2)}`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <button
          onClick={() => handleToggleActive(t.id)}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-pointer ${
            t.isActive
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
          title="Click to toggle status"
        >
          {t.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {t.isActive ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (t) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => handleOpenEdit(t)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Edit tax"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteTarget(t)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete tax"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tax Rules</h1>
          <p className="text-sm text-muted-foreground">
            Configure jurisdiction tax rates, fixed fee levies, and active calculation rules.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Tax
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search tax rules by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Taxes Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredTaxes}
          totalCount={filteredTaxes.length}
          pageSize={PAGE_SIZE}
          isLoading={loading}
          emptyMessage="No taxes match your search."
        />
      </div>

      {/* Add / Edit Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={formData.id ? 'Edit Tax Rule' : 'New Tax Rule'}
        description="Configure tax percentage or fixed surcharge amount."
      >
        <form onSubmit={handleSave} className="space-y-4 pb-6">
          <FormField label="Tax Name" error={fieldErrors.name} required>
            <input
              type="text"
              placeholder="e.g. GST 18%, VAT Standard, Service Levy"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
            />
          </FormField>

          <FormField label="Computation Type" required>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer text-sm font-medium transition ${
                  formData.type === 'percent'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="taxType"
                  value="percent"
                  checked={formData.type === 'percent'}
                  onChange={() => setFormData({ ...formData, type: 'percent' })}
                  className="sr-only"
                />
                <Percent className="w-4 h-4" />
                Percentage (%)
              </label>

              <label
                className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer text-sm font-medium transition ${
                  formData.type === 'fixed'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="taxType"
                  value="fixed"
                  checked={formData.type === 'fixed'}
                  onChange={() => setFormData({ ...formData, type: 'fixed' })}
                  className="sr-only"
                />
                <DollarSign className="w-4 h-4" />
                Fixed Amount ($)
              </label>
            </div>
          </FormField>

          <FormField
            label={formData.type === 'percent' ? 'Rate Percentage (%)' : 'Fixed Surcharge ($)'}
            error={fieldErrors.value}
            required
          >
            <input
              type="number"
              step="0.01"
              min="0"
              max={formData.type === 'percent' ? 100 : undefined}
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </FormField>

          <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground block">Active Status</span>
              <span className="text-xs text-muted-foreground">
                When active, tax rule can be applied to products and new quotations.
              </span>
            </div>
            <input
              type="checkbox"
              id="taxActiveToggle"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2 text-sm text-foreground hover:bg-muted border border-border rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition shadow-sm"
            >
              {formData.id ? 'Save Changes' : 'Create Tax'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Tax Rule"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Historical invoices will retain their generated calculation.`}
        confirmLabel="Delete Tax"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

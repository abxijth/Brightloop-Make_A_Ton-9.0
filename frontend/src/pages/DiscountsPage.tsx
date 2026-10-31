import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Calendar, Percent, DollarSign } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { Drawer } from '../components/shared/Drawer';
import { FormField } from '../components/shared/FormField';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { DiscountRule } from '../types/catalog';
import { INITIAL_DISCOUNTS, INITIAL_PRODUCTS } from '../lib/mockCatalog';

const PAGE_SIZE = 10;
const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

interface DiscountFormData {
  id?: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  minPurchase: string;
  minQuantity: string;
  startDate: string;
  endDate: string;
  usageLimit: string;
  scope: 'subscription' | 'product';
  productId: string;
}

const EMPTY_FORM: DiscountFormData = {
  name: '',
  type: 'percent',
  value: 10,
  minPurchase: '',
  minQuantity: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  usageLimit: '',
  scope: 'subscription',
  productId: INITIAL_PRODUCTS[0]?.id || '',
};

export function DiscountsPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [discounts, setDiscounts] = useState<DiscountRule[]>(INITIAL_DISCOUNTS);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<DiscountFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<DiscountRule | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const getDiscountStatus = (d: DiscountRule): 'Active' | 'Expired' | 'Exhausted' => {
    if (d.usageLimit && d.timesUsed >= d.usageLimit) return 'Exhausted';
    if (d.endDate && d.endDate < todayStr) return 'Expired';
    return d.isActive ? 'Active' : 'Expired';
  };

  const filteredDiscounts = useMemo(() => {
    return discounts.filter((d) => {
      const matchSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase());
      const status = getDiscountStatus(d);
      const matchStatus = statusFilter === 'all' || status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [discounts, searchTerm, statusFilter, todayStr]);

  const handleOpenAdd = () => {
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const handleOpenEdit = (rule: DiscountRule) => {
    setFormData({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      value: rule.value,
      minPurchase: rule.minPurchase ? String(rule.minPurchase) : '',
      minQuantity: rule.minQuantity ? String(rule.minQuantity) : '',
      startDate: rule.startDate || todayStr,
      endDate: rule.endDate || '',
      usageLimit: rule.usageLimit ? String(rule.usageLimit) : '',
      scope: rule.scope,
      productId: rule.productId || INITIAL_PRODUCTS[0]?.id || '',
    });
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Discount rule name is required';
    if (formData.value <= 0) errors.value = 'Value must be greater than 0';
    if (formData.type === 'percent' && formData.value > 100) {
      errors.value = 'Percentage cannot exceed 100%';
    }
    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) {
      errors.endDate = 'End date cannot precede start date';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const selectedProduct = formData.scope === 'product'
      ? INITIAL_PRODUCTS.find((p) => p.id === formData.productId)
      : undefined;

    if (formData.id) {
      setDiscounts((prev) =>
        prev.map((item) =>
          item.id === formData.id
            ? {
                ...item,
                name: formData.name.trim(),
                type: formData.type,
                value: Number(formData.value),
                minPurchase: formData.minPurchase ? Number(formData.minPurchase) : undefined,
                minQuantity: formData.minQuantity ? parseInt(formData.minQuantity, 10) : undefined,
                startDate: formData.startDate,
                endDate: formData.endDate || undefined,
                usageLimit: formData.usageLimit ? parseInt(formData.usageLimit, 10) : undefined,
                scope: formData.scope,
                productId: formData.scope === 'product' ? formData.productId : undefined,
                productName: selectedProduct?.name,
              }
            : item
        )
      );
      toast({ type: 'success', title: 'Discount rule updated' });
    } else {
      const newDiscount: DiscountRule = {
        id: `disc-${Date.now()}`,
        name: formData.name.trim(),
        type: formData.type,
        value: Number(formData.value),
        minPurchase: formData.minPurchase ? Number(formData.minPurchase) : undefined,
        minQuantity: formData.minQuantity ? parseInt(formData.minQuantity, 10) : undefined,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit, 10) : undefined,
        timesUsed: 0,
        scope: formData.scope,
        productId: formData.scope === 'product' ? formData.productId : undefined,
        productName: selectedProduct?.name,
        isActive: true,
        createdAt: todayStr,
      };
      setDiscounts((prev) => [newDiscount, ...prev]);
      toast({ type: 'success', title: 'New discount rule established' });
    }
    setDrawerOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    setDiscounts((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    toast({ type: 'success', title: `Discount rule "${deleteTarget.name}" deleted` });
    setDeleteTarget(null);
  };

  const columns: Column<DiscountRule>[] = [
    {
      key: 'name',
      header: 'Rule Name',
      sortable: true,
      render: (d) => (
        <div>
          <div className="font-semibold text-foreground flex items-center gap-2">
            {d.name}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <span className="capitalize font-medium">{d.scope} Scope</span>
            {d.scope === 'product' && d.productName && (
              <span>• On {d.productName}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Discount Value',
      sortable: true,
      render: (d) => (
        <span className="font-semibold text-foreground flex items-center gap-1">
          {d.type === 'percent' ? (
            <>
              <Percent className="w-3.5 h-3.5 text-primary" />
              {d.value}% Off
            </>
          ) : (
            <>
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              ${d.value.toFixed(2)} Off
            </>
          )}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Usage Counter',
      render: (d) => {
        const percent = d.usageLimit ? Math.min(100, Math.round((d.timesUsed / d.usageLimit) * 100)) : null;
        return (
          <div className="w-36">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-medium text-foreground">{d.timesUsed} uses</span>
              <span className="text-muted-foreground">{d.usageLimit ? `/ ${d.usageLimit}` : 'Unlimited'}</span>
            </div>
            {d.usageLimit && (
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    percent && percent >= 100
                      ? 'bg-destructive'
                      : percent && percent >= 75
                      ? 'bg-amber-500'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'validity',
      header: 'Validity Period',
      render: (d) => (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {d.startDate} {d.endDate ? `→ ${d.endDate}` : '(No expiry)'}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => {
        const status = getDiscountStatus(d);
        const styles = {
          Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
          Expired: 'bg-muted text-muted-foreground border-border',
          Exhausted: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800',
        };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
            {status}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => handleOpenEdit(d)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Edit rule"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteTarget(d)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete rule"
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Discount Rules</h1>
          <p className="text-sm text-muted-foreground">
            Configure promotional percentage cuts, fixed vouchers, usage caps, and product-specific discounts.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Discount Rule
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search discount rules by name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              const p = new URLSearchParams(searchParams);
              if (e.target.value) p.set('q', e.target.value);
              else p.delete('q');
              setSearchParams(p);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-44 px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="exhausted">Exhausted</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredDiscounts}
          totalCount={filteredDiscounts.length}
          pageSize={PAGE_SIZE}
          emptyMessage="No discount rules match your criteria."
        />
      </div>

      {/* Add / Edit Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={formData.id ? 'Edit Discount Rule' : 'New Discount Rule'}
        description="Set scope, thresholds, time window, and usage limits."
      >
        <form onSubmit={handleSave} className="space-y-4 pb-6">
          <FormField label="Rule Name" error={fieldErrors.name} required>
            <input
              type="text"
              placeholder="e.g. Loyalty 10% Off, Summer Launch $20"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Discount Type" required>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className={inputClass}
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </FormField>

            <FormField
              label={formData.type === 'percent' ? 'Percentage (%)' : 'Amount ($)'}
              error={fieldErrors.value}
              required
            >
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={formData.type === 'percent' ? 100 : undefined}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Scope" required>
              <select
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value as any })}
                className={inputClass}
              >
                <option value="subscription">Whole Subscription</option>
                <option value="product">Single Product</option>
              </select>
            </FormField>

            {formData.scope === 'product' ? (
              <FormField label="Target Product" required>
                <select
                  value={formData.productId}
                  onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                  className={inputClass}
                >
                  {INITIAL_PRODUCTS.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              <FormField label="Min Purchase Amount ($)">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Optional threshold"
                  value={formData.minPurchase}
                  onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                  className={inputClass}
                />
              </FormField>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Min Quantity / Seats">
              <input
                type="number"
                min="1"
                placeholder="Optional"
                value={formData.minQuantity}
                onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })}
                className={inputClass}
              />
            </FormField>

            <FormField label="Max Usage Limit">
              <input
                type="number"
                min="1"
                placeholder="e.g. 50 (leave empty for unlimited)"
                value={formData.usageLimit}
                onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className={inputClass}
              />
            </FormField>

            <FormField label="End Date (Expiry)" error={fieldErrors.endDate}>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className={inputClass}
              />
            </FormField>
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
              {formData.id ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Discount Rule"
        description={`Are you sure you want to remove rule "${deleteTarget?.name}"? Already billed invoices will keep their discounts.`}
        confirmLabel="Delete Discount"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

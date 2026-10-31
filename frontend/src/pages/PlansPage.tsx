import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Calendar, Repeat } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { Drawer } from '../components/shared/Drawer';
import { FormField } from '../components/shared/FormField';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { Plan } from '../types/catalog';
import { ApiError } from '../lib/api';
import { plansApi, camelFields } from '../lib/catalogApi';

const PAGE_SIZE = 10;
const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

interface PlanFormData {
  id?: string;
  name: string;
  price: number;
  billingPeriod: 'daily' | 'weekly' | 'monthly' | 'yearly';
  minQuantity: number;
  availableFrom: string;
  availableTo: string;
  autoClose: boolean;
  allowEarlyClose: boolean;
  isActive: boolean;
}

const EMPTY_FORM: PlanFormData = {
  name: '',
  price: 29,
  billingPeriod: 'monthly',
  minQuantity: 1,
  availableFrom: new Date().toISOString().split('T')[0],
  availableTo: '',
  autoClose: false,
  allowEarlyClose: true,
  isActive: true,
};

export function PlansPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    plansApi.list().then(setPlans).catch((e) => toast({ type: 'error', title: e.message })).finally(() => setLoading(false));
  }, [toast]);
  useEffect(reload, [reload]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [periodFilter, setPeriodFilter] = useState<string>('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<PlanFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchPeriod = periodFilter === 'all' || p.billingPeriod === periodFilter;
      return matchSearch && matchPeriod;
    });
  }, [plans, searchTerm, periodFilter]);

  const handleOpenAdd = () => {
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setFormData({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      billingPeriod: plan.billingPeriod,
      minQuantity: plan.minQuantity,
      availableFrom: plan.availableFrom || '',
      availableTo: plan.availableTo || '',
      autoClose: plan.autoClose,
      allowEarlyClose: plan.allowEarlyClose,
      isActive: plan.isActive,
    });
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const fail = (e: unknown, fallback: string) => {
    if (e instanceof ApiError) {
      setFieldErrors(camelFields(e.fields));
      toast({ type: 'error', title: e.message });
    } else {
      toast({ type: 'error', title: fallback });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Plan name is required';
    if (formData.price < 0) errors.price = 'Price cannot be negative';
    if (formData.minQuantity < 1) errors.minQuantity = 'Min quantity must be at least 1';
    if (!formData.availableFrom) errors.availableFrom = 'Available from is required';
    if (formData.availableTo && formData.availableFrom && formData.availableTo < formData.availableFrom) {
      errors.availableTo = 'End date cannot precede start date';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await plansApi.save({
        id: formData.id,
        name: formData.name.trim(),
        price: Number(formData.price),
        billingPeriod: formData.billingPeriod,
        minQuantity: Number(formData.minQuantity),
        availableFrom: formData.availableFrom,
        availableTo: formData.availableTo || undefined,
        autoClose: formData.autoClose,
        allowEarlyClose: formData.allowEarlyClose,
        isActive: formData.isActive,
      });
      toast({ type: 'success', title: formData.id ? 'Plan updated successfully' : 'New plan published' });
      setDrawerOpen(false);
      reload();
    } catch (err) {
      fail(err, 'Could not save plan');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await plansApi.remove(deleteTarget.id);
      toast({ type: 'success', title: `Plan "${deleteTarget.name}" deleted` });
      reload();
    } catch (e) {
      fail(e, 'Could not delete plan');
    }
    setDeleteTarget(null);
  };

  const columns: Column<Plan>[] = [
    {
      key: 'name',
      header: 'Plan Name',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-semibold text-foreground flex items-center gap-2">
            {p.name}
            {!p.isActive && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                Archived
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">Min quantity: {p.minQuantity}</div>
        </div>
      ),
    },
    {
      key: 'billingPeriod',
      header: 'Cycle',
      sortable: true,
      render: (p) => (
        <span className="capitalize inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
          <Repeat className="w-3 h-3" />
          {p.billingPeriod}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      render: (p) => (
        <span className="font-semibold text-foreground">
          ${p.price.toFixed(2)}
          <span className="text-xs text-muted-foreground font-normal"> / {p.billingPeriod}</span>
        </span>
      ),
    },
    {
      key: 'availability',
      header: 'Validity Dates',
      render: (p) => (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          {p.availableFrom || 'Always'} {p.availableTo ? `→ ${p.availableTo}` : ''}
        </div>
      ),
    },
    {
      key: 'toggles',
      header: 'Policy Toggles',
      render: (p) => (
        <div className="flex flex-col gap-1 text-[11px]">
          <span className={`inline-flex items-center gap-1 font-medium ${p.allowEarlyClose ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.allowEarlyClose ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            {p.allowEarlyClose ? 'Allows early close' : 'No early close'}
          </span>
          <span className={`inline-flex items-center gap-1 font-medium ${p.autoClose ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.autoClose ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
            {p.autoClose ? 'Auto-close at end' : 'Continuous renewal'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => handleOpenEdit(p)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Edit plan"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteTarget(p)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete plan"
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Subscription Plans</h1>
          <p className="text-sm text-muted-foreground">
            Configure recurring billing cycles, minimum volume thresholds, and early termination rules.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Plan
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search plans by name..."
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
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="w-full sm:w-44 px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="all">All Cycles</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Plans Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredPlans}
          isLoading={loading}
          totalCount={filteredPlans.length}
          pageSize={PAGE_SIZE}
          emptyMessage="No plans match your filter."
        />
      </div>

      {/* Add / Edit Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={formData.id ? 'Edit Plan' : 'Add New Plan'}
        description="Set up recurring periods, minimum seat requirements, and auto-close policies."
      >
        <form onSubmit={handleSave} className="space-y-4 pb-6">
          <FormField label="Plan Name" error={fieldErrors.name} required>
            <input
              type="text"
              placeholder="e.g. Enterprise Monthly"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Price ($)" error={fieldErrors.price} required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className={inputClass}
              />
            </FormField>

            <FormField label="Billing Cycle" required>
              <select
                value={formData.billingPeriod}
                onChange={(e) => setFormData({ ...formData, billingPeriod: e.target.value as Plan['billingPeriod'] })}
                className={inputClass}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </FormField>
          </div>

          <FormField label="Minimum Quantity / Seats" error={fieldErrors.minQuantity} required>
            <input
              type="number"
              min="1"
              value={formData.minQuantity}
              onChange={(e) => setFormData({ ...formData, minQuantity: parseInt(e.target.value, 10) || 1 })}
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Available From">
              <input
                type="date"
                value={formData.availableFrom}
                onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                className={inputClass}
              />
            </FormField>

            <FormField label="Available To" error={fieldErrors.availableTo}>
              <input
                type="date"
                value={formData.availableTo}
                onChange={(e) => setFormData({ ...formData, availableTo: e.target.value })}
                className={inputClass}
              />
            </FormField>
          </div>

          <div className="p-4 bg-muted/30 border border-border rounded-lg space-y-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Feature & Contract Policy Toggles
            </h4>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="allowEarlyClose"
                checked={formData.allowEarlyClose}
                onChange={(e) => setFormData({ ...formData, allowEarlyClose: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="allowEarlyClose" className="text-sm cursor-pointer">
                <span className="font-medium text-foreground block">Allow Early Close</span>
                <span className="text-xs text-muted-foreground">
                  Enables customer "Close early" button on their portal subscription view.
                </span>
              </label>
            </div>

            <div className="flex items-start gap-3 pt-2 border-t border-border/50">
              <input
                type="checkbox"
                id="autoClose"
                checked={formData.autoClose}
                onChange={(e) => setFormData({ ...formData, autoClose: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="autoClose" className="text-sm cursor-pointer">
                <span className="font-medium text-foreground block">Auto-close at End Date</span>
                <span className="text-xs text-muted-foreground">
                  Automatically transitions subscription to Closed when expiry date is reached instead of renewing.
                </span>
              </label>
            </div>

            <div className="flex items-start gap-3 pt-2 border-t border-border/50">
              <input
                type="checkbox"
                id="isActivePlan"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="isActivePlan" className="text-sm cursor-pointer">
                <span className="font-medium text-foreground block">Active Plan</span>
                <span className="text-xs text-muted-foreground">
                  Visible to sales and customers when constructing new subscriptions.
                </span>
              </label>
            </div>
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
              {formData.id ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Plan"
        description={`Are you sure you want to remove plan "${deleteTarget?.name}"? Existing active subscriptions will retain their contract terms.`}
        confirmLabel="Delete Plan"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

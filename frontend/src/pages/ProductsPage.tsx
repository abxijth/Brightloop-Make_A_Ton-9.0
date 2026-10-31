import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Tag, Layers } from 'lucide-react';
import { DataTable, Column } from '../components/shared/DataTable';
import { Drawer } from '../components/shared/Drawer';
import { FormField } from '../components/shared/FormField';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useToast } from '../components/shared/Toast';
import { Product, ProductVariant, Tax } from '../types/catalog';
import { ApiError } from '../lib/api';
import { productsApi, taxesApi, camelFields } from '../lib/catalogApi';

const PAGE_SIZE = 10;
const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

interface ProductFormData {
  id?: string;
  name: string;
  type: string;
  salesPrice: number;
  defaultTaxId: string;
  isActive: boolean;
  variants: ProductVariant[];
}

const EMPTY_FORM: ProductFormData = {
  name: '',
  type: 'Software',
  salesPrice: 0,
  defaultTaxId: '',
  isActive: true,
  variants: [],
};

export function ProductsPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    Promise.all([productsApi.list(), taxesApi.list()])
      .then(([p, t]) => {
        setProducts(p);
        setTaxes(t);
      })
      .catch((e) => toast({ type: 'error', title: e.message }))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(reload, [reload]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [newVarAttr, setNewVarAttr] = useState('Edition');
  const [newVarValue, setNewVarValue] = useState('');
  const [newVarExtra, setNewVarExtra] = useState<number>(0);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.type.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = typeFilter === 'all' || p.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [products, searchTerm, typeFilter]);

  const handleOpenAdd = () => {
    setFormData({
      ...EMPTY_FORM,
      variants: [],
    });
    setFieldErrors({});
    setNewVarAttr('Edition');
    setNewVarValue('');
    setNewVarExtra(0);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setFormData({
      id: p.id,
      name: p.name,
      type: p.type,
      salesPrice: p.salesPrice,
      defaultTaxId: p.defaultTaxId || '',
      isActive: p.isActive,
      variants: [...p.variants],
    });
    setFieldErrors({});
    setNewVarAttr('Edition');
    setNewVarValue('');
    setNewVarExtra(0);
    setDrawerOpen(true);
  };

  const handleAddVariant = () => {
    if (!newVarAttr.trim() || !newVarValue.trim()) {
      toast({ type: 'error', title: 'Please enter both attribute and variant value' });
      return;
    }
    const newVariant: ProductVariant = {
      id: `var-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      attribute: newVarAttr.trim(),
      value: newVarValue.trim(),
      extraPrice: Number(newVarExtra) || 0,
    };
    setFormData((prev) => ({
      ...prev,
      variants: [...prev.variants, newVariant],
    }));
    setNewVarValue('');
    setNewVarExtra(0);
  };

  const handleRemoveVariant = (variantId: string) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((v) => v.id !== variantId),
    }));
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
    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (formData.salesPrice < 0) errors.salesPrice = 'Sales price cannot be negative';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await productsApi.save({
        id: formData.id,
        name: formData.name.trim(),
        type: formData.type,
        salesPrice: Number(formData.salesPrice),
        defaultTaxId: formData.defaultTaxId || undefined,
        isActive: formData.isActive,
        variants: formData.variants,
      });
      toast({ type: 'success', title: formData.id ? 'Product updated successfully' : 'Product added to catalog' });
      setDrawerOpen(false);
      reload();
    } catch (err) {
      fail(err, 'Could not save product');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await productsApi.remove(deleteTarget.id);
      toast({ type: 'success', title: `Product "${deleteTarget.name}" deleted` });
      reload();
    } catch (e) {
      fail(e, 'Could not delete product');
    }
    setDeleteTarget(null);
  };

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-foreground flex items-center gap-2">
            {p.name}
            {!p.isActive && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                Inactive
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
          <Tag className="w-3 h-3 text-muted-foreground" />
          {p.type}
        </span>
      ),
    },
    {
      key: 'salesPrice',
      header: 'Sales Price',
      sortable: true,
      render: (p) => <span className="font-semibold text-foreground">${p.salesPrice.toFixed(2)}</span>,
    },
    {
      key: 'variants',
      header: 'Variants',
      render: (p) => (
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{p.variants.length}</span>
          {p.variants.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({p.variants.map((v) => v.value).slice(0, 2).join(', ')}
              {p.variants.length > 2 ? '…' : ''})
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'tax',
      header: 'Default Tax',
      render: (p) => {
        const tax = taxes.find((t) => t.id === p.defaultTaxId);
        return (
          <span className="text-xs text-muted-foreground">
            {tax ? `${tax.name} (${tax.type === 'percent' ? `${tax.value}%` : `$${tax.value}`})` : 'None'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => handleOpenEdit(p)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Edit product"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteTarget(p)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete product"
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Products Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Manage your service and software products, variants, and pricing.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products by name or type..."
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full sm:w-44 px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="all">All Types</option>
          <option value="Software">Software</option>
          <option value="Service">Service</option>
          <option value="Hardware">Hardware</option>
        </select>
      </div>

      {/* Products Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredProducts}
          isLoading={loading}
          totalCount={filteredProducts.length}
          pageSize={PAGE_SIZE}
          emptyMessage="No products match your criteria."
        />
      </div>

      {/* Add / Edit Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={formData.id ? 'Edit Product' : 'Add New Product'}
        description="Configure basic pricing details and variant pricing attributes."
      >
        <form onSubmit={handleSave} className="space-y-5 pb-6">
          <FormField label="Product Name" error={fieldErrors.name} required>
            <input
              type="text"
              placeholder="e.g. CRM Enterprise Suite"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Product Type" required>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className={inputClass}
              >
                <option value="Software">Software</option>
                <option value="Service">Service</option>
                <option value="Hardware">Hardware</option>
                <option value="Other">Other</option>
              </select>
            </FormField>

            <FormField label="Default Tax">
              <select
                value={formData.defaultTaxId}
                onChange={(e) => setFormData({ ...formData, defaultTaxId: e.target.value })}
                className={inputClass}
              >
                <option value="">No Tax</option>
                {taxes.map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.name} ({tax.type === 'percent' ? `${tax.value}%` : `$${tax.value}`})
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <FormField label="Base Sales Price ($)" error={fieldErrors.salesPrice} required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.salesPrice}
                onChange={(e) => setFormData({ ...formData, salesPrice: parseFloat(e.target.value) || 0 })}
                className={inputClass}
              />
            </FormField>

          </div>

          {/* Variants Sub-table with live Final Price calculation */}
          <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary" />
                  Variants & Attributes
                </h4>
                <p className="text-xs text-muted-foreground">
                  Inline attribute management with live Final Price calculation.
                </p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                {formData.variants.length} defined
              </span>
            </div>

            {/* Quick Add Variant Bar */}
            <div className="p-3 bg-card border border-border rounded-lg space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Add Variant Row
              </span>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <label className="text-[11px] text-muted-foreground mb-1 block">Attribute</label>
                  <input
                    type="text"
                    placeholder="e.g. Brand, Edition, Size"
                    value={newVarAttr}
                    onChange={(e) => setNewVarAttr(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background"
                  />
                </div>
                <div className="col-span-4">
                  <label className="text-[11px] text-muted-foreground mb-1 block">Value</label>
                  <input
                    type="text"
                    placeholder="e.g. Odoo, Pro, 1 TB"
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[11px] text-muted-foreground mb-1 block">Extra Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newVarExtra}
                    onChange={(e) => setNewVarExtra(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-background font-mono"
                  />
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={handleAddVariant}
                    className="w-full py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 flex items-center justify-center"
                    title="Add variant"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Variants List Table */}
            {formData.variants.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg bg-card">
                No variants configured for this product. Base price applies.
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-card text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                      <th className="p-2.5">Attribute</th>
                      <th className="p-2.5">Value</th>
                      <th className="p-2.5 text-right">Extra Surcharge</th>
                      <th className="p-2.5 text-right font-semibold text-primary">Live Final Price</th>
                      <th className="p-2.5 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {formData.variants.map((v) => {
                      const finalPrice = Number(formData.salesPrice || 0) + Number(v.extraPrice || 0);
                      return (
                        <tr key={v.id} className="hover:bg-muted/20">
                          <td className="p-2.5 font-medium">{v.attribute}</td>
                          <td className="p-2.5">{v.value}</td>
                          <td className="p-2.5 text-right font-mono text-muted-foreground">
                            {v.extraPrice >= 0 ? `+$${v.extraPrice.toFixed(2)}` : `-$${Math.abs(v.extraPrice).toFixed(2)}`}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-foreground bg-primary/5">
                            ${finalPrice.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(v.id)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">
              Active in catalog and quotations
            </label>
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
              {formData.id ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Product"
        description={`Are you sure you want to remove "${deleteTarget?.name}"? Existing quotations referencing this item will maintain historical data.`}
        confirmLabel="Delete Product"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

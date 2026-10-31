import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Drawer } from '../shared/Drawer';
import { useToast } from '../shared/Toast';
import { plansApi, productsApi } from '../../lib/catalogApi';
import {
  customersApi,
  errorMessage,
  subscriptionsApi,
  todayIso,
  type CustomerOption,
  type SubscriptionInput,
} from '../../lib/billingApi';
import { useDebounced } from '../../lib/useDebounced';
import { formatCurrency } from '../../lib/utils';
import type { Plan, Product } from '../../types/catalog';
import type { SubscriptionDetail, SubscriptionTemplate } from '../../types/subscription';

interface LineDraft {
  key: number;
  productId: string;
  variantId: string;
  quantity: string;
  unitPrice: string; // '' = use the catalog price
}

interface SubscriptionFormDrawerProps {
  isOpen: boolean;
  /** Subscription to edit; omit to create a new one. */
  subscription?: SubscriptionDetail | null;
  onClose: () => void;
  onSaved: (subscription: SubscriptionDetail) => void;
}

const inputCls =
  'w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden';
const labelCls = 'block text-xs font-medium text-foreground mb-1';

let lineKey = 0;
const blankLine = (): LineDraft => ({ key: ++lineKey, productId: '', variantId: '', quantity: '1', unitPrice: '' });

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const SubscriptionFormDrawer: React.FC<SubscriptionFormDrawerProps> = ({ isOpen, subscription, onClose, onSaved }) => {
  const { toast } = useToast();
  const isEdit = Boolean(subscription);

  // Reference data
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<SubscriptionTemplate[]>([]);

  // Customer picker
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const debouncedCustomerQuery = useDebounced(customerQuery);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);

  // Form fields
  const [templateId, setTemplateId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [expiryDate, setExpiryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('15');
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    Promise.all([plansApi.list(), productsApi.list(), subscriptionsApi.templates()])
      .then(([pl, pr, tm]) => {
        setPlans(pl);
        setProducts(pr);
        setTemplates(tm);
      })
      .catch((err) => toast({ type: 'error', title: 'Could not load catalog', message: errorMessage(err) }));
  }, [isOpen, toast]);

  // Reset the form each time the drawer opens.
  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setCustomerQuery('');
    setTemplateId('');
    if (subscription) {
      setCustomer({ id: subscription.customer_id, name: subscription.customer_name, email: subscription.customer_email, company: null });
      setPlanId(String(subscription.plan_id));
      setStartDate(subscription.start_date);
      setExpiryDate(subscription.expiry_date ?? '');
      setPaymentTerms(String(subscription.payment_terms_days));
      setLines(
        subscription.lines.map((l) => ({
          key: ++lineKey,
          productId: String(l.product_id),
          variantId: l.variant_id ? String(l.variant_id) : '',
          quantity: String(l.quantity),
          unitPrice: String(l.unit_price),
        }))
      );
    } else {
      setCustomer(null);
      setPlanId('');
      setStartDate(todayIso());
      setExpiryDate('');
      setPaymentTerms('15');
      setLines([blankLine()]);
    }
  }, [isOpen, subscription]);

  useEffect(() => {
    if (!isOpen || customer) return;
    let cancelled = false;
    customersApi
      .search(debouncedCustomerQuery.trim())
      .then((c) => !cancelled && setCustomerOptions(c))
      .catch(() => !cancelled && setCustomerOptions([]));
    return () => {
      cancelled = true;
    };
  }, [isOpen, customer, debouncedCustomerQuery]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const activePlans = plans.filter((p) => p.isActive || p.id === planId);
  const activeProducts = products.filter((p) => p.isActive);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setPlanId(String(t.plan_id));
    setExpiryDate(addDays(startDate, t.validity_days));
    setLines(
      t.lines.map((l) => ({
        key: ++lineKey,
        productId: String(l.product_id),
        variantId: l.variant_id ? String(l.variant_id) : '',
        quantity: String(l.quantity),
        unitPrice: '',
      }))
    );
  };

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const catalogPrice = (l: LineDraft) => {
    const p = productById.get(l.productId);
    if (!p) return 0;
    const v = p.variants.find((x) => x.id === l.variantId);
    return p.salesPrice + (v?.extraPrice ?? 0);
  };
  const linePrice = (l: LineDraft) => (l.unitPrice === '' ? catalogPrice(l) : Number(l.unitPrice) || 0);
  const subtotal = lines.reduce((acc, l) => acc + linePrice(l) * (Number(l.quantity) || 0), 0);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!customer) e.customer_id = 'Choose a customer.';
    if (!planId) e.plan_id = 'Choose a plan (or a template).';
    if (!startDate) e.start_date = 'Start date is required.';
    if (expiryDate && startDate && expiryDate < startDate) e.expiry_date = 'Expiry must be on or after the start date.';
    const terms = Number(paymentTerms);
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) e.payment_terms_days = 'Use a whole number of days from 0 to 365.';
    if (lines.length === 0) e.lines = 'Add at least one line.';
    else if (lines.some((l) => !l.productId)) e.lines = 'Every line needs a product.';
    else if (lines.some((l) => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1))
      e.lines = 'Quantities must be whole numbers of at least 1.';
    else if (lines.some((l) => l.unitPrice !== '' && !(Number(l.unitPrice) >= 0)))
      e.lines = 'Unit prices cannot be negative.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const body: SubscriptionInput = {
      customer_id: customer!.id,
      plan_id: Number(planId),
      template_id: !isEdit && templateId ? Number(templateId) : undefined,
      start_date: startDate,
      expiry_date: expiryDate || null,
      payment_terms_days: Number(paymentTerms),
      lines: lines.map((l) => ({
        product_id: Number(l.productId),
        variant_id: l.variantId ? Number(l.variantId) : null,
        quantity: Number(l.quantity),
        unit_price: l.unitPrice === '' ? null : Number(l.unitPrice),
      })),
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await subscriptionsApi.update(subscription!.id, body)
        : await subscriptionsApi.create(body);
      toast({
        type: 'success',
        title: isEdit ? 'Subscription Updated' : 'Subscription Created',
        message: `${saved.number} for ${saved.customer_name} was saved.`,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      const fields = (err as { fields?: Record<string, string> }).fields ?? {};
      // Show field errors next to their inputs, plus one summary line for anything else.
      setErrors({ ...fields, form: errorMessage(err, 'Could not save the subscription.') });
    } finally {
      setSaving(false);
    }
  };

  const FieldError = ({ name }: { name: string }) =>
    errors[name] ? <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{errors[name]}</p> : null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit ${subscription?.number}` : 'New Subscription'}
      description={isEdit ? 'Change the customer, plan, dates, terms or lines' : 'Start from a quotation template or pick a plan and add lines'}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Draft'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Customer */}
        <div>
          <label className={labelCls}>Customer</label>
          {customer ? (
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30 text-xs">
              <span>
                <span className="font-semibold text-foreground">{customer.name}</span>
                <span className="text-muted-foreground"> · {customer.email}</span>
              </span>
              <button type="button" onClick={() => setCustomer(null)} className="text-primary hover:underline">
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search customers by name, email or company..."
                className={inputCls}
              />
              <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {customerOptions.length === 0 ? (
                  <div className="p-3 text-[11px] text-muted-foreground text-center">No customers found.</div>
                ) : (
                  customerOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCustomer(c)}
                      className="w-full text-left p-2.5 text-xs hover:bg-muted/40"
                    >
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-muted-foreground"> · {c.email}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
          <FieldError name="customer_id" />
        </div>

        {/* Template (create only) */}
        {!isEdit && templates.length > 0 && (
          <div>
            <label className={labelCls}>Quotation Template (optional)</label>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={inputCls}>
              <option value="">Blank: choose a plan and lines</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.plan_name}, valid {t.validity_days} days)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Plan */}
        <div>
          <label className={labelCls}>Recurring Plan</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
            <option value="">Choose a plan...</option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.billingPeriod}, min qty {p.minQuantity})
              </option>
            ))}
          </select>
          <FieldError name="plan_id" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            <FieldError name="start_date" />
          </div>
          <div>
            <label className={labelCls}>Expiry Date</label>
            <input type="date" value={expiryDate} min={startDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
            <FieldError name="expiry_date" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Payment Terms (days)</label>
          <input
            type="number"
            min={0}
            max={365}
            step={1}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            className={inputCls}
          />
          <FieldError name="payment_terms_days" />
        </div>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-foreground">Lines</label>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine()])}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((l) => {
              const product = productById.get(l.productId);
              return (
                <div key={l.key} className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={l.productId}
                      onChange={(e) => updateLine(l.key, { productId: e.target.value, variantId: '', unitPrice: '' })}
                      className={inputCls}
                    >
                      <option value="">Choose a product...</option>
                      {activeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatCurrency(p.salesPrice)})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Remove line"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={l.variantId}
                      disabled={!product || product.variants.length === 0}
                      onChange={(e) => updateLine(l.key, { variantId: e.target.value, unitPrice: '' })}
                      className={inputCls}
                    >
                      <option value="">No variant</option>
                      {product?.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.attribute}: {v.value}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={l.quantity}
                      onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                      placeholder="Qty"
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                      placeholder={product ? String(catalogPrice(l)) : 'Unit price'}
                      className={inputCls}
                      title="Leave blank to use the catalog price"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <FieldError name="lines" />
        </div>

        <div className="p-3 rounded-lg border border-border bg-muted/30 flex justify-between text-xs">
          <span className="text-muted-foreground">Subtotal per period (before tax)</span>
          <span className="font-mono font-semibold text-foreground">{formatCurrency(subtotal)}</span>
        </div>

        {errors.form && (
          <div className="p-2.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {errors.form}
          </div>
        )}
      </div>
    </Drawer>
  );
};

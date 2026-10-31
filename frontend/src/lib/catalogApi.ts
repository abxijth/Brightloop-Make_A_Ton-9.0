import { apiDelete, apiGet, apiPatch, apiPost } from './api';
import type { DiscountRule, Plan, Product, Tax } from '../types/catalog';

// API rows use snake_case, numbers as decimal strings and numeric ids.
// These adapters turn them into the camelCase types the pages already use.

interface TaxRow { id: number; name: string; type: 'percent' | 'fixed'; value: string; is_active: boolean; created_at: string }
interface ProductRow {
  id: number; name: string; type: string; sales_price: string; tax_id: number | null; tax: TaxRow | null;
  is_active: boolean; created_at: string;
  variants: { id: number; attribute: string; value: string; extra_price: string }[];
}
interface PlanRow {
  id: number; name: string; price: string; billing_period: Plan['billingPeriod']; min_quantity: number;
  available_from: string; available_to: string | null; auto_close: boolean; allow_early_close: boolean;
  is_active: boolean; created_at: string;
}
interface DiscountRow {
  id: number; name: string; type: 'percent' | 'fixed'; value: string; min_purchase: string | null;
  min_quantity: number | null; start_date: string; end_date: string | null; usage_limit: number | null;
  times_used: number; scope: 'subscription' | 'product'; product_id: number | null; product_name: string | null;
  is_active: boolean; created_at: string;
}

const day = (s: string) => s.slice(0, 10);
const num = (s: string | null) => (s === null ? undefined : Number(s));
const id = (n: number | null) => (n === null ? undefined : String(n));

const toTax = (r: TaxRow): Tax => ({
  id: String(r.id), name: r.name, type: r.type, value: Number(r.value), isActive: r.is_active, createdAt: day(r.created_at),
});

const toProduct = (r: ProductRow): Product => ({
  id: String(r.id), name: r.name, type: r.type, salesPrice: Number(r.sales_price),
  defaultTaxId: id(r.tax_id), defaultTaxRate: r.tax && r.tax.type === 'percent' ? Number(r.tax.value) : undefined,
  isActive: r.is_active, createdAt: day(r.created_at),
  variants: r.variants.map((v) => ({ id: String(v.id), attribute: v.attribute, value: v.value, extraPrice: Number(v.extra_price) })),
});

const toPlan = (r: PlanRow): Plan => ({
  id: String(r.id), name: r.name, price: Number(r.price), billingPeriod: r.billing_period, minQuantity: r.min_quantity,
  availableFrom: r.available_from, availableTo: r.available_to ?? undefined, autoClose: r.auto_close,
  allowEarlyClose: r.allow_early_close, isActive: r.is_active, createdAt: day(r.created_at),
});

const toDiscount = (r: DiscountRow): DiscountRule => ({
  id: String(r.id), name: r.name, type: r.type, value: Number(r.value), minPurchase: num(r.min_purchase),
  minQuantity: r.min_quantity ?? undefined, startDate: r.start_date, endDate: r.end_date ?? undefined,
  usageLimit: r.usage_limit ?? undefined, timesUsed: r.times_used, scope: r.scope, productId: id(r.product_id),
  productName: r.product_name ?? undefined, isActive: r.is_active, createdAt: day(r.created_at),
});

const nid = (s?: string) => (s ? Number(s) : null);

export const taxesApi = {
  list: () => apiGet<TaxRow[]>('/taxes').then((r) => r.map(toTax)),
  save: (t: { id?: string; name: string; type: Tax['type']; value: number; isActive: boolean }) => {
    const body = { name: t.name, type: t.type, value: t.value, is_active: t.isActive };
    return (t.id ? apiPatch<TaxRow>(`/taxes/${t.id}`, body) : apiPost<TaxRow>('/taxes', body)).then(toTax);
  },
  remove: (taxId: string) => apiDelete(`/taxes/${taxId}`),
};

export interface ProductInput {
  id?: string; name: string; type: string; salesPrice: number; defaultTaxId?: string; isActive: boolean;
  variants: { attribute: string; value: string; extraPrice: number }[];
}
export const productsApi = {
  list: () => apiGet<ProductRow[]>('/products').then((r) => r.map(toProduct)),
  save: (p: ProductInput) => {
    const body = {
      name: p.name, type: p.type, sales_price: p.salesPrice, tax_id: nid(p.defaultTaxId), is_active: p.isActive,
      variants: p.variants.map((v) => ({ attribute: v.attribute, value: v.value, extra_price: v.extraPrice })),
    };
    return (p.id ? apiPatch<ProductRow>(`/products/${p.id}`, body) : apiPost<ProductRow>('/products', body)).then(toProduct);
  },
  remove: (productId: string) => apiDelete(`/products/${productId}`),
};

export interface PlanInput {
  id?: string; name: string; price: number; billingPeriod: Plan['billingPeriod']; minQuantity: number;
  availableFrom: string; availableTo?: string; autoClose: boolean; allowEarlyClose: boolean; isActive: boolean;
}
export const plansApi = {
  list: () => apiGet<PlanRow[]>('/plans').then((r) => r.map(toPlan)),
  save: (p: PlanInput) => {
    const body = {
      name: p.name, price: p.price, billing_period: p.billingPeriod, min_quantity: p.minQuantity,
      available_from: p.availableFrom, available_to: p.availableTo || null, auto_close: p.autoClose,
      allow_early_close: p.allowEarlyClose, is_active: p.isActive,
    };
    return (p.id ? apiPatch<PlanRow>(`/plans/${p.id}`, body) : apiPost<PlanRow>('/plans', body)).then(toPlan);
  },
  remove: (planId: string) => apiDelete(`/plans/${planId}`),
};

export interface DiscountInput {
  id?: string; name: string; type: DiscountRule['type']; value: number; minPurchase?: number; minQuantity?: number;
  startDate: string; endDate?: string; usageLimit?: number; scope: DiscountRule['scope']; productId?: string; isActive: boolean;
}
export const discountsApi = {
  list: () => apiGet<DiscountRow[]>('/discounts').then((r) => r.map(toDiscount)),
  save: (d: DiscountInput) => {
    const body = {
      name: d.name, type: d.type, value: d.value, min_purchase: d.minPurchase ?? null, min_quantity: d.minQuantity ?? null,
      start_date: d.startDate, end_date: d.endDate || null, usage_limit: d.usageLimit ?? null, scope: d.scope,
      product_id: nid(d.productId), is_active: d.isActive,
    };
    return (d.id ? apiPatch<DiscountRow>(`/discounts/${d.id}`, body) : apiPost<DiscountRow>('/discounts', body)).then(toDiscount);
  },
  remove: (discountId: string) => apiDelete(`/discounts/${discountId}`),
};

/** Map API field errors (snake_case) onto the camelCase form field names. */
export const camelFields = (fields: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

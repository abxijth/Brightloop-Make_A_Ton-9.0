export interface ProductVariant {
  id: string;
  attribute: string;
  value: string;
  extraPrice: number;
}

export interface Product {
  id: string;
  name: string;
  type: string;
  salesPrice: number;
  costPrice?: number;
  defaultTaxId?: string;
  defaultTaxRate?: number;
  notes?: string;
  isActive: boolean;
  variants: ProductVariant[];
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  billingPeriod: 'daily' | 'weekly' | 'monthly' | 'yearly';
  minQuantity: number;
  availableFrom?: string;
  availableTo?: string;
  autoClose: boolean;
  allowEarlyClose: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Tax {
  id: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  isActive: boolean;
  createdAt: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  minPurchase?: number;
  minQuantity?: number;
  startDate: string;
  endDate?: string;
  usageLimit?: number;
  timesUsed: number;
  scope: 'subscription' | 'product';
  productId?: string;
  productName?: string;
  isActive: boolean;
  createdAt: string;
}

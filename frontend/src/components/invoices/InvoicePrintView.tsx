import React from 'react';
import { CustomerInvoice } from '../../types/invoice';
import { formatCurrency } from '../../lib/utils';

interface InvoicePrintViewProps {
  invoice: CustomerInvoice;
}

export const InvoicePrintView: React.FC<InvoicePrintViewProps> = ({ invoice }) => {
  return (
    <div id="printable-invoice" className="hidden print:block p-8 bg-white text-black font-sans">
      {/* Print-only Invoice Header */}
      <div className="flex justify-between items-start border-b border-gray-300 pb-6 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">BRIGHTLOOP</h1>
          <p className="text-sm text-gray-600 mt-1">Cloud Billing & Subscription Platform</p>
          <p className="text-xs text-gray-500 mt-1">GSTIN: 29AABCU9603R1ZX</p>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase text-gray-800">TAX INVOICE</h2>
          <p className="text-sm font-semibold text-gray-700 mt-1">{invoice.number}</p>
          <div className="mt-2 inline-block px-2.5 py-0.5 text-xs font-semibold rounded border uppercase border-gray-400 text-gray-800">
            Status: {invoice.status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Bill To & Invoice Meta */}
      <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
        <div>
          <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-2">Billed To</h3>
          <p className="font-bold text-gray-900">{invoice.customer_name}</p>
          <p className="text-gray-600">{invoice.customer_email}</p>
          {invoice.customer_address && (
            <p className="text-gray-600 text-xs mt-1 whitespace-pre-line leading-relaxed">
              {invoice.customer_address}
            </p>
          )}
        </div>

        <div className="text-right space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Invoice Date:</span>
            <span className="font-semibold text-gray-800">{invoice.issue_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Due Date:</span>
            <span className="font-semibold text-gray-800">{invoice.due_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Billing Period:</span>
            <span className="font-semibold text-gray-800">
              {invoice.period_start} to {invoice.period_end}
            </span>
          </div>
          {invoice.subscription_number && (
            <div className="flex justify-between">
              <span className="text-gray-500">Subscription Ref:</span>
              <span className="font-semibold text-gray-800">{invoice.subscription_number}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-left text-xs mb-8 border-collapse">
        <thead>
          <tr className="border-y border-gray-300 bg-gray-50 text-gray-700 uppercase font-semibold">
            <th className="py-2.5 px-3">Item & Description</th>
            <th className="py-2.5 px-3 text-center">Qty</th>
            <th className="py-2.5 px-3 text-right">Unit Price</th>
            <th className="py-2.5 px-3 text-right">Tax</th>
            <th className="py-2.5 px-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td className="py-3 px-3">
                <span className="font-medium text-gray-900">{line.description}</span>
                {line.line_type === 'discount' && (
                  <span className="ml-2 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Discount Applied
                  </span>
                )}
              </td>
              <td className="py-3 px-3 text-center text-gray-700">{line.quantity}</td>
              <td className="py-3 px-3 text-right text-gray-700">{formatCurrency(line.unit_price)}</td>
              <td className="py-3 px-3 text-right text-gray-700">
                {line.tax_rate ? `${line.tax_name} (${line.tax_rate}%)` : '-'}
              </td>
              <td className="py-3 px-3 text-right font-medium text-gray-900">
                {formatCurrency(line.line_total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals Breakdown */}
      <div className="flex justify-end mb-12">
        <div className="w-64 space-y-2 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>

          {invoice.discount_total > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Discount</span>
              <span>-{formatCurrency(invoice.discount_total)}</span>
            </div>
          )}

          <div className="flex justify-between text-gray-600">
            <span>Estimated Tax</span>
            <span>{formatCurrency(invoice.tax_total)}</span>
          </div>

          <div className="flex justify-between font-bold text-sm text-gray-900 pt-2 border-t border-gray-300">
            <span>Total Amount</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>

          <div className="flex justify-between text-gray-600 pt-1">
            <span>Amount Paid</span>
            <span>{formatCurrency(invoice.amount_paid)}</span>
          </div>

          <div className="flex justify-between font-bold text-sm text-gray-900 pt-2 border-t-2 border-gray-900">
            <span>Balance Due</span>
            <span className={invoice.amount_due > 0 ? 'text-red-600' : 'text-gray-900'}>
              {formatCurrency(invoice.amount_due)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="border-t border-gray-200 pt-6 text-[11px] text-gray-500 text-center">
        <p>Thank you for your business. For billing queries, reach us at support@brightloop.io</p>
        <p className="mt-1">Computer-generated invoice. No signature required.</p>
      </div>
    </div>
  );
};

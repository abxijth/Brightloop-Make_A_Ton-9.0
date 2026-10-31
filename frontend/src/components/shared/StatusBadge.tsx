import React from 'react';
import { cn } from '../../lib/utils';

export type StatusType = 'draft' | 'quotation' | 'confirmed' | 'active' | 'closed' | 'overdue' | 'paid';

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
  daysOverdue?: number;
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  draft: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    label: 'Draft',
  },
  quotation: {
    bg: 'bg-blue-50 dark:bg-blue-950/60',
    text: 'text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    label: 'Quotation',
  },
  confirmed: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/60',
    text: 'text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    label: 'Confirmed',
  },
  active: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    label: 'Active',
  },
  closed: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700',
    label: 'Closed',
  },
  overdue: {
    bg: 'bg-red-50 dark:bg-red-950/60',
    text: 'text-red-700 dark:text-red-300 border-red-300 dark:border-red-800',
    label: 'Overdue',
  },
  paid: {
    bg: 'bg-green-50 dark:bg-green-950/60',
    text: 'text-green-700 dark:text-green-300 border-green-300 dark:border-green-800',
    label: 'Paid',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className, daysOverdue }) => {
  const normalized = status.toLowerCase();
  const config = statusStyles[normalized] || {
    bg: 'bg-muted',
    text: 'text-muted-foreground border-border',
    label: status,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors',
        config.bg,
        config.text,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {normalized === 'overdue' && daysOverdue !== undefined
        ? `Overdue (${daysOverdue}d)`
        : config.label}
    </span>
  );
};

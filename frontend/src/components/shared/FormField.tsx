import React from 'react';
import { cn } from '../../lib/utils';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  htmlFor,
  description,
  children,
  className,
}) => {
  return (
    <div className={cn('space-y-1 text-left', className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium text-foreground tracking-tight"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      </div>

      {children}

      {description && !error && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}

      {error && (
        <p className="text-[11px] font-medium text-red-500 animate-in fade-in-50">
          {error}
        </p>
      )}
    </div>
  );
};

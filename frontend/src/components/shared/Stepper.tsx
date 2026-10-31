import React from 'react';
import { cn } from '../../lib/utils';
import { Check } from 'lucide-react';

interface StepperProps {
  steps: string[];
  currentStep: string;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep, className }) => {
  const currentIndex = steps.findIndex(
    (step) => step.toLowerCase() === currentStep.toLowerCase()
  );

  return (
    <div className={cn('flex items-center w-full py-4', className)}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;

        return (
          <React.Fragment key={step}>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border transition-all',
                  isCompleted && 'bg-primary text-primary-foreground border-primary',
                  isCurrent && 'bg-primary/10 border-primary text-primary ring-2 ring-primary/20',
                  !isCompleted && !isCurrent && 'border-muted-foreground/30 text-muted-foreground bg-muted/40'
                )}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
              >
                {step}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-3 transition-colors',
                  idx < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

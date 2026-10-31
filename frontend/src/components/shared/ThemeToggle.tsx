import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label="Toggle theme"
      className={cn(
        'relative inline-flex items-center justify-center p-2 rounded-lg border border-border bg-card/80 backdrop-blur-xs text-foreground shadow-xs hover:bg-muted hover:border-primary/40 active:scale-95 transition-all duration-200 group',
        className
      )}
    >
      <div className="relative w-4 h-4 overflow-hidden">
        <Sun
          className={cn(
            'w-4 h-4 absolute inset-0 text-amber-500 transition-all duration-300 transform',
            theme === 'dark'
              ? 'rotate-90 opacity-0 scale-50 pointer-events-none'
              : 'rotate-0 opacity-100 scale-100'
          )}
        />
        <Moon
          className={cn(
            'w-4 h-4 absolute inset-0 text-amber-400 transition-all duration-300 transform',
            theme === 'dark'
              ? 'rotate-0 opacity-100 scale-100'
              : '-rotate-90 opacity-0 scale-50 pointer-events-none'
          )}
        />
      </div>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};

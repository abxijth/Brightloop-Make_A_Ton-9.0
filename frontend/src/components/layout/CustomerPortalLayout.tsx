import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Repeat, FileText, User } from 'lucide-react';
import { ThemeToggle } from '../shared/ThemeToggle';
import { cn } from '../../lib/utils';

interface CustomerPortalLayoutProps {
  onLogout?: () => void;
}

export const CustomerPortalLayout: React.FC<CustomerPortalLayoutProps> = ({ onLogout }) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-primary">Brightloop</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                Portal
              </span>
            </div>

            <nav className="flex items-center gap-1 text-sm font-medium">
              <NavLink
                to="/portal/subscriptions"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <Repeat className="w-4 h-4" />
                <span>My Subscriptions</span>
              </NavLink>
              <NavLink
                to="/portal/invoices"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <FileText className="w-4 h-4" />
                <span>Invoices</span>
              </NavLink>
              <NavLink
                to="/portal/account"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <User className="w-4 h-4" />
                <span>Account</span>
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-xs text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded-md"
              >
                Sign out
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Portal View */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Brightloop Software Customer Portal &copy; 2026
      </footer>
    </div>
  );
};

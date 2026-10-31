import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Repeat,
  FileText,
  CreditCard,
  PlayCircle,
  Mail,
  Users,
  Package,
  CalendarDays,
  Percent,
  Receipt,
  UserCheck,
  Search,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from '../shared/ThemeToggle';
import { cn } from '../../lib/utils';

export type UserRole = 'admin' | 'staff' | 'customer';

interface BackOfficeLayoutProps {
  role: 'admin' | 'staff';
  onSwitchRole?: (role: UserRole) => void;
}

export const BackOfficeLayout: React.FC<BackOfficeLayoutProps> = ({ role, onSwitchRole }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navigation = [
    {
      group: 'Dashboard',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, adminOnly: false },
      ],
    },
    {
      group: 'Sales',
      items: [
        { label: 'Subscriptions', href: '/sales/subscriptions', icon: Repeat, adminOnly: false },
      ],
    },
    {
      group: 'Billing',
      items: [
        { label: 'Invoices', href: '/billing/invoices', icon: FileText, adminOnly: false },
        { label: 'Payments', href: '/billing/payments', icon: CreditCard, adminOnly: false },
        { label: 'Billing Run', href: '/billing/run', icon: PlayCircle, adminOnly: false },
        { label: 'Outbox', href: '/billing/outbox', icon: Mail, adminOnly: false },
      ],
    },
    {
      group: 'Customers',
      items: [
        { label: 'Customers', href: '/customers', icon: Users, adminOnly: false },
      ],
    },
    ...(role === 'admin'
      ? [
          {
            group: 'Catalog',
            items: [
              { label: 'Products', href: '/catalog/products', icon: Package, adminOnly: true },
              { label: 'Plans', href: '/catalog/plans', icon: CalendarDays, adminOnly: true },
            ],
          },
          {
            group: 'Configuration',
            items: [
              { label: 'Taxes', href: '/config/taxes', icon: Receipt, adminOnly: true },
              { label: 'Discounts', href: '/config/discounts', icon: Percent, adminOnly: true },
              { label: 'Staff', href: '/config/staff', icon: UserCheck, adminOnly: true },
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-md hover:bg-muted"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-primary">Brightloop</span>
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase font-semibold">
            {role}
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 md:static md:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-0 -translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg text-primary tracking-tight">Brightloop</h1>
            <p className="text-xs text-muted-foreground">Subscription Management</p>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase">
            {role}
          </span>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {navigation.map((section) => (
            <div key={section.group} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {section.group}
              </p>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setIsSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Role Switcher Demo Bar & User Info */}
        <div className="p-3 border-t border-border bg-muted/20 space-y-2">
          {onSwitchRole && (
            <div className="text-[11px] text-muted-foreground space-y-1">
              <span className="block font-medium">Demo Role Switcher:</span>
              <div className="flex gap-1">
                {(['admin', 'staff', 'customer'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => onSwitchRole(r)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-semibold border transition-all capitalize',
                      r === role
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border hover:bg-muted text-muted-foreground'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs">
              <p className="font-medium text-foreground">Logged in as</p>
              <p className="text-muted-foreground capitalize">{role} User</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile sidebar */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Top Bar */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-3 w-96">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customers, subscriptions, invoices..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-muted/50 border border-border focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => onSwitchRole?.('customer')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-3.5 h-3.5" /> Portal
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

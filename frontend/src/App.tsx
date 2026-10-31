import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import { AuthPage } from './pages/AuthPage';
import { CustomerPortalLayout } from './components/layout/CustomerPortalLayout';
import { BackOfficeLayout, UserRole } from './components/layout/BackOfficeLayout';
import { MySubscriptionsPage } from './pages/MySubscriptionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { OutboxPage } from './pages/OutboxPage';
import { SubscriptionsBackOfficePage } from './pages/SubscriptionsBackOfficePage';
import { InvoicesPage } from './pages/InvoicesPage';

function AppRoutes() {
  const [currentRole, setCurrentRole] = useState<UserRole>('admin');
  const navigate = useNavigate();

  const handleSwitchRole = (role: UserRole) => {
    setCurrentRole(role);
    if (role === 'customer') {
      navigate('/portal/subscriptions');
    } else {
      navigate('/dashboard');
    }
  };

  const backOfficeRole = currentRole === 'customer' ? 'admin' : currentRole;

  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />

      {/* Back-office shell (Admin & Staff) */}
      <Route
        element={
          <BackOfficeLayout
            role={backOfficeRole}
            onSwitchRole={handleSwitchRole}
          />
        }
      >
        <Route path="/dashboard" element={<DashboardPage role={backOfficeRole} />} />
        <Route path="/sales/subscriptions" element={<SubscriptionsBackOfficePage />} />
        <Route
          path="/billing/invoices"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Billing Invoices view coming soon.
            </div>
          }
        />
        <Route
          path="/billing/payments"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Payments ledger coming soon.
            </div>
          }
        />
        <Route
          path="/billing/run"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              One-click Billing Run coming soon.
            </div>
          }
        />
        <Route path="/billing/outbox" element={<OutboxPage />} />
        <Route
          path="/customers"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Customers directory coming soon.
            </div>
          }
        />
        <Route
          path="/catalog/products"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Products catalog coming soon.
            </div>
          }
        />
        <Route
          path="/catalog/plans"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Plans management coming soon.
            </div>
          }
        />
        <Route
          path="/config/taxes"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Tax rules coming soon.
            </div>
          }
        />
        <Route
          path="/config/discounts"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Discount rules coming soon.
            </div>
          }
        />
        <Route
          path="/config/staff"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Staff management coming soon.
            </div>
          }
        />
      </Route>

      {/* Customer Portal shell (Customer) */}
      <Route
        path="/portal"
        element={<CustomerPortalLayout onSwitchRole={handleSwitchRole} />}
      >
        <Route index element={<Navigate to="/portal/subscriptions" replace />} />
        <Route path="subscriptions" element={<MySubscriptionsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route
          path="account"
          element={
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
              Account management coming soon.
            </div>
          }
        />
      </Route>

      {/* Default redirect: back-office dashboard */}
      <Route
        path="*"
        element={
          <Navigate
            to={currentRole === 'customer' ? '/portal/subscriptions' : '/dashboard'}
            replace
          />
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
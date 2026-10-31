import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth, homePathFor } from './context/AuthContext';
import type { Role } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import { AuthPage } from './pages/AuthPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { CustomerPortalLayout } from './components/layout/CustomerPortalLayout';
import { BackOfficeLayout } from './components/layout/BackOfficeLayout';
import { MySubscriptionsPage } from './pages/MySubscriptionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { StaffPage } from './pages/StaffPage';
import { OutboxPage } from './pages/OutboxPage';
import { BillingRunPage } from './pages/BillingRunPage';
import { SubscriptionsBackOfficePage } from './pages/SubscriptionsBackOfficePage';
import { InvoicesPage } from './pages/InvoicesPage';
import { AccountPage } from './pages/AccountPage';
import { BackOfficeInvoicesPage } from './pages/BackOfficeInvoicesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { PlansPage } from './pages/PlansPage';
import { TaxesPage } from './pages/TaxesPage';
import { DiscountsPage } from './pages/DiscountsPage';

function RequireRole({ allow }: { allow: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}

function AppRoutes() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const backOfficeRole: 'admin' | 'staff' = user?.role === 'staff' ? 'staff' : 'admin';

  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Back-office shell (Admin & Staff) */}
      <Route element={<RequireRole allow={['admin', 'staff']} />}>
      <Route
        element={
          <BackOfficeLayout
            role={backOfficeRole}
            onLogout={handleLogout}
          />
        }
      >
        <Route path="/dashboard" element={<DashboardPage role={backOfficeRole} />} />
        <Route path="/sales/subscriptions" element={<SubscriptionsBackOfficePage />} />
        <Route path="/billing/invoices" element={<BackOfficeInvoicesPage />} />
        <Route path="/billing/payments" element={<PaymentsPage />} />
        <Route path="/billing/run" element={<BillingRunPage />} />
        <Route path="/billing/outbox" element={<OutboxPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/catalog/products" element={<ProductsPage />} />
        <Route path="/catalog/plans" element={<PlansPage />} />
        <Route path="/config/taxes" element={<TaxesPage />} />
        <Route path="/config/discounts" element={<DiscountsPage />} />
        <Route element={<RequireRole allow={['admin']} />}>
          <Route path="/config/staff" element={<StaffPage />} />
        </Route>
      </Route>
      </Route>

      {/* Customer Portal shell (Customer) */}
      <Route element={<RequireRole allow={['customer']} />}>
      <Route
        path="/portal"
        element={<CustomerPortalLayout onLogout={handleLogout} />}
      >
        <Route index element={<Navigate to="/portal/subscriptions" replace />} />
        <Route path="subscriptions" element={<MySubscriptionsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      </Route>

      {/* Default redirect: back-office dashboard */}
      <Route
        path="*"
        element={
          <Navigate to={user ? homePathFor(user.role) : '/login'} replace />
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
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
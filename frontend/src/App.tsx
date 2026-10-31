import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import { AuthPage } from './pages/AuthPage';
import { CustomerPortalLayout } from './components/layout/CustomerPortalLayout';
import { BackOfficeLayout, UserRole } from './components/layout/BackOfficeLayout';
import { MySubscriptionsPage } from './pages/MySubscriptionsPage';

export function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');

  const handleSwitchRole = (role: UserRole) => {
    setCurrentRole(role);
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth routes */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/login" element={<AuthPage />} />

            {/* Customer Portal routes */}
            <Route
              path="/portal"
              element={<CustomerPortalLayout onSwitchRole={handleSwitchRole} />}
            >
              <Route index element={<Navigate to="/portal/subscriptions" replace />} />
              <Route path="subscriptions" element={<MySubscriptionsPage />} />
              <Route
                path="invoices"
                element={
                  <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl">
                    Invoices view coming soon.
                  </div>
                }
              />
              <Route
                path="account"
                element={
                  <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl">
                    Account management coming soon.
                  </div>
                }
              />
            </Route>

            {/* Backoffice routes */}
            <Route
              path="/sales"
              element={<BackOfficeLayout role={currentRole === 'customer' ? 'staff' : currentRole} onSwitchRole={handleSwitchRole} />}
            >
              <Route
                path="subscriptions"
                element={
                  <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl">
                    Staff subscriptions view coming soon.
                  </div>
                }
              />
            </Route>

            {/* Default redirect to Portal Subscriptions */}
            <Route path="*" element={<Navigate to="/portal/subscriptions" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;

import { useState } from 'react';
import {
  User,
  Building,
  Mail,
  Phone,
  MapPin,
  Save,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useToast } from '../components/shared/Toast';

export function AccountPage() {
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    fullName: 'Acme Administrator',
    company: 'Acme Technologies Pvt Ltd',
    email: 'billing@acmetech.io',
    phone: '+91 98765 43210',
    address: 'Plot 42, Electronic City Phase 1, Bangalore, Karnataka 560100',
    taxId: '29AABCU9603R1ZX',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast({
        type: 'success',
        title: 'Account Profile Updated',
        message: 'Your billing contact information has been updated successfully.',
      });
    }, 500);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        type: 'error',
        title: 'Validation Error',
        message: 'New passwords do not match.',
      });
      return;
    }

    toast({
      type: 'success',
      title: 'Password Changed',
      message: 'Your portal access password has been updated.',
    });
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="pb-3 border-b border-border">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Account & Billing Settings
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Manage your organization details, billing address for GST tax invoices, and portal credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs text-center">
            <div className="w-16 h-16 rounded-full bg-primary/20 text-primary mx-auto flex items-center justify-center font-bold text-xl mb-3">
              {formData.fullName.slice(0, 2).toUpperCase()}
            </div>
            <h3 className="font-semibold text-base text-foreground">{formData.fullName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{formData.company}</p>
            <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3 h-3" /> Verified Customer
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border bg-muted/20 text-xs space-y-2">
            <span className="font-semibold text-foreground uppercase tracking-wider text-[10px] block">
              Billing Summary
            </span>
            <div className="flex justify-between text-muted-foreground">
              <span>Customer ID</span>
              <span className="font-mono font-medium text-foreground">CUST-101</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Default Currency</span>
              <span className="font-medium text-foreground">INR (₹)</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GSTIN</span>
              <span className="font-mono font-medium text-foreground">{formData.taxId}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Organization Details Form */}
          <form
            onSubmit={handleSaveProfile}
            className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                <Building className="w-4 h-4 text-primary" />
                <span>Organization & Tax Details</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-foreground block mb-1">Contact Name</label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-foreground block mb-1">Company Legal Name</label>
                <div className="relative">
                  <Building className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-foreground block mb-1">Billing Email</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-foreground block mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground block mb-1">Billing Address (Printed on Invoices)</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <textarea
                  name="address"
                  rows={2}
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>

          {/* Security & Password Form */}
          <form
            onSubmit={handleUpdatePassword}
            className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs"
          >
            <div className="flex items-center gap-2 font-semibold text-sm text-foreground pb-3 border-b border-border">
              <Lock className="w-4 h-4 text-primary" />
              <span>Portal Password & Security</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-foreground block mb-1">New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={passwordData.newPassword}
                  onChange={(e) =>
                    setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                />
              </div>

              <div>
                <label className="font-medium text-foreground block mb-1">Confirm New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={passwordData.confirmPassword}
                  onChange={(e) =>
                    setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold transition-colors"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

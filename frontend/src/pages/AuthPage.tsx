import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Check,
  X,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiPost } from '../lib/api';
import { useAuth, homePathFor } from '../context/AuthContext';
import { ThemeToggle } from '../components/shared/ThemeToggle';
import { cn } from '../lib/utils';

type AuthMode = 'login' | 'signup' | 'forgot-password';

interface PasswordRule {
  id: string;
  label: string;
  test: (val: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { id: 'min_len', label: 'More than 8 characters', test: (val) => val.length > 8 },
  { id: 'uppercase', label: 'At least one uppercase letter (A-Z)', test: (val) => /[A-Z]/.test(val) },
  { id: 'lowercase', label: 'At least one lowercase letter (a-z)', test: (val) => /[a-z]/.test(val) },
  { id: 'special', label: 'At least one special character (!@#$%^&* etc.)', test: (val) => /[^A-Za-z0-9]/.test(val) },
];

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & error states
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Validate password rules in real-time
  const rulesStatus = PASSWORD_RULES.map((rule) => ({
    ...rule,
    valid: rule.test(password),
  }));

  const allRulesPassed = rulesStatus.every((r) => r.valid);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  // Real-time email format validation
  const validateEmailFormat = (val: string) => {
    if (!val) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) return 'Please enter a valid email address';
    return null;
  };

  const handleEmailBlur = () => {
    setEmailError(validateEmailFormat(email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const emailErr = validateEmailFormat(email);
    if (emailErr) {
      setEmailError(emailErr);
      return;
    }

    if (mode === 'signup') {
      if (!allRulesPassed) {
        setFormError('Please fulfill all password requirements before signing up.');
        return;
      }
      if (!passwordsMatch) {
        setFormError('Passwords do not match.');
        return;
      }
    } else if (mode === 'login') {
      if (!password) {
        setFormError('Password is required.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'forgot-password') {
        const res = await apiPost<{ message: string }>('/auth/forgot-password', { email });
        setSuccessMessage(res.message);
      } else if (mode === 'signup') {
        const u = await signup(email, password, confirmPassword);
        navigate(homePathFor(u.role), { replace: true });
      } else {
        const u = await login(email, password);
        navigate(homePathFor(u.role), { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields.email) setEmailError(err.fields.email);
        const other = Object.entries(err.fields).filter(([k]) => k !== 'email').map(([, v]) => v);
        if (!err.fields.email || other.length) setFormError(other.length ? other.join(' ') : err.message);
      } else {
        setFormError('Could not reach the server. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setFormError(null);
    setEmailError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-background transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-foreground">Brightloop</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
              Subscription Management
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Authentication Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 15, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl shadow-primary/5 p-6 sm:p-8 relative overflow-hidden"
        >
          {/* Decorative Subtle Accent Top Border */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-primary to-yellow-300" />

          {/* Mode Switch Tabs */}
          <div className="flex border-b border-border mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={cn(
                'flex-1 pb-3 text-sm font-semibold transition-all relative',
                mode === 'login'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Sign In
              {mode === 'login' && (
                <motion.div
                  layoutId="auth-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={cn(
                'flex-1 pb-3 text-sm font-semibold transition-all relative',
                mode === 'signup'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Sign Up
              {mode === 'signup' && (
                <motion.div
                  layoutId="auth-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
          </div>

          {/* Header Title */}
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {mode === 'login' && 'Welcome back'}
              {mode === 'signup' && 'Create your account'}
              {mode === 'forgot-password' && 'Reset your password'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {mode === 'login' && 'Enter your credentials to access your subscriptions & billing.'}
              {mode === 'signup' && 'Set up your account to start managing plans and services.'}
              {mode === 'forgot-password' && 'Enter your registered email and we will send you a reset link.'}
            </p>
          </div>

          {/* General Error or Success Notification */}
          <AnimatePresence mode="wait">
            {formError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2"
              >
                <X className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </motion.div>
            )}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2"
              >
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="name@company.com"
                  required
                  className={cn(
                    'w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl bg-muted/40 border transition-all text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary',
                    emailError ? 'border-red-500 focus:ring-red-500/20' : 'border-border'
                  )}
                />
              </div>
              {emailError && (
                <p className="text-[11px] font-medium text-red-500 animate-in fade-in-50">
                  {emailError}
                </p>
              )}
            </div>

            {/* Password Field (for Login and Signup) */}
            {mode !== 'forgot-password' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground">
                    Password <span className="text-red-500">*</span>
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot-password')}
                      className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password Field (for Signup) */}
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className={cn(
                      'w-full pl-10 pr-10 py-2.5 text-xs rounded-xl bg-muted/40 border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all',
                      confirmPassword && !passwordsMatch ? 'border-red-500' : 'border-border'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-[11px] font-medium text-red-500">Passwords do not match.</p>
                )}
              </div>
            )}

            {/* Real-Time Live Password Requirement Checklist (Signup Requirement) */}
            {mode === 'signup' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2 mt-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>Password Requirements:</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {rulesStatus.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-2 text-[11px] transition-colors"
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors',
                          rule.valid
                            ? 'bg-emerald-500 text-white'
                            : 'bg-muted-foreground/20 text-muted-foreground'
                        )}
                      >
                        {rule.valid ? <Check className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />}
                      </div>
                      <span
                        className={cn(
                          rule.valid ? 'text-foreground font-medium' : 'text-muted-foreground'
                        )}
                      >
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || (mode === 'signup' && (!allRulesPassed || !passwordsMatch))}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-primary/20 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'login' && 'Sign In to Account'}
                    {mode === 'signup' && 'Create Account'}
                    {mode === 'forgot-password' && 'Send Reset Link'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Back to Login link for Forgot Password */}
          {mode === 'forgot-password' && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                ← Back to Sign In
              </button>
            </div>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 text-xs text-muted-foreground border-t border-border">
        Brightloop Software &copy; 2026 &middot; Subscription Management System
      </footer>
    </div>
  );
};

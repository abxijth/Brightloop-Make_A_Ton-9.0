import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiPost } from '../lib/api';

export const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiPost('/auth/reset-password', {
        token: params.get('token') ?? '',
        password,
        confirm_password: confirm,
      });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fields).join(' ') || err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3.5 py-2.5 text-xs rounded-xl bg-muted/40 border border-border text-foreground';
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-card border border-border rounded-2xl p-8 space-y-4">
        <h2 className="text-xl font-bold text-foreground">Choose a new password</h2>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <input type="password" required placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        <input type="password" required placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {busy ? 'Saving...' : 'Update password'}
        </button>
        <Link to="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Back to Sign In</Link>
      </form>
    </div>
  );
};

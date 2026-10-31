import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, apiGet, apiPost } from '../lib/api';

export type Role = 'admin' | 'staff' | 'customer';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string, confirmPassword: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<AuthUser>('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError)) console.error(e);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiPost<AuthUser>('/auth/login', { email, password });
    setUser(u);
    return u;
  }, []);

  const signup = useCallback(async (email: string, password: string, confirmPassword: string) => {
    const u = await apiPost<AuthUser>('/auth/signup', {
      email,
      password,
      confirm_password: confirmPassword,
    });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const homePathFor = (role: Role) => (role === 'customer' ? '/portal/subscriptions' : '/dashboard');

import { createContext, useContext, useState, ReactNode } from 'react';
import { apiRequest, setToken } from './api';

interface Admin {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR';
}

interface AuthContextValue {
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const raw = localStorage.getItem('almus_admin_profile');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email: string, password: string) {
    const data = await apiRequest<{ admin: Admin; accessToken: string }>('/admin/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(data.accessToken);
    localStorage.setItem('almus_admin_profile', JSON.stringify(data.admin));
    setAdmin(data.admin);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem('almus_admin_profile');
    setAdmin(null);
  }

  return <AuthContext.Provider value={{ admin, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

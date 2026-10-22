import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';

interface User {
  userId: string;
  email: string;
  displayName: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('sessionToken'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('sessionToken', data.sessionToken);
    setUser(data.user);
  }

  async function signup(email: string, password: string, displayName: string) {
    const data = await api.post('/api/auth/signup', { email, password, displayName });
    localStorage.setItem('sessionToken', data.sessionToken);
    setUser(data.user);
  }

  function logout() {
    api.post('/api/auth/logout').catch(() => {});
    localStorage.removeItem('sessionToken');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

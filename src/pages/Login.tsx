import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-ink px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-center mb-1">GATE PYQ Practice</h1>
        <p className="text-center text-sm text-slate dark:text-slate-dim mb-8">Log in to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </Field>
          <Field label="Password">
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </Field>
          {error && <p className="text-sm text-rose">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-card bg-amber text-white font-semibold hover:bg-amber-dim disabled:opacity-60">
            {busy ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="text-center text-sm text-slate dark:text-slate-dim mt-6">
          No account? <Link to="/signup" className="text-amber-dim font-medium">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim font-mono">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

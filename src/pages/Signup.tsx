import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field } from './Login';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signup(email, password, displayName);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-ink px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-center mb-1">Create your account</h1>
        <p className="text-center text-sm text-slate dark:text-slate-dim mb-8">Your personal GATE PYQ practice, on this laptop</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name">
            <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
          </Field>
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </Field>
          <Field label="Password">
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </Field>
          {error && <p className="text-sm text-rose">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-card bg-amber text-white font-semibold hover:bg-amber-dim disabled:opacity-60">
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-sm text-slate dark:text-slate-dim mt-6">
          Already have an account? <Link to="/login" className="text-amber-dim font-medium">Log in</Link>
        </p>
      </div>
    </div>
  );
}

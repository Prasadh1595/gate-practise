import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const navItems = [
    { to: '/', label: 'Dashboard' },
    { to: '/library', label: 'Test Library' },
    { to: '/analytics', label: 'Analytics' },
    { to: '/progress', label: 'Progress Banks' },
    { to: '/history', label: 'Attempt History' },
  ];

  return (
    <div className="min-h-screen bg-paper dark:bg-ink text-ink dark:text-paper">
      <header className="border-b border-mist dark:border-graphite-2 bg-white dark:bg-graphite">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="font-display font-semibold text-lg">GATE PYQ Practice</span>
            <nav className="flex gap-1">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to}
                  className={`px-3 py-2 rounded-card text-sm font-medium transition-colors
                    ${location.pathname === item.to
                      ? 'bg-amber-tint text-amber-dim dark:bg-amber-dim/20 dark:text-amber'
                      : 'text-slate dark:text-slate-dim hover:text-ink dark:hover:text-paper'}`}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setDark((d) => !d)}
              className="w-9 h-9 rounded-card border border-mist dark:border-graphite-2 flex items-center justify-center text-sm"
              aria-label="Toggle dark mode">
              {dark ? '☀' : '☾'}
            </button>
            <span className="text-sm text-slate dark:text-slate-dim hidden sm:inline">{user?.displayName || user?.email}</span>
            <button onClick={() => { logout(); navigate('/login'); }}
              className="text-sm font-medium text-slate dark:text-slate-dim hover:text-rose">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

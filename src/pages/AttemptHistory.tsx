import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Attempt {
  attempt_id: string; test_id: string; test_name: string; subject_name: string;
  attempt_number: number; score: number; max_score: number; percentage: number;
  correct_count: number; incorrect_count: number; unattempted_count: number; submitted_at: string;
}

export default function AttemptHistory() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    api.get('/api/attempts').then(setAttempts).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Attempt History</h1>
      {attempts.length === 0 ? (
        <p className="text-sm text-slate dark:text-slate-dim">No attempts yet.</p>
      ) : (
        <div className="card divide-y divide-mist dark:divide-graphite-2">
          {attempts.map((a) => (
            <Link key={a.attempt_id} to={`/results/${a.attempt_id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-paper-2 dark:hover:bg-graphite-2">
              <div>
                <p className="text-sm font-medium">{a.test_name}</p>
                <p className="text-xs text-slate dark:text-slate-dim mt-0.5">
                  {a.subject_name} · Attempt #{a.attempt_number} · {new Date(a.submitted_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right font-mono text-sm flex items-center gap-4">
                <span className="text-xs text-slate dark:text-slate-dim hidden sm:inline">
                  {a.correct_count}✓ {a.incorrect_count}✗ {a.unattempted_count}−
                </span>
                <span className={a.percentage >= 50 ? 'text-teal-dim font-semibold' : 'text-rose-dim font-semibold'}>
                  {a.score}/{a.max_score}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';

interface AttemptData {
  attempt: {
    attempt_id: string; test_id: string; attempt_number: number; status: string;
    score: number; max_score: number; correct_count: number; incorrect_count: number;
    unattempted_count: number; accuracy_pct: number; attempt_pct: number; percentage: number;
    time_taken_seconds: number; submitted_at: string;
  };
  test: { name: string };
}

interface HistorySummary {
  attemptCount: number; bestScore: number; latestScore: number; averageScore: number;
}

export default function ResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AttemptData | null>(null);
  const [history, setHistory] = useState<HistorySummary | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!attemptId) return;
    api.get(`/api/attempts/${attemptId}`).then((d) => {
      setData(d);
      return api.get(`/api/tests/${d.attempt.test_id}/attempts`);
    }).then((h) => setHistory(h.summary)).catch((e) => setError(e.message));
  }, [attemptId]);

  async function handleRetake() {
    if (!data) return;
    setStarting(true);
    try {
      const res = await api.post(`/api/tests/${data.attempt.test_id}/attempts`);
      navigate(`/exam/${res.attemptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start retake.');
      setStarting(false);
    }
  }

  if (error) return <p className="text-rose">{error}</p>;
  if (!data) return <p className="text-slate dark:text-slate-dim">Loading...</p>;

  const { attempt, test } = data;
  const minutes = Math.floor(attempt.time_taken_seconds / 60);
  const seconds = attempt.time_taken_seconds % 60;

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-sm text-slate dark:text-slate-dim mb-1">{test.name}</p>
      <h1 className="font-display text-2xl font-semibold mb-1">
        Attempt #{attempt.attempt_number} {attempt.status === 'auto_submitted' && '(auto-submitted)'}
      </h1>
      <p className="text-sm text-slate dark:text-slate-dim mb-8">Submitted {new Date(attempt.submitted_at).toLocaleString()}</p>

      <div className="card p-8 text-center mb-6">
        <p className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim font-mono mb-2">Your Score</p>
        <p className="font-display text-5xl font-semibold">
          {attempt.score}<span className="text-2xl text-slate dark:text-slate-dim">/{attempt.max_score}</span>
        </p>
        <p className="text-teal-dim font-mono mt-2">{attempt.percentage}%</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Correct" value={attempt.correct_count} color="text-teal-dim" />
        <MetricCard label="Incorrect" value={attempt.incorrect_count} color="text-rose-dim" />
        <MetricCard label="Unattempted" value={attempt.unattempted_count} color="text-slate dark:text-slate-dim" />
        <MetricCard label="Accuracy" value={`${attempt.accuracy_pct}%`} color="text-ink dark:text-paper" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <MetricCard label="Attempt Rate" value={`${attempt.attempt_pct}%`} color="text-ink dark:text-paper" />
        <MetricCard label="Time Taken" value={`${minutes}m ${seconds}s`} color="text-ink dark:text-paper" />
      </div>

      {history && history.attemptCount > 1 && (
        <div className="card p-5 mb-6">
          <h2 className="font-display font-semibold mb-3 text-sm">Your Performance on This Topic</h2>
          <div className="grid grid-cols-3 gap-4 font-mono text-sm">
            <div><p className="text-xs text-slate dark:text-slate-dim">Best</p><p className="font-semibold">{history.bestScore}</p></div>
            <div><p className="text-xs text-slate dark:text-slate-dim">Latest</p><p className="font-semibold">{history.latestScore}</p></div>
            <div><p className="text-xs text-slate dark:text-slate-dim">Average</p><p className="font-semibold">{history.averageScore}</p></div>
          </div>
          <p className="text-xs text-slate dark:text-slate-dim mt-2">{history.attemptCount} attempts total</p>
        </div>
      )}

      <div className="flex gap-3">
        <Link to={`/review/${attempt.attempt_id}`} className="flex-1 text-center py-2.5 rounded-card border border-mist dark:border-graphite-2 font-medium text-sm">
          Review Answers
        </Link>
        <button onClick={handleRetake} disabled={starting}
          className="flex-1 py-2.5 rounded-card bg-amber text-white font-medium text-sm hover:bg-amber-dim disabled:opacity-60">
          {starting ? 'Starting...' : 'Retake Test'}
        </button>
      </div>
      <Link to="/library" className="block text-center text-sm text-slate dark:text-slate-dim mt-4 hover:text-amber">Back to library</Link>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim font-mono">{label}</p>
      <p className={`font-display text-xl font-semibold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

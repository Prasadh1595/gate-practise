import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api/client';

interface TestDetail {
  test_id: string; name: string; subject_name: string;
  total_questions: number; scoreable_questions: number; total_marks: number;
  duration_minutes: number | null;
  typeBreakdown: { type: string; count: number }[];
  yearRange: { min_year: string | null; max_year: string | null };
}

export default function TestInstructions() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!testId) return;
    api.get(`/api/tests/${testId}`).then(setTest).catch((e) => setError(e.message));
  }, [testId]);

  async function handleStart() {
    if (!testId) return;
    setStarting(true);
    try {
      const data = await api.post(`/api/tests/${testId}/attempts`);
      navigate(`/exam/${data.attemptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start test.');
      setStarting(false);
    }
  }

  if (error) return <p className="text-rose">{error}</p>;
  if (!test) return <p className="text-slate dark:text-slate-dim">Loading...</p>;

  const referenceCount = test.total_questions - test.scoreable_questions;

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/library" className="text-sm text-slate dark:text-slate-dim hover:text-amber">&larr; Back to library</Link>
      <h1 className="font-display text-2xl font-semibold mt-3 mb-1">{test.name}</h1>
      <p className="text-slate dark:text-slate-dim mb-6">{test.subject_name}</p>

      <div className="card p-6 mb-6">
        <h2 className="font-display font-semibold mb-4">Test Overview</h2>
        <div className="grid grid-cols-3 gap-4 font-mono text-sm">
          <InfoStat label="Duration" value={test.duration_minutes ? `${test.duration_minutes} min` : 'No limit'} />
          <InfoStat label="Questions" value={String(test.total_questions)} />
          <InfoStat label="Max Marks" value={String(test.total_marks)} />
        </div>
        {test.yearRange.min_year && (
          <p className="text-xs text-slate dark:text-slate-dim mt-4">
            Years covered: GATE {test.yearRange.min_year}–{test.yearRange.max_year}
          </p>
        )}
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-display font-semibold mb-4">Question Types</h2>
        <div className="flex gap-4 flex-wrap">
          {test.typeBreakdown.map((t) => (
            <span key={t.type} className="text-sm font-mono px-3 py-1.5 rounded-card bg-paper-2 dark:bg-graphite-2">
              {t.type}: {t.count}
            </span>
          ))}
        </div>
        {referenceCount > 0 && (
          <p className="text-xs text-slate dark:text-slate-dim mt-3">
            {referenceCount} of these questions are reference-only and are not scored.
          </p>
        )}
      </div>

      <div className="card p-6 mb-6 text-sm text-slate dark:text-slate-dim space-y-2">
        <h2 className="font-display font-semibold text-ink dark:text-paper mb-2">Instructions</h2>
        <p>Standard GATE marking applies: 1-mark MCQ has -1/3 negative marking, 2-mark MCQ has -2/3. MSQ and NAT have no negative marking.</p>
        {test.duration_minutes ? (
          <p>The timer starts as soon as you click Start Test and auto-submits at zero.</p>
        ) : (
          <p>This topic has no time limit specified in the source — take as long as you need.</p>
        )}
        <p>You can retake this test unlimited times — every attempt is saved separately.</p>
      </div>

      {error && <p className="text-rose text-sm mb-4">{error}</p>}

      <button onClick={handleStart} disabled={starting}
        className="w-full py-3 rounded-card bg-amber text-white font-semibold hover:bg-amber-dim disabled:opacity-60">
        {starting ? 'Starting...' : 'Start Test'}
      </button>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

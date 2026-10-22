import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { QuestionImage } from '../components/QuestionContent';

interface ReviewQuestion {
  question_id: string; q_num: number; year: string | null; set_num: string | null;
  type: 'MCQ' | 'MSQ' | 'NAT' | 'DESCRIPTIVE'; marks: number; penalty: number;
  correct_answer: string | null; needs_review: number; review_note: string | null;
  question_image_path: string; answer_key_url: string | null;
  selectedAnswer: string | null; isCorrect: boolean | null; marksAwarded: number; markedForReview: boolean;
}

export default function ReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [testId, setTestId] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'unattempted' | 'reference'>('all');
  const [revisionIds, setRevisionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!attemptId) return;
    (async()=>{ try { const d=await api.get(`/api/attempts/${attemptId}/review`); setQuestions(d.questions); setTestId(d.attempt.test_id); const rev=await api.get('/api/analytics/progress/bank?type=revision'); setRevisionIds(new Set(rev.map((r:any)=>r.question_id))); } catch(e) { setError(e instanceof Error?e.message:'Failed to load review.'); } })();
  }, [attemptId]);

  if (error) return <p className="text-rose">{error}</p>;
  if (questions.length === 0) return <p className="text-slate dark:text-slate-dim">Loading...</p>;

  const filtered = questions.filter((q) => {
    if (filter === 'all') return true;
    if (q.type === 'DESCRIPTIVE' || q.needs_review) return filter === 'reference';
    if (filter === 'correct') return q.isCorrect === true;
    if (filter === 'incorrect') return q.isCorrect === false;
    if (filter === 'unattempted') return q.selectedAnswer === null && !q.needs_review;
    return false;
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link to={`/results/${attemptId}`} className="text-sm text-slate dark:text-slate-dim hover:text-amber">&larr; Back to results</Link>
        <Link to={`/test/${testId}`} className="text-sm text-amber-dim font-medium">Retake test</Link>
      </div>

      <h1 className="font-display text-2xl font-semibold mb-4">Review Answers</h1>

      <div className="flex gap-1.5 mb-6 flex-wrap">
        {(['all', 'correct', 'incorrect', 'unattempted', 'reference'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-card text-xs font-medium border capitalize
              ${filter === f ? 'bg-ink text-white border-ink dark:bg-paper dark:text-ink' : 'border-mist dark:border-graphite-2 text-slate dark:text-slate-dim'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 && (
          <p className="text-sm text-slate dark:text-slate-dim py-8 text-center">No questions match this filter.</p>
        )}
        {filtered.map((q) => <QuestionReviewCard key={q.question_id} q={q} revision={revisionIds.has(q.question_id)} onRevisionChange={(v) => setRevisionIds(prev => { const n=new Set(prev); if(v)n.add(q.question_id); else n.delete(q.question_id); return n; })} />)}
      </div>
    </div>
  );
}

function QuestionReviewCard({ q, revision, onRevisionChange }: { q: ReviewQuestion; revision: boolean; onRevisionChange: (v:boolean)=>void }) {
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionError, setRevisionError] = useState('');

  async function toggleRevision(){
    if (revisionLoading) return;
    setRevisionLoading(true);
    try {
      await api.put(`/api/analytics/progress/${q.question_id}/revision`,{revision:!revision});
      onRevisionChange(!revision);
    } catch (e) {
      setRevisionError(e instanceof Error ? e.message : 'Failed to update revision list.');
    } finally {
      setRevisionLoading(false);
    }
  }
  const status = q.type === 'DESCRIPTIVE'
    ? { label: 'Reference only', style: 'bg-paper-2 dark:bg-graphite-2 text-slate dark:text-slate-dim' }
    : q.needs_review
    ? { label: 'Flagged — excluded', style: 'bg-paper-2 dark:bg-graphite-2 text-slate dark:text-slate-dim' }
    : q.selectedAnswer === null
    ? { label: 'Unattempted', style: 'bg-paper-2 dark:bg-graphite-2 text-slate dark:text-slate-dim' }
    : q.isCorrect
    ? { label: 'Correct', style: 'bg-teal-tint text-teal-dim' }
    : { label: 'Incorrect', style: 'bg-rose-tint text-rose-dim' };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate dark:text-slate-dim">Q{q.q_num}</span>
          <span className="px-2 py-0.5 rounded bg-paper-2 dark:bg-graphite-2 text-slate dark:text-slate-dim">{q.type}</span>
          {q.year && <span className="text-slate dark:text-slate-dim">GATE {q.year}</span>}
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-card ${status.style}`}>{status.label}</span>
      </div>

      <QuestionImage imagePath={q.question_image_path} lazy />

      {q.type !== 'DESCRIPTIVE' && !q.needs_review && (
        <button onClick={toggleRevision} disabled={revisionLoading} className={`mt-3 text-xs px-2.5 py-1 rounded-card border disabled:opacity-50 ${revision?'bg-amber-tint text-amber-dim border-amber':'border-mist dark:border-graphite-2 text-slate dark:text-slate-dim'}`}>{revisionLoading ? 'Saving…' : revision?'★ In Revision':'☆ Add to Revision'}</button>
      )}

      {revisionError && (
        <p className="mt-3 text-xs text-rose bg-rose/10 rounded-card px-3 py-2">{revisionError}</p>
      )}

      {!!q.needs_review && q.review_note && (
        <p className="mt-3 text-xs text-amber-dim bg-amber-tint dark:bg-amber-dim/10 rounded-card px-3 py-2">{q.review_note}</p>
      )}

      {q.type !== 'DESCRIPTIVE' && !q.needs_review && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
          <span>Your answer: <strong>{q.selectedAnswer || '—'}</strong></span>
          <span>Correct answer: <strong className="text-teal-dim">{q.correct_answer}</strong></span>
          <span className={q.marksAwarded >= 0 ? 'text-teal-dim' : 'text-rose-dim'}>
            {q.marksAwarded >= 0 ? '+' : ''}{q.marksAwarded} marks
          </span>
        </div>
      )}

      {q.answer_key_url && (
        <a href={q.answer_key_url} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-dim hover:underline">
          View answer key &amp; explanation ↗
        </a>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { QuestionImage } from '../components/QuestionContent';

type BankType = 'wrong' | 'revision' | 'unattempted';
interface Row {
  question_id: string; q_num: number; year: string | null; set_num: string | null; type: string;
  question_image_path: string; test_name: string; subject_name: string;
  latest_correct: number | null; ever_wrong: number; revision: number;
}

const PAGE = 30; // banks can hold thousands of questions: load them in pages

export default function ProgressBank() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial = params.get('type');
  const [type, setType] = useState<BankType>(initial === 'revision' || initial === 'unattempted' ? initial : 'wrong');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setRows([]); setError('');
    api.get(`/api/analytics/progress/bank?type=${type}&limit=${PAGE}&offset=0`)
      .then((d) => { if (!cancelled) { setRows(d.rows); setTotal(d.total); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this list.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const d = await api.get(`/api/analytics/progress/bank?type=${type}&limit=${PAGE}&offset=${rows.length}`);
      setRows((prev) => [...prev, ...d.rows]); setTotal(d.total);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load more.'); }
    finally { setLoadingMore(false); }
  }

  async function practice() {
    setStarting(true);
    try { const d = await api.post('/api/practice', { mode: type, count: 20 }); navigate(`/exam/${d.attemptId}`); }
    catch (e) { alert(e instanceof Error ? e.message : 'No questions available.'); }
    finally { setStarting(false); }
  }

  async function toggle(q: Row) {
    const next = !q.revision;
    try {
      await api.put(`/api/analytics/progress/${q.question_id}/revision`, { revision: next });
      if (type === 'revision' && !next) { setRows((r) => r.filter((x) => x.question_id !== q.question_id)); setTotal((t) => Math.max(0, t - 1)); }
      else setRows((r) => r.map((x) => x.question_id === q.question_id ? { ...x, revision: next ? 1 : 0 } : x));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the revision list.'); }
  }

  const label = (x: BankType) => x === 'wrong' ? 'Wrong PYQs' : x === 'revision' ? 'Revision' : 'Unattempted';

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">PYQ Progress Banks</h1>
          <p className="text-sm text-slate dark:text-slate-dim mt-1">Your personal coverage, mistakes and revision list.</p>
        </div>
        <button onClick={practice} disabled={starting || total === 0} className="px-4 py-2 rounded-card bg-amber text-white text-sm font-semibold disabled:opacity-50">
          {starting ? 'Starting…' : 'Practice 20'}
        </button>
      </div>
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {(['wrong', 'revision', 'unattempted'] as BankType[]).map((x) => (
          <button key={x} onClick={() => setType(x)}
            className={`px-3 py-1.5 rounded-card text-xs font-medium border ${type === x ? 'bg-ink text-white border-ink dark:bg-paper dark:text-ink' : 'border-mist dark:border-graphite-2 text-slate dark:text-slate-dim'}`}>
            {label(x)}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-rose mb-4">{error}</p>}
      {loading ? <p className="text-sm text-slate dark:text-slate-dim">Loading…</p>
        : rows.length === 0 ? <p className="text-sm text-slate dark:text-slate-dim">Nothing here yet.</p>
        : <>
          <p className="text-xs font-mono text-slate dark:text-slate-dim mb-3">{label(type)}: {total} question{total === 1 ? '' : 's'}</p>
          <div className="space-y-4">
            {rows.map((q) => (
              <div key={q.question_id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-mono text-slate dark:text-slate-dim">{q.subject_name} · {q.test_name} · Q{q.q_num}{q.year ? ` · GATE ${q.year}` : ''}</p>
                  <button onClick={() => toggle(q)} className={`text-xs px-2.5 py-1 rounded-card border ${q.revision ? 'bg-amber-tint text-amber-dim border-amber' : 'border-mist dark:border-graphite-2 text-slate dark:text-slate-dim'}`}>
                    {q.revision ? '★ In Revision' : '☆ Add to Revision'}
                  </button>
                </div>
                <QuestionImage imagePath={q.question_image_path} lazy />
              </div>
            ))}
          </div>
          {rows.length < total && (
            <div className="text-center mt-6">
              <button onClick={loadMore} disabled={loadingMore} className="px-5 py-2 rounded-card border border-mist dark:border-graphite-2 text-sm font-medium disabled:opacity-60">
                {loadingMore ? 'Loading…' : `Load more (${total - rows.length} left)`}
              </button>
            </div>
          )}
        </>}
    </div>
  );
}

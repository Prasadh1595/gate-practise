import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

interface Test {
  test_id: string; name: string; subject_num: string; subject_name: string;
  total_questions: number; scoreable_questions: number; total_marks: number;
}

interface Subject { subject_num: string; name: string; }

export default function TestLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const subject = searchParams.get('subject') || '';

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [search, setSearch] = useState('');
  const [attemptedTestIds, setAttemptedTestIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/api/subjects').then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (search) params.set('search', search);
    api.get(`/api/tests?${params}`).then(setTests).catch(() => {});
  }, [subject, search]);

  useEffect(() => {
    api.get('/api/attempts').then((attempts: Array<{ test_id: string }>) => {
      setAttemptedTestIds(new Set(attempts.map((a) => a.test_id)));
    }).catch(() => {});
  }, []);

  function setSubjectFilter(s: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (s) next.set('subject', s); else next.delete('subject');
      return next;
    });
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Test Library</h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topics..." className="input max-w-xs" />
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        <FilterChip active={!subject} label="All subjects" onClick={() => setSubjectFilter('')} />
        {subjects.map((s) => (
          <FilterChip key={s.subject_num} active={subject === s.subject_num} label={s.name} onClick={() => setSubjectFilter(s.subject_num)} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tests.map((t) => (
          <TestCard key={t.test_id} test={t} attempted={attemptedTestIds.has(t.test_id)} />
        ))}
      </div>

      {tests.length === 0 && <p className="text-sm text-slate dark:text-slate-dim">No topics match your filters.</p>}
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-card text-xs font-medium border transition-colors
        ${active ? 'bg-ink text-white border-ink dark:bg-paper dark:text-ink dark:border-paper'
          : 'border-mist dark:border-graphite-2 text-slate dark:text-slate-dim hover:border-slate-dim'}`}>
      {label}
    </button>
  );
}

function TestCard({ test, attempted }: { test: Test; attempted: boolean }) {
  return (
    <Link to={`/test/${test.test_id}`} className="card p-4 hover:border-amber transition-colors flex flex-col">
      <p className="font-medium text-sm leading-snug">{test.name}</p>
      <p className="text-xs text-slate dark:text-slate-dim mt-1">{test.subject_name}</p>
      <div className="flex items-center gap-3 mt-3 text-xs font-mono text-slate dark:text-slate-dim">
        <span>{test.total_questions}Q</span>
        <span>{test.scoreable_questions} scoreable</span>
        <span>{test.total_marks}mk</span>
      </div>
      <div className="mt-3">
        {attempted ? (
          <span className="text-xs font-medium text-teal-dim">Attempted — view or retake</span>
        ) : (
          <span className="text-xs font-medium text-slate dark:text-slate-dim">Not attempted</span>
        )}
      </div>
    </Link>
  );
}

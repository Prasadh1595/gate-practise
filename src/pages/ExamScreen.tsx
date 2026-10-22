import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useCountdown, formatDuration } from '../hooks/useCountdown';
import { QuestionImage, AnswerControls } from '../components/QuestionContent';
import { QuestionPalette } from '../components/QuestionPalette';

interface Question {
  question_id: string;
  test_id: string;
  q_num: number;
  year: string | null;
  set_num: string | null;
  source_ref: string | null;
  tags: string;
  type: 'MCQ' | 'MSQ' | 'NAT' | 'DESCRIPTIVE';
  marks: number;
  penalty: number;
  needs_review: number;
  question_image_path: string;
  option_letters: string;
}

interface ResponseState {
  selectedAnswer: string | null;
  markedForReview: boolean;
}

export default function ExamScreen() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [testName, setTestName] = useState('');
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [initialRemaining, setInitialRemaining] = useState<number | null>(null);
  const [isTimed, setIsTimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [revisionIds, setRevisionIds] = useState<Set<string>>(new Set());
  const [revisionLoading, setRevisionLoading] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const remainingRef = useRef<number | null>(null);

  const saveOneResponse = useCallback(async (questionId: string, state: ResponseState) => {
    if (!attemptId) return;
    await api.put(`/api/attempts/${attemptId}/responses`, {
      questionId, selectedAnswer: state.selectedAnswer, markedForReview: state.markedForReview,
    });
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      try {
        const attemptData = await api.get(`/api/attempts/${attemptId}`);
        if (attemptData.attempt.status !== 'in_progress') {
          navigate(`/results/${attemptId}`, { replace: true });
          return;
        }
        const qs: Question[] = await api.get(`/api/tests/${attemptData.attempt.test_id}/questions`);
        setQuestions(qs);
        setTestName(attemptData.test.name);

        const initial: Record<string, ResponseState> = {};
        for (const q of qs) initial[q.question_id] = { selectedAnswer: null, markedForReview: false };
        for (const r of attemptData.responses) {
          initial[r.question_id] = { selectedAnswer: r.selected_answer, markedForReview: !!r.marked_for_review };
        }
        setResponses(initial);
        setIsTimed(attemptData.test.duration_minutes != null);
        setInitialRemaining(attemptData.remainingSeconds !== null ? Math.round(attemptData.remainingSeconds) : null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load test.');
      } finally {
        setLoading(false);
      }
    })();
  }, [attemptId, navigate]);

  const flushPendingResponses = useCallback(async () => {
    if (!attemptId) return;
    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};
    // Only re-send questions the student touched; one invalid value (e.g. a half-typed number) must not block submitting.
    await Promise.allSettled(Object.entries(responses)
      .filter(([, state]) => state.selectedAnswer !== null || state.markedForReview)
      .map(([questionId, state]) => saveOneResponse(questionId, state)));
  }, [attemptId, responses, saveOneResponse]);

  const handleSubmit = useCallback(async (auto: boolean) => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      await flushPendingResponses();
      await api.post(`/api/attempts/${attemptId}/submit`, { autoSubmit: auto });
      navigate(`/results/${attemptId}`, { replace: true });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Submit failed. Please try again.');
      setShowSubmitConfirm(false);
      setSubmitting(false);
    }
  }, [attemptId, submitting, navigate, flushPendingResponses]);

  const handleExit = useCallback(async () => {
    if (!attemptId || exiting) return;
    setExiting(true);
    try {
      await flushPendingResponses();
      await api.post(`/api/attempts/${attemptId}/exit`);
      navigate('/library', { replace: true });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Exit failed. Please try again.');
      setShowExitConfirm(false);
      setExiting(false);
    }
  }, [attemptId, exiting, navigate, flushPendingResponses]);

  useEffect(() => {
    api.get('/api/analytics/progress/bank?type=revision')
      .then((rows: Array<{ question_id: string }>) => {
        setRevisionIds(new Set(rows.map((row) => String(row.question_id))));
      })
      .catch(() => {});
  }, []);

  async function toggleRevision(questionId: string) {
    if (revisionLoading) return;
    const id = String(questionId);
    const nextRevision = !revisionIds.has(id);
    setRevisionLoading(true);
    try {
      await api.put(`/api/analytics/progress/${id}/revision`, { revision: nextRevision });
      setRevisionIds((prev) => {
        const next = new Set(prev);
        if (nextRevision) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to update revision list.');
    } finally {
      setRevisionLoading(false);
    }
  }

  const remaining = useCountdown(isTimed ? initialRemaining : null, () => handleSubmit(true));

  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  useEffect(() => {
    if (!isTimed || initialRemaining === null || !attemptId) return;
    const sendHeartbeat = () => {
      const seconds = remainingRef.current;
      if (seconds === null) return;
      api.put(`/api/attempts/${attemptId}/heartbeat`, { remainingSeconds: seconds }).catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [attemptId, isTimed, initialRemaining]);

  function saveResponse(questionId: string, state: ResponseState, immediate = false) {
    if (!attemptId) return;
    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    const doSave = () => {
      saveOneResponse(questionId, state).catch((e) => {
        // e.g. an invalid number; surfaced once, and ignored at submit time.
        if (e instanceof Error && /valid number/i.test(e.message)) setActionError(e.message);
      });
    };
    if (immediate) doSave();
    else saveTimers.current[questionId] = setTimeout(doSave, 400);
  }

  function updateAnswer(questionId: string, value: string) {
    if (actionError) setActionError('');
    setResponses((prev) => {
      const next = { ...prev, [questionId]: { ...prev[questionId], selectedAnswer: value || null } };
      saveResponse(questionId, next[questionId]);
      return next;
    });
  }

  function toggleMarkForReview(questionId: string) {
    setResponses((prev) => {
      const next = { ...prev, [questionId]: { ...prev[questionId], markedForReview: !prev[questionId].markedForReview } };
      saveResponse(questionId, next[questionId], true);
      return next;
    });
  }

  function clearResponse(questionId: string) {
    setResponses((prev) => {
      const next = { ...prev, [questionId]: { ...prev[questionId], selectedAnswer: null } };
      saveResponse(questionId, next[questionId], true);
      return next;
    });
  }

  function goTo(index: number) {
    setCurrentIndex(Math.max(0, Math.min(questions.length - 1, index)));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate">Loading test...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-rose">{error}</div>;
  if (questions.length === 0) return null;

  const current = questions[currentIndex];
  const currentResponse = responses[current.question_id] || { selectedAnswer: null, markedForReview: false };
  const scoreableQs = questions.filter((q) => q.type !== 'DESCRIPTIVE' && q.needs_review === 0);
  const attemptedCount = scoreableQs.filter((q) => responses[q.question_id]?.selectedAnswer).length;

  const paletteQuestions = questions.map((q, idx) => {
    const r = responses[q.question_id];
    let status: 'current' | 'answered' | 'unattempted' | 'marked' | 'answered-marked' | 'reference' = 'unattempted';
    const isReference = q.type === 'DESCRIPTIVE' || q.needs_review === 1;
    if (isReference) status = 'reference';
    else if (r?.selectedAnswer && r.markedForReview) status = 'answered-marked';
    else if (r?.markedForReview) status = 'marked';
    else if (r?.selectedAnswer) status = 'answered';
    if (idx === currentIndex) status = 'current';
    return { q_num: q.q_num, status };
  });

  const isLowTime = isTimed && remaining <= 300 && remaining > 0;

  return (
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      <header className="border-b border-mist dark:border-graphite-2 bg-white dark:bg-graphite px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-display font-semibold">{testName}</p>
          <p className="text-xs text-slate dark:text-slate-dim font-mono">
            Question {current.q_num} of {questions.length}
            {current.year ? ` · GATE ${current.year}${current.set_num ? ` Set ${current.set_num}` : ''}` : ''}
          </p>
        </div>
        {isTimed ? (
          <div className={`font-mono text-lg font-semibold px-4 py-1.5 rounded-card
            ${isLowTime ? 'bg-rose-tint text-rose-dim' : 'bg-paper-2 dark:bg-graphite-2 text-ink dark:text-paper'}`}>
            {formatDuration(remaining)}
          </div>
        ) : (
          <div className="text-xs font-mono px-3 py-1.5 rounded-card bg-paper-2 dark:bg-graphite-2 text-slate dark:text-slate-dim">
            No time limit
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto px-6 py-6 max-w-[1500px]">
          <div className="flex items-center gap-2 mb-4 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-paper-2 dark:bg-graphite-2 text-slate dark:text-slate-dim">
              {current.type}
            </span>
            {current.type === 'DESCRIPTIVE' ? (
              <span className="text-slate dark:text-slate-dim">Reference only — not scored</span>
            ) : (
              <span className="text-slate dark:text-slate-dim">
                +{current.marks} {current.penalty > 0 ? `/ -${current.penalty}` : ''}
              </span>
            )}
            {current.needs_review === 1 && (
              <span className="text-amber-dim">Flagged by source — excluded from scoring</span>
            )}
          </div>

          {actionError && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-card bg-rose-tint text-rose-dim text-sm px-4 py-2.5">
              <span>{actionError}</span>
              <button onClick={() => setActionError('')} className="font-semibold" aria-label="Dismiss">×</button>
            </div>
          )}

          <QuestionImage imagePath={current.question_image_path} />

          {!current.needs_review && current.type !== 'DESCRIPTIVE' && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => toggleRevision(current.question_id)}
              disabled={revisionLoading}
              className={`px-4 py-2 rounded-card border text-sm font-medium transition-colors disabled:opacity-60 ${
                revisionIds.has(String(current.question_id))
                  ? 'bg-amber-tint text-amber-dim border-amber'
                  : 'border-mist dark:border-graphite-2 text-slate dark:text-slate-dim hover:bg-paper-2 dark:hover:bg-graphite-2'
              }`}
            >
              {revisionIds.has(String(current.question_id)) ? '★ In Revision' : '☆ Add to Revision'}
            </button>
            {revisionIds.has(String(current.question_id)) && (
              <span className="text-xs text-slate dark:text-slate-dim">Saved to your permanent revision list</span>
            )}
          </div>
          )}

          {current.type !== 'DESCRIPTIVE' && current.needs_review !== 1 && (
            <AnswerControls
              type={current.type}
              selected={currentResponse.selectedAnswer}
              optionLetters={current.option_letters ? current.option_letters.split(';').filter(Boolean) : undefined}
              onSelect={(v) => updateAnswer(current.question_id, v)}
            />
          )}
          {(current.type === 'DESCRIPTIVE' || current.needs_review === 1) && (
            <p className="mt-5 text-sm text-slate dark:text-slate-dim italic">
              {current.type === 'DESCRIPTIVE'
                ? 'This is an older-style descriptive question with no discrete options. Shown for reference only — it is not scored.'
                : 'This source answer is flagged for review. Shown for reference only — it is not scored and has no answer control.'}
            </p>
          )}

          <div className="mt-8 flex items-center gap-3 flex-wrap">
            <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}
              className="px-4 py-2 rounded-card border border-mist dark:border-graphite-2 text-sm font-medium disabled:opacity-40">
              Previous
            </button>
            <button onClick={() => goTo(currentIndex + 1)}
              className="px-4 py-2 rounded-card bg-teal text-white text-sm font-medium hover:bg-teal-dim">
              Save &amp; Next
            </button>
            {current.type !== 'DESCRIPTIVE' && current.needs_review !== 1 && (
              <button onClick={() => { toggleMarkForReview(current.question_id); goTo(currentIndex + 1); }}
                className="px-4 py-2 rounded-card bg-amber text-white text-sm font-medium hover:bg-amber-dim">
                {currentResponse.markedForReview ? 'Unmark & Next' : 'Mark for Review & Next'}
              </button>
            )}
            {current.type !== 'DESCRIPTIVE' && current.needs_review !== 1 && (
              <button onClick={() => clearResponse(current.question_id)}
                className="px-4 py-2 rounded-card border border-mist dark:border-graphite-2 text-sm font-medium">
                Clear Response
              </button>
            )}
            <div className="flex-1" />
            <button onClick={() => setShowExitConfirm(true)} disabled={submitting}
              className="px-4 py-2 rounded-card border border-rose text-rose-dim text-sm font-medium hover:bg-rose-tint dark:hover:bg-rose-dim/10 disabled:opacity-40">
              Exit Test
            </button>
            <button onClick={() => setShowSubmitConfirm(true)} disabled={exiting}
              className="px-5 py-2 rounded-card bg-ink dark:bg-paper text-white dark:text-ink text-sm font-semibold disabled:opacity-40">
              Submit Test
            </button>
          </div>
        </main>

        <aside className="w-64 border-l border-mist dark:border-graphite-2 bg-white dark:bg-graphite px-5 py-6 overflow-y-auto">
          <p className="text-xs uppercase tracking-wide font-mono text-slate dark:text-slate-dim mb-3">Question Palette</p>
          <QuestionPalette questions={paletteQuestions} onJump={goTo} />
        </aside>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-graphite rounded-card p-6 max-w-sm w-full">
            <h3 className="font-display font-semibold text-lg mb-2">Submit test?</h3>
            <p className="text-sm text-slate dark:text-slate-dim mb-5">
              You have attempted {attemptedCount}/{scoreableQs.length} scoreable questions.
              Are you sure you want to submit?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 rounded-card border border-mist dark:border-graphite-2 text-sm font-medium">
                Cancel
              </button>
              <button onClick={() => handleSubmit(false)} disabled={submitting}
                className="px-4 py-2 rounded-card bg-teal text-white text-sm font-semibold disabled:opacity-60">
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-graphite rounded-card p-6 max-w-sm w-full">
            <h3 className="font-display font-semibold text-lg mb-2">Exit this test?</h3>
            <p className="text-sm text-slate dark:text-slate-dim mb-5">
              Your current answers and progress will be discarded. This test will not be submitted or evaluated.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowExitConfirm(false)}
                className="px-4 py-2 rounded-card border border-mist dark:border-graphite-2 text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleExit} disabled={exiting}
                className="px-4 py-2 rounded-card bg-rose text-white text-sm font-semibold hover:bg-rose-dim disabled:opacity-60">
                {exiting ? 'Exiting...' : 'Exit Test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

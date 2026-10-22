const express = require('../lib/mini-express');
const uuidv4 = require('../lib/password').uuid;
const db = require('../db/db');
const { calculateScore, NUMERIC_RE } = require('../engine/scoring');

const router = express.Router();

function getPracticeSet(testId) {
  return db.prepare('SELECT * FROM practice_sets WHERE test_id=?').get(testId);
}

function getFullQuestions(testId) {
  const practice = getPracticeSet(testId);
  if (practice) {
    return db.prepare(`SELECT q.*, psq.q_num, psq.test_id
      FROM practice_set_questions psq
      JOIN questions q ON q.question_id=psq.question_id
      WHERE psq.test_id=? ORDER BY psq.q_num`).all(testId);
  }
  return db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY q_num').all(testId);
}

function questionBelongsToAttempt(attempt, questionId) {
  const practice = getPracticeSet(attempt.test_id);
  if (practice) {
    if (practice.user_id !== attempt.user_id) return false;
    return !!db.prepare('SELECT 1 FROM practice_set_questions WHERE test_id=? AND question_id=?').get(attempt.test_id, questionId);
  }
  return !!db.prepare('SELECT 1 FROM questions WHERE test_id=? AND question_id=?').get(attempt.test_id, questionId);
}

function optionLettersForQuestion(question) {
  return String(question.option_letters || 'A;B;C;D').split(';').filter(Boolean);
}

function validateSelectedAnswer(question, selectedAnswer) {
  if (selectedAnswer == null || String(selectedAnswer).trim() === '') return null;
  const optionLetters = new Set(optionLettersForQuestion(question));
  const raw = String(selectedAnswer).trim().toUpperCase();

  if (question.type === 'MCQ') {
    if (!optionLetters.has(raw)) return 'Invalid MCQ option.';
    return null;
  }

  if (question.type === 'MSQ') {
    const parts = raw.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    const unique = [...new Set(parts)];
    if (!unique.length || unique.some((x) => !optionLetters.has(x))) return 'Invalid MSQ option set.';
    return null;
  }

  if (question.type === 'NAT' && !NUMERIC_RE.test(raw)) return 'NAT answer must be a valid number.';
  return null;
}

function recordQuestionProgress(userId, questions, responses, submittedAt) {
  const byQ = Object.fromEntries(responses.map(r => [r.question_id, r]));
  const insert = db.prepare(`INSERT OR IGNORE INTO user_question_progress
    (user_id, question_id, first_attempted_at, last_attempted_at, latest_correct, ever_wrong, revision)
    VALUES (?, ?, ?, ?, ?, ?, 0)`);
  const update = db.prepare(`UPDATE user_question_progress SET first_attempted_at=COALESCE(first_attempted_at, ?), last_attempted_at=?, latest_correct=?, ever_wrong=MAX(ever_wrong, ?) WHERE user_id=? AND question_id=?`);
  for (const q of questions) {
    const r = byQ[q.question_id];
    if (!r || r.selected_answer == null || q.type === 'DESCRIPTIVE' || q.needs_review) continue;
    const correct = r.is_correct == null ? null : (r.is_correct ? 1 : 0);
    insert.run(userId, q.question_id, submittedAt, submittedAt, correct, correct === 0 ? 1 : 0);
    update.run(submittedAt, submittedAt, correct, correct === 0 ? 1 : 0, userId, q.question_id);
  }
}

// POST /api/tests/:testId/attempts - start a new attempt
router.post('/tests/:testId/attempts', (req, res) => {
  const { testId } = req.params;
  const test = db.prepare('SELECT * FROM tests WHERE test_id = ?').get(testId);
  if (!test) return res.status(404).json({ error: 'Test not found.' });

  const practice = getPracticeSet(testId);
  if (practice && practice.user_id !== req.user.userId) return res.status(403).json({ error: 'This practice set belongs to another user.' });

  const existingCount = db.prepare('SELECT COUNT(*) as c FROM test_attempts WHERE user_id = ? AND test_id = ?')
    .get(req.user.userId, testId).c;

  const attemptId = uuidv4();
  const startedAt = new Date().toISOString();
  const initialRemaining = test.duration_minutes != null ? test.duration_minutes * 60 : null;
  db.prepare(`INSERT INTO test_attempts (attempt_id, user_id, test_id, attempt_number, status, started_at, time_remaining_seconds)
              VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`)
    .run(attemptId, req.user.userId, testId, existingCount + 1, startedAt, initialRemaining);

  res.json({ attemptId, attemptNumber: existingCount + 1, startedAt, durationMinutes: test.duration_minutes });
});

// GET /api/attempts/:attemptId - resume: current state + computed remaining time (if timed)
router.get('/attempts/:attemptId', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE attempt_id = ?').get(req.params.attemptId);
  if (!attempt || attempt.user_id !== req.user.userId) return res.status(404).json({ error: 'Attempt not found.' });

  const test = db.prepare('SELECT * FROM tests WHERE test_id = ?').get(attempt.test_id);
  const responses = db.prepare('SELECT * FROM responses WHERE attempt_id = ?').all(attempt.attempt_id);

  let remainingSeconds = null;
  if (test.duration_minutes != null && attempt.status === 'in_progress') {
    const elapsedSec = (Date.now() - new Date(attempt.started_at).getTime()) / 1000;
    remainingSeconds = Math.max(0, test.duration_minutes * 60 - elapsedSec);
  }

  res.json({ attempt, test, responses, remainingSeconds });
});

// PUT /api/attempts/:attemptId/responses - upsert a single response (autosave)
router.put('/attempts/:attemptId/responses', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE attempt_id = ?').get(req.params.attemptId);
  if (!attempt || attempt.user_id !== req.user.userId) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Attempt is no longer in progress.' });

  const { questionId, selectedAnswer, markedForReview, timeSpentSeconds } = req.body || {};
  if (!questionId) return res.status(400).json({ error: 'questionId is required.' });
  if (!questionBelongsToAttempt(attempt, questionId)) return res.status(400).json({ error: 'Question does not belong to this attempt.' });

  const question = db.prepare('SELECT * FROM questions WHERE question_id=?').get(questionId);
  if (!question) return res.status(400).json({ error: 'Question not found.' });
  const validationError = validateSelectedAnswer(question, selectedAnswer);
  if (validationError) return res.status(400).json({ error: validationError });

  const existing = db.prepare('SELECT * FROM responses WHERE attempt_id = ? AND question_id = ?')
    .get(attempt.attempt_id, questionId);

  if (existing) {
    db.prepare(`UPDATE responses SET selected_answer = ?, marked_for_review = ?, time_spent_seconds = ?
                WHERE response_id = ?`)
      .run(selectedAnswer == null ? null : String(selectedAnswer).trim(), markedForReview ? 1 : 0,
        timeSpentSeconds ?? existing.time_spent_seconds, existing.response_id);
  } else {
    db.prepare(`INSERT INTO responses (response_id, attempt_id, question_id, selected_answer, marked_for_review, time_spent_seconds)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), attempt.attempt_id, questionId, selectedAnswer == null ? null : String(selectedAnswer).trim(), markedForReview ? 1 : 0, timeSpentSeconds ?? 0);
  }
  res.json({ ok: true });
});

// PUT /api/attempts/:attemptId/heartbeat - persist remaining time snapshot
router.put('/attempts/:attemptId/heartbeat', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE attempt_id = ?').get(req.params.attemptId);
  if (!attempt || attempt.user_id !== req.user.userId) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status !== 'in_progress') return res.json({ ok: true });
  const { remainingSeconds } = req.body || {};
  if (remainingSeconds != null && Number.isFinite(Number(remainingSeconds))) {
    db.prepare('UPDATE test_attempts SET time_remaining_seconds = ? WHERE attempt_id = ?')
      .run(Math.max(0, Math.floor(Number(remainingSeconds))), attempt.attempt_id);
  }
  res.json({ ok: true });
});

// POST /api/attempts/:attemptId/exit - abandon an in-progress attempt.
router.post('/attempts/:attemptId/exit', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE attempt_id = ?').get(req.params.attemptId);
  if (!attempt || attempt.user_id !== req.user.userId) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Only an in-progress attempt can be exited.' });

  db.prepare('DELETE FROM responses WHERE attempt_id = ?').run(attempt.attempt_id);
  db.prepare('DELETE FROM test_attempts WHERE attempt_id = ?').run(attempt.attempt_id);
  // A practice set is a throwaway, per-user test: if it was never submitted, remove it entirely.
  const practice = getPracticeSet(attempt.test_id);
  if (practice) {
    const left = db.prepare('SELECT COUNT(*) c FROM test_attempts WHERE test_id = ?').get(attempt.test_id).c;
    if (left === 0) {
      const t = db.prepare('SELECT topic_id FROM tests WHERE test_id = ?').get(attempt.test_id);
      db.prepare('DELETE FROM practice_set_questions WHERE test_id = ?').run(attempt.test_id);
      db.prepare('DELETE FROM practice_sets WHERE test_id = ?').run(attempt.test_id);
      db.prepare('DELETE FROM tests WHERE test_id = ?').run(attempt.test_id);
      if (t) db.prepare('DELETE FROM topics WHERE topic_id = ?').run(t.topic_id);
    }
  }
  res.json({ ok: true, exited: true });
});

// POST /api/practice - create a hidden, user-specific practice set.
router.post('/practice', (req, res) => {
  const { mode = 'random', subjectNum = '', count = 20 } = req.body || {};
  const userId = req.user.userId;
  const allowed = new Set(['random', 'unattempted', 'wrong', 'revision']);
  if (!allowed.has(mode)) return res.status(400).json({ error: 'Invalid practice mode.' });
  const n = Math.max(1, Math.min(50, Number(count) || 20));
  let where = `q.type != 'DESCRIPTIVE' AND q.needs_review = 0 AND t.subject_num != '__practice__'`;
  const params = [userId];
  if (subjectNum) { where += ' AND t.subject_num = ?'; params.push(subjectNum); }
  if (mode === 'unattempted') where += ' AND u.first_attempted_at IS NULL';
  if (mode === 'wrong') where += ' AND u.ever_wrong = 1';
  if (mode === 'revision') where += ' AND u.revision = 1';
  const rows = db.prepare(`SELECT q.* FROM questions q JOIN tests t ON t.test_id=q.test_id LEFT JOIN user_question_progress u ON u.question_id=q.question_id AND u.user_id=? WHERE ${where} ORDER BY RANDOM() LIMIT ${n}`).all(...params);
  if (!rows.length) return res.status(404).json({ error: 'No questions are available for this practice mode.' });

  const testId = `practice-${uuidv4()}`;
  const topicId = `practice-topic-${uuidv4()}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO subjects(subject_num,name,sort_order) VALUES('__practice__','Practice',9999)`).run();
  db.prepare(`INSERT INTO topics(topic_id,subject_num,name,declared_count,sort_order) VALUES(?,?,?,?,?)`).run(topicId,'__practice__',mode==='random'?'Random PYQs':`${mode[0].toUpperCase()+mode.slice(1)} PYQs`,rows.length,9999);
  const scoreableRows = rows.filter((q) => q.type !== 'DESCRIPTIVE' && q.needs_review === 0);
  const totalMarks = scoreableRows.reduce((sum,q)=>sum+(q.marks||0),0);
  db.prepare(`INSERT INTO tests(test_id,name,subject_num,topic_id,total_questions,scoreable_questions,total_marks,duration_minutes,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(testId, mode==='random'?`Random ${rows.length} PYQs`:`${mode[0].toUpperCase()+mode.slice(1)} PYQs`, '__practice__', topicId, rows.length, scoreableRows.length, totalMarks, null, 9999);
  db.prepare(`INSERT INTO practice_sets(test_id,mode,user_id,created_at) VALUES(?,?,?,?)`).run(testId,mode,userId,now);
  const ins = db.prepare(`INSERT INTO practice_set_questions(test_id,question_id,q_num) VALUES(?,?,?)`);
  rows.forEach((q,i)=>ins.run(testId,q.question_id,i+1));
  const attemptId = uuidv4();
  db.prepare(`INSERT INTO test_attempts(attempt_id,user_id,test_id,attempt_number,status,started_at,time_remaining_seconds) VALUES(?,?,?,?, 'in_progress',?,NULL)`)
    .run(attemptId,userId,testId,1,now);
  res.json({ attemptId, testId, questionCount: rows.length });
});

function doSubmit(attempt, isAutoSubmit) {
  const questions = getFullQuestions(attempt.test_id);
  const responses = db.prepare('SELECT * FROM responses WHERE attempt_id = ?').all(attempt.attempt_id);
  const responseMap = {};
  for (const r of responses) responseMap[r.question_id] = r.selected_answer;

  const result = calculateScore(questions, responseMap);
  const submittedAt = new Date().toISOString();
  const timeTakenSeconds = Math.round((new Date(submittedAt).getTime() - new Date(attempt.started_at).getTime()) / 1000);

  db.prepare(`UPDATE test_attempts SET status = ?, submitted_at = ?, score = ?, max_score = ?,
              correct_count = ?, incorrect_count = ?, unattempted_count = ?, accuracy_pct = ?,
              attempt_pct = ?, percentage = ?, time_taken_seconds = ?, time_remaining_seconds = 0
              WHERE attempt_id = ?`)
    .run(isAutoSubmit ? 'auto_submitted' : 'submitted', submittedAt, result.score, result.maxScore,
         result.correctCount, result.incorrectCount, result.unattemptedCount, result.accuracyPct,
         result.attemptPct, result.percentage, timeTakenSeconds, attempt.attempt_id);

  const updateResp = db.prepare('UPDATE responses SET is_correct = ?, marks_awarded = ? WHERE attempt_id = ? AND question_id = ?');
  const insertResp = db.prepare(`INSERT INTO responses (response_id, attempt_id, question_id, selected_answer, is_correct, marks_awarded)
                                  VALUES (?, ?, ?, NULL, ?, ?)`);
  for (const pq of result.perQuestion) {
    const isCorrectVal = pq.isCorrect === null ? null : (pq.isCorrect ? 1 : 0);
    const info = updateResp.run(isCorrectVal, pq.marksAwarded, attempt.attempt_id, pq.questionId);
    if (info.changes === 0) insertResp.run(uuidv4(), attempt.attempt_id, pq.questionId, isCorrectVal, pq.marksAwarded);
  }
  recordQuestionProgress(attempt.user_id, questions, db.prepare('SELECT * FROM responses WHERE attempt_id = ?').all(attempt.attempt_id), submittedAt);
  return { ...result, submittedAt, timeTakenSeconds, status: isAutoSubmit ? 'auto_submitted' : 'submitted' };
}

// POST /api/attempts/:attemptId/submit
router.post('/attempts/:attemptId/submit', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE attempt_id = ?').get(req.params.attemptId);
  if (!attempt || attempt.user_id !== req.user.userId) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Attempt already submitted.' });

  const test = db.prepare('SELECT * FROM tests WHERE test_id = ?').get(attempt.test_id);
  let isAuto = !!req.body?.autoSubmit;
  if (test.duration_minutes != null) {
    const elapsedSec = (Date.now() - new Date(attempt.started_at).getTime()) / 1000;
    isAuto = isAuto || elapsedSec > test.duration_minutes * 60 + 5;
  }
  const result = doSubmit(attempt, isAuto);
  res.json(result);
});

// GET /api/attempts/:attemptId/review
router.get('/attempts/:attemptId/review', (req, res) => {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE attempt_id = ?').get(req.params.attemptId);
  if (!attempt || attempt.user_id !== req.user.userId) return res.status(404).json({ error: 'Attempt not found.' });
  if (attempt.status === 'in_progress') return res.status(400).json({ error: 'Attempt not yet submitted.' });

  const questions = getFullQuestions(attempt.test_id);
  const responses = db.prepare('SELECT * FROM responses WHERE attempt_id = ?').all(attempt.attempt_id);
  const responseByQ = {};
  for (const r of responses) responseByQ[r.question_id] = r;

  const detailed = questions.map((q) => {
    const r = responseByQ[q.question_id];
    return {
      ...q,
      selectedAnswer: r ? r.selected_answer : null,
      isCorrect: r ? (r.is_correct === null ? null : !!r.is_correct) : null,
      marksAwarded: r ? r.marks_awarded : 0,
      markedForReview: r ? !!r.marked_for_review : false,
    };
  });

  res.json({ attempt, questions: detailed });
});

// GET /api/tests/:testId/attempts - history for this user + this test
router.get('/tests/:testId/attempts', (req, res) => {
  const practice = getPracticeSet(req.params.testId);
  if (practice && practice.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden.' });
  const attempts = db.prepare(`SELECT * FROM test_attempts WHERE user_id = ? AND test_id = ? AND status != 'in_progress'
                                ORDER BY attempt_number ASC`).all(req.user.userId, req.params.testId);
  if (attempts.length === 0) return res.json({ attempts: [], summary: null });

  const scores = attempts.map((a) => a.score);
  const accuracies = attempts.map((a) => a.accuracy_pct);
  const summary = {
    attemptCount: attempts.length,
    bestScore: Math.max(...scores),
    latestScore: attempts[attempts.length - 1].score,
    averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
    bestAccuracy: Math.max(...accuracies),
    latestAccuracy: attempts[attempts.length - 1].accuracy_pct,
  };
  res.json({ attempts, summary });
});

router.get('/attempts', (req, res) => {
  const attempts = db.prepare(`SELECT ta.*, t.name as test_name, t.subject_num, s.name as subject_name
                                FROM test_attempts ta
                                JOIN tests t ON ta.test_id = t.test_id
                                JOIN subjects s ON t.subject_num = s.subject_num
                                WHERE ta.user_id = ? AND ta.status != 'in_progress'
                                ORDER BY ta.submitted_at DESC`).all(req.user.userId);
  res.json(attempts);
});

router.get('/attempts-in-progress', (req, res) => {
  const attempts = db.prepare(`SELECT ta.*, t.name as test_name, t.duration_minutes
                                FROM test_attempts ta JOIN tests t ON ta.test_id = t.test_id
                                WHERE ta.user_id = ? AND ta.status = 'in_progress'`).all(req.user.userId);
  res.json(attempts);
});

module.exports = router;

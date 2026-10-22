const express = require('../lib/mini-express');
const db = require('../db/db');

const router = express.Router();

function getPracticeSet(testId) {
  return db.prepare('SELECT * FROM practice_sets WHERE test_id=?').get(testId);
}

function assertPracticeOwner(req, res, testId) {
  const practice = getPracticeSet(testId);
  if (practice && practice.user_id !== req.user.userId) {
    res.status(403).json({ error: 'This practice set belongs to another user.' });
    return null;
  }
  return practice;
}

router.get('/subjects', (req, res) => {
  const subjects = db.prepare("SELECT * FROM subjects WHERE subject_num != '__practice__' ORDER BY sort_order").all();
  const topics = db.prepare(`SELECT t.*, te.total_questions, te.scoreable_questions, te.total_marks
                              FROM topics t JOIN tests te ON t.topic_id = te.test_id
                              WHERE te.subject_num != '__practice__'
                              ORDER BY t.sort_order`).all();
  const bySubject = {};
  for (const t of topics) (bySubject[t.subject_num] ||= []).push(t);
  res.json(subjects.map((s) => ({ ...s, topics: bySubject[s.subject_num] || [] })));
});

router.get('/tests', (req, res) => {
  const { subject, search } = req.query;
  let sql = `SELECT t.*, s.name as subject_name
             FROM tests t JOIN subjects s ON t.subject_num = s.subject_num
             WHERE t.subject_num != '__practice__' AND t.test_id NOT IN (SELECT test_id FROM practice_sets)`;
  const params = [];
  if (subject) { sql += ' AND t.subject_num = ?'; params.push(subject); }
  if (search) { sql += ' AND (t.name LIKE ? OR s.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY s.sort_order, s.name, t.sort_order';
  res.json(db.prepare(sql).all(...params));
});

router.get('/tests/:testId', (req, res) => {
  const practice = assertPracticeOwner(req, res, req.params.testId);
  if (practice === null) return;

  const test = db.prepare(`SELECT t.*, s.name as subject_name FROM tests t
                            LEFT JOIN subjects s ON t.subject_num = s.subject_num
                            WHERE t.test_id = ?`).get(req.params.testId);
  if (!test) return res.status(404).json({ error: 'Test not found.' });

  const typeBreakdown = practice
    ? db.prepare('SELECT q.type, COUNT(*) as count FROM practice_set_questions psq JOIN questions q ON q.question_id=psq.question_id WHERE psq.test_id=? GROUP BY q.type').all(req.params.testId)
    : db.prepare('SELECT type, COUNT(*) as count FROM questions WHERE test_id = ? GROUP BY type').all(req.params.testId);
  const yearRange = practice
    ? db.prepare('SELECT MIN(q.year) as min_year, MAX(q.year) as max_year FROM practice_set_questions psq JOIN questions q ON q.question_id=psq.question_id WHERE psq.test_id=? AND q.year IS NOT NULL').get(req.params.testId)
    : db.prepare('SELECT MIN(year) as min_year, MAX(year) as max_year FROM questions WHERE test_id = ? AND year IS NOT NULL').get(req.params.testId);

  res.json({ ...test, typeBreakdown, yearRange });
});

// For taking a test: never expose correct_answer/review_note.
router.get('/tests/:testId/questions', (req, res) => {
  const practice = assertPracticeOwner(req, res, req.params.testId);
  if (practice === null) return;

  const questions = practice
    ? db.prepare(`SELECT q.question_id, ? as test_id, psq.q_num, q.year, q.set_num, q.source_ref, q.tags,
                         q.type, q.marks, q.penalty, q.needs_review, q.question_image_path, q.option_letters
                  FROM practice_set_questions psq JOIN questions q ON q.question_id=psq.question_id
                  WHERE psq.test_id=? ORDER BY psq.q_num`).all(req.params.testId, req.params.testId)
    : db.prepare(`SELECT question_id, test_id, q_num, year, set_num, source_ref, tags, type, marks, penalty,
                         needs_review, question_image_path, option_letters
                  FROM questions WHERE test_id = ? ORDER BY q_num`).all(req.params.testId);
  if (questions.length === 0) return res.status(404).json({ error: 'Test not found or has no questions.' });
  res.json(questions);
});

module.exports = router;

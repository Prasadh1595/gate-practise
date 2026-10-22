const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const DB_PATH = process.env.GATE_PYQ_DB_PATH || path.join(dataDir, 'gate-pyq.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// Progress/revision tables are additive so existing installations keep their data.
db.exec(`
CREATE TABLE IF NOT EXISTS user_question_progress (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  first_attempted_at TEXT,
  last_attempted_at TEXT,
  latest_correct INTEGER,
  ever_wrong INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_uqp_user ON user_question_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_uqp_revision ON user_question_progress(user_id, revision);
CREATE TABLE IF NOT EXISTS practice_sets (
  test_id TEXT PRIMARY KEY REFERENCES tests(test_id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS practice_set_questions (
  test_id TEXT NOT NULL REFERENCES tests(test_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  q_num INTEGER NOT NULL,
  PRIMARY KEY (test_id, question_id)
);
`);


// Keep question option metadata available to the frontend without exposing answers.
try {
  const qcols = db.prepare('PRAGMA table_info(questions)').all();
  if (!qcols.some(c => c.name === 'option_letters')) {
    db.exec("ALTER TABLE questions ADD COLUMN option_letters TEXT NOT NULL DEFAULT 'A;B;C;D'");
  }
  // Source-verified five-option questions. The source images were checked directly;
  // these are the questions where an E option is actually selectable.
  const fiveOptionIds = [
    'v1-2.5.6','v1-3.3.5','v1-3.3.9','v1-4.3.4','v1-4.10.2','v1-4.13.2','v1-4.13.3','v1-10.8.3',
    'v2-1.23.3','v2-1.23.4','v2-1.31.1','v2-1.43.3','v2-2.3.4','v2-2.16.1','v2-2.21.5','v2-2.24.6','v2-6.18.2','v2-6.20.4',
    'v3-1.28.1','v3-4.8.6','v3-4.8.7','v3-4.8.8','v3-4.36.1','v3-5.23.4','v3-5.25.4','v3-5.33.4','v3-5.7.3'
  ];
  const setFive = db.prepare("UPDATE questions SET option_letters='A;B;C;D;E' WHERE question_id=?");
  for (const id of fiveOptionIds) setFive.run(id);
  // Source-verified question with eight selectable options.
  db.prepare("UPDATE questions SET option_letters='A;B;C;D;E;F;G;H' WHERE question_id=?").run('v1-10.8.3');
} catch (_) {}

// Recompute test metadata from the actual question rows on startup. This repairs
// stale counts/marks from older builds while keeping practice sets user-specific.
try {
  const tests = db.prepare('SELECT test_id FROM tests').all();
  for (const { test_id: testId } of tests) {
    const isPractice = !!db.prepare('SELECT 1 FROM practice_sets WHERE test_id=?').get(testId);
    let counts;
    if (isPractice) {
      counts = db.prepare(`
        SELECT COUNT(*) AS total_questions,
               COALESCE(SUM(CASE WHEN q.type!='DESCRIPTIVE' AND q.needs_review=0 THEN 1 ELSE 0 END),0) AS scoreable_questions,
               COALESCE(SUM(CASE WHEN q.type!='DESCRIPTIVE' AND q.needs_review=0 THEN q.marks ELSE 0 END),0) AS total_marks
        FROM practice_set_questions psq JOIN questions q ON q.question_id=psq.question_id
        WHERE psq.test_id=?`).get(testId);
    } else {
      counts = db.prepare(`
        SELECT COUNT(*) AS total_questions,
               COALESCE(SUM(CASE WHEN type!='DESCRIPTIVE' AND needs_review=0 THEN 1 ELSE 0 END),0) AS scoreable_questions,
               COALESCE(SUM(CASE WHEN type!='DESCRIPTIVE' AND needs_review=0 THEN marks ELSE 0 END),0) AS total_marks
        FROM questions WHERE test_id=?`).get(testId);
    }
    db.prepare('UPDATE tests SET total_questions=?, scoreable_questions=?, total_marks=? WHERE test_id=?')
      .run(counts.total_questions || 0, counts.scoreable_questions || 0, counts.total_marks || 0, testId);
  }
} catch (_) {}

// Older builds used NOT NULL timestamps; allow revision-only questions without counting them as attempted.
try {
  const cols = db.prepare('PRAGMA table_info(user_question_progress)').all();
  const firstCol = cols.find(c => c.name === 'first_attempted_at');
  if (firstCol && firstCol.notnull === 1) {
    db.exec(`ALTER TABLE user_question_progress RENAME TO user_question_progress_old;
      CREATE TABLE user_question_progress (
        user_id TEXT NOT NULL REFERENCES users(user_id),
        question_id TEXT NOT NULL REFERENCES questions(question_id),
        first_attempted_at TEXT,
        last_attempted_at TEXT,
        latest_correct INTEGER,
        ever_wrong INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, question_id)
      );
      INSERT INTO user_question_progress SELECT * FROM user_question_progress_old;
      DROP TABLE user_question_progress_old;
      CREATE INDEX IF NOT EXISTS idx_uqp_user ON user_question_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_uqp_revision ON user_question_progress(user_id, revision);`);
  }
} catch (_) {}

// Backfill progress from any attempts that already existed before this feature.
try {
  const rows = db.prepare(`
    SELECT ta.user_id, r.question_id, ta.submitted_at, r.is_correct
    FROM test_attempts ta JOIN responses r ON r.attempt_id = ta.attempt_id
    JOIN questions q ON q.question_id = r.question_id
    WHERE ta.status != 'in_progress' AND r.selected_answer IS NOT NULL AND q.type != 'DESCRIPTIVE' AND q.needs_review = 0
    ORDER BY ta.submitted_at ASC
  `).all();
  const ins = db.prepare(`INSERT OR IGNORE INTO user_question_progress
    (user_id, question_id, first_attempted_at, last_attempted_at, latest_correct, ever_wrong)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const upd = db.prepare(`UPDATE user_question_progress SET first_attempted_at=COALESCE(first_attempted_at, ?), last_attempted_at=?, latest_correct=?, ever_wrong=MAX(ever_wrong, ?) WHERE user_id=? AND question_id=?`);
  for (const r of rows) {
    const correct = r.is_correct == null ? null : (r.is_correct ? 1 : 0);
    ins.run(r.user_id, r.question_id, r.submitted_at, r.submitted_at, correct, correct === 0 ? 1 : 0);
    upd.run(r.submitted_at, r.submitted_at, correct, correct === 0 ? 1 : 0, r.user_id, r.question_id);
  }
} catch (_) {}

module.exports = db;

const express = require('../lib/mini-express');
const bcrypt = require('../lib/password');
const uuidv4 = require('../lib/password').uuid;
const db = require('../db/db');

const router = express.Router();
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createSession(userId) {
  const token = uuidv4() + '-' + uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt);
  return { token, expiresAt };
}

router.post('/signup', (req, res) => {
  const { password } = req.body || {};
  const email = String((req.body || {}).email || '').trim();
  const displayName = String((req.body || {}).displayName || '').trim();
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (user_id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
    .run(userId, email.toLowerCase(), passwordHash, displayName || null);

  const { token, expiresAt } = createSession(userId);
  res.json({ user: { userId, email: email.toLowerCase(), displayName: displayName || null }, sessionToken: token, expiresAt });
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const email = String((req.body || {}).email || '').trim();
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const { token, expiresAt } = createSession(user.user_id);
  res.json({ user: { userId: user.user_id, email: user.email, displayName: user.display_name }, sessionToken: token, expiresAt });
});

router.post('/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  const session = db.prepare('SELECT * FROM sessions WHERE session_token = ?').get(token);
  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Session expired.' });
  }
  const user = db.prepare('SELECT user_id, email, display_name FROM users WHERE user_id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  res.json({ user: { userId: user.user_id, email: user.email, displayName: user.display_name } });
});

module.exports = router;

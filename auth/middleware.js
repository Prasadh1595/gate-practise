const db = require('../db/db');

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  const session = db.prepare('SELECT * FROM sessions WHERE session_token = ?').get(token);
  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  const user = db.prepare('SELECT user_id, email, display_name FROM users WHERE user_id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  req.user = { userId: user.user_id, email: user.email, displayName: user.display_name };
  next();
}

module.exports = { requireAuth };

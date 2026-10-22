// GATE PYQ platform - single-process local server (API + built web app).
// Uses only Node.js built-ins: no `npm install`, no internet required.
const path = require('path');
const fs = require('fs');
const os = require('os');

// node:sqlite (built into Node.js) is needed; it is unflagged from Node 22.13.
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`\n  This app needs Node.js 22.13 or newer (you have ${process.versions.node}).\n  Install the current LTS from https://nodejs.org and run this again.\n`);
  process.exit(1);
}
const express = require('./lib/mini-express');

const authRoutes = require('./auth/routes');
const { requireAuth } = require('./auth/middleware');
const testsRoutes = require('./routes/tests');
const attemptsRoutes = require('./routes/attempts');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

function getNetworkUrls() {
  const urls = new Set([`http://localhost:${PORT}`]);
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const details of interfaces[name] || []) {
      if (details.family === 'IPv4' && !details.internal) {
        urls.add(`http://${details.address}:${PORT}`);
      }
    }
  }
  return [...urls];
}

app.set('trust proxy', true);
app.use(express.json({ limit: 2 * 1024 * 1024 }));

app.use('/assets/questions', express.static(path.join(__dirname, 'assets', 'questions'), { maxAge: 86400 }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);
app.use('/api', requireAuth, testsRoutes);
app.use('/api', requireAuth, attemptsRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Built front-end (single-page app): static files, then index.html for client-side routes.
app.use(express.static(PUBLIC_DIR));
app.get('/:a', spa);
app.get('/:a/:b', spa);
app.get('/:a/:b/:c', spa);
function spa(req, res, next) {
  const index = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(index)) return res.status(500).send('Front-end build missing (server/public/index.html).');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(fs.readFileSync(index));
}
app.get('/', spa);

const server = app.listen(PORT, HOST, () => {
  const urls = getNetworkUrls();
  console.log('');
  console.log('  GATE PYQ Practice is running.');
  console.log(`  Public listen host: ${HOST}`);
  console.log(`  Open in your browser: ${urls.join(' | ')}`);
  console.log('  Keep this window open while you practise. Close it to stop.');
  console.log('');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. GATE PYQ may already be running - open http://localhost:${PORT}\n  or close the other window / set another port (e.g. PORT=3010).\n`);
  } else console.error(err);
  process.exit(1);
});

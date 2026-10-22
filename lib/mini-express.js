/**
 * Tiny, dependency-free replacement for the subset of Express used by this app.
 * Exists so the project runs on a bare Node.js install with NO `npm install`
 * (students may have no internet connection).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function compile(pattern, end) {
  const keys = [];
  const src = pattern.replace(/\/+$/, '').split('/').map((seg) => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { re: new RegExp('^' + src + (end ? '/?$' : '(?=/|$)')), keys };
}

function Router() {
  const stack = [];
  function router(req, res, next) {
    const pathname = req._pathname;
    let i = 0;
    const baseUrlBefore = req.baseUrl || '';
    const urlBefore = req.url;
    const pathBefore = req.path;
    function done(err) { req.baseUrl = baseUrlBefore; req.url = urlBefore; req.path = pathBefore; next(err); }
    function step(err) {
      if (i >= stack.length) return done(err);
      const layer = stack[i++];
      const p = req.path;
      let m = null;
      if (layer.method && layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD')) return step(err);
      m = layer.route.re.exec(p === '' ? '/' : p);
      if (!m) return step(err);
      req.params = { ...(req.params || {}) };
      layer.route.keys.forEach((k, idx) => { try { req.params[k] = decodeURIComponent(m[idx + 1]); } catch { req.params[k] = m[idx + 1]; } });
      const matched = m[0];
      if (layer.isUse) {
        req.baseUrl = baseUrlBefore + matched;
        req.path = p.slice(matched.length) || '/';
      }
      let j = 0;
      function inner(e) {
        if (layer.isUse) { /* keep stripped path until we leave this layer */ }
        const h = layer.handlers[j++];
        if (!h) { if (layer.isUse) { req.baseUrl = baseUrlBefore; req.path = p; } return step(e); }
        try {
          if (e) { if (h.length === 4) return h(e, req, res, inner); return inner(e); }
          if (h.length === 4) return inner();
          const r = h(req, res, inner);
          if (r && typeof r.catch === 'function') r.catch(inner);
        } catch (ex) { inner(ex); }
      }
      inner(err);
    }
    step();
  }
  router.stack = stack;
  router.use = function (...args) {
    let p = '/';
    if (typeof args[0] === 'string') p = args.shift();
    stack.push({ method: null, isUse: true, route: compile(p, false), handlers: args.flat() });
    return router;
  };
  for (const m of ['get', 'post', 'put', 'delete']) {
    router[m] = function (p, ...handlers) {
      stack.push({ method: m.toUpperCase(), isUse: false, route: compile(p, true), handlers: handlers.flat() });
      return router;
    };
  }
  return router;
}

function decorate(req, res) {
  const u = new URL(req.url, 'http://localhost');
  req._pathname = u.pathname;
  req.path = u.pathname;
  req.query = Object.fromEntries(u.searchParams.entries());
  req.params = {};
  req.baseUrl = '';
  res.statusCode = 200;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (obj) => {
    const body = JSON.stringify(obj);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  };
  res.send = (body) => {
    if (typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(body);
  };
}

function express() {
  const app = Router();
  app.locals = {};
  app.set = function (key, value) {
    app.locals[key] = value;
    return app;
  };
  app.listen = function (port, host, cb) {
    if (typeof host === 'function') { cb = host; host = undefined; }
    const server = http.createServer((req, res) => {
      decorate(req, res);
      app(req, res, (err) => {
        if (err) {
          console.error(err);
          if (!res.headersSent) res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal server error.' });
          else res.end();
          return;
        }
        res.status(404).json({ error: 'Not found.' });
      });
    });
    return host ? server.listen(port, host, cb) : server.listen(port, cb);
  };
  return app;
}

express.Router = Router;

express.json = function ({ limit = 2 * 1024 * 1024 } = {}) {
  return function jsonBody(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { req.body = req.body || {}; return next(); }
    const chunks = []; let size = 0; let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { aborted = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) { req.body = {}; return next(); }
      try { req.body = JSON.parse(raw); next(); }
      catch { res.status(400).json({ error: 'Invalid JSON body.' }); }
    });
    req.on('error', next);
  };
};

express.static = function (root, { maxAge = 0 } = {}) {
  const base = path.resolve(root);
  return function serveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    let file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
    if (file !== base && !file.startsWith(base + path.sep)) return next();
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); return fs.stat(file, (e2, s2) => (e2 || !s2.isFile()) ? next() : send(file, s2)); }
      if (err || !st.isFile()) return next();
      send(file, st);
    });
    function send(f, st) {
      res.setHeader('Content-Type', MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Content-Length', st.size);
      res.setHeader('Cache-Control', maxAge ? `public, max-age=${maxAge}` : 'no-cache');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(f).on('error', next).pipe(res);
    }
  };
};

module.exports = express;

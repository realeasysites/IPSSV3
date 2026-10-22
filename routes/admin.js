const express = require('express');
const path = require('path');
const db = require('../db/init');
const auth = require('../lib/auth');
const { statsFor } = require('./analytics');

const router = express.Router();
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

let fails = new Map(); // simple login throttle per IP
function throttled(ip) {
  const now = Date.now();
  const arr = (fails.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  fails.set(ip, arr);
  return arr.length >= 8;
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

router.get('/admin', (req, res) => {
  const file = auth.isAuthed(req) ? 'admin.html' : 'login.html';
  res.sendFile(path.join(__dirname, '..', 'views', file));
});

router.get('/admin/status', (req, res) => {
  res.json({ loginEnabled: auth.loginEnabled(), authed: auth.isAuthed(req) });
});

router.post('/admin/login', express.urlencoded({ extended: false, limit: '4kb' }), express.json({ limit: '4kb' }), (req, res) => {
  if (!auth.loginEnabled()) return res.status(503).json({ ok: false, error: 'Login is not set up yet. Set ADMIN_PASSWORD (8+ characters).' });
  if (throttled(req.ip)) return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in a few minutes.' });
  if (!auth.checkPassword((req.body || {}).password)) {
    fails.get(req.ip).push(Date.now());
    return res.status(401).json({ ok: false, error: 'Wrong password.' });
  }
  auth.issue(req, res);
  res.json({ ok: true });
});

router.get('/admin/logout', (req, res) => {
  auth.clear(res);
  res.redirect('/admin');
});

const api = express.Router();
api.use(auth.requireAdminApi);

api.get('/leads', (req, res) => {
  res.json({ statuses: STATUSES, leads: db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 1000').all() });
});

api.patch('/leads/:id', express.json({ limit: '16kb' }), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const row = db.prepare('SELECT id FROM leads WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'bad status' });
    db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(b.status, id);
  }
  if (b.notes !== undefined) db.prepare('UPDATE leads SET notes = ? WHERE id = ?').run(String(b.notes).slice(0, 4000), id);
  res.json({ ok: true });
});

api.delete('/leads/:id', (req, res) => {
  const r = db.prepare('DELETE FROM leads WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: r.changes > 0 });
});

api.get('/stats', (req, res) => {
  res.json({ d7: statsFor(7), d30: statsFor(30), d90: statsFor(90) });
});

api.get('/export.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM leads ORDER BY id DESC').all();
  const cols = ['id', 'created_at', 'status', 'name', 'phone', 'email', 'item', 'quantity', 'method', 'deadline', 'contact_pref', 'details', 'source', 'notes'];
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="imagepro-leads.csv"');
  res.send(csv);
});

router.use('/admin/api', api);

module.exports = router;

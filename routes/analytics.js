// Cookieless, first-party traffic tracking. Stored in the same SQLite file as leads.
const express = require('express');
const crypto = require('crypto');
const db = require('../db/init');
const { isAuthed } = require('../lib/auth');

const router = express.Router();
const TYPES = new Set(['view', 'call', 'text', 'email', 'social', 'quote_click']);
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|curl|wget|python|monitor|uptime|render/i;

function dailySalt() {
  return new Date().toISOString().slice(0, 10) + (process.env.SESSION_SECRET || 'ip-salt');
}

function sourceOf(ref, utm, host) {
  if (utm) return utm.slice(0, 60);
  if (!ref) return 'direct';
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    if (h === host.replace(/^www\./, '')) return 'internal';
    if (/google\./.test(h)) return 'google';
    if (/facebook|fb\.com|l\.facebook/.test(h)) return 'facebook';
    if (/instagram/.test(h)) return 'instagram';
    if (/bing\./.test(h)) return 'bing';
    return h;
  } catch (e) {
    return 'other';
  }
}

router.post('/sa/collect', express.text({ type: '*/*', limit: '4kb' }), (req, res) => {
  res.status(204).end();
  try {
    const ua = req.headers['user-agent'] || '';
    if (!ua || BOT.test(ua) || isAuthed(req)) return;
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b);
    if (!b || !TYPES.has(b.t)) return;
    const visitor = crypto.createHash('sha256').update(dailySalt() + req.ip + ua).digest('hex').slice(0, 16);
    const device = /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
    const src = sourceOf(String(b.r || ''), String(b.u || ''), req.hostname || '');
    db.prepare('INSERT INTO sa_events (visitor, type, path, source, device, label) VALUES (?,?,?,?,?,?)').run(
      visitor,
      b.t,
      String(b.p || '/').slice(0, 120),
      src,
      device,
      String(b.l || '').slice(0, 80)
    );
  } catch (e) {
    /* never throw from tracking */
  }
});

function statsFor(days) {
  const since = `-${days} days`;
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const visitors = one(`SELECT COUNT(DISTINCT visitor) n FROM sa_events WHERE type='view' AND ts >= datetime('now', ?)`, since).n;
  const views = one(`SELECT COUNT(*) n FROM sa_events WHERE type='view' AND ts >= datetime('now', ?)`, since).n;
  const calls = one(`SELECT COUNT(*) n FROM sa_events WHERE type='call' AND ts >= datetime('now', ?)`, since).n;
  const texts = one(`SELECT COUNT(*) n FROM sa_events WHERE type='text' AND ts >= datetime('now', ?)`, since).n;
  const leads = one(`SELECT COUNT(*) n FROM leads WHERE created_at >= datetime('now', ?)`, since).n;
  const sources = q(
    `SELECT source, COUNT(DISTINCT visitor) n FROM sa_events WHERE type='view' AND ts >= datetime('now', ?) GROUP BY source ORDER BY n DESC LIMIT 6`,
    since
  );
  const pages = q(
    `SELECT path, COUNT(*) n FROM sa_events WHERE type='view' AND ts >= datetime('now', ?) GROUP BY path ORDER BY n DESC LIMIT 5`,
    since
  );
  const devices = q(
    `SELECT device, COUNT(DISTINCT visitor) n FROM sa_events WHERE type='view' AND ts >= datetime('now', ?) GROUP BY device ORDER BY n DESC`,
    since
  );
  const contacts = calls + texts + leads;
  return { days, visitors, views, calls, texts, leads, sources, pages, devices, contactRate: visitors ? Math.min(100, Math.round((contacts / visitors) * 1000) / 10) : 0 };
}

module.exports = { router, statsFor };

const express = require('express');
const db = require('../db/init');
const { sendLeadAlert, sendAutoReply } = require('../lib/mailer');

const router = express.Router();

// tiny in-memory rate limit: 6 submissions / 15 min / IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const win = 15 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 6;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

router.post('/api/quote', (req, res) => {
  const b = req.body || {};
  // honeypot: real people never fill the hidden "company" field
  if (b.company) return res.json({ ok: true });
  if (limited(req.ip)) return res.status(429).json({ ok: false, error: 'Too many requests. Please call us instead.' });

  const lead = {
    name: clean(b.name, 120),
    phone: clean(b.phone, 40),
    email: clean(b.email, 160),
    item: clean(b.item, 120),
    quantity: clean(b.quantity, 60),
    method: clean(b.method, 80),
    deadline: clean(b.deadline, 80),
    contact_pref: clean(b.contact_pref, 40),
    details: clean(b.details, 3000),
    source: clean(b.source, 200),
  };

  if (!lead.name || lead.phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ ok: false, error: 'Please add your name and a phone number.' });
  }
  if (lead.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) {
    return res.status(400).json({ ok: false, error: 'That email address looks off.' });
  }

  const info = db
    .prepare(
      `INSERT INTO leads (name, phone, email, item, quantity, method, deadline, contact_pref, details, source)
       VALUES (@name, @phone, @email, @item, @quantity, @method, @deadline, @contact_pref, @details, @source)`
    )
    .run(lead);

  db.prepare(`INSERT INTO sa_events (visitor, type, path, label) VALUES ('server', 'lead', '/', ?)`).run(String(info.lastInsertRowid));

  // fire-and-forget emails; a mail problem must never lose or block the lead
  sendLeadAlert(lead).catch((e) => console.error('alert email failed:', e.message));
  sendAutoReply(lead).catch((e) => console.error('auto-reply failed:', e.message));

  res.json({ ok: true });
});

module.exports = router;

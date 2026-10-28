// Team & crew stores: open/closed logic, private-store access codes, fundraiser totals, close-out emails.
const crypto = require('crypto');
const db = require('../db/init');

const TZ = process.env.SHOP_TZ || 'America/New_York';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD in shop time

const bySlug = (slug) => db.prepare('SELECT * FROM team_stores WHERE slug = ?').get(String(slug || ''));
const byId = (id) => db.prepare('SELECT * FROM team_stores WHERE id = ?').get(Number(id));
const itemsOf = (storeId, all) => db.prepare(`SELECT * FROM team_items WHERE store_id = ? ${all ? '' : 'AND active = 1'} ORDER BY sort DESC, id`).all(storeId);
const itemById = (id) => db.prepare('SELECT * FROM team_items WHERE id = ?').get(Number(id));

const isOpen = (s) => !!s && s.status === 'open' && (!s.closes_at || s.closes_at >= today());
const isPublic = (s) => !!s && s.status !== 'draft'; // drafts only show to the owner
function closesLabel(s) {
  if (!s || !s.closes_at) return '';
  const d = new Date(s.closes_at + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function daysLeft(s) {
  if (!s || !s.closes_at) return null;
  const a = new Date(today() + 'T12:00:00'), b = new Date(s.closes_at + 'T12:00:00');
  return Math.round((b - a) / 864e5);
}

/* ---------- private stores: access code -> signed cookie ---------- */
function secret() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('ts|' + (process.env.ADMIN_PASSWORD || 'imagepro')).digest('hex');
}
const passSig = (s) => crypto.createHmac('sha256', secret()).update(s.id + ':' + (s.password || '')).digest('hex').slice(0, 32);
const cookieName = (s) => 'ts' + s.id;
function hasAccess(req, s) {
  if (!s.password) return true;
  const m = new RegExp('(?:^|;\\s*)' + cookieName(s) + '=([a-f0-9]{32})').exec(req.headers.cookie || '');
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(passSig(s));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function grant(req, res, s) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${cookieName(s)}=${passSig(s)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}${secure ? '; Secure' : ''}`);
}
function checkCode(s, code) {
  const a = crypto.createHash('sha256').update(String(code || '').trim().toLowerCase()).digest();
  const b = crypto.createHash('sha256').update(String(s.password || '').trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------- totals from paid orders ---------- */
const COUNTED = `status NOT IN ('awaiting_payment','cancelled')`;
function paidOrders(storeId) {
  return db.prepare(`SELECT * FROM orders WHERE team_store_id = ? AND ${COUNTED} ORDER BY id`).all(storeId);
}
function stats(s) {
  const orders = paidOrders(s.id);
  let pieces = 0, sales = 0;
  orders.forEach((o) => { sales += o.total_cents; (JSON.parse(o.items_json) || []).forEach((i) => { pieces += i.qty; }); });
  return { orders: orders.length, pieces, sales, raised: pieces * s.fund_cents };
}

/* ---------- close-out: when the closing date passes, close the store and send the summary ---------- */
function closeOut() {
  try {
    const due = db.prepare(`SELECT * FROM team_stores WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at < ? AND closed_notified = 0`).all(today());
    if (!due.length) return;
    const O = require('./orders');
    due.forEach((s) => {
      db.prepare(`UPDATE team_stores SET status = 'closed', closed_notified = 1 WHERE id = ?`).run(s.id);
      const t = stats(s);
      const lines = `${t.orders} orders · ${t.pieces} pieces · ${O.money(t.sales)} in sales${s.fund_cents ? ` · ${O.money(t.raised)} raised for ${s.org || s.name}` : ''}`;
      O.emailOwner(`Team store closed: ${s.name}`, `${s.name} closed on ${s.closes_at}.\n\n${lines}\n\nThe print sheet and packing list by person are ready in the dashboard (Team stores > Report):\n${O.site()}/admin`);
      if (s.contact_email) O.emailTo(s.contact_email, `Your store is closed: ${s.name}`, `Hi ${s.contact_name || 'there'},\n\n${s.name} is now closed. Here's how it went:\n\n${lines}\n\nWe're printing everything now and will reach out when it's ready. ${s.handoff || ''}\n\nThanks for ordering with Imagepro Screenprint.\nImagepro Screenprint · (207) 499-2700`);
    });
  } catch (e) { console.error('team store close-out failed:', e.message); }
}
setTimeout(closeOut, 15 * 1000).unref();
setInterval(closeOut, 60 * 60 * 1000).unref();

module.exports = { today, bySlug, byId, itemsOf, itemById, isOpen, isPublic, closesLabel, daysLeft, hasAccess, grant, checkCode, paidOrders, stats, closeOut };

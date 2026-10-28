// Order helpers: statuses, formatting, customer + owner emails.
const db = require('../db/init');
const { getTransport, esc } = require('./mailer');

const STATUS = {
  awaiting_payment: 'Waiting for payment',
  paid: 'Paid, proof coming',
  mockup_sent: 'Proof sent, waiting on approval',
  changes_requested: 'Changes requested',
  approved: 'Approved, in line to print',
  printing: 'Printing',
  ready: 'Ready',
  completed: 'Picked up / delivered',
  cancelled: 'Cancelled',
};
const teamOf = (o) => (o && o.team_store_id ? db.prepare('SELECT * FROM team_stores WHERE id = ?').get(o.team_store_id) || null : null);
const statusLabel = (o) => (o.status === 'paid' && o.team_store_id ? 'Paid, prints when the store closes' : o.status === 'paid' && !o.needs_mockup ? 'Paid, in line to print' : STATUS[o.status] || o.status);
const ref = (o) => 'IP-' + (1000 + o.id);
const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '');
const site = () => (process.env.SITE_URL || 'https://imageproscreenprint.com').replace(/\/+$/, '');
const trackUrl = (o) => `${site()}/o/${o.token}`;
const itemsOf = (o) => { try { return JSON.parse(o.items_json) || []; } catch (e) { return []; } };
const mockupsOf = (o) => { try { return JSON.parse(o.mockups) || []; } catch (e) { return []; } };
const getByToken = (t) => db.prepare('SELECT * FROM orders WHERE token = ?').get(String(t || ''));
const getById = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(id));

function itemsText(o) {
  return itemsOf(o)
    .map((i) => `• ${i.title} (${money(i.line)})\n  ${i.details.join('\n  ')}${i.artwork_name ? '\n  Logo: ' + i.artwork_name : i.no_logo ? '\n  Logo: needs help with logo' : ''}${i.notes ? '\n  Notes: ' + i.notes : ''}`)
    .join('\n');
}

async function send(to, subject, text, replyTo) {
  const t = getTransport();
  if (!t || !to) return false;
  await t.sendMail({ from: `"Imagepro Screenprint" <${process.env.SMTP_USER}>`, to, subject, text, replyTo });
  return true;
}
const quiet = (p) => p.catch((e) => console.error('store email failed:', e.message));
const phone = () => process.env.PUBLIC_PHONE || '(207) 499-2700';

function markPaid(o) {
  if (o.status !== 'awaiting_payment') return o;
  db.prepare(`UPDATE orders SET status='paid', paid_at=datetime('now') WHERE id=?`).run(o.id);
  const f = getById(o.id);
  const team = teamOf(f);
  quiet(send(process.env.NOTIFY_EMAIL, `New ${team ? 'team store' : 'online'} order ${ref(f)}: ${money(f.total_cents)}`,
    `New paid order${f.payment_mode === 'demo' ? ' (DEMO, no card charged)' : ''}${team ? ' from the team store "' + team.name + '"' : ''}.\n\n${ref(f)}\n${itemsText(f)}\n\nCustomer: ${f.name} · ${f.phone} · ${f.email}${f.recipient ? '\nFor: ' + f.recipient : ''}\n` +
      `Getting it: ${team ? 'with the team store' : f.fulfillment}${f.address ? ' · ' + f.address : ''}${f.need_by ? '\nNeed by: ' + f.need_by : ''}\nTotal: ${money(f.total_cents)}\n\nOpen the dashboard: ${site()}/admin`, f.email));
  quiet(send(f.email, `Order ${ref(f)} received, Imagepro Screenprint`,
    `Hi ${f.name},\n\nThanks for your order! Here's what we have:\n\n${itemsText(f)}\n\nTotal: ${money(f.total_cents)}\n\n` +
      (team ? `Everything in the ${team.name} store gets printed together after the store closes${team.closes_at ? ' on ' + team.closes_at : ''}. ${team.handoff || ''}\n\n`
        : f.needs_mockup ? `Next we'll email you a free proof to approve. Nothing gets printed until you say it looks right.\n\n` : `We'll let you know as soon as it's ready.\n\n`) +
      `Track your order any time: ${trackUrl(f)}\n\nQuestions? Call or text ${phone()}.\n\nImagepro Screenprint · Biddeford, ME`, process.env.NOTIFY_EMAIL));
  return f;
}

function emailMockup(o) {
  return quiet(send(o.email, `Your proof is ready to approve (${ref(o)})`,
    `Hi ${o.name},\n\nYour proof is ready. Take a look and approve it, or tell us what to change:\n\n${trackUrl(o)}\n\nWe start printing as soon as you approve.\n\nImagepro Screenprint · ${phone()}`, process.env.NOTIFY_EMAIL));
}

function emailStatus(o) {
  if (o.status === 'ready') {
    const team = teamOf(o);
    const how = team ? (team.handoff || `It's ready for pickup at the shop in Biddeford.`) : o.fulfillment === 'delivery' ? `We'll reach out to set up delivery.` : `It's ready for pickup at the shop in Biddeford.`;
    return quiet(send(o.email, `Your order ${ref(o)} is ready`, `Hi ${o.name},\n\nGood news: your order is done. ${how}\n\nOrder details: ${trackUrl(o)}\n\nImagepro Screenprint · ${phone()}`, process.env.NOTIFY_EMAIL));
  }
  if (o.status === 'printing') {
    return quiet(send(o.email, `Your order ${ref(o)} is on the press`, `Hi ${o.name},\n\nYour order is printing now. We'll let you know when it's ready.\n\n${trackUrl(o)}\n\nImagepro Screenprint`, process.env.NOTIFY_EMAIL));
  }
  return Promise.resolve();
}

const emailOwner = (subject, text) => quiet(send(process.env.NOTIFY_EMAIL, subject, text));
const emailTo = (to, subject, text) => quiet(send(to, subject, text, process.env.NOTIFY_EMAIL));

module.exports = { STATUS, statusLabel, ref, money, site, trackUrl, itemsOf, mockupsOf, getByToken, getById, itemsText, markPaid, emailMockup, emailStatus, emailOwner, emailTo, teamOf, esc };

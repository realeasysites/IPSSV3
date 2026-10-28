const nodemailer = require('nodemailer');

let transporter = null;

function getTransport() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendLeadAlert(lead) {
  const t = getTransport();
  const to = process.env.NOTIFY_EMAIL;
  if (!t || !to) return false;
  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const rows = [
    ['Name', lead.name],
    ['Phone', lead.phone],
    ['Email', lead.email],
    ['Item', lead.item],
    ['Quantity', lead.quantity],
    ['Method', lead.method],
    ['Needed by', lead.deadline],
    ['Best way to reach', lead.contact_pref],
    ['Details', lead.details],
    ['Came from', lead.source],
  ].filter((r) => r[1]);
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px">` +
    `<h2 style="margin:0 0 12px">New quote request</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse;font-size:15px">` +
    rows.map((r) => `<tr><td style="color:#666;vertical-align:top"><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('') +
    `</table>` +
    `<p style="margin:18px 0 6px"><a href="tel:${esc(lead.phone)}" style="background:#ffc400;color:#000;padding:10px 16px;text-decoration:none;font-weight:bold;border-radius:6px">Call ${esc(lead.name)}</a></p>` +
    (site ? `<p><a href="${esc(site)}/admin">View in dashboard</a></p>` : '') +
    `</div>`;
  const text = rows.map((r) => `${r[0]}: ${r[1]}`).join('\n') + (site ? `\n\nDashboard: ${site}/admin` : '');
  await t.sendMail({
    from: `"Imagepro Website" <${process.env.SMTP_USER}>`,
    to,
    replyTo: lead.email || undefined,
    subject: `New quote request: ${lead.name}${lead.item ? ' — ' + lead.item : ''}`,
    text,
    html,
  });
  return true;
}

async function sendAutoReply(lead) {
  const t = getTransport();
  if (!t || !lead.email) return false;
  const phone = process.env.PUBLIC_PHONE || '(207) 499-2700';
  await t.sendMail({
    from: `"Imagepro Screenprint" <${process.env.SMTP_USER}>`,
    to: lead.email,
    replyTo: process.env.NOTIFY_EMAIL || undefined,
    subject: 'We got your quote request — Imagepro Screenprint',
    text:
      `Hi ${lead.name},\n\nThanks for reaching out to Imagepro Screenprint. We got your request and will get back to you with a quote shortly.\n\n` +
      `If you have artwork or a logo, reply to this email and attach it. Need it fast? Call or text ${phone}.\n\n` +
      `Design. Print. Promote.\nImagepro Screenprint · Biddeford, ME`,
  });
  return true;
}

module.exports = { sendLeadAlert, sendAutoReply, getTransport, esc };

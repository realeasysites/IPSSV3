const crypto = require('crypto');

const COOKIE = 'ip_admin';
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 hours

function secret() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('ip|' + (process.env.ADMIN_PASSWORD || '')).digest('hex');
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function loginEnabled() {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length >= 8;
}

function checkPassword(pw) {
  if (!loginEnabled()) return false;
  return safeEqual(pw || '', process.env.ADMIN_PASSWORD);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function issue(req, res) {
  const exp = String(Date.now() + MAX_AGE_MS);
  const token = exp + '.' + sign(exp);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}${secure ? '; Secure' : ''}`
  );
}

function clear(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function isAuthed(req) {
  if (!loginEnabled()) return false;
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}

function requireAdminApi(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

module.exports = { loginEnabled, checkPassword, issue, clear, isAuthed, requireAdminApi };

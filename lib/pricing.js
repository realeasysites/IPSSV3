// Pricing engine for the store. The server always re-prices; the browser only previews.
const db = require('../db/init');

const DEFAULTS = {
  extraInkCents: 75,          // per piece, for each ink color beyond the first, per location
  extraLocationCents: 200,    // per piece, for each print location beyond the first
  maxInks: 4,
  maxLocations: 4,
  locations: ['Front', 'Back', 'Left chest', 'Right chest', 'Left sleeve', 'Right sleeve'],
  hatDecorations: [
    { id: 'embroidery', name: 'Embroidery', cents: 0, blurb: 'Your logo stitched right into the hat.' },
    { id: 'patch', name: 'Custom patch', cents: 400, blurb: 'A raised custom patch with your logo.' },
  ],
  hatExtras: [
    { id: 'side', name: 'Small logo or flag on the side', cents: 400 },
    { id: 'back', name: 'Text across the back', cents: 400 },
  ],
  signDoubleCents: 300,        // yard signs: printed on both sides, per sign
  signStakeCents: 150,         // yard signs: H-stake, per stake
  sample: true,
};

function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'pricing'").get();
  let s = {};
  try { s = row ? JSON.parse(row.value) : {}; } catch (e) {}
  return { ...DEFAULTS, ...s };
}

const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const cents = (v) => Math.max(0, Math.min(1000000, Math.round(parseFloat(String(v).replace(/[$,]/g, '')) * 100) || 0));
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function saveSettings(b) {
  const cur = getSettings();
  const clean = (arr, max) => (Array.isArray(arr) ? arr : []).slice(0, max);
  const next = {
    extraInkCents: b.extraInk !== undefined ? cents(b.extraInk) : cur.extraInkCents,
    extraLocationCents: b.extraLocation !== undefined ? cents(b.extraLocation) : cur.extraLocationCents,
    maxInks: b.maxInks !== undefined ? int(b.maxInks, 1, 8, cur.maxInks) : cur.maxInks,
    maxLocations: b.maxLocations !== undefined ? int(b.maxLocations, 1, 6, cur.maxLocations) : cur.maxLocations,
    locations: b.locations !== undefined ? list(b.locations).slice(0, 10) : cur.locations,
    hatDecorations: b.hatDecorations !== undefined
      ? clean(b.hatDecorations, 6).map((d, i) => ({ id: String(d.id || 'deco' + i).replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'deco' + i, name: String(d.name || '').slice(0, 40), cents: cents(d.price), blurb: String(d.blurb || '').slice(0, 120) })).filter((d) => d.name)
      : cur.hatDecorations,
    hatExtras: b.hatExtras !== undefined
      ? clean(b.hatExtras, 6).map((d, i) => ({ id: String(d.id || 'extra' + i).replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'extra' + i, name: String(d.name || '').slice(0, 60), cents: cents(d.price) })).filter((d) => d.name)
      : cur.hatExtras,
    signDoubleCents: b.signDouble !== undefined ? cents(b.signDouble) : cur.signDoubleCents,
    signStakeCents: b.signStake !== undefined ? cents(b.signStake) : cur.signStakeCents,
    sample: b.sample !== undefined ? !!b.sample : cur.sample,
  };
  if (!next.locations.length) next.locations = DEFAULTS.locations;
  if (!next.hatDecorations.length) next.hatDecorations = DEFAULTS.hatDecorations;
  db.prepare("INSERT INTO settings (key, value) VALUES ('pricing', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
  return next;
}

const breaksOf = (p) => { try { return JSON.parse(p.breaks) || []; } catch (e) { return []; } };
const sizePricesOf = (p) => { try { return JSON.parse(p.size_prices) || {}; } catch (e) { return {}; } };

/* A yard sign line: { size, qty, sides: 1|2, stakes: bool } */
function priceSign(p, cfg, S) {
  const sizes = list(p.sizes).length ? list(p.sizes) : ['One size'], breaks = breaksOf(p), extra = sizePricesOf(p);
  if (!breaks.length) return { error: 'This item has no price set yet.' };
  const size = sizes.includes(cfg.size) ? cfg.size : sizes.length === 1 ? sizes[0] : null;
  if (!size) return { error: 'Pick a sign size.' };
  const qty = int(cfg.qty, 0, 5000, 0);
  if (!qty) return { error: 'Choose how many signs.' };
  if (qty < p.min_qty) return { error: `The minimum for ${p.name} is ${p.min_qty}. You have ${qty}.` };
  const sides = Number(cfg.sides) === 2 ? 2 : 1, stakes = !!cfg.stakes;
  const base = baseFor(breaks, qty);
  const unit = base + (Number(extra[size]) || 0) + (sides === 2 ? S.signDoubleCents : 0) + (stakes ? S.signStakeCents : 0);
  const decoration = `${sides === 2 ? 'Double-sided' : 'Single-sided'} full color${stakes ? ' + H-stakes' : ''}`;
  return {
    kind: 'custom', ref_id: p.id, title: `${qty} × ${p.name}`, style: p.style, photo: p.photo || '', product: p.name, color: '', sizes: { [size]: qty }, size, qty,
    decoration, details: ['Size: ' + size, decoration], unit, line: unit * qty, needsLogo: true, next: nextBreak(breaks, qty),
  };
}
function baseFor(breaks, qty) {
  let price = breaks.length ? breaks[0][1] : 0;
  for (const [min, c] of breaks) if (qty >= min) price = c;
  return price;
}
function nextBreak(breaks, qty) {
  const now = baseFor(breaks, qty);
  for (const [min, c] of breaks) if (min > qty && c < now) return { at: min, more: min - qty, save: now - c };
  return null;
}

// sizes: { S: 10, M: 12, ... } -> validated object + totals
function readSizes(raw, allowed, plus) {
  const out = {};
  let qty = 0, plusQty = 0;
  for (const s of allowed) {
    const n = int(raw && raw[s], 0, 5000, 0);
    if (n > 0) { out[s] = n; qty += n; if (plus.includes(s)) plusQty += n; }
  }
  return { sizes: out, qty, plusQty };
}

const fmt = (c) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '');

/* A package line: { package_id, color, sizes, location } */
function pricePackage(pkg, cfg) {
  if (!pkg || !pkg.active) return { error: 'That package is no longer available.' };
  const colors = list(pkg.colors), sizes = list(pkg.sizes), plus = list(pkg.plus_sizes), locs = list(pkg.locations);
  const color = colors.length ? (colors.includes(cfg.color) ? cfg.color : null) : '';
  if (color === null) return { error: 'Pick a garment color.' };
  const s = readSizes(cfg.sizes, sizes.length ? sizes : ['One size'], plus);
  if (pkg.sell_mode === 'pack') {
    if (s.qty !== pkg.pack_qty) return { error: `Sizes need to add up to ${pkg.pack_qty}. You have ${s.qty}.` };
  } else if (s.qty < 1) return { error: 'Add a quantity.' };
  const location = locs.length ? (locs.includes(cfg.location) ? cfg.location : locs[0]) : '';
  const plusTotal = s.plusQty * pkg.plus_cents;
  const base = pkg.sell_mode === 'pack' ? pkg.price_cents : pkg.price_cents * s.qty;
  const details = [color && 'Color: ' + color, location && 'Print: ' + location, 'Sizes: ' + Object.entries(s.sizes).map(([k, v]) => `${k} ${v}`).join(', ')];
  if (plusTotal) details.push(`Plus sizes: ${s.plusQty} × ${fmt(pkg.plus_cents)}`);
  return {
    kind: 'package', ref_id: pkg.id, title: pkg.title + (pkg.sell_mode === 'pack' ? ` (${pkg.pack_qty} pc)` : ''), style: pkg.style,
    product: pkg.title, color, sizes: s.sizes, qty: s.qty, location, decoration: pkg.includes || '',
    details: details.filter(Boolean), unit: Math.round((base + plusTotal) / s.qty), line: base + plusTotal, needsLogo: !!pkg.needs_logo,
  };
}

/* A custom line:
   apparel: { product_id, color, sizes, prints: [{ location, inks }] }
   hat:     { product_id, color, sizes: {'One size': n}, decoration, extras: [] } */
function priceCustom(p, cfg, S) {
  S = S || getSettings();
  if (!p || !p.active) return { error: 'That item is no longer available.' };
  if (p.kind === 'sign') return priceSign(p, cfg, S);
  const colors = list(p.colors), sizes = list(p.sizes), plus = list(p.plus_sizes), breaks = breaksOf(p);
  if (!breaks.length) return { error: 'This item has no price set yet.' };
  const color = colors.length ? (colors.includes(cfg.color) ? cfg.color : null) : '';
  if (color === null) return { error: 'Pick a color.' };
  const s = readSizes(cfg.sizes, sizes.length ? sizes : ['One size'], plus);
  if (!s.qty) return { error: 'Add your quantities.' };
  if (s.qty < p.min_qty) return { error: `The minimum for ${p.name} is ${p.min_qty}. You have ${s.qty}.` };
  const base = baseFor(breaks, s.qty);
  const details = [color && 'Color: ' + color, 'Sizes: ' + Object.entries(s.sizes).map(([k, v]) => `${k} ${v}`).join(', ')];
  let deco = 0, decoration = '';
  if (p.kind === 'hat') {
    const d = S.hatDecorations.find((x) => x.id === cfg.decoration) || S.hatDecorations[0];
    const ex = (Array.isArray(cfg.extras) ? cfg.extras : []).map((id) => S.hatExtras.find((x) => x.id === id)).filter(Boolean);
    deco = d.cents + ex.reduce((t, x) => t + x.cents, 0);
    decoration = [d.name].concat(ex.map((x) => x.name)).join(' + ');
    details.push('Decoration: ' + decoration);
  } else {
    const seen = new Set();
    const prints = (Array.isArray(cfg.prints) ? cfg.prints : [])
      .map((x) => ({ location: String(x.location || ''), inks: int(x.inks, 1, S.maxInks, 1) }))
      .filter((x) => S.locations.includes(x.location) && !seen.has(x.location) && seen.add(x.location))
      .slice(0, S.maxLocations);
    if (!prints.length) return { error: 'Pick at least one print location.' };
    deco = (prints.length - 1) * S.extraLocationCents + prints.reduce((t, x) => t + (x.inks - 1) * S.extraInkCents, 0);
    decoration = 'Screen print: ' + prints.map((x) => `${x.location} (${x.inks} color${x.inks > 1 ? 's' : ''})`).join(', ');
    details.push(decoration);
  }
  const unit = base + deco;
  const plusTotal = s.plusQty * p.plus_cents;
  if (plusTotal) details.push(`Plus sizes: ${s.plusQty} × ${fmt(p.plus_cents)}`);
  return {
    kind: 'custom', ref_id: p.id, title: `${s.qty} × ${p.name}`, style: p.style, product: p.name, color, sizes: s.sizes, qty: s.qty,
    decoration, details: details.filter(Boolean), unit, line: unit * s.qty + plusTotal, needsLogo: true,
    next: nextBreak(breaks, s.qty),
  };
}

/* A team store line: { color, size, qty, name, number }. One size per line so the packing list stays simple. */
function priceTeam(it, store, cfg) {
  const T = require('./teams');
  if (!it || !store || it.store_id !== store.id || !it.active) return { error: 'That item is no longer in the store.' };
  if (!T.isOpen(store)) return { error: `The ${store.name} store is closed.` };
  const colors = list(it.colors), sizes = list(it.sizes).length ? list(it.sizes) : ['One size'], plus = list(it.plus_sizes);
  const color = colors.length ? (colors.includes(cfg.color) ? cfg.color : null) : '';
  if (color === null) return { error: 'Pick a color.' };
  const size = sizes.includes(cfg.size) ? cfg.size : (sizes.length === 1 ? sizes[0] : null);
  if (!size) return { error: 'Pick a size.' };
  const qty = int(cfg.qty, 0, 50, 0);
  if (!qty) return { error: 'Choose how many.' };
  let name = '', number = '';
  if (it.personalize) {
    name = String(cfg.name || '').replace(/[^\p{L}\p{N} .'&-]/gu, '').trim().slice(0, 16).toUpperCase();
    number = String(cfg.number || '').replace(/\D/g, '').slice(0, 3);
  }
  const extra = (plus.includes(size) ? it.plus_cents : 0) + (name && store.name_cents ? store.name_cents : 0) + (number && store.number_cents ? store.number_cents : 0);
  const unit = it.price_cents + extra;
  const details = [color && 'Color: ' + color, `Size: ${size}${qty > 1 ? ' × ' + qty : ''}`];
  if (name) details.push('Name on back: ' + name);
  if (number) details.push('Number: ' + number);
  if (it.design_note) details.push('Design: ' + it.design_note);
  return {
    kind: 'team', ref_id: it.id, store_id: store.id, store_name: store.name, title: (qty > 1 ? qty + ' × ' : '') + it.name, style: it.style, photo: it.design || '',
    product: `${store.name}: ${it.name}`, color, sizes: { [size]: qty }, size, qty, name, number, decoration: it.design_note || 'Team store design',
    details: details.filter(Boolean), unit, line: unit * qty, needsLogo: false,
  };
}

function priceCartItem(item, S) {
  let cfg = {};
  try { cfg = JSON.parse(item.config); } catch (e) {}
  if (item.kind === 'team') {
    const it = db.prepare('SELECT * FROM team_items WHERE id = ?').get(item.ref_id);
    return priceTeam(it, it && db.prepare('SELECT * FROM team_stores WHERE id = ?').get(it.store_id), cfg);
  }
  if (item.kind === 'package') return pricePackage(db.prepare('SELECT * FROM packages WHERE id = ?').get(item.ref_id), cfg);
  return priceCustom(db.prepare('SELECT * FROM products WHERE id = ?').get(item.ref_id), cfg, S);
}

const taxRate = () => Math.max(0, Number(process.env.TAX_RATE || 0));

module.exports = { getSettings, saveSettings, pricePackage, priceCustom, priceTeam, priceCartItem, breaksOf, sizePricesOf, list, cents, fmt, taxRate, DEFAULTS };

/* Product page: package deal or custom order configurator. Price shown here is a preview; the server re-prices. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var money = function (c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, ''); };
  var form = $('#buyForm'); if (!form) return;
  var kind = form.getAttribute('data-kind'), C = JSON.parse(form.getAttribute('data-cfg'));
  var msg = $('#buyMsg'), btn = $('#addBtn');

  function say(t, ok) { msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t; }

  // color name
  $$('input[name=color]').forEach(function (r) { r.addEventListener('change', function () { var n = $('#colorName'); if (n) n.textContent = r.value; }); });

  function sizes() {
    var o = {}, qty = 0, plus = 0;
    $$('input[data-size]').forEach(function (i) {
      var n = Math.max(0, Math.floor(Number(i.value) || 0)), s = i.getAttribute('data-size');
      i.closest('.size').classList.toggle('has', n > 0);
      if (n > 0) { o[s] = n; qty += n; if ((C.plus || []).indexOf(s) > -1) plus += n; }
    });
    return { map: o, qty: qty, plus: plus };
  }
  function prints() {
    return $$('input[name=loc]:checked').map(function (c) {
      var sel = form.querySelector('select[data-inks="' + c.value.replace(/"/g, '\\"') + '"]');
      return { location: c.value, inks: sel ? Number(sel.value) : 1 };
    });
  }
  var sign = C.kind === 'sign', qtyIn = form.elements.namedItem('qty');
  $$('[data-step]', form).forEach(function (b) {
    b.addEventListener('click', function () { qtyIn.value = Math.max(1, Math.min(5000, (Number(qtyIn.value) || 0) + Number(b.getAttribute('data-step')))); render(); });
  });
  function config() {
    if (sign) {
      var q = Math.max(0, Math.min(5000, Math.floor(Number(qtyIn.value) || 0)));
      var sz = form.querySelector('input[name=size]:checked'), sd = form.querySelector('input[name=sides]:checked');
      return { cfg: { size: sz ? sz.value : '', qty: q, sides: sd ? Number(sd.value) : 1, stakes: !!(form.querySelector('input[name=stakes]') || {}).checked }, s: { qty: q, plus: 0 } };
    }
    var s = sizes(), cfg = { color: (form.querySelector('input[name=color]:checked') || {}).value || '', sizes: s.map };
    if (kind === 'package') cfg.location = (form.querySelector('[name=location]:checked') || form.querySelector('input[type=hidden][name=location]') || {}).value || '';
    else if (C.kind === 'hat') {
      cfg.decoration = (form.querySelector('input[name=decoration]:checked') || {}).value;
      cfg.extras = $$('input[name=extra]:checked').map(function (x) { return x.value; });
    } else cfg.prints = prints();
    return { cfg: cfg, s: s };
  }

  function render() {
    var c = config(), s = c.s;
    if (kind === 'package') {
      var total = (C.mode === 'pack' ? C.price : C.price * s.qty) + s.plus * (C.plusCents || 0);
      $('#liveTotal').textContent = money(C.mode === 'pack' || s.qty ? total : C.price);
      var m = $('.meter');
      if (m) {
        $('#meterFill').style.width = Math.min(100, (s.qty / C.pack) * 100) + '%';
        m.classList.toggle('full', s.qty === C.pack); m.classList.toggle('over', s.qty > C.pack);
        $('#meterTxt').textContent = s.qty === C.pack ? 'All ' + C.pack + ' pieces assigned. Nice.' : s.qty > C.pack ? s.qty + ' of ' + C.pack + ' pieces. Remove ' + (s.qty - C.pack) + '.' : s.qty + ' of ' + C.pack + ' pieces · ' + (C.pack - s.qty) + ' to go';
      }
      return;
    }
    // custom
    var b = C.breaks, base = b[0][1], next = null;
    b.forEach(function (x) { if (s.qty >= x[0]) base = x[1]; });
    for (var i = 0; i < b.length; i++) if (b[i][0] > s.qty && b[i][1] < base) { next = { more: b[i][0] - s.qty, save: base - b[i][1] }; break; }
    var deco = 0;
    if (sign) {
      deco = (Number((C.sizePrices || {})[c.cfg.size]) || 0) + (c.cfg.sides === 2 ? C.double : 0) + (c.cfg.stakes ? C.stake : 0);
    } else if (C.kind === 'hat') {
      var d = C.deco.filter(function (x) { return x.id === c.cfg.decoration; })[0] || C.deco[0];
      deco = d.cents + c.cfg.extras.reduce(function (t, id) { var x = C.extras.filter(function (e) { return e.id === id; })[0]; return t + (x ? x.cents : 0); }, 0);
    } else {
      var p = c.cfg.prints;
      deco = Math.max(0, p.length - 1) * C.extraLoc + p.reduce(function (t, x) { return t + (x.inks - 1) * C.extraInk; }, 0);
    }
    var unit = base + deco, total = unit * s.qty + s.plus * (C.plusCents || 0);
    $('#livePer').innerHTML = money(unit) + ' <small>each' + (s.qty ? ' at ' + s.qty + (sign ? ' signs' : ' pieces') : '') + '</small>';
    $('#liveQty').textContent = s.qty + (sign ? ' sign' : ' piece') + (s.qty === 1 ? '' : 's');
    $('#liveTotal').textContent = money(total);
    var n = $('#nudge');
    var unitWord = sign ? 'sign' : 'piece';
    if (s.qty < C.min) { n.className = 'nudge warn'; n.textContent = s.qty ? 'Add ' + (C.min - s.qty) + ' more to reach the ' + C.min + '-' + unitWord + ' minimum.' : 'Minimum ' + C.min + ' ' + unitWord + 's.'; }
    else if (next) { n.className = 'nudge'; n.textContent = 'Add ' + next.more + ' more and every ' + unitWord + ' drops ' + money(next.save) + '.'; }
    else { n.className = 'nudge good'; n.textContent = 'You’re at the best price.'; }
    $$('.breaks th, .breaks td').forEach(function (cell) { cell.classList.remove('on'); });
    var col = -1; b.forEach(function (x, k) { if (s.qty >= x[0]) col = k; });
    if (col > -1) { var rows = $$('.breaks tr'); rows.forEach(function (r) { if (r.children[col]) r.children[col].classList.add('on'); }); }
  }

  // max print locations
  $$('input[name=loc]').forEach(function (c) {
    c.addEventListener('change', function () {
      var on = $$('input[name=loc]:checked');
      if (on.length > C.maxLoc) { c.checked = false; say('Up to ' + C.maxLoc + ' print locations.'); }
    });
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();

  // logo drop zone
  var drop = $('.drop'), file = drop && $('input[type=file]', drop);
  if (file) {
    var prev = document.createElement('img'); prev.className = 'drop-prev'; prev.hidden = true; drop.appendChild(prev);
    var show = function () {
      var f = file.files[0];
      $('.drop-txt b', drop).textContent = f ? f.name : 'Upload your logo';
      drop.classList.toggle('has', !!f);
      if (f && /^image\/(png|jpe?g|gif|webp)$/.test(f.type)) { prev.src = URL.createObjectURL(f); prev.hidden = false; } else prev.hidden = true;
      if (f) { var nl = form.querySelector('input[name=no_logo]'); if (nl) nl.checked = false; }
    };
    file.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; show(); } });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var c = config(), s = c.s;
    if (kind === 'package' && C.mode === 'pack' && s.qty !== C.pack) return say('Your sizes need to add up to ' + C.pack + '. You have ' + s.qty + '.');
    if (!s.qty) return say('Add your quantities.');
    if (kind === 'custom' && s.qty < C.min) return say('The minimum is ' + C.min + (sign ? ' signs' : ' pieces') + '. You have ' + s.qty + '.');
    if (sign && !c.cfg.size) return say('Pick a sign size.');
    if (kind === 'custom' && !sign && C.kind !== 'hat' && !c.cfg.prints.length) return say('Pick at least one print location.');
    var needsLogo = kind === 'custom' || C.needsLogo;
    var nl = form.querySelector('input[name=no_logo]');
    if (needsLogo && file && !file.files.length && !(nl && nl.checked)) return say('Upload your logo, or check the box if you don’t have one yet.');
    var fd = new FormData();
    fd.append('kind', kind); fd.append('ref_id', C.id); fd.append('config', JSON.stringify(c.cfg));
    fd.append('notes', (form.querySelector('[name=notes]') || {}).value || '');
    if (nl && nl.checked) fd.append('no_logo', '1');
    if (file && file.files[0]) fd.append('artwork', file.files[0]);
    btn.disabled = true; btn.textContent = 'Adding…'; say('', true);
    fetch('/api/bag', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          window.ipBag && window.ipBag(res.j.count);
          window.ipToast && window.ipToast('Added to bag <a href="/bag">View bag</a>');
          say('Added to your bag. ', true);
          msg.insertAdjacentHTML('beforeend', '<a href="/bag">Check out</a> or keep shopping.');
          if (window.saTrack) window.saTrack('quote_click', 'add to bag');
        } else say(res.j.error || 'Something went wrong. Please call (207) 499-2700.');
      })
      .catch(function () { say('Could not add to bag. Check your connection and try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Add to Bag'; });
  });
})();

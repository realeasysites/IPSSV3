/* Team & crew stores: private-store code, item page (size, qty, name/number), "start a store" request form. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var money = function (c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, ''); };
  var post = function (url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); });
  };
  function sayIn(el) { return function (t, ok) { el.className = 'form-msg ' + (ok ? 'ok' : 'err'); el.textContent = t; }; }

  /* ---------- private store code ---------- */
  var lock = $('#unlock');
  if (lock) {
    var lsay = sayIn($('#unlockMsg'));
    lock.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = lock.elements.namedItem('code').value.trim();
      if (!code) return lsay('Enter the store code.');
      post('/api/team/' + encodeURIComponent(lock.getAttribute('data-slug')) + '/unlock', { code: code }).then(function (res) {
        if (res.ok) location.reload(); else lsay(res.j.error || 'That code doesn’t match.');
      }).catch(function () { lsay('Could not connect. Try again.'); });
    });
  }

  /* ---------- item page ---------- */
  var form = $('#teamForm');
  if (form) {
    var C = JSON.parse(form.getAttribute('data-cfg'));
    var say = sayIn($('#buyMsg')), btn = $('#addBtn');
    var qtyIn = form.elements.namedItem('qty');
    var val = function (n) { var el = form.querySelector('[name="' + n + '"]:checked') || form.querySelector('input[type=hidden][name="' + n + '"]'); return el ? el.value : ''; };
    $$('input[name=color]', form).forEach(function (r) { r.addEventListener('change', function () { var n = $('#colorName'); if (n) n.textContent = r.value; }); });
    $$('[data-step]', form).forEach(function (b) {
      b.addEventListener('click', function () { qtyIn.value = Math.max(1, Math.min(50, (Number(qtyIn.value) || 1) + Number(b.getAttribute('data-step')))); render(); });
    });
    var pnum = form.elements.namedItem('pnum');
    if (pnum) pnum.addEventListener('input', function () { pnum.value = pnum.value.replace(/\D/g, '').slice(0, 3); });
    function cfg() {
      var name = form.elements.namedItem('pname'), num = form.elements.namedItem('pnum');
      return { color: val('color'), size: val('size'), qty: Math.max(0, Math.min(50, Math.floor(Number(qtyIn.value) || 0))), name: name ? name.value.trim() : '', number: num ? num.value.trim() : '' };
    }
    function render() {
      var c = cfg();
      var unit = C.price + ((C.plus || []).indexOf(c.size) > -1 ? C.plusCents : 0) + (c.name ? C.nameCents : 0) + (c.number ? C.numberCents : 0);
      $('#liveQty').textContent = c.qty + ' piece' + (c.qty === 1 ? '' : 's');
      $('#liveTotal').textContent = money(unit * c.qty);
    }
    form.addEventListener('input', render);
    form.addEventListener('change', render);
    render();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var c = cfg();
      if (!c.size) return say('Pick a size.');
      if (!c.qty) return say('Choose how many.');
      var fd = new FormData();
      fd.append('kind', 'team'); fd.append('ref_id', C.id); fd.append('config', JSON.stringify(c));
      btn.disabled = true; btn.textContent = 'Adding…'; say('', true);
      fetch('/api/bag', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            window.ipBag && window.ipBag(res.j.count);
            window.ipToast && window.ipToast('Added to bag <a href="/bag">View bag</a>');
            say('Added to your bag. ', true);
            $('#buyMsg').insertAdjacentHTML('beforeend', '<a href="/bag">Check out</a> or keep shopping.');
            if (window.saTrack) window.saTrack('quote_click', 'team add to bag');
          } else {
            say(res.j.error || 'Something went wrong. Please call (207) 499-2700.');
            if (/bag/.test(res.j.error || '')) $('#buyMsg').insertAdjacentHTML('beforeend', ' <a href="/bag">Go to bag</a>');
          }
        })
        .catch(function () { say('Could not add to bag. Check your connection and try again.'); })
        .then(function () { btn.disabled = false; btn.textContent = 'Add to Bag'; });
    });
  }

  /* ---------- start-a-store request (lands in Quote requests on the dashboard) ---------- */
  var req = $('#teamReq');
  if (req) {
    var rsay = sayIn($('#teamReqMsg')), rbtn = $('#teamReqBtn');
    req.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {}; new FormData(req).forEach(function (v, k) { d[k] = v; });
      if (!String(d.name || '').trim()) return rsay('Please add your name.');
      if (String(d.phone || '').replace(/\D/g, '').length < 7) return rsay('Please add a phone number we can reach you at.');
      var q = new URLSearchParams(location.search);
      var body = {
        company: d.company, name: d.name, phone: d.phone, email: d.email, item: 'Team / crew store', quantity: d.quantity, deadline: d.deadline, contact_pref: 'Call',
        details: [d.team ? 'Team / company: ' + d.team : '', d.fundraiser ? 'Wants a fundraiser store' : '', d.details || ''].filter(Boolean).join('\n'),
        source: q.get('utm_source') || q.get('ref') || 'team stores page',
      };
      rbtn.disabled = true; rbtn.textContent = 'Sending…';
      post('/api/quote', body).then(function (res) {
        if (res.ok) { req.reset(); rsay('Got it! We’ll reach out to set up your store. In a rush? Call or text (207) 499-2700.', true); if (window.saTrack) window.saTrack('quote_click', 'team store request'); }
        else rsay(res.j.error || 'Something went wrong. Please call (207) 499-2700.');
      }).catch(function () { rsay('Could not send. Please call or text (207) 499-2700.'); })
        .then(function () { rbtn.disabled = false; rbtn.textContent = 'Send My Request'; });
    });
  }
})();

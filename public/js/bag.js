(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  $$('[data-rm]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      fetch('/api/bag/' + b.getAttribute('data-rm'), { method: 'DELETE', credentials: 'same-origin' }).then(function () { location.reload(); });
    });
  });

  var form = $('#checkout'); if (!form) return;
  var msg = $('#coMsg'), btn = $('#coBtn');
  $$('input[name=fulfillment]').forEach(function (r) { r.addEventListener('change', function () { $('.addr', form).hidden = !(r.value === 'delivery' && r.checked); }); });
  function say(t) { msg.className = 'form-msg err'; msg.textContent = t; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = {}; new FormData(form).forEach(function (v, k) { d[k] = v; });
    if (!String(d.name || '').trim()) return say('Add your name.');
    if (String(d.phone || '').replace(/\D/g, '').length < 7) return say('Add a phone number.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || '').trim())) return say(form.elements.namedItem('recipient') ? 'Add your email for your receipt.' : 'Add your email so we can send your proof.');
    var q = new URLSearchParams(location.search); d.source = q.get('utm_source') || q.get('ref') || '';
    btn.disabled = true; btn.textContent = 'Placing order…';
    fetch('/api/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { if (window.saTrack) window.saTrack('quote_click', 'checkout'); location.href = res.j.redirect; }
        else { say(res.j.error || 'Something went wrong. Please call (207) 499-2700.'); btn.disabled = false; btn.textContent = 'Checkout'; }
      })
      .catch(function () { say('Could not check out. Check your connection and try again.'); btn.disabled = false; btn.textContent = 'Checkout'; });
  });
})();

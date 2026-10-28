(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }); });
  }
  function say(el, t, ok) { if (!el) return; el.className = 'form-msg ' + (ok ? 'ok' : 'err'); el.textContent = t; }

  var demo = $('#demoPay');
  if (demo) demo.addEventListener('click', function () {
    demo.disabled = true; say($('#payMsg'), 'Processing…', true);
    post('/api/orders/' + demo.getAttribute('data-token') + '/demo-pay').then(function (r) {
      if (r.ok) location.href = r.j.redirect; else { say($('#payMsg'), 'Could not complete. Please call the shop.'); demo.disabled = false; }
    });
  });

  var again = $('#payAgain');
  if (again) again.addEventListener('click', function () {
    again.disabled = true;
    post('/api/orders/' + again.getAttribute('data-token') + '/pay').then(function (r) {
      if (r.ok) location.href = r.j.redirect; else { say($('#payMsg'), r.j.error || 'Please call the shop.'); again.disabled = false; }
    });
  });

  var appr = $('#approveBtn');
  if (appr) appr.addEventListener('click', function () {
    appr.disabled = true;
    post('/api/orders/' + appr.getAttribute('data-token') + '/approve').then(function (r) {
      if (r.ok) location.reload(); else { say($('#apprMsg'), r.j.error || 'Please call the shop.'); appr.disabled = false; }
    });
  });

  var ch = $('#changeBtn');
  if (ch) ch.addEventListener('click', function () {
    var note = $('#changeNote').value.trim();
    if (!note) return say($('#apprMsg'), 'Tell us what to change.');
    ch.disabled = true;
    post('/api/orders/' + ch.getAttribute('data-token') + '/changes', { note: note }).then(function (r) {
      if (r.ok) location.reload(); else { say($('#apprMsg'), r.j.error || 'Please call the shop.'); ch.disabled = false; }
    });
  });
})();

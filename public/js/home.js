(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // gallery filter
  var figs = $$('#gallery figure');
  $$('.chips .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('.chips .chip').forEach(function (x) { x.classList.toggle('on', x === c); });
      var f = c.getAttribute('data-filter');
      figs.forEach(function (fig) { fig.hidden = !(f === 'all' || (' ' + fig.getAttribute('data-cat') + ' ').indexOf(' ' + f + ' ') > -1); });
    });
  });

  // lightbox
  var lb = $('#lightbox'), img = $('#lbImg'), cap = $('#lbCap'), idx = 0, last = null;
  function vis() { return figs.filter(function (f) { return !f.hidden; }); }
  function show(i) { var v = vis(); if (!v.length) return; idx = (i + v.length) % v.length; var im = $('img', v[idx]); img.src = im.src; img.alt = im.alt; cap.textContent = $('figcaption', v[idx]).textContent; lb.hidden = false; }
  figs.forEach(function (f) { $('button', f).addEventListener('click', function () { last = this; show(vis().indexOf(f)); $('#lbClose').focus(); }); });
  function close() { lb.hidden = true; img.src = ''; if (last) last.focus(); }
  $('#lbClose').addEventListener('click', close);
  $('#lbPrev').addEventListener('click', function () { show(idx - 1); });
  $('#lbNext').addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) { if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });

  // links that pre-pick the quote form's "What do you need?"
  $$('[data-prefill]').forEach(function (a) {
    a.addEventListener('click', function () {
      var sel = $('#itemSel'), v = a.getAttribute('data-prefill');
      if (sel) [].forEach.call(sel.options, function (o) { if (o.text === v) sel.value = o.value || o.text; });
    });
  });

  // quote form
  var form = $('#quoteForm'), msg = $('#quoteMsg'), btn = $('#quoteBtn');
  var q = new URLSearchParams(location.search), ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
  $('#srcField').value = q.get('utm_source') || q.get('ref') || ref || 'direct';
  function say(t, ok) { msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = {}; new FormData(form).forEach(function (v, k) { d[k] = v; });
    if (!String(d.name || '').trim()) return say('Please add your name.');
    if (String(d.phone || '').replace(/\D/g, '').length < 7) return say('Please add a phone number we can reach you at.');
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { form.reset(); say('Got it! We’ll reach out shortly. In a rush? Call or text (207) 499-2700.', true); if (window.saTrack) window.saTrack('quote_click', 'submitted'); }
        else say((res.j && res.j.error) || 'Something went wrong. Please call (207) 499-2700.');
      })
      .catch(function () { say('Could not send. Please call or text (207) 499-2700.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Send My Request'; });
  });
})();

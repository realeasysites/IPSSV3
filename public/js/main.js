(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var track = function (t, l) { if (window.saTrack) window.saTrack(t, l); };

  $('#yr').textContent = new Date().getFullYear();
  $('#tkDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // logo plates pull into registration
  var press = $('.press');
  if (press) setTimeout(function () { press.classList.add('is-set'); }, reduce ? 0 : 350);

  // menu
  var menuBtn = $('#menuBtn'), nav = $('#nav');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
  $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  // conveyor: duplicate the run so it loops seamlessly
  var belt = $('.belt'), run = $('#beltRun');
  if (belt && run && !reduce) {
    $$('li', run).forEach(function (li) {
      var c = li.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      $('img', c).alt = '';
      run.appendChild(c);
    });
    belt.classList.add('is-moving');
  }

  // blanks tabs
  var tabs = $$('[role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') selectTab(tabs[(i + 1) % tabs.length], true);
      if (e.key === 'ArrowLeft') selectTab(tabs[(i - 1 + tabs.length) % tabs.length], true);
    });
  });

  // "Order these" / "Ask about a store" pre-fill the work order
  $$('[data-prefill]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-prefill');
      $$('input[name="garment"]').forEach(function (c) { if (c.value === v) c.checked = true; });
      track('quote_click', v);
      $('#order').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      setTimeout(function () { $('input[name="name"]').focus({ preventScroll: true }); }, reduce ? 0 : 600);
    });
  });

  // roll call: photo follows the cursor on desktop
  var peek = $('#peek');
  if (peek && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.names button').forEach(function (b) {
      b.addEventListener('mouseenter', function () { peek.src = b.getAttribute('data-src'); peek.classList.add('on'); });
      b.addEventListener('mouseleave', function () { peek.classList.remove('on'); });
      b.addEventListener('mousemove', function (e) {
        peek.style.transform = 'translate(' + (e.clientX + 24) + 'px,' + (e.clientY - 110) + 'px) rotate(-3deg)';
      });
    });
  }

  // lightbox (grouped by the list or panel the photo lives in)
  var lb = $('#lightbox'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), group = [], idx = 0, lastFocus = null;
  function srcOf(el) { return el.getAttribute('data-src') || el.getAttribute('src'); }
  function show(i) {
    idx = (i + group.length) % group.length;
    var el = group[idx];
    lbImg.src = srcOf(el);
    lbImg.alt = el.getAttribute('data-cap') || el.alt || '';
    lbCap.textContent = el.getAttribute('data-cap') || '';
    lb.hidden = false;
  }
  function open(el) {
    group = $$('[data-lb]', el.closest('.names, .panel-photos') || document);
    lastFocus = document.activeElement;
    peek && peek.classList.remove('on');
    show(group.indexOf(el));
    $('#lbClose').focus();
  }
  function close() { lb.hidden = true; lbImg.src = ''; if (lastFocus) lastFocus.focus(); }
  $$('[data-lb]').forEach(function (el) { el.addEventListener('click', function () { open(el); }); });
  $('#lbClose').addEventListener('click', close);
  $('#lbPrev').addEventListener('click', function () { show(idx - 1); });
  $('#lbNext').addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) setMenu(false);
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });

  // work order submit
  var form = $('#quoteForm'), msg = $('#formMsg'), sub = $('#submitBtn');
  var q = new URLSearchParams(location.search);
  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
  $('#srcField').value = q.get('utm_source') || q.get('ref') || ref || 'direct';

  function say(cls, text) { msg.className = 'form-msg ' + cls; msg.textContent = text; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    say('', '');
    var d = {}, items = [];
    new FormData(form).forEach(function (v, k) { if (k === 'garment') items.push(v); else d[k] = v; });
    d.item = items.join(', ');
    if (!d.name || !d.name.trim()) { say('err', 'Add your name so we know who the order is for.'); form.elements.namedItem('name').focus(); return; }
    if ((d.phone || '').replace(/\D/g, '').length < 7) { say('err', 'Add a phone number we can reach you at.'); form.elements.namedItem('phone').focus(); return; }
    sub.disabled = true; sub.textContent = 'Sending...';
    fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          say('ok', 'Got it. Your work order is in. We\'ll reach out soon. In a rush? Call or text (207) 499-2700.');
          track('quote_click', 'submitted');
        } else {
          say('err', (res.j && res.j.error) || 'Something went wrong. Please call (207) 499-2700.');
        }
      })
      .catch(function () { say('err', 'Could not send. Please call or text (207) 499-2700.'); })
      .then(function () { sub.disabled = false; sub.textContent = 'Send it to the shop'; });
  });
})();

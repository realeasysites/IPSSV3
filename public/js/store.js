/* Shared on every page: menu, bag count, header shadow, rails, toast, share buttons. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var toastT;
  window.ipToast = function (html) {
    var t = $('#toast'); if (!t) return;
    t.innerHTML = html; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 3200);
  };
  window.ipBag = function (n) {
    var b = $('#bagN'); if (!b) return;
    b.textContent = n; b.hidden = !n;
  };
  fetch('/api/bag/count', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) { window.ipBag(d.count); }).catch(function () {});

  // menu
  var btn = $('#menuBtn'), nav = $('#nav');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (btn && nav) {
    btn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) setMenu(false); });
  }

  // header border once scrolled
  var hdr = $('.hdr');
  function onScroll() { if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 10); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // carousel arrows
  $$('[data-scroll]').forEach(function (b) {
    b.addEventListener('click', function () {
      var rail = document.getElementById(b.getAttribute('data-scroll'));
      if (rail) rail.scrollBy({ left: Number(b.getAttribute('data-dir')) * rail.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  // share buttons
  $$('.share').forEach(function (s) {
    var url = s.getAttribute('data-url'), title = s.getAttribute('data-title');
    var native = $('[data-share=native]', s);
    if (native && navigator.share) { native.hidden = false; native.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); }); }
    var copy = $('[data-share=copy]', s);
    if (copy) copy.addEventListener('click', function () {
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { window.ipToast('Link copied. Paste it in your post.'); }, function () { window.prompt('Copy this link:', url); });
      if (window.saTrack) window.saTrack('social', 'copy link');
    });
  });
})();

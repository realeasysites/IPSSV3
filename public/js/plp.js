/* Product listing filters: package checkboxes (style / quantity) and custom-order category tabs. */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var cards = $$('#plpGrid .pcard'), count = $('#plpCount');
  function setCount(n) { if (count) count.textContent = '(' + n + ')'; }

  // packages
  var groups = $$('.f-group'), qtys = $$('.f-qty');
  function applyChecks() {
    var g = groups.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
    var q = qtys.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
    var n = 0;
    cards.forEach(function (c) {
      var show = (!g.length || g.indexOf(c.getAttribute('data-group')) > -1) && (!q.length || q.indexOf(c.getAttribute('data-qty')) > -1);
      c.hidden = !show; if (show) n++;
    });
    setCount(n);
  }
  groups.concat(qtys).forEach(function (x) { x.addEventListener('change', applyChecks); });

  // custom order tabs
  var tabs = $$('.tab');
  function applyTab(cat) {
    var n = 0;
    tabs.forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-cat') === cat); });
    cards.forEach(function (c) { var show = !cat || c.getAttribute('data-cat') === cat; c.hidden = !show; if (show) n++; });
    setCount(n);
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var cat = t.getAttribute('data-cat'); applyTab(cat);
      var u = new URL(location.href); if (cat) u.searchParams.set('cat', cat); else u.searchParams.delete('cat');
      history.replaceState(null, '', u.pathname + u.search);
    });
  });
  if (tabs.length) {
    var start = new URLSearchParams(location.search).get('cat') || '';
    if (start && !tabs.some(function (t) { return t.getAttribute('data-cat') === start; })) start = '';
    applyTab(start);
  }
})();

/* Cookieless first-party analytics. Posts to /sa/collect as {t,p,r,u,l}. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var utm = q.get('utm_source') || q.get('ref') || '';
  function send(t, l) {
    try {
      var body = JSON.stringify({ t: t, p: location.pathname, r: document.referrer || '', u: utm, l: l || '' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/sa/collect', new Blob([body], { type: 'text/plain' }));
      } else {
        fetch('/sa/collect', { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
      }
    } catch (e) {}
  }
  window.saTrack = send;
  send('view');

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) send('call', 'phone');
    else if (href.indexOf('sms:') === 0) send('text', 'phone');
    else if (href.indexOf('mailto:') === 0) send('email', 'email');
    else if (a.hasAttribute('data-social')) send('social', a.getAttribute('data-social'));
    else if (a.hasAttribute('data-quote')) send('quote_click', a.textContent.trim().slice(0, 40));
  });
})();

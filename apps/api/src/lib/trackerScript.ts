// The script amzur.com loads through Google Tag Manager (served at
// /api/inbound/tracker.js, so changes here need no GTM edit).
//
// - Page views: page, title, referrer and UTM tags, plus time actually spent
//   on the page (while it is visible) and how far down it was scrolled.
// - Contact forms (WPForms): the fields are read on submit and sent only once
//   WPForms confirms the submission succeeded.
// - Consent: if the site sets window.amzurTrackingConsent = false (e.g. a
//   cookie banner for a visitor who declined), no cookies are set and no page
//   views are sent; a submitted form is still recorded, since the person sent
//   it to Amzur themselves.
//
// Cookies: amz_vid (random visitor id, 1 year), amz_sid (session, 30 minutes).
export function trackerScript(apiBase: string): string {
  return `/* Amzur Lead Discovery Engine: website tracker */
(function () {
  if (window.__amzurLeadTracker) return;
  window.__amzurLeadTracker = true;
  var API = ${JSON.stringify(apiBase.replace(/\/$/, ''))};
  var tracking = window.amzurTrackingConsent !== false;

  function rid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ''); } catch (e) {}
    return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, seconds) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + seconds + '; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '');
  }
  function send(path, data) {
    var payload = JSON.stringify(data);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(API + path, new Blob([payload], { type: 'text/plain' }))) return;
    } catch (e) {}
    try {
      fetch(API + path, { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' })['catch'](function () {});
    } catch (e) {}
  }

  var params = new URLSearchParams(location.search);
  var utm = {
    source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign'),
    term: params.get('utm_term'), content: params.get('utm_content')
  };

  var visitorId = null, sessionId = null, firstTouch = null;
  if (tracking) {
    visitorId = getCookie('amz_vid') || rid();
    setCookie('amz_vid', visitorId, 365 * 86400);
    sessionId = getCookie('amz_sid') || rid();
    setCookie('amz_sid', sessionId, 1800);
    try {
      firstTouch = JSON.parse(localStorage.getItem('amz_ft') || 'null');
      if (!firstTouch) {
        firstTouch = { referrer: document.referrer || null, utm: utm, landing: location.href, at: new Date().toISOString() };
        localStorage.setItem('amz_ft', JSON.stringify(firstTouch));
      }
    } catch (e) {}
  }

  // ---- page view, time on page, scroll depth ----
  var viewId = rid();
  var visibleMs = 0, visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  var maxScroll = 0, sentSec = 0;
  function onScroll() {
    var h = document.documentElement;
    var pct = Math.round(100 * (window.scrollY + window.innerHeight) / Math.max(h.scrollHeight, 1));
    if (pct > maxScroll) maxScroll = Math.min(pct, 100);
  }
  function engagedSec() { return Math.round((visibleMs + (visibleSince ? Date.now() - visibleSince : 0)) / 1000); }
  function flush() {
    if (!tracking) return;
    var sec = engagedSec();
    if (sec - sentSec < 2) return;
    sentSec = sec;
    send('/api/inbound/event', { type: 'engage', viewId: viewId, visitorId: visitorId, engagedSec: sec, scrollPct: maxScroll });
  }
  if (tracking) {
    send('/api/inbound/event', {
      type: 'view', viewId: viewId, visitorId: visitorId, sessionId: sessionId,
      url: location.href, title: document.title, referrer: document.referrer || null, utm: utm
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (visibleSince) { visibleMs += Date.now() - visibleSince; visibleSince = null; }
        flush();
      } else {
        visibleSince = Date.now();
        setCookie('amz_sid', sessionId, 1800);
      }
    });
    window.addEventListener('pagehide', function () {
      if (visibleSince) { visibleMs += Date.now() - visibleSince; visibleSince = null; }
      flush();
    });
  }

  // ---- contact forms (WPForms) ----
  var pending = {}, sent = {};
  function labelOf(el) {
    var box = el.closest('.wpforms-field');
    var label = box && box.querySelector('.wpforms-field-label');
    return ((label && label.textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '')
      .replace(/\\s*\\*\\s*$/, '').trim();
  }
  function capture(form) {
    var fields = [], consent = false;
    var els = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || el.tagName)).toLowerCase();
      if (/^(hidden|submit|button|password|file|image|reset)$/.test(type)) continue;
      if (type === 'checkbox' || type === 'radio') {
        if (el.checked && el.closest('.wpforms-field-gdpr-checkbox, .wpforms-field-checkbox') &&
            /communicat|marketing|newsletter|contact me/i.test(el.value + ' ' + labelOf(el))) consent = true;
        continue;
      }
      // Fields people can't see are spam traps.
      if (!el.offsetParent || el.closest('.wpforms-field-hp')) continue;
      var value = (el.value || '').trim();
      if (value) fields.push({ label: labelOf(el), type: type, value: value.slice(0, 4000) });
    }
    return { fields: fields, consent: consent };
  }
  function submit(formId) {
    var data = pending[formId];
    if (!data || sent[formId]) return;
    sent[formId] = true;
    send('/api/inbound/form', {
      formId: formId, fields: data.fields, consentMarketing: data.consent,
      visitorId: visitorId, sessionId: sessionId, pageUrl: location.href, pageTitle: document.title,
      referrer: document.referrer || null, utm: utm, firstTouch: firstTouch
    });
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.classList || !form.classList.contains('wpforms-form')) return;
    var formId = form.getAttribute('data-formid') || form.id || 'form';
    pending[formId] = capture(form);
    sent[formId] = false;
    // Forms that reload the page can't be confirmed: send now.
    if (!form.classList.contains('wpforms-ajax-form')) submit(formId);
  }, true);
  // WPForms' own success event (jQuery), with a fallback on its confirmation message.
  if (window.jQuery) {
    window.jQuery(document).on('wpformsAjaxSubmitSuccess', function (e) {
      var form = e.target;
      submit((form && form.getAttribute && form.getAttribute('data-formid')) || Object.keys(pending)[0]);
    });
  }
  if (window.MutationObserver) {
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          var box = node.matches && node.matches('[id^="wpforms-confirmation"]') ? node :
            node.querySelector && node.querySelector('[id^="wpforms-confirmation"]');
          if (box) submit(box.id.replace('wpforms-confirmation-', '') || Object.keys(pending)[0]);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
`;
}

(function () {
  'use strict';

  if (window.__perplexityInterceptorInstalled) return;
  window.__perplexityInterceptorInstalled = true;

  function postToContentScript(payload) {
    try {
      window.postMessage(
        { __mw: true, type: 'MODEL_TEXT', text: payload },
        '*'
      );
    } catch (_) {}
  }

  function hookFetch() {
    const orig = window.fetch;
    if (!orig) return;

    window.fetch = function (...args) {
      return orig.apply(this, args).then((res) => {
        try {
          const clone = res.clone();
          clone
            .text()
            .then((text) => {
              if (text && (text.includes('display_model') || text.includes('user_selected_model'))) {
                postToContentScript(text);
              }
            })
            .catch(() => {});
        } catch (_) {}
        return res;
      });
    };

    window.__perplexityFetchHooked = window.fetch;
  }

  function hookXHR() {
    const XHR = window.XMLHttpRequest;
    if (!XHR) return;

    const open = XHR.prototype.open;
    const send = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__mw_url = String(url || '');
      } catch (_) {}
      return open.apply(this, arguments);
    };

    XHR.prototype.send = function (body) {
      this.addEventListener('load', function () {
        try {
          if (this && typeof this.responseText === 'string') {
            const text = this.responseText;
            if (text.includes('display_model') || text.includes('user_selected_model')) {
              postToContentScript(text);
            }
          }
        } catch (_) {}
      });
      return send.apply(this, arguments);
    };
  }

  function notifyURLChange() {
    try {
      window.postMessage({ __mw: true, type: 'URL_CHANGE', href: location.href }, '*');
    } catch (_) {}
  }

  function hookHistory() {
    try {
      const H = window.history;
      const origPush = H.pushState;
      const origReplace = H.replaceState;

      H.pushState = function () {
        const r = origPush.apply(this, arguments);
        setTimeout(notifyURLChange, 0);
        return r;
      };
      H.replaceState = function () {
        const r = origReplace.apply(this, arguments);
        setTimeout(notifyURLChange, 0);
        return r;
      };

      window.addEventListener('popstate', notifyURLChange);
    } catch (_) {}
  }

  try {
    hookFetch();
    hookXHR();
    hookHistory();
  } catch (_) {}

  setInterval(() => {
    if (window.fetch !== window.__perplexityFetchHooked) {
      hookFetch();
    }
  }, 2000);
})();
(function () {
  'use strict';

  if (window.__perplexityInterceptorInstalled) return;
  window.__perplexityInterceptorInstalled = true;

  // Grab the REAL native fetch before anything can overwrite it
  const _nativeFetch = window.fetch;

  function postToContentScript(text) {
    try {
      window.postMessage(
        { __mw: true, type: 'MODEL_TEXT', text: text },
        '*'
      );
    } catch (_) {}
  }

  function hookFetch() {
    const wrapper = function (...args) {
      // Always call the original native fetch — bypasses any wrapper Perplexity adds
      return _nativeFetch.apply(this, args).then((res) => {
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
    // Marker so we can detect if someone replaced our hook
    wrapper.__perplexityInterceptor = true;
    window.fetch = wrapper;
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

  // Re-hook fetch if Perplexity or another script overwrites it
  setInterval(function () {
    if (!window.fetch || !window.fetch.__perplexityInterceptor) {
      hookFetch();
    }
  }, 2000);
})();
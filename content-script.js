const script = document.createElement('script');
script.src = chrome.runtime.getURL('page-interceptor.js');
script.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

const STATE_KEY = 'mw_lastKey';

function deepFindModels(obj) {
  let found = {};
  function walk(v) {
    if (!v) return;
    if (typeof v === 'object') {
      if ('display_model' in v && typeof v.display_model === 'string')
        found.display_model = v.display_model;
      if ('user_selected_model' in v && typeof v.user_selected_model === 'string')
        found.user_selected_model = v.user_selected_model;
      if (found.display_model && found.user_selected_model) return;
      for (const key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key)) walk(v[key]);
        if (found.display_model && found.user_selected_model) return;
      }
    }
  }
  walk(obj);
  return found;
}

function extractModelsFromText(text) {
  if (!text || (!text.includes('display_model') && !text.includes('user_selected_model')))
    return null;

  try {
    const json = JSON.parse(text);
    const f = deepFindModels(json);
    if (f.display_model || f.user_selected_model) return f;
  } catch (_) {}

  const dm = /"display_model"\s*:\s*"([^"]+)"/.exec(text);
  const us = /"user_selected_model"\s*:\s*"([^"]+)"/.exec(text);
  if (dm || us)
    return {
      display_model: dm ? dm[1] : null,
      user_selected_model: us ? us[1] : null,
    };

  return null;
}

let lastKey = '';

// Listen for messages from the page script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || d.__mw !== true) return;

  if (d.type === 'MODEL_TEXT') {
    const models = extractModelsFromText(d.text);
    if (!models) return;

    const key =
      location.href +
      '|' +
      (models.display_model || '') +
      '|' +
      (models.user_selected_model || '');
    if (key === lastKey) return;
    lastKey = key;

    chrome.runtime.sendMessage({
      type: 'MODEL_MISMATCH_UPDATE',
      payload: {
        displayModel: models.display_model || 'unknown',
        userSelectedModel: models.user_selected_model || 'unknown',
        matched: models.display_model === models.user_selected_model,
      },
    });
  } else if (d.type === 'URL_CHANGE') {
    lastKey = '';
  }
});

// Handle popup requests for rate limits
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_RATE_LIMITS') {
    fetchRateLimits()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  return false;
});

async function fetchRateLimits() {
  const res = await fetch('https://www.perplexity.ai/rest/rate-limit/all', {
    credentials: 'include',
    headers: {
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error('HTTP ' + res.status);
  }
  return res.json();
}
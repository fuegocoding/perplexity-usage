let currentSlug = '';
let lastModelKey = '';

function getSlugFromURL(url) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/^\/search\/([^/?#]+)/);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
}

// Walk the thread JSON and collect the LAST display_model and
// LAST user_selected_model independently. This way if "turbo"
// appears as display_model but "claude-4-6-sonnet" as user_selected_model,
// both are shown — that IS the mismatch the user needs to see.
function deepFindLastModels(obj) {
  var lastDM = null;
  var lastUS = null;
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    if ('display_model' in v && v.display_model != null) {
      lastDM = String(v.display_model);
    }
    if ('user_selected_model' in v && v.user_selected_model != null) {
      lastUS = String(v.user_selected_model);
    }
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) walk(v[i]);
    } else {
      for (var key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key)) walk(v[key]);
      }
    }
  }
  walk(obj);
  if (lastDM !== null || lastUS !== null) {
    return { display_model: lastDM, user_selected_model: lastUS };
  }
  return null;
}

function extractModelsFromText(text) {
  if (!text || (!text.includes('display_model') && !text.includes('user_selected_model')))
    return null;

  try {
    var json = JSON.parse(text);
    var found = deepFindLastModels(json);
    if (found) return found;
  } catch (_) {}

  // Regex fallback: take the last occurrence of each field independently
  var dmRegex = /"display_model"\s*:\s*"([^"]+)"/g;
  var usRegex = /"user_selected_model"\s*:\s*"([^"]+)"/g;
  var lastDm = null, lastUs = null, m;
  while ((m = dmRegex.exec(text)) !== null) { lastDm = m[1]; }
  while ((m = usRegex.exec(text)) !== null) { lastUs = m[1]; }
  if (lastDm || lastUs) {
    return { display_model: lastDm, user_selected_model: lastUs };
  }
  return null;
}

async function checkModels() {
  if (!currentSlug) return;
  try {
    var res = await fetch(
      'https://www.perplexity.ai/rest/thread/' + encodeURIComponent(currentSlug),
      { credentials: 'include', headers: { accept: 'application/json' } }
    );
    if (!res.ok) return;
    var text = await res.text();
    var models = extractModelsFromText(text);
    if (!models) return;

    var key = (models.display_model || '') + '|' + (models.user_selected_model || '');
    if (key === lastModelKey) return;
    lastModelKey = key;

    chrome.runtime.sendMessage({
      type: 'MODEL_MISMATCH_UPDATE',
      payload: {
        displayModel: models.display_model || 'unknown',
        userSelectedModel: models.user_selected_model || 'unknown',
        matched: models.display_model === models.user_selected_model,
      },
    });
  } catch (_) {}
}

function onURLChange() {
  var slug = getSlugFromURL(location.href);
  if (slug !== currentSlug) {
    currentSlug = slug;
    lastModelKey = '';
    if (slug) {
      setTimeout(checkModels, 500);
    }
  }
}

// Poll for URL changes (detects SPA navigation)
setInterval(onURLChange, 1000);

// Poll for model changes in current chat (detects new messages)
setInterval(checkModels, 3000);

// Initial check
onURLChange();

// Handle popup requests for rate limits
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === 'FETCH_RATE_LIMITS') {
    fetchRateLimits()
      .then(function (data) {
        sendResponse({ success: true, data: data });
      })
      .catch(function (err) {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  return false;
});

async function fetchRateLimits() {
  var res = await fetch('https://www.perplexity.ai/rest/rate-limit/all', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
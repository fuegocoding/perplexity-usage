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

// Walk the thread JSON and find the last object that has BOTH
// display_model AND user_selected_model. Skip partial matches (like
// "turbo" which only has one field) — they come from quick/internal
// responses. If no full match exists, fall back to the last partial.
function deepFindLastModels(obj) {
  var fullMatches = [];
  var partialMatches = [];
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    var hasDM = 'display_model' in v && v.display_model != null;
    var hasUS = 'user_selected_model' in v && v.user_selected_model != null;
    if (hasDM && hasUS) {
      fullMatches.push({
        display_model: String(v.display_model),
        user_selected_model: String(v.user_selected_model),
      });
    } else if (hasDM || hasUS) {
      partialMatches.push({
        display_model: hasDM ? String(v.display_model) : null,
        user_selected_model: hasUS ? String(v.user_selected_model) : null,
      });
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
  // Prefer the last full match (both fields = real model record)
  if (fullMatches.length > 0) return fullMatches[fullMatches.length - 1];
  // Fall back to last partial match
  if (partialMatches.length > 0) return partialMatches[partialMatches.length - 1];
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

  // Regex fallback: find ALL pairs, prefer last pair where both fields are present
  var pairRegex = /"display_model"\s*:\s*"([^"]+)"[^}]*?"user_selected_model"\s*:\s*"([^"]+)"|[^}]*?"display_model"\s*:\s*"([^"]+)"[^}]*?"user_selected_model"\s*:\s*"([^"]+)"/g;
  var lastFullDm = null, lastFullUs = null;
  var lastDm = null, lastUs = null;
  var pm;
  while ((pm = pairRegex.exec(text)) !== null) {
    var dm = pm[1] || pm[3] || null;
    var us = pm[2] || pm[4] || null;
    if (dm && us) {
      lastFullDm = dm;
      lastFullUs = us;
    }
  }
  if (lastFullDm || lastFullUs) {
    return { display_model: lastFullDm, user_selected_model: lastFullUs };
  }
  // Fall back to last occurrence of each field individually
  var dmRegex = /"display_model"\s*:\s*"([^"]+)"/g;
  var usRegex = /"user_selected_model"\s*:\s*"([^"]+)"/g;
  var m;
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
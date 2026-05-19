const STORAGE_TOTALS_KEY = 'inferredTotals';
const CACHE_KEY = 'rateLimitCache';

const METRICS = [
  { key: 'pro', field: 'remaining_pro', label: 'Pro Search' },
  { key: 'labs', field: 'remaining_labs', label: 'Labs' },
  { key: 'research', field: 'remaining_research', label: 'Deep Research' },
];

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('refresh-btn').addEventListener('click', init);
});

async function init() {
  showLoading();
  hideError();

  try {
    const [rateData, modelState] = await Promise.all([
      fetchRateLimits(),
      getModelState(),
    ]);

    renderModelStatus(modelState);
    await renderUsage(rateData);
    renderModelSpecificLimits(rateData.model_specific_limits);
    renderLastUpdated();
  } catch (err) {
    showError(err.message || 'Failed to load data.');
  }
}

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('cards').classList.add('hidden');
  document.getElementById('model-limits-section').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showError(msg) {
  hideLoading();
  const el = document.getElementById('error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error').classList.add('hidden');
}

async function fetchRateLimits() {
  // 1. Try direct fetch from popup (works with host permissions + credentials)
  try {
    const response = await fetch('https://www.perplexity.ai/rest/rate-limit/all', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      await chrome.storage.local.set({
        [CACHE_KEY]: { data, timestamp: Date.now() },
      });
      return data;
    }
  } catch (_) {
    // Direct fetch failed, try content script fallback
  }

  // 2. Try content script on a Perplexity tab
  try {
    const tabs = await chrome.tabs.query({ url: 'https://*.perplexity.ai/*' });
    if (tabs.length > 0) {
      const data = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'FETCH_RATE_LIMITS' },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response || !response.success) {
              reject(new Error(response?.error || 'Failed to fetch rate limits.'));
              return;
            }
            resolve(response.data);
          }
        );
      });
      await chrome.storage.local.set({
        [CACHE_KEY]: { data, timestamp: Date.now() },
      });
      return data;
    }
  } catch (_) {
    // Content script failed, try cache
  }

  // 3. Fall back to cached data
  const stored = await chrome.storage.local.get([CACHE_KEY]);
  if (stored[CACHE_KEY] && stored[CACHE_KEY].data) {
    return stored[CACHE_KEY].data;
  }

  throw new Error(
    'Could not fetch usage data. Make sure you are logged into Perplexity.ai.'
  );
}

function getModelState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_MODEL_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

function renderModelStatus(state) {
  const statusEl = document.getElementById('model-status');
  const detailEl = document.getElementById('model-detail');
  const dot = statusEl.querySelector('.status-dot');
  const label = statusEl.querySelector('.status-label');

  statusEl.classList.remove('hidden');
  detailEl.classList.remove('hidden');

  if (!state || !state.displayModel) {
    statusEl.classList.remove('ok');
    dot.style.background = '#737373';
    label.textContent = 'Model Status Unknown';
    detailEl.textContent = 'Perform a search on Perplexity to detect model info.';
    return;
  }

  const isOk = state.matched;
  statusEl.classList.toggle('ok', isOk);
  dot.style.background = '';
  label.textContent = isOk ? 'Model OK' : 'Model Mismatch';

  detailEl.innerHTML = `
    Display: <code>${escapeHtml(state.displayModel)}</code>
    · Selected: <code>${escapeHtml(state.userSelectedModel)}</code>
  `;
}

async function renderUsage(data) {
  const container = document.getElementById('cards');
  container.innerHTML = '';

  const totalsResult = await chrome.storage.local.get([STORAGE_TOTALS_KEY]);
  const totals = totalsResult[STORAGE_TOTALS_KEY] || {};
  let hasAny = false;
  let updatedTotals = false;

  for (const metric of METRICS) {
    const val = data[metric.field];
    if (typeof val !== 'number') continue;
    hasAny = true;

    if (typeof totals[metric.key] !== 'number' || val > totals[metric.key]) {
      totals[metric.key] = val;
      updatedTotals = true;
    }

    const total = totals[metric.key];
    const remaining = val;
    const used = total > 0 ? total - remaining : 0;
    const percentage =
      total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;

    const card = document.createElement('div');
    card.className = 'card';

    let valueHtml = `<span class="card-value">${remaining}</span>`;
    if (total > 0) {
      valueHtml = `<span class="card-value">${used}<span class="total"> / ${total}</span></span>`;
    }

    const subText = total > 0 ? `${remaining} left` : '';
    const fillClass =
      percentage >= 85 ? 'critical' : percentage >= 65 ? 'low' : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${metric.label}</span>
        ${valueHtml}
      </div>
      ${subText ? `<div class="card-sub">${subText}</div>` : ''}
      ${total > 0 ? `
        <div class="progress-wrap">
          <div class="progress-fill ${fillClass}" style="width: ${percentage}%"></div>
        </div>
      ` : ''}
    `;

    container.appendChild(card);
  }

  if (updatedTotals) {
    await chrome.storage.local.set({ [STORAGE_TOTALS_KEY]: totals });
  }

  hideLoading();
  if (hasAny) {
    container.classList.remove('hidden');
  } else {
    showError('No usage data available.');
  }
}

function renderModelSpecificLimits(limits) {
  const section = document.getElementById('model-limits-section');
  const container = document.getElementById('model-limits-cards');
  container.innerHTML = '';

  if (!limits || typeof limits !== 'object' || Object.keys(limits).length === 0) {
    section.classList.add('hidden');
    return;
  }

  let hasAny = false;
  for (const [model, info] of Object.entries(limits)) {
    if (!info || typeof info !== 'object') continue;

    const remaining = info.remaining;
    const monthlyLimit = info.monthly_limit;

    if (remaining === null || remaining === undefined) continue;
    hasAny = true;

    const card = document.createElement('div');
    card.className = 'card';

    const totalVal =
      monthlyLimit !== null && monthlyLimit !== undefined ? monthlyLimit : null;
    const usedVal = totalVal !== null ? totalVal - remaining : null;

    let valueHtml = `<span class="card-value">${remaining}</span>`;
    if (totalVal !== null) {
      valueHtml = `<span class="card-value">${usedVal}<span class="total"> / ${totalVal}</span></span>`;
    }

    const pct =
      totalVal > 0
        ? Math.max(0, Math.min(100, (usedVal / totalVal) * 100))
        : 0;
    const subText = totalVal !== null ? `${remaining} left` : '';
    const fillClass =
      pct >= 85 ? 'critical' : pct >= 65 ? 'low' : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(model)}</span>
        ${valueHtml}
      </div>
      ${subText ? `<div class="card-sub">${subText}</div>` : ''}
      ${totalVal > 0 ? `
        <div class="progress-wrap">
          <div class="progress-fill ${fillClass}" style="width: ${pct}%"></div>
        </div>
      ` : ''}
    `;

    container.appendChild(card);
  }

  if (hasAny) {
    section.classList.remove('hidden');
  } else {
    section.classList.add('hidden');
  }
}

function renderLastUpdated() {
  const el = document.getElementById('last-updated');
  chrome.storage.local.get([CACHE_KEY]).then((result) => {
    const cache = result[CACHE_KEY];
    if (cache && cache.timestamp) {
      const date = new Date(cache.timestamp);
      el.textContent = 'Updated ' + date.toLocaleTimeString();
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
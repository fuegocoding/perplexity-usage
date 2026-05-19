const STORAGE_TOTALS_KEY = 'inferredTotals';

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
  // Find a Perplexity tab to send the request from (same-origin cookies)
  let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  let targetTab = tabs.find((t) => t.url && t.url.includes('perplexity.ai'));

  if (!targetTab) {
    const pTabs = await chrome.tabs.query({ url: 'https://*.perplexity.ai/*' });
    if (!pTabs || pTabs.length === 0) {
      throw new Error(
        'No Perplexity.ai tab found. Please open Perplexity and try again.'
      );
    }
    targetTab = pTabs[0];
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      targetTab.id,
      { type: 'FETCH_RATE_LIMITS' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              'Unable to connect to the Perplexity page. Try refreshing the tab.'
            )
          );
          return;
        }
        if (!response || !response.success) {
          reject(
            new Error(response?.error || 'Failed to fetch rate limits.')
          );
          return;
        }
        resolve(response.data);
      }
    );
  });
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

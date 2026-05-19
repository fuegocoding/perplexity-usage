const MODEL_STATE_KEY = 'modelWatcherState';

const ICONS_DEFAULT = {
  16: 'icon16.png',
  48: 'icon48.png',
  128: 'icon128.png',
};
const ICONS_GREEN = {
  16: 'icon16-green.png',
  48: 'icon48-green.png',
  128: 'icon128-green.png',
};
const ICONS_RED = {
  16: 'icon16-red.png',
  48: 'icon48-red.png',
  128: 'icon128-red.png',
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MODEL_MISMATCH_UPDATE') {
    handleModelUpdate(message.payload);
    sendResponse({ ok: true });
  } else if (message.type === 'GET_MODEL_STATE') {
    chrome.storage.local.get([MODEL_STATE_KEY]).then((result) => {
      sendResponse(result[MODEL_STATE_KEY] || null);
    });
    return true;
  }
  return false;
});

function handleModelUpdate(payload) {
  const { displayModel, userSelectedModel, matched } = payload;

  const state = {
    displayModel,
    userSelectedModel,
    matched,
    timestamp: Date.now(),
  };

  chrome.storage.local.set({ [MODEL_STATE_KEY]: state });

  if (!matched) {
    chrome.action.setIcon({ path: ICONS_RED });
  } else {
    chrome.action.setIcon({ path: ICONS_GREEN });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setIcon({ path: ICONS_DEFAULT });
});
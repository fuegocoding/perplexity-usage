# Perplexity Usage & Model Watcher

A browser extension that displays your Perplexity.ai usage limits in a clean, dark UI — and detects model mismatches in real time.

## Features

### Usage Dashboard

Click the extension icon to see your remaining usage at a glance:

- **Pro Search** — remaining vs. total with progress bar
- **Labs** — remaining vs. total with progress bar
- **Deep Research** — remaining vs. total with progress bar
- **Model-specific limits** — shown automatically when Perplexity returns them

Cards display `used / total` (e.g. `5 / 170`) with `165 left` and a Perplexity-turquoise progress bar that fills as you consume your quota.

> **Total discovery**: On first install, only your remaining count is shown. Once your cycle resets and the remaining value increases, the extension infers your true cap and displays both used/total from then on.

### Model Mismatch Detection

Reads the `/rest/thread/{slug}` endpoint for the current chat every 3 seconds and extracts `display_model` vs `user_selected_model` from the latest message:

- **Green dot** on the extension icon — models match
- **Red dot** on the extension icon — mismatch detected
- Inside the popup: a status chip shows **Model OK** or **Model Mismatch** with the exact model names

Updates automatically when you send a new message or switch chats.

## Installation

### Chrome Web Store
[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/eginpieajmffnlceanahoekihepncjij?utm_source=item-share-cb)

### Firefox Add-ons
[Install from Firefox Add-ons](https://addons.mozilla.org/firefox/addon/perplexity-usage-model-watcher/)

### Chrome — Manual (Developer Mode)
1. Clone this repo or download and extract the ZIP
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the **`chrome/`** folder
6. Open any `perplexity.ai` page and click the extension icon

### Firefox / Zen Browser — Temporary Installation (for testing)
1. Open your browser and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the **`firefox/`** folder
4. Open any `perplexity.ai` page and click the extension icon

> The extension will be removed when you restart the browser. See below for persistent installation.

### Firefox / Zen Browser — Persistent Installation (Developer Mode)
1. Open your browser and navigate to `about:config`
2. Search for `xpinstall.signatures.required` and set it to `false`
3. Package the extension:
   ```bash
   cd firefox && zip -r /tmp/perplexity-usage-firefox.zip .
   ```
4. Open your browser and navigate to `about:addons`
5. Click the gear icon → **Install Add-on From File**
6. Select `/tmp/perplexity-usage-firefox.zip`

> ⚠️ Setting `xpinstall.signatures.required` to `false` is only recommended for development. For distribution, see **Publishing below**.

## How It Works

```
├── src/                      — Source files (edit here)
│   ├── background.js         — Stores model state, swaps icon dots
│   ├── content-script.js     — Detects URL changes, polls /rest/thread for model info,
│   │                           fetches rate limits on demand
│   ├── popup/
│   │   ├── popup.html        — Popup UI
│   │   ├── popup.css         — Perplexity-styled dark theme
│   │   └── popup.js          — Fetches/caches usage data, renders UI
│   └── icons/                — Speedometer gauge icons (base, green dot, red dot)
├── chrome/
│   └── manifest.json         — Chrome MV3 manifest (auto-synced from src/)
├── firefox/
│   └── manifest.json         — Firefox MV3 manifest (auto-synced from src/)
└── scripts/
    └── sync.sh               — Copies src/ → chrome/ and src/ → firefox/
```

**Rate limits**: The popup fetches `/rest/rate-limit/all` directly using host permissions and credentials. No Perplexity tab required.

**Model detection**: The content script on Perplexity pages extracts the chat slug from the URL, fetches `/rest/thread/{slug}`, and walks the response JSON to find the latest `display_model` and `user_selected_model` fields. It polls every 3 seconds and detects URL changes every second for SPA navigation.

### Privacy

- No data is sent anywhere. All processing is local.
- Rate limit data is only fetched when you open the popup — no background polling.
- The only network requests made are to `perplexity.ai` itself (using your existing session).

## Publishing to Firefox Add-ons (AMO)

1. **Create an account** at [addons.mozilla.org](https://addons.mozilla.org)
2. **Package the extension** (from `firefox/`):
   ```bash
   cd firefox && zip -r /tmp/perplexity-usage-firefox.zip .
   ```
3. Go to [addons.mozilla.org/developers/addon/submit](https://addons.mozilla.org/developers/addon/submit)
4. Select **"On your own"** → upload the ZIP
5. Fill in the store listing (description, screenshots, privacy policy)
6. Submit for review — Mozilla will auto-review most addons within a few days

> **Note:** The addon ID `hello@fuego.im` is set in `firefox/manifest.json`. Make sure this is the email you use for your AMO developer account, or change it before submission.

## Data Source

Usage data comes from:

```
https://www.perplexity.ai/rest/rate-limit/all
```

Model data comes from:

```
https://www.perplexity.ai/rest/thread/{chat-slug}
```

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- Model mismatch detection inspired by [perplexity-model-watcher](https://github.com/apix7/perplexity-model-watcher) by [@apix7](https://github.com/apix7)

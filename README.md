# Perplexity Usage & Model Watcher

A Chrome extension that displays your Perplexity.ai usage limits in a clean, dark UI — and detects model mismatches in real time.

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

Continuously intercepts Perplexity network responses to compare `display_model` vs `user_selected_model`:

- **Green dot** on the extension icon — models match
- **Red dot** on the extension icon — mismatch detected
- Inside the popup: a status chip shows **Model OK** or **Model Mismatch** with the exact model names

Based on the [perplexity-model-watcher](https://github.com/apix7/perplexity-model-watcher) interception technique, with regex fallback for streaming/chunked responses and automatic re-hooking if Perplexity overwrites `fetch`.

## Installation

1. Clone this repo or download and extract the ZIP
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the project folder
6. Open any `perplexity.ai` page and click the extension icon

## How It Works

| Component | Purpose |
|---|---|
| `manifest.json` | Chrome MV3 manifest |
| `background.js` | Stores model mismatch state, swaps icon between default/green/red |
| `content-script.js` | Bridges page context ↔ extension, fetches `/rest/rate-limit/all` on demand |
| `page-interceptor.js` | Hooks `fetch`/`XHR` in page context, detects `display_model`/`user_selected_model` with regex fallback |
| `popup.html` / `popup.css` / `popup.js` | Dark Perplexity-styled popup UI |
| `icon*.png` | Speedometer gauge icons (base, green dot, red dot) |
| `scripts/generate-icons.js` | Node.js script to regenerate icons from scratch |

### Privacy

- No data is sent anywhere. All processing is local.
- Rate limit data is only fetched when you open the popup — no background polling.
- The only network requests made are to `perplexity.ai` itself (same-origin, using your existing cookies).

## Data Source

Usage data comes from:

```
https://www.perplexity.ai/rest/rate-limit/all
```

This endpoint returns JSON like:

```json
{
  "remaining_pro": 170,
  "remaining_labs": 25,
  "remaining_research": 20,
  "model_specific_limits": {},
  "sources": { ... }
}
```

## Development

### Regenerating Icons

Requires Node.js (no external dependencies):

```bash
node scripts/generate-icons.js
```

This produces `icon16.png`, `icon48.png`, `icon128.png` and their `-green` / `-red` variants.

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- Model mismatch detection inspired by [perplexity-model-watcher](https://github.com/apix7/perplexity-model-watcher) by [@apix7](https://github.com/apix7)
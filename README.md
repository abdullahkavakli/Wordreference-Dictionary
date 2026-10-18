# WordReference Dictionary – Chrome Extension

[![tests](https://github.com/abdullahkavakli/Wordreference-Dictionary/actions/workflows/test.yml/badge.svg)](https://github.com/abdullahkavakli/Wordreference-Dictionary/actions/workflows/test.yml)

WordReference.com lookups in your browser, for **English ↔ multiple languages** and **English monolingual definitions**.

Supported language pairs include Turkish, Spanish, Italian, Portuguese, French, German, Dutch, Swedish, Arabic, Chinese, Russian, Greek, Polish, Romanian, Czech, Japanese, Korean, Icelandic, and English (monolingual).

⭐ **Featured** on the Chrome Web Store: **[Install](https://chromewebstore.google.com/detail/wordreference-dictionary/iejcondpdpcmgfiejidjbhcgloepemmd)**

## Features

| Feature | How to use |
|---|---|
| **Popup search** | Click the WR toolbar icon. On normal pages, you can also press **Alt+Z** (customizable in options). |
| **Auto direction** | WordReference direction is resolved automatically based on the selected dictionary language pair. |
| **In-page bubble** | Select a word and use **Alt + double-click**, **Alt+Q** (page shortcut), or **Alt+X** (Chrome command shortcut). |
| **Context menu** | Right-click selected text, then click *WordReference: …*. |
| **TTS** | Click the pronunciation flag buttons in the popup (when available). |
| **Favorites** | Save words from popup or in-page bubble; duplicates are blocked automatically. |
| **Excel export** | Manage favorites on the settings page and export all favorites to `.xlsx` (Word, IPA, explanation). |
| **Open in WR** | Click the WR logo in the popup to open full results on WordReference. |
| **PDF support** | In Chrome's own PDF viewer, right-click a selected word for the bubble. For Alt + double-click / Alt+Q / Alt+X inside PDFs, turn on the PDF viewer in settings (opt-in; Mozilla PDF.js; local files too, with *Allow access to file URLs*). |

## Privacy & permissions

- Preferences are stored in `chrome.storage.sync`; favorites stay on your device in `chrome.storage.local`.
- Translation results are fetched directly from `wordreference.com`. The extension does not send user data to any custom backend.
- To pass WordReference's anti-bot check, the extension sets a single `nginx_wr_human` cookie on `wordreference.com` (the same cookie the site sets for ordinary visitors). No other cookies are read or written, and no tracking is performed.

## Development

Load the repo root as an unpacked extension: `chrome://extensions` → **Developer mode** → **Load unpacked**. Unit tests:

```sh
npm install   # one-time; dev-only (jsdom)
npm test
```

Recipes, release steps, and packaging: [DEVELOPMENT.md](DEVELOPMENT.md).

## License

Proprietary. Copyright (c) 2026 Abdullah Kavakli. All rights reserved. Commercial use, redistribution, and modification require prior written consent and payment of a licensing fee; see `LICENSE`.

Excel export uses SheetJS Community Edition; the PDF viewer uses Mozilla PDF.js. See `THIRD_PARTY_NOTICES.md`.

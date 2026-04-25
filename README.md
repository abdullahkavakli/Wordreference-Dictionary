# WordReference Dictionary – Chrome Extension

A Chrome extension that brings **WordReference.com lookups for English ↔ multiple languages** and **English monolingual definitions** to your browser, modeled after the [Tureng Dictionary extension](https://chromewebstore.google.com/detail/tureng-dictionary/ihedienojfhdahpomfldoejaimefofff).

Supported language pairs include Turkish, Spanish, Italian, Portuguese, French, German, Dutch, Swedish, Arabic, Chinese, Russian, Greek, Polish, Romanian, Czech, Japanese, Korean, Icelandic, and English (monolingual).

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
| **PDF support** *(opt-in)* | Enable in settings to open PDFs in a built-in viewer where Alt + double-click / Alt+Q / Alt+X work over the rendered text. |

## Chrome Web Store

Install from the Chrome Web Store:
https://chromewebstore.google.com/detail/wordreference-dictionary/iejcondpdpcmgfiejidjbhcgloepemmd

## Installation

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this project folder.

## Development

```
wordreference/
├── manifest.json
├── popup.html          # Extension popup
├── info.html           # Options / settings page
├── scripts/
│   ├── background.js   # Service worker: context menu and keyboard shortcut relay
│   ├── content.js      # In-page translation bubble
│   ├── popup.js        # Popup search & rendering
│   ├── options.js      # Settings page logic
│   ├── favorites.js    # Favorites storage/management (chrome.storage.local)
│   └── xlsx.full.min.js # SheetJS — lazy-loaded only on favorites export
├── styles/
│   ├── main.css        # incl. minimal Bootstrap-compatible shim
│   └── loading.css
├── images/
│   ├── AppIcon.png
│   ├── icon-{16,32,48,128}.png
│   ├── flag-*.png      # 19 language flag icons
│   └── voice-logo.png
├── _locales/
│   └── en/messages.json
├── welcome.html        # First-install onboarding
├── pdf-viewer.html     # Opt-in PDF.js viewer (enable in settings)
└── vendor/pdfjs/       # Mozilla PDF.js (Apache-2.0)
```

## Privacy & permissions

- The extension stores user preferences (shortcuts, modifier, IPA dialect) in `chrome.storage.sync`.
- Favorites are stored locally on your device in `chrome.storage.local`.
- It does not send user data to any custom backend.
- Translation results are fetched directly from `wordreference.com`.

## Third-party notices

Excel export uses SheetJS Community Edition (`xlsx`). PDF rendering in the
opt-in viewer uses Mozilla PDF.js. See `THIRD_PARTY_NOTICES.md`.

## License

**Proprietary License**

Copyright (c) 2026 Abdullah Kavakli. All rights reserved.

Commercial use, redistribution, and modification require prior written consent and payment of a licensing fee. See the `LICENSE` file for full terms.

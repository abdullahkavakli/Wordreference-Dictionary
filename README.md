# WordReference Dictionary – Chrome Extension

A Chrome extension that brings **WordReference.com Turkish ↔ English** lookups to your browser, modelled after the [Tureng Dictionary extension](https://chromewebstore.google.com/detail/tureng-dictionary/ihedienojfhdahpomfldoejaimefofff).

## Features

| Feature | How to use |
|---|---|
| **Popup search** | Click the WR toolbar icon. On normal pages you can also press **Alt+Z** (customizable in options) |
| **Auto direction** | Extension detects Turkish characters automatically; toggle with `Auto / EN→TR / TR→EN` buttons |
| **In-page bubble** | Select a word and **Alt + double-click**, press **Alt+Q** (page shortcut), or press **Alt+X** (Chrome command shortcut) |
| **Context menu** | Right-click selected text → *WordReference: …* |
| **Omnibox** | Type `wr` in the address bar, then press Space and type a word |
| **TTS** | Click the Turkish or English flag buttons in the popup |
| **Open in WR** | Click the WR logo in the popup to open the full page |

## Chrome Web Store

Install from the Chrome Web Store:
https://chromewebstore.google.com/detail/wordreference-dictionary/iejcondpdpcmgfiejidjbhcgloepemmd

## Installation

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this project folder

## Development

```
wordreference/
├── manifest.json
├── popup.html          # Extension popup
├── info.html           # Options / settings page
├── scripts/
│   ├── background.js   # Service worker: context menu, omnibox, keyboard shortcut relay
│   ├── content.js      # In-page translation bubble
│   ├── popup.js        # Popup search & rendering
│   ├── options.js      # Settings page logic
│   ├── jquery.min.js
│   ├── bootstrap.min.js
│   └── tether.min.js
├── styles/
│   ├── main.css
│   ├── loading.css
│   ├── bootstrap.min.css
│   └── font-awesome.min.css
├── images/
│   ├── AppIcon.png
│   ├── flag-tr.png
│   ├── flag-us.png
│   ├── flag-uk.png
│   └── voice-logo.png
└── fonts/
```

## Privacy & permissions

- The extension stores only user preferences (shortcuts/modifier/IPA dialect) in `chrome.storage.sync`.
- It does not send user data to any custom backend.
- Translation results are fetched directly from `wordreference.com`.

## License

**Proprietary License**

Copyright (c) 2026 Abdullah Kavakli. All rights reserved.

Commercial use, redistribution, and modification require prior written consent and payment of a licensing fee. See the `LICENSE` file for full terms.

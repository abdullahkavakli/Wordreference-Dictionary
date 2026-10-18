/**
 * WordReference Dictionary Extension
 * Copyright (c) 2026 Abdullah Kavakli. All rights reserved.
 * Proprietary License. Unauthorized redistribution prohibited.
 */

// Loaded into Mozilla's PDF.js viewer (vendor/pdfjs/web/viewer.html, patched
// by tools/update-pdfjs.mjs) ahead of favorites.js, parser.js and content.js,
// which make the bubble work on the viewer's text layer. This file sets the
// viewer's options, opens the PDF that pdf-viewer.html forwarded in `wrfile`,
// and adds the extension's hint and "Open in Chrome's PDF viewer" to the UI.
(() => {
  'use strict';

  const fileUrl = new URLSearchParams(location.search).get('wrfile');
  const canOpenInChrome = /^(https?|file):/i.test(fileUrl || '');
  const t = key => chrome.i18n.getMessage(key);

  // The viewer fires this just before it starts: the moment to set its options.
  document.addEventListener('webviewerloaded', () => {
    const options = window.PDFViewerApplicationOptions;
    options.set('disablePreferences', true); // saved viewer preferences must not override these
    options.set('defaultUrl', '');            // no sample PDF; the real one is opened below
    options.set('enableScripting', false);    // PDFs don't get to run JavaScript
    options.set('isEvalSupported', false);
    options.set('useWasm', false);            // the extension's CSP blocks WebAssembly
    options.set('externalLinkTarget', 2);     // links inside a PDF open in a new tab

    const app = window.PDFViewerApplication;
    app.initializedPromise.then(() => {
      addToolbarItems();
      app.eventBus.on('documenterror', showLoadError);
      if (fileUrl) app.open({ url: fileUrl });
    });
  }, { once: true });

  // background.js lets this one navigation past the rule that sends .pdf links here.
  function openInChrome() {
    chrome.runtime.sendMessage({ type: 'wr-pdf-open-native', url: fileUrl });
  }

  function addToolbarItems() {
    const style = document.createElement('style');
    style.textContent = `
      #wrdict-hint {
        align-self: center;
        margin-inline-end: 8px;
        font-size: 11px;
        white-space: nowrap;
        color: var(--main-color);
        opacity: .7;
      }
      @media (max-width: 1100px) { #wrdict-hint { display: none; } }
      #wrdict-error {
        position: fixed;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100000;
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 10px 14px;
        border-radius: 8px;
        background: #fff4e5;
        color: #4a2c00;
        border: 1px solid #f0b35b;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .2);
        font: 14px/1.4 system-ui, sans-serif;
      }
      #wrdict-error button { font: inherit; cursor: pointer; }
    `;
    document.head.append(style);

    const hint = document.createElement('span');
    hint.id = 'wrdict-hint';
    hint.textContent = t('pdfViewerHint');
    document.getElementById('toolbarViewerRight')?.prepend(hint);

    if (!canOpenInChrome) return;
    const item = document.createElement('button');
    item.id = 'wrdictOpenInChrome';
    item.className = 'toolbarButton labeled';
    item.type = 'button';
    const label = document.createElement('span');
    label.textContent = t('pdfViewerOpenInChrome');
    item.append(label);
    item.addEventListener('click', openInChrome);
    document.getElementById('secondaryToolbarButtonContainer')?.prepend(item);
  }

  // The viewer's own error text is easy to miss; offer the way out next to it.
  function showLoadError() {
    if (document.getElementById('wrdict-error')) return;
    const bar = document.createElement('div');
    bar.id = 'wrdict-error';
    bar.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = t('pdfViewerLoadFailed');
    bar.append(text);
    if (canOpenInChrome) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t('pdfViewerOpenInChrome');
      button.addEventListener('click', openInChrome);
      bar.append(button);
    }
    document.body.append(bar);
  }
})();

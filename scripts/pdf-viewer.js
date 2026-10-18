/**
 * WordReference Dictionary Extension
 * Copyright (c) 2026 Abdullah Kavakli. All rights reserved.
 * Proprietary License. Unauthorized redistribution prohibited.
 */

// pdf-viewer.html is where .pdf links land (the redirect rule in
// background.js, syncPdfViewerRule). It hands the address to Mozilla's PDF.js
// viewer, which scripts/pdf-bridge.js sets up.
//
// The rule appends the address as-is (…?file=https://site/a.pdf?x=1&y=2), so
// everything after "file=" is the address: URLSearchParams would cut it at
// "&" and turn "+" into spaces. An encoded address (file=https%3A…) works too.
(() => {
  'use strict';

  const raw = location.search.startsWith('?file=') ? location.search.slice('?file='.length) : '';
  let file = raw;
  if (/^[a-z][a-z\d+.-]*%3a/i.test(raw)) {
    try { file = decodeURIComponent(raw); } catch { /* malformed: use as-is */ }
  }

  const viewer = new URL('vendor/pdfjs/web/viewer.html', location.href);
  if (file) viewer.searchParams.set('wrfile', file);
  viewer.hash = location.hash; // e.g. #page=3 from the original link
  location.replace(viewer.href);
})();

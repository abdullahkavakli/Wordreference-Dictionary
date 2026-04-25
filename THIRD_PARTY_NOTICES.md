# Third-Party Notices

## SheetJS Community Edition (xlsx)

- Package: `xlsx`
- Version: `0.18.5`
- Homepage: https://github.com/SheetJS/sheetjs
- License: Apache-2.0
- Source bundle in this project: `scripts/xlsx.full.min.js`

This project includes the browser build of SheetJS Community Edition to generate `.xlsx` exports.

## PDF.js

- Package: `pdfjs-dist`
- Version: `4.7.76`
- Homepage: https://github.com/mozilla/pdf.js
- License: Apache-2.0 (see `vendor/pdfjs/LICENSE`)
- Source bundle in this project: `vendor/pdfjs/pdf.min.mjs`, `vendor/pdfjs/pdf.worker.min.mjs`

PDF.js is bundled to render PDF files inside the optional in-extension viewer
(`pdf-viewer.html`). This lets the in-page translation bubble (Alt + double-click,
Alt + X, Alt + Q) work inside PDFs. The viewer is opt-in and disabled by
default — see *PDF support* in the extension settings page.

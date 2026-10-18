# Third-Party Notices

## SheetJS Community Edition (xlsx)

- Package: `xlsx`
- Version: `0.20.3`
- Homepage: https://sheetjs.com (source: https://git.sheetjs.com/sheetjs/sheetjs)
- Distribution: https://cdn.sheetjs.com/xlsx-0.20.3/ (npm's `xlsx` package stops at 0.18.5)
- License: Apache-2.0
- Source bundle in this project: `scripts/xlsx.full.min.js`

This project includes the browser build of SheetJS Community Edition to generate `.xlsx` exports.

## PDF.js

- Version: `6.4.299` (legacy build)
- Homepage: https://github.com/mozilla/pdf.js
- Distribution: https://github.com/mozilla/pdf.js/releases/tag/v6.4.299 (`pdfjs-6.4.299-legacy-dist.zip`)
- License: Apache-2.0 (see `vendor/pdfjs/LICENSE`)
- Files in this project: `vendor/pdfjs/`, built by `tools/update-pdfjs.mjs`

PDF.js renders PDF files in the optional in-extension viewer, Mozilla's own
PDF.js viewer with the extension's scripts added, so the in-page translation
bubble (Alt + double-click, Alt + X, Alt + Q) works inside PDFs. The viewer is
opt-in and disabled by default — see *PDF support* in the extension settings
page.

Parts of the viewer under their own licenses, each shipped next to them:

- OpenJPEG image decoder: BSD-2-Clause (`vendor/pdfjs/web/wasm/LICENSE_OPENJPEG`, `LICENSE_PDFJS_OPENJPEG`)
- JBIG2 image decoder (from PDFium): BSD-3-Clause, with the PDF.js wrapper under Apache-2.0 (`vendor/pdfjs/web/wasm/LICENSE_JBIG2`, `LICENSE_PDFJS_JBIG2`)
- Adobe CMaps: BSD-3-Clause (`vendor/pdfjs/web/cmaps/LICENSE`)
- Foxit standard fonts (from PDFium): BSD-3-Clause (`vendor/pdfjs/web/standard_fonts/LICENSE_FOXIT`)
- ICC profile: CC0-1.0 (`vendor/pdfjs/web/iccs/LICENSE`)

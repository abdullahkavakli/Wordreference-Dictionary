import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.mjs');

const pagesEl = document.getElementById('pages');
const statusEl = document.getElementById('status');
const filenameEl = document.getElementById('filename');
const pageInfoEl = document.getElementById('page-info');
const zoomInfoEl = document.getElementById('zoom-info');

const params = new URLSearchParams(location.search);
const fileUrl = params.get('file');

let pdfDoc = null;
let zoom = 1.25;

if (!fileUrl) {
  statusEl.classList.add('error');
  statusEl.textContent = 'No PDF URL provided. Open a .pdf link in your browser to use this viewer.';
} else {
  filenameEl.textContent = decodeURIComponent(fileUrl.split('/').pop().split('?')[0]) || 'PDF';
  load(fileUrl);
}

async function load(url) {
  try {
    const task = pdfjsLib.getDocument({
      url,
      withCredentials: false,
      isEvalSupported: false,
      disableAutoFetch: false,
      disableStream: false
    });
    pdfDoc = await task.promise;
    statusEl.remove();
    pageInfoEl.textContent = `1 / ${pdfDoc.numPages}`;
    await renderAll();
  } catch (err) {
    statusEl.classList.add('error');
    const msg = (err && err.message) || String(err);
    statusEl.textContent = '';
    const heading = document.createElement('div');
    heading.textContent = 'Could not open PDF.';
    const detail = document.createElement('small');
    detail.style.display = 'block';
    detail.style.marginTop = '6px';
    detail.textContent = msg;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in original viewer';
    link.style.display = 'inline-block';
    link.style.marginTop = '14px';
    statusEl.appendChild(heading);
    statusEl.appendChild(detail);
    statusEl.appendChild(link);
  }
}

async function renderAll() {
  pagesEl.textContent = '';
  for (let n = 1; n <= pdfDoc.numPages; n++) {
    await renderPage(n);
  }
}

async function renderPage(num) {
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: zoom * (window.devicePixelRatio || 1) });
  const cssViewport = page.getViewport({ scale: zoom });

  const wrap = document.createElement('div');
  wrap.className = 'pdf-page';
  wrap.style.width = `${cssViewport.width}px`;
  wrap.style.height = `${cssViewport.height}px`;
  wrap.dataset.page = String(num);

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  wrap.appendChild(canvas);

  const textLayerDiv = document.createElement('div');
  textLayerDiv.className = 'textLayer';
  wrap.appendChild(textLayerDiv);

  pagesEl.appendChild(wrap);

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  const textContent = await page.getTextContent();
  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: cssViewport
  });
  await textLayer.render();
}

document.getElementById('zoom-in').addEventListener('click', () => {
  zoom = Math.min(3, zoom + 0.25);
  zoomInfoEl.textContent = `${Math.round(zoom * 100)}%`;
  if (pdfDoc) renderAll();
});

document.getElementById('zoom-out').addEventListener('click', () => {
  zoom = Math.max(0.5, zoom - 0.25);
  zoomInfoEl.textContent = `${Math.round(zoom * 100)}%`;
  if (pdfDoc) renderAll();
});

const obs = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting && pdfDoc) {
      pageInfoEl.textContent = `${e.target.dataset.page} / ${pdfDoc.numPages}`;
    }
  }
}, { threshold: 0.5 });

new MutationObserver(records => {
  for (const r of records) {
    for (const node of r.addedNodes) {
      if (node.classList && node.classList.contains('pdf-page')) obs.observe(node);
    }
  }
}).observe(pagesEl, { childList: true });

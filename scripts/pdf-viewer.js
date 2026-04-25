import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.mjs');

const pagesEl = document.getElementById('pages');
const statusEl = document.getElementById('status');
const filenameEl = document.getElementById('filename');
const pageInputEl = document.getElementById('page-input');
const pageTotalEl = document.getElementById('page-total');
const zoomInfoEl = document.getElementById('zoom-info');

const params = new URLSearchParams(location.search);
const fileUrl = params.get('file');

let pdfDoc = null;
let zoom = 1.25;
let currentPage = 1;

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
    pageInputEl.max = String(pdfDoc.numPages);
    pageTotalEl.textContent = `/ ${pdfDoc.numPages}`;
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

function changeZoom(next) {
  zoom = Math.max(0.5, Math.min(3, next));
  zoomInfoEl.textContent = `${Math.round(zoom * 100)}%`;
  if (pdfDoc) renderAll();
}

document.getElementById('zoom-in').addEventListener('click', () => changeZoom(zoom + 0.25));
document.getElementById('zoom-out').addEventListener('click', () => changeZoom(zoom - 0.25));

document.getElementById('zoom-fit').addEventListener('click', async () => {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(currentPage);
  const baseViewport = page.getViewport({ scale: 1 });
  const available = pagesEl.clientWidth - 24;
  changeZoom(available / baseViewport.width);
});

function jumpToPage(num) {
  if (!pdfDoc) return;
  const target = Math.max(1, Math.min(pdfDoc.numPages, num | 0));
  const el = pagesEl.querySelector(`.pdf-page[data-page="${target}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('prev-page').addEventListener('click', () => jumpToPage(currentPage - 1));
document.getElementById('next-page').addEventListener('click', () => jumpToPage(currentPage + 1));

pageInputEl.addEventListener('change', () => jumpToPage(Number(pageInputEl.value)));
pageInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') pageInputEl.blur(); });

document.addEventListener('keydown', e => {
  if (e.target === pageInputEl || e.target.matches('input, textarea')) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); jumpToPage(currentPage + 1); }
  else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); jumpToPage(currentPage - 1); }
  else if (e.key === 'Home') { e.preventDefault(); jumpToPage(1); }
  else if (e.key === 'End' && pdfDoc) { e.preventDefault(); jumpToPage(pdfDoc.numPages); }
  else if (e.key === '+' || e.key === '=') { e.preventDefault(); changeZoom(zoom + 0.25); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); changeZoom(zoom - 0.25); }
});

document.getElementById('download-btn').addEventListener('click', () => {
  if (!fileUrl) return;
  const a = document.createElement('a');
  a.href = fileUrl;
  a.download = decodeURIComponent(fileUrl.split('/').pop().split('?')[0]) || 'document.pdf';
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.getElementById('print-btn').addEventListener('click', () => {
  if (!fileUrl) return;
  window.open(fileUrl, '_blank', 'noopener');
});

const obs = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting && pdfDoc) {
      currentPage = Number(e.target.dataset.page) || 1;
      pageInputEl.value = String(currentPage);
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

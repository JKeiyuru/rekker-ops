// client/src/lib/pdfExtract.js
//
// PDF → plain text lines, for the packaging disparity engine.
//
// Two paths:
//   1. Digital PDFs (e.g. our QuickBooks invoices) — read the embedded text
//      layer with pdf.js and rebuild visual lines from item positions.
//   2. Scanned / faxed PDFs (e.g. Carrefour LPO faxes) — render each page to a
//      canvas and OCR it with tesseract.js. Faxes are frequently rotated, so we
//      try a few orientations and keep the most "readable" result.
//
// Everything is lazy-imported so the heavy libraries never land in the main
// bundle for users who don't use this feature.

let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** Rebuild visual text lines from pdf.js text items using their Y positions. */
function itemsToLines(items) {
  const rows = [];
  items.forEach((it) => {
    const str = it.str;
    if (!str || !str.trim()) return;
    const y = Math.round(it.transform[5]);
    const x = it.transform[4];
    // group items whose baseline is within 3pt of each other
    let row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, str });
  });
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.cells
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

/** Rough readability score — used to pick the best OCR orientation. */
function readabilityScore(text) {
  if (!text) return 0;
  const tokens = text.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  let good = 0;
  tokens.forEach((t) => {
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 3 && /[AEIOUaeiou]/.test(letters)) good += 1;
  });
  return good;
}

let ocrWorkerPromise = null;
async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng');
    })();
  }
  return ocrWorkerPromise;
}

async function renderPageToCanvas(page, rotation, scale = 2.4) {
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Extract text lines from a PDF File/Blob/ArrayBuffer.
 * @returns {Promise<{ lines: string[], ocrUsed: boolean, pages: number }>}
 */
export async function extractPdfLines(file, { onProgress } = {}) {
  const report = (msg) => { try { onProgress && onProgress(msg); } catch { /* ignore */ } };

  const pdfjs = await getPdfjs();
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  const allLines = [];
  let ocrUsed = false;

  for (let p = 1; p <= doc.numPages; p += 1) {
    report(`Reading page ${p} of ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = itemsToLines(content.items || []);
    const charCount = lines.join('').replace(/\s/g, '').length;

    if (charCount >= 40) {
      allLines.push(...lines);
      continue;
    }

    // Scanned page → OCR, trying the most common fax orientations.
    ocrUsed = true;
    const worker = await getOcrWorker();
    let best = { score: -1, text: '' };
    for (const rotation of [0, 90, 270, 180]) {
      report(`Scanning page ${p} (OCR${rotation ? `, rotated ${rotation}°` : ''})…`);
      const canvas = await renderPageToCanvas(page, rotation);
      const { data } = await worker.recognize(canvas);
      const score = readabilityScore(data.text);
      if (score > best.score) best = { score, text: data.text };
      // A clearly readable page — no need to try the other orientations.
      if (best.score >= 25) break;
    }
    allLines.push(...best.text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean));
  }

  return { lines: allLines, ocrUsed, pages: doc.numPages };
}

export async function terminatePdfOcr() {
  if (!ocrWorkerPromise) return;
  try { (await ocrWorkerPromise).terminate(); } catch { /* ignore */ }
  ocrWorkerPromise = null;
}

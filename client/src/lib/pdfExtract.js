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
    //
    // NOTE: we used to rank orientations with a hand-rolled "readability"
    // heuristic (count tokens that look vaguely like English words). That
    // heuristic is *not* reliable: OCR-ing a sideways/upside-down fax still
    // produces plenty of accidental 3+ letter, vowel-containing tokens, so
    // garbage from the WRONG rotation regularly out-scored the real text
    // from the correct one — and since the loop broke as soon as it saw a
    // "good enough" score, it would often lock onto the very first rotation
    // tried (0°, i.e. not rotated at all) before ever trying the orientation
    // that was actually readable. That's exactly why LPO faxes (which are
    // scanned sideways) were coming out as garbled nonsense while upright
    // digital invoices, which never hit this code path, were fine.
    //
    // Tesseract itself reports a mean confidence (0-100) for how sure it is
    // about what it read, which is a much stronger signal than guessing from
    // word shape — a sideways scan reads as low-confidence noise, the
    // correctly oriented one reads as high-confidence real text. We rank by
    // that instead, and only stop early once tesseract is genuinely
    // confident, rather than settling for "found some words".
    ocrUsed = true;
    const worker = await getOcrWorker();
    let best = { confidence: -1, text: '' };
    for (const rotation of [0, 90, 180, 270]) {
      report(`Scanning page ${p} (OCR${rotation ? `, rotated ${rotation}°` : ''})…`);
      const canvas = await renderPageToCanvas(page, rotation);
      const { data } = await worker.recognize(canvas);
      const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
      if (confidence > best.confidence) best = { confidence, text: data.text };
      // Genuinely high-confidence read — no need to try the other orientations.
      if (best.confidence >= 85) break;
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
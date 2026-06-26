import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

/** OCR a single PDF page and return the recognized text. Lazy-loads
 *  Tesseract.js — the worker + traineddata are ~13MB so this happens only
 *  when the user actually picks the OCR action. */
export async function ocrPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  onProgress?: (status: string, progress: number) => void
): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  try {
    const canvas = await renderPageToOcrCanvas(page)
    // @vite-ignore — tesseract.js is an optional install; if it isn't on
    // disk we don't want Vite's import-analysis to crash dev. The friendly
    // error below points users at `npm install tesseract.js`.
    const tess = await import(/* @vite-ignore */ 'tesseract.js').catch(() => null)
    if (!tess) {
      throw new Error(
        'OCR engine not installed. Run `npm install tesseract.js` and reload to enable OCR.'
      )
    }
    const worker = await tess.createWorker('eng', 1, {
      logger: (m: { status?: string; progress?: number }) => {
        if (onProgress) onProgress(m.status ?? 'working', m.progress ?? 0)
      }
    })
    try {
      const { data } = await worker.recognize(canvas)
      return data.text as string
    } finally {
      await worker.terminate()
    }
  } finally {
    page.cleanup()
  }
}

async function renderPageToOcrCanvas(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  // OCR accuracy plateaus around 2x scale for typical 12pt body text.
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

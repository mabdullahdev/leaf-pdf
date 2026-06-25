import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function loadDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableAutoFetch: false,
    disableStream: false
  })
  return task.promise
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas 2d context unavailable')

  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
  await page.render({ canvasContext: ctx, viewport, transform }).promise
  return { width: viewport.width, height: viewport.height }
}

export type { PDFDocumentProxy, PDFPageProxy }

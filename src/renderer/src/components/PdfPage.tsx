import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist'
import { renderPageToCanvas } from '../lib/pdfRenderer'
import { useDocumentStore } from '../store/documentStore'
import HighlightLayer from './HighlightLayer'
import AnnotationLayer from './AnnotationLayer'

type Props = {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  /** Called once per render with the page's *natural* (scale=1) dimensions in PDF units. */
  onNaturalSize?: (w: number, h: number) => void
}

export default function PdfPage({ pdf, pageNumber, scale, onNaturalSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [viewport, setViewport] = useState<PageViewport | null>(null)
  const setPageViewport = useDocumentStore((s) => s.setPageViewport)

  useEffect(() => {
    let cancelled = false

    async function go() {
      const canvas = canvasRef.current
      if (!canvas) return
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const vp = page.getViewport({ scale })
      // Natural dims (scale=1) — independent of current zoom so the parent's
      // fit-to-width calc isn't tangled in a feedback loop with `scale`.
      const naturalVp = page.getViewport({ scale: 1 })
      try {
        const dims = await renderPageToCanvas(page, canvas, scale)
        if (cancelled) return
        setSize(dims)
        setViewport(vp)
        setPageViewport(pageNumber, vp)
        onNaturalSize?.(naturalVp.width, naturalVp.height)
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('render error', err)
        }
      } finally {
        page.cleanup()
      }
    }
    go()

    return () => { cancelled = true }
  }, [pdf, pageNumber, scale, onNaturalSize, setPageViewport])

  return (
    <div
      className="relative bg-white shadow-md ring-1 ring-black/5 dark:ring-white/10"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      <canvas ref={canvasRef} />
      {viewport && <HighlightLayer pageNumber={pageNumber} viewport={viewport} />}
      {viewport && <AnnotationLayer pageNumber={pageNumber} viewport={viewport} />}
    </div>
  )
}

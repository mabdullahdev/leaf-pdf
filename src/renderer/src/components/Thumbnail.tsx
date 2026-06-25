import { useEffect, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPageToCanvas } from '../lib/pdfRenderer'

const THUMB_WIDTH = 140

type Props = {
  pdf: PDFDocumentProxy
  pageNumber: number
  active: boolean
  onClick: () => void
}

export default function Thumbnail({ pdf, pageNumber, active, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    async function go() {
      const canvas = canvasRef.current
      if (!canvas) return
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = THUMB_WIDTH / baseViewport.width
      try {
        await renderPageToCanvas(page, canvas, scale)
      } catch {
        // ignore cancelled renders
      } finally {
        page.cleanup()
      }
    }
    go()
    return () => { cancelled = true }
  }, [pdf, pageNumber])

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center gap-1 p-2 rounded-md text-xs transition ${
        active
          ? 'bg-blue-500/10 ring-1 ring-blue-500/50'
          : 'hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
      }`}
    >
      <div className="bg-white shadow-sm ring-1 ring-black/10">
        <canvas ref={canvasRef} />
      </div>
      <span className={active ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-neutral-500'}>
        {pageNumber}
      </span>
    </button>
  )
}

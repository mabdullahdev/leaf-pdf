import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useDocumentStore } from '../store/documentStore'
import { usePagesStore } from '../store/pagesStore'
import { renderPageToCanvas } from '../lib/pdfRenderer'

/** Pages-tab main view. Distinct from the reference design — instead of a
 *  flat grid we use a "card stack" treatment: every page card sits on a thin
 *  back-card so the grid reads as a deck rather than a slide list. Selection
 *  state lights up a blue ring + corner check; multi-select via cmd/shift. */
export default function PagesGrid() {
  const pdf = useDocumentStore((s) => s.pdf)
  const numPages = useDocumentStore((s) => s.numPages)
  const selection = usePagesStore((s) => s.selection)
  const select = usePagesStore((s) => s.select)
  const selectAll = usePagesStore((s) => s.selectAll)
  const clear = usePagesStore((s) => s.clear)
  const thumbWidth = usePagesStore((s) => s.thumbWidth)
  const busy = usePagesStore((s) => s.busy)

  const containerRef = useRef<HTMLDivElement>(null)

  // Keyboard: Cmd+A to select all, Esc to clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      const t = e.target as HTMLElement | null
      const inField = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable
      if (inField) return
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll(numPages)
      } else if (e.key === 'Escape') {
        clear()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages, selectAll, clear])

  const onCardClick = (n: number, e: React.MouseEvent): void => {
    e.stopPropagation()
    if (e.shiftKey) select(n, 'range')
    else if (e.metaKey || e.ctrlKey) select(n, 'toggle')
    else select(n, 'single')
  }

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])

  if (!pdf) return null

  return (
    <div
      ref={containerRef}
      onClick={() => clear()}
      className="flex-1 overflow-auto relative bg-neutral-100 dark:bg-neutral-950"
    >
      {/* Selection-count pill — floats above the grid when any pages are picked. */}
      {selection.size > 0 && (
        <div className="sticky top-3 z-10 flex justify-center pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500 text-white text-xs shadow-lg ring-1 ring-blue-300/60">
            <span className="w-2 h-2 rounded-full bg-white" />
            {selection.size} page{selection.size === 1 ? '' : 's'} selected
            <button
              onClick={(e) => { e.stopPropagation(); clear() }}
              className="ml-1 h-4 w-4 inline-flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
              title="Clear selection (Esc)"
              aria-label="Clear selection"
            >
              <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div
        className="grid gap-6 p-6 justify-center"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbWidth}px, 1fr))`,
          maxWidth: '100%',
          opacity: busy ? 0.45 : 1,
          transition: 'opacity 120ms ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {pages.map((n) => (
          <PageCard
            key={n}
            pdf={pdf}
            pageNumber={n}
            thumbWidth={thumbWidth}
            selected={selection.has(n)}
            onClick={(e) => onCardClick(n, e)}
          />
        ))}
      </div>
    </div>
  )
}

type CardProps = {
  pdf: PDFDocumentProxy
  pageNumber: number
  thumbWidth: number
  selected: boolean
  onClick: (e: React.MouseEvent) => void
}

function PageCard({ pdf, pageNumber, thumbWidth, selected, onClick }: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [aspect, setAspect] = useState<number>(0.7727) // default Letter aspect

  useEffect(() => {
    let cancelled = false
    async function go(): Promise<void> {
      const canvas = canvasRef.current
      if (!canvas) return
      const page = await pdf.getPage(pageNumber)
      if (cancelled) { page.cleanup(); return }
      const baseVp = page.getViewport({ scale: 1 })
      setAspect(baseVp.height / baseVp.width)
      const scale = thumbWidth / baseVp.width
      try {
        await renderPageToCanvas(page, canvas, scale)
      } catch {
        /* ignore */
      } finally {
        page.cleanup()
      }
    }
    void go()
    return () => { cancelled = true }
  }, [pdf, pageNumber, thumbWidth])

  // Card height tracks the thumb's aspect so the title strip aligns no matter
  // how the page is sized.
  const cardHeight = Math.round(thumbWidth * aspect) + 32

  return (
    <button
      onClick={onClick}
      style={{ width: thumbWidth, height: cardHeight + 12 }}
      className="group relative inline-block focus:outline-none text-left"
    >
      {/* Back card — gives every page a slight "stack" feel, the design twist
          that differentiates this grid from the flat reference. Tilts a touch
          when hovered. */}
      <span
        aria-hidden
        className="absolute inset-x-2 top-2 bottom-0 rounded-lg bg-neutral-300 dark:bg-neutral-700/60 transition-transform duration-200 group-hover:-rotate-1"
        style={{ zIndex: 0 }}
      />
      {/* Front card */}
      <span
        className={`absolute inset-0 rounded-lg overflow-hidden transition-all duration-200 ${
          selected
            ? 'ring-2 ring-blue-500 shadow-xl shadow-blue-500/30 -translate-y-0.5'
            : 'ring-1 ring-black/10 dark:ring-white/10 shadow-md group-hover:-translate-y-1 group-hover:shadow-lg'
        }`}
        style={{ background: 'white', zIndex: 1 }}
      >
        <span className="block w-full" style={{ height: thumbWidth * aspect }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: thumbWidth, height: thumbWidth * aspect }} />
        </span>
        <span className="flex items-center justify-between px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 border-t border-neutral-200/70 dark:border-neutral-700/50 bg-white dark:bg-neutral-900">
          <span className="tabular-nums">Page {pageNumber}</span>
          <span className="opacity-60">⌘ click for multi</span>
        </span>
      </span>

      {/* Selected badge — checkmark in a blue circle, top-right of front card. */}
      {selected && (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-500 text-white shadow-md inline-flex items-center justify-center"
          style={{ zIndex: 2 }}
        >
          <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6.5 5 9.5 10 3" />
          </svg>
        </span>
      )}
    </button>
  )
}

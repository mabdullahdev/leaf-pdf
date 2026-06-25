import { useCallback, useEffect, useMemo, useLayoutEffect, useRef, useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useSearchStore } from '../store/searchStore'
import { computeRangeRect } from '../lib/search'
import PdfPage from './PdfPage'

export default function PdfViewer() {
  const pdf = useDocumentStore((s) => s.pdf)
  const numPages = useDocumentStore((s) => s.numPages)
  const scale = useDocumentStore((s) => s.scale)
  const fitMode = useDocumentStore((s) => s.fitMode)
  const viewMode = useDocumentStore((s) => s.viewMode)
  const scrollingEnabled = useDocumentStore((s) => s.scrollingEnabled)
  const currentPage = useDocumentStore((s) => s.currentPage)
  const setScale = useDocumentStore((s) => s.setScale)
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage)

  const rows = useMemo<number[][]>(() => {
    if (viewMode === 'single') {
      return Array.from({ length: numPages }, (_, i) => [i + 1])
    }
    const r: number[][] = []
    for (let i = 1; i <= numPages; i += 2) {
      r.push(i + 1 <= numPages ? [i, i + 1] : [i])
    }
    return r
  }, [viewMode, numPages])

  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  // Natural page-1 dimensions (at scale=1) — invariant to current zoom.
  const [firstPageNatural, setFirstPageNatural] = useState<{ width: number; height: number } | null>(null)

  // Stable identity so PdfPage's effect doesn't re-fire on every parent render.
  const handleFirstPageNatural = useCallback((w: number, h: number) => {
    setFirstPageNatural((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }))
  }, [])

  // In double-page view, the row holds two pages plus a 16px gap, so the natural
  // "row width" is roughly 2x a single page. Used by the fit calculations.
  const rowWidthMultiplier = viewMode === 'double' ? 2 : 1
  const rowGapPx = viewMode === 'double' ? 16 : 0

  // Re-fit when the document, the natural size, or the user's fit mode changes.
  // Deliberately NOT depending on `scale`: this effect *sets* scale, so listing it
  // here would feed back into itself before useEffect can refresh inputs.
  useEffect(() => {
    if (!pdf || !firstPageNatural || fitMode === 'manual') return
    const el = containerRef.current
    if (!el) return
    const padding = 64
    const currentScale = useDocumentStore.getState().scale
    const widthBudget = (el.clientWidth - padding - rowGapPx) / (firstPageNatural.width * rowWidthMultiplier)
    let next: number
    if (fitMode === 'width') {
      next = widthBudget
    } else {
      next = Math.min(widthBudget, (el.clientHeight - padding) / firstPageNatural.height)
    }
    if (Math.abs(next - currentScale) > 0.02) {
      setScale(next, fitMode)
    }
  }, [pdf, firstPageNatural, fitMode, setScale, rowWidthMultiplier, rowGapPx])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !pdf) return
    const onResize = (): void => {
      if (fitMode === 'manual' || !firstPageNatural) return
      const padding = 64
      const widthBudget =
        (el.clientWidth - padding - rowGapPx) / (firstPageNatural.width * rowWidthMultiplier)
      let next: number
      if (fitMode === 'width') {
        next = widthBudget
      } else if (fitMode === 'page') {
        next = Math.min(widthBudget, (el.clientHeight - padding) / firstPageNatural.height)
      } else {
        return
      }
      const currentScale = useDocumentStore.getState().scale
      // Tolerance breaks the scrollbar-flap feedback loop: a few-pixel container
      // change (scrollbar appear/disappear) produces a tiny scale delta that we
      // ignore. scrollbar-gutter: stable below pins clientWidth so this rarely fires.
      if (Math.abs(next - currentScale) > 0.02) {
        setScale(next, fitMode)
      }
    }
    const obs = new ResizeObserver(onResize)
    obs.observe(el)
    return () => obs.disconnect()
  }, [pdf, fitMode, firstPageNatural, setScale, rowWidthMultiplier, rowGapPx])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !pdf) return
    const onScroll = () => {
      const top = el.scrollTop
      const center = top + el.clientHeight / 2
      for (let i = 0; i < pageRefs.current.length; i++) {
        const p = pageRefs.current[i]
        if (!p) continue
        if (p.offsetTop <= center && p.offsetTop + p.offsetHeight >= center) {
          setCurrentPage(i + 1)
          return
        }
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [pdf, setCurrentPage])

  useEffect(() => {
    const el = pageRefs.current[currentPage - 1]
    const container = containerRef.current
    if (!el || !container) return
    const containerTop = container.scrollTop
    const containerBot = containerTop + container.clientHeight
    if (el.offsetTop < containerTop || el.offsetTop > containerBot - 40) {
      container.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
    }
  }, [currentPage])

  const matches = useSearchStore((s) => s.matches)
  const currentMatchIndex = useSearchStore((s) => s.currentIndex)
  const pageTexts = useSearchStore((s) => s.pageTexts)
  // Only subscribe to the one viewport we actually need — keeps PdfViewer from
  // re-rendering on every page's setPageViewport call.
  const targetMatchPage = matches[currentMatchIndex]?.pageNumber ?? null
  const targetViewport = useDocumentStore((s) =>
    targetMatchPage !== null ? s.pageViewports[targetMatchPage] ?? null : null
  )

  useEffect(() => {
    if (currentMatchIndex < 0 || !pageTexts) return
    const match = matches[currentMatchIndex]
    if (!match) return
    const viewport = targetViewport
    if (!viewport) return
    const pageText = pageTexts[match.pageNumber - 1]
    if (!pageText) return
    const range = match.ranges[0]
    const item = pageText.items[range.itemIndex]
    if (!item) return
    const pageEl = pageRefs.current[match.pageNumber - 1]
    const container = containerRef.current
    if (!pageEl || !container) return

    const rect = computeRangeRect(item, range, viewport)
    const padding = 96
    const targetTop = pageEl.offsetTop + rect.top - padding
    const targetBot = pageEl.offsetTop + rect.top + rect.height + padding
    const viewTop = container.scrollTop
    const viewBot = viewTop + container.clientHeight
    if (targetTop < viewTop || targetBot > viewBot) {
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
    }
  }, [currentMatchIndex, matches, pageTexts, targetViewport])

  if (!pdf) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500">
        <div className="text-center">
          <p className="text-lg font-medium text-neutral-700 dark:text-neutral-200">No document open</p>
          <p className="mt-2 text-sm">Use File → Open (⌘O) or drop a PDF here</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-950 [scrollbar-gutter:stable]"
    >
      <div className="flex flex-col items-center gap-4 py-8 px-4 min-h-full">
        {rows.map((row, rowIdx) => {
          const rowVisible = scrollingEnabled || row.includes(currentPage)
          return (
            <div
              key={`row-${rowIdx}`}
              className={`flex gap-4 ${rowVisible ? '' : 'hidden'}`}
            >
              {row.map((n) => (
                <div
                  key={n}
                  ref={(el) => { pageRefs.current[n - 1] = el }}
                  data-page={n}
                >
                  <PdfPage
                    pdf={pdf}
                    pageNumber={n}
                    scale={scale}
                    onNaturalSize={n === 1 ? handleFirstPageNatural : undefined}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import type { PageViewport } from 'pdfjs-dist'
import { useSearchStore } from '../store/searchStore'
import { computeRangeRect } from '../lib/search'

type Props = {
  pageNumber: number
  viewport: PageViewport
}

export default function HighlightLayer({ pageNumber, viewport }: Props) {
  const allMatches = useSearchStore((s) => s.matches)
  const currentIndex = useSearchStore((s) => s.currentIndex)
  const pageTexts = useSearchStore((s) => s.pageTexts)

  if (allMatches.length === 0 || !pageTexts) return null
  const pageText = pageTexts[pageNumber - 1]
  if (!pageText) return null

  const rects: { left: number; top: number; width: number; height: number; isCurrent: boolean; key: string }[] = []
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i]
    if (m.pageNumber !== pageNumber) continue
    const isCurrent = i === currentIndex
    for (let r = 0; r < m.ranges.length; r++) {
      const range = m.ranges[r]
      const item = pageText.items[range.itemIndex]
      if (!item) continue
      const rect = computeRangeRect(item, range, viewport)
      rects.push({
        ...rect,
        isCurrent,
        key: `${i}-${r}`
      })
    }
  }

  if (rects.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none">
      {rects.map((r) => (
        <div
          key={r.key}
          className={r.isCurrent ? 'absolute bg-orange-400/70' : 'absolute bg-yellow-300/60'}
          style={{
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
            mixBlendMode: 'multiply'
          }}
        />
      ))}
    </div>
  )
}

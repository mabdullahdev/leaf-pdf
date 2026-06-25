import { useRef } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointCssToPdf, pointPdfToCss, type MarkAnnotation, type MarkKind } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  mark: MarkAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

export default function MarkBox({ mark, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const moveMark = useAnnotationStore((s) => s.moveMark)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === mark.id
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { left, top } = pointPdfToCss(viewport, mark.x, mark.y)
  const sizeCss = mark.size * viewport.scale
  const strokeCss = Math.max(1, mark.strokeWidth * viewport.scale)

  const toPagePoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startMark = { x: mark.x, y: mark.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = mark.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const curPdf = pointCssToPdf(viewport, cur.x, cur.y)
      if (!snapshotted) {
        beginInteraction()
        snapshotted = true
      }
      moveMark(
        id,
        startMark.x + (curPdf.x - startPdf.x),
        startMark.y + (curPdf.y - startPdf.y),
        { commitHistory: false }
      )
    }
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    if (!isSelected) select(mark.id)
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute pointer-events-auto"
      style={{
        left,
        top,
        width: sizeCss,
        height: sizeCss,
        cursor: 'move',
        boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.85)' : undefined,
        borderRadius: 2
      }}
      onPointerDown={onPointerDown}
    >
      <MarkGlyph kind={mark.mark} color={mark.color} strokeCss={strokeCss} sizeCss={sizeCss} />
      {isSelected && (
        <button
          type="button"
          title="Delete (Delete)"
          aria-label="Delete mark"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            remove(mark.id)
          }}
          style={{
            position: 'absolute',
            top: -22,
            right: -8,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#ef4444',
            color: 'white',
            border: '1px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            fontSize: 11,
            lineHeight: '16px',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            zIndex: 3
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

/** Render a single mark as inline SVG. Same glyph set is used in the toolbar
 *  preview and at save time, so what users place is exactly what they pick. */
export function MarkGlyph({
  kind,
  color,
  strokeCss,
  sizeCss
}: {
  kind: MarkKind
  color: string
  strokeCss: number
  sizeCss: number
}) {
  // Stroke is given to us in CSS px; map it back to the 16-unit viewBox.
  // Cap it so the glyph never reads as bold even when sizeCss is small.
  const strokeInUnits = Math.min(1.4, (strokeCss / sizeCss) * 16)
  const commonProps = {
    width: sizeCss,
    height: sizeCss,
    viewBox: '0 0 16 16',
    fill: 'none' as const,
    stroke: color,
    strokeWidth: strokeInUnits,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { pointerEvents: 'none' as const, display: 'block' }
  }
  if (kind === 'check') {
    return <svg {...commonProps}><path d="M3 8.5 L6.5 12 L13 4.5" /></svg>
  }
  if (kind === 'cross') {
    return <svg {...commonProps}><path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" /></svg>
  }
  if (kind === 'dot') {
    return (
      <svg {...commonProps}>
        <circle cx="8" cy="8" r="3.2" fill={color} stroke="none" />
      </svg>
    )
  }
  if (kind === 'dash') {
    return <svg {...commonProps}><path d="M3 8 L13 8" /></svg>
  }
  if (kind === 'square') {
    return <svg {...commonProps}><rect x="3.5" y="3.5" width="9" height="9" rx="0.5" /></svg>
  }
  // circle
  return <svg {...commonProps}><circle cx="8" cy="8" r="4.5" /></svg>
}

import { useRef } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointCssToPdf, pointPdfToCss, type StampAnnotation } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  stamp: StampAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

export default function StampBox({ stamp, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const moveStamp = useAnnotationStore((s) => s.moveStamp)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === stamp.id
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { left, top } = pointPdfToCss(viewport, stamp.x, stamp.y)
  const widthCss = stamp.width * viewport.scale
  const heightCss = stamp.height * viewport.scale
  const fontSizeCss = stamp.fontSize * viewport.scale
  const borderCss = Math.max(2, 1.5 * viewport.scale)

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
    const startStamp = { x: stamp.x, y: stamp.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = stamp.id
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
      moveStamp(
        id,
        startStamp.x + (curPdf.x - startPdf.x),
        startStamp.y + (curPdf.y - startPdf.y),
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

    if (!isSelected) select(stamp.id)
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute pointer-events-auto select-none"
      style={{
        left,
        top,
        width: widthCss,
        height: heightCss,
        cursor: 'move'
      }}
      onPointerDown={onPointerDown}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          border: `${borderCss}px solid ${stamp.color}`,
          borderRadius: Math.max(6, 8 * viewport.scale),
          color: stamp.color,
          fontStyle: 'italic',
          fontWeight: 700,
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: fontSizeCss,
          letterSpacing: 0.5 * viewport.scale,
          background: 'transparent',
          boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.85)' : undefined,
          whiteSpace: 'nowrap',
          padding: `0 ${6 * viewport.scale}px`,
          // The box already moves on pointerdown; this stops the inner div
          // from intercepting and resetting cursor.
          pointerEvents: 'none'
        }}
      >
        {stamp.text}
      </div>

      {isSelected && (
        <button
          type="button"
          title="Delete stamp (Delete)"
          aria-label="Delete stamp"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            remove(stamp.id)
          }}
          style={{
            position: 'absolute',
            top: -28,
            right: -10,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#ef4444',
            color: 'white',
            border: '1px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            fontSize: 14,
            lineHeight: '20px',
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

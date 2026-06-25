import { useRef } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointCssToPdf, pointPdfToCss, type AttachedImageAnnotation } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  attached: AttachedImageAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

export default function AttachedImageBox({ attached, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const moveAttachedImage = useAnnotationStore((s) => s.moveAttachedImage)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === attached.id
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { left, top } = pointPdfToCss(viewport, attached.x, attached.y)
  const sizeCss = attached.size * viewport.scale

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
    const startA = { x: attached.x, y: attached.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = attached.id
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
      moveAttachedImage(
        id,
        startA.x + (curPdf.x - startPdf.x),
        startA.y + (curPdf.y - startPdf.y),
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

    if (!isSelected) select(attached.id)
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
        borderRadius: 3,
        background: 'rgba(255, 255, 255, 0.85)',
        border: '1px solid rgba(0,0,0,0.15)'
      }}
      title={`Attachment: ${attached.fileName}`}
      onPointerDown={onPointerDown}
    >
      {/* Tiny preview of the embedded image as the visible icon. */}
      <img
        src={attached.dataUrl}
        alt={attached.fileName}
        draggable={false}
        style={{
          position: 'absolute',
          inset: 1,
          width: 'calc(100% - 2px)',
          height: 'calc(100% - 2px)',
          objectFit: 'cover',
          pointerEvents: 'none'
        }}
      />
      {/* Paperclip badge to mark this as an attached file vs a plain image. */}
      <span
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: Math.max(10, sizeCss * 0.45),
          height: Math.max(10, sizeCss * 0.45),
          borderRadius: '50%',
          background: '#1f2937',
          color: 'white',
          fontSize: Math.max(8, sizeCss * 0.35),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          border: '1px solid white'
        }}
        aria-hidden
      >
        📎
      </span>

      {isSelected && (
        <button
          type="button"
          title="Delete attachment (Delete)"
          aria-label="Delete attachment"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            remove(attached.id)
          }}
          style={{
            position: 'absolute',
            top: -22,
            right: -10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#ef4444',
            color: 'white',
            border: '1px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            fontSize: 12,
            lineHeight: '18px',
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

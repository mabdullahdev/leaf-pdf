import { useRef } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointCssToPdf, pointPdfToCss, type SignatureAnnotation } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  signature: SignatureAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

type Handle = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_SIZE = 10
const MIN_CSS = 24

export default function SignatureBox({ signature, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const moveSignature = useAnnotationStore((s) => s.moveSignature)
  const resizeSignature = useAnnotationStore((s) => s.resizeSignature)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === signature.id
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { left, top } = pointPdfToCss(viewport, signature.x, signature.y)
  const widthCss = signature.width * viewport.scale
  const heightCss = signature.height * viewport.scale
  const aspect = signature.height / Math.max(0.0001, signature.width)

  const toPagePoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onWrapperPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.target !== wrapperRef.current && e.target !== imgRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startSig = { x: signature.x, y: signature.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = signature.id
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
      moveSignature(
        id,
        startSig.x + (curPdf.x - startPdf.x),
        startSig.y + (curPdf.y - startPdf.y),
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

    if (!isSelected) select(signature.id)
  }

  const imgRef = useRef<HTMLImageElement>(null)

  const startResize = (e: React.PointerEvent<HTMLDivElement>, handle: Handle): void => {
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startCssLeft = left
    const startCssTop = top
    const startCssW = widthCss
    const startCssH = heightCss
    const id = signature.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const dx = cur.x - start.x
      const dy = cur.y - start.y
      // Preserve aspect ratio. Drive by the dominant axis delta.
      let newW = startCssW
      let newH = startCssH
      let newLeft = startCssLeft
      let newTop = startCssTop
      const widthFromDx = (signX: number): number => Math.max(MIN_CSS, startCssW + signX * dx)
      const heightFromDy = (signY: number): number => Math.max(MIN_CSS, startCssH + signY * dy)
      const driveByWidth = Math.abs(dx) * 1 >= Math.abs(dy) * aspect
      if (handle === 'se') {
        const wCand = widthFromDx(1)
        const hCand = heightFromDy(1)
        if (driveByWidth) { newW = wCand; newH = newW * aspect } else { newH = hCand; newW = newH / aspect }
      } else if (handle === 'sw') {
        const wCand = widthFromDx(-1)
        const hCand = heightFromDy(1)
        if (driveByWidth) { newW = wCand; newH = newW * aspect } else { newH = hCand; newW = newH / aspect }
        newLeft = startCssLeft + (startCssW - newW)
      } else if (handle === 'ne') {
        const wCand = widthFromDx(1)
        const hCand = heightFromDy(-1)
        if (driveByWidth) { newW = wCand; newH = newW * aspect } else { newH = hCand; newW = newH / aspect }
        newTop = startCssTop + (startCssH - newH)
      } else {
        // nw
        const wCand = widthFromDx(-1)
        const hCand = heightFromDy(-1)
        if (driveByWidth) { newW = wCand; newH = newW * aspect } else { newH = hCand; newW = newH / aspect }
        newLeft = startCssLeft + (startCssW - newW)
        newTop = startCssTop + (startCssH - newH)
      }
      const pdfTL = pointCssToPdf(viewport, newLeft, newTop)
      if (!snapshotted) {
        beginInteraction()
        snapshotted = true
      }
      resizeSignature(
        id,
        {
          x: pdfTL.x,
          y: pdfTL.y,
          width: newW / viewport.scale,
          height: newH / viewport.scale
        },
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

    if (!isSelected) select(signature.id)
  }

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: '#3b82f6',
    border: '1px solid white',
    borderRadius: 2,
    zIndex: 2
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute pointer-events-auto"
      style={{
        left,
        top,
        width: widthCss,
        height: heightCss,
        cursor: 'move',
        boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.85)' : undefined
      }}
      onPointerDown={onWrapperPointerDown}
      onClick={(e) => {
        e.stopPropagation()
        if (!isSelected) select(signature.id)
      }}
    >
      <img
        ref={imgRef}
        src={signature.dataUrl}
        alt="Signature"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
      />

      {isSelected && (
        <>
          <button
            type="button"
            title="Delete signature (Delete)"
            aria-label="Delete signature"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              remove(signature.id)
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
          <div
            style={{ ...handleStyle, top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }}
            onPointerDown={(e) => startResize(e, 'nw')}
          />
          <div
            style={{ ...handleStyle, top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }}
            onPointerDown={(e) => startResize(e, 'ne')}
          />
          <div
            style={{ ...handleStyle, bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }}
            onPointerDown={(e) => startResize(e, 'sw')}
          />
          <div
            style={{ ...handleStyle, bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }}
            onPointerDown={(e) => startResize(e, 'se')}
          />
        </>
      )}
    </div>
  )
}

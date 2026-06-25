import { useEffect, useRef, useState } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { FONT_FAMILIES, pointCssToPdf, pointPdfToCss, type FreeTextAnnotation } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  freetext: FreeTextAnnotation
  viewport: PageViewport
  /** AnnotationLayer container, used to compute page-local coords from viewport coords. */
  containerRef: React.RefObject<HTMLDivElement>
}

type Handle = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_SIZE = 10
const RIM_PADDING = 6
const MIN_W_CSS = 50
const MIN_H_CSS = 24

export default function FreeTextBox({ freetext, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const updateFreeText = useAnnotationStore((s) => s.updateFreeText)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === freetext.id
  const [draft, setDraft] = useState(freetext.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Distinguish drag operations (which shouldn't focus the textarea) from a plain click on the rim.
  const interactionRef = useRef<'idle' | 'move' | 'resize'>('idle')

  useEffect(() => {
    setDraft(freetext.text)
  }, [freetext.text])

  useEffect(() => {
    if (!isSelected) return
    const focusAndPlaceCursor = (): void => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      t.setSelectionRange(t.value.length, t.value.length)
    }
    focusAndPlaceCursor()
    const raf = requestAnimationFrame(focusAndPlaceCursor)
    return () => cancelAnimationFrame(raf)
  }, [isSelected])

  // Current CSS position/size derived from PDF-space storage.
  const { left, top } = pointPdfToCss(viewport, freetext.x, freetext.y)
  const widthCss = freetext.width * viewport.scale
  const heightCss = freetext.height * viewport.scale
  const fontSize = freetext.fontSize * viewport.scale
  const fontCss = FONT_FAMILIES.find((f) => f.id === freetext.fontFamily)?.css ?? 'sans-serif'

  const hasUserBg = freetext.backgroundColor !== null
  const hasUserBorder = freetext.borderColor !== null
  const userBorderWidthCss = freetext.borderColor ? Math.max(1, freetext.strokeWidth * viewport.scale) : 0
  const editorBackground = hasUserBg ? freetext.backgroundColor! : 'rgba(255,255,255,0.85)'
  const editorBorder = hasUserBorder
    ? `${userBorderWidthCss}px solid ${freetext.borderColor!}`
    : '1px dashed rgba(59, 130, 246, 0.7)'

  // Convert a viewport-coord pointer event to page-local CSS coords (relative to the
  // AnnotationLayer container, same space pointCssToPdf expects).
  const toPagePoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // -- MOVE --

  const onWrapperPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    // Only start a move when the rim itself was clicked (not the textarea / handles inside).
    if (e.target !== wrapperRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    interactionRef.current = 'move'
    const startFreetext = { x: freetext.x, y: freetext.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = freetext.id
    e.currentTarget.setPointerCapture(e.pointerId)
    // Snapshot once so the whole drag collapses to a single undo step.
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const curPdf = pointCssToPdf(viewport, cur.x, cur.y)
      if (!snapshotted) {
        beginInteraction()
        snapshotted = true
      }
      updateFreeText(
        id,
        {
          x: startFreetext.x + (curPdf.x - startPdf.x),
          y: startFreetext.y + (curPdf.y - startPdf.y)
        },
        { commitHistory: false }
      )
    }
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      // Reset on next tick so the wrapper's onClick (if any) sees the drag state.
      setTimeout(() => {
        interactionRef.current = 'idle'
      }, 0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    if (!isSelected) select(freetext.id)
  }

  // -- RESIZE --

  const startResize = (e: React.PointerEvent<HTMLDivElement>, handle: Handle): void => {
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    interactionRef.current = 'resize'

    const startCssLeft = left
    const startCssTop = top
    const startCssW = widthCss
    const startCssH = heightCss
    const id = freetext.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const dx = cur.x - start.x
      const dy = cur.y - start.y
      let newLeft = startCssLeft
      let newTop = startCssTop
      let newW = startCssW
      let newH = startCssH
      if (handle === 'se') {
        newW = Math.max(MIN_W_CSS, startCssW + dx)
        newH = Math.max(MIN_H_CSS, startCssH + dy)
      } else if (handle === 'sw') {
        newW = Math.max(MIN_W_CSS, startCssW - dx)
        newLeft = startCssLeft + (startCssW - newW)
        newH = Math.max(MIN_H_CSS, startCssH + dy)
      } else if (handle === 'ne') {
        newW = Math.max(MIN_W_CSS, startCssW + dx)
        newH = Math.max(MIN_H_CSS, startCssH - dy)
        newTop = startCssTop + (startCssH - newH)
      } else {
        // nw
        newW = Math.max(MIN_W_CSS, startCssW - dx)
        newLeft = startCssLeft + (startCssW - newW)
        newH = Math.max(MIN_H_CSS, startCssH - dy)
        newTop = startCssTop + (startCssH - newH)
      }
      const pdfTL = pointCssToPdf(viewport, newLeft, newTop)
      if (!snapshotted) {
        beginInteraction()
        snapshotted = true
      }
      updateFreeText(
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
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        interactionRef.current = 'idle'
      }, 0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    if (!isSelected) select(freetext.id)
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
        padding: RIM_PADDING,
        background: editorBackground,
        border: editorBorder,
        boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.85)' : '0 0 0 1px rgba(96,165,250,0.4)',
        boxSizing: 'border-box',
        cursor: 'move'
      }}
      onPointerDown={onWrapperPointerDown}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (!isSelected) select(freetext.id)
        }}
        onBlur={() => {
          if (draft !== freetext.text) updateFreeText(freetext.id, { text: draft })
        }}
        placeholder="Text"
        spellCheck={false}
        className="absolute pointer-events-auto resize-none outline-none bg-transparent leading-snug"
        style={{
          left: RIM_PADDING,
          top: RIM_PADDING,
          width: `calc(100% - ${RIM_PADDING * 2}px)`,
          height: `calc(100% - ${RIM_PADDING * 2}px)`,
          fontSize,
          color: freetext.color,
          padding: 0,
          fontFamily: fontCss,
          fontWeight: freetext.bold ? 700 : 400,
          fontStyle: freetext.italic ? 'italic' : 'normal',
          textDecoration: freetext.underline ? 'underline' : 'none',
          textAlign: freetext.align,
          cursor: 'text'
        }}
      />

      {isSelected && (
        <>
          <button
            type="button"
            title="Delete text (Delete)"
            aria-label="Delete text"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              remove(freetext.id)
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

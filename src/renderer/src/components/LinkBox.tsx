import { useRef, useState } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointCssToPdf, pointPdfToCss, type LinkAnnotation } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  link: LinkAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

type Handle = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_SIZE = 10
const MIN_CSS = 16

export default function LinkBox({ link, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const moveLink = useAnnotationStore((s) => s.moveLink)
  const resizeLink = useAnnotationStore((s) => s.resizeLink)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === link.id
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState(link.url)

  const { left, top } = pointPdfToCss(viewport, link.x, link.y)
  const widthCss = link.width * viewport.scale
  const heightCss = link.height * viewport.scale

  const toPagePoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onWrapperPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.target !== wrapperRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startLink = { x: link.x, y: link.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = link.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const curPdf = pointCssToPdf(viewport, cur.x, cur.y)
      if (!snapshotted) { beginInteraction(); snapshotted = true }
      moveLink(
        id,
        startLink.x + (curPdf.x - startPdf.x),
        startLink.y + (curPdf.y - startPdf.y),
        { commitHistory: false }
      )
    }
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    if (!isSelected) select(link.id)
  }

  const startResize = (e: React.PointerEvent<HTMLDivElement>, handle: Handle): void => {
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startCssLeft = left
    const startCssTop = top
    const startCssW = widthCss
    const startCssH = heightCss
    const id = link.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const dx = cur.x - start.x
      const dy = cur.y - start.y
      let newLeft = startCssLeft, newTop = startCssTop, newW = startCssW, newH = startCssH
      if (handle === 'se') {
        newW = Math.max(MIN_CSS, startCssW + dx); newH = Math.max(MIN_CSS, startCssH + dy)
      } else if (handle === 'sw') {
        newW = Math.max(MIN_CSS, startCssW - dx); newLeft = startCssLeft + (startCssW - newW)
        newH = Math.max(MIN_CSS, startCssH + dy)
      } else if (handle === 'ne') {
        newW = Math.max(MIN_CSS, startCssW + dx); newH = Math.max(MIN_CSS, startCssH - dy)
        newTop = startCssTop + (startCssH - newH)
      } else {
        newW = Math.max(MIN_CSS, startCssW - dx); newLeft = startCssLeft + (startCssW - newW)
        newH = Math.max(MIN_CSS, startCssH - dy); newTop = startCssTop + (startCssH - newH)
      }
      const pdfTL = pointCssToPdf(viewport, newLeft, newTop)
      if (!snapshotted) { beginInteraction(); snapshotted = true }
      resizeLink(
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
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    if (!isSelected) select(link.id)
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
        // Distinct blue outline so users can see link targets even before clicking.
        border: '1.5px solid rgba(37, 99, 235, 0.85)',
        background: 'rgba(59, 130, 246, 0.08)',
        cursor: 'move',
        boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.85)' : undefined
      }}
      onPointerDown={onWrapperPointerDown}
      onClick={(e) => {
        e.stopPropagation()
        if (!isSelected) select(link.id)
      }}
      title={link.url}
    >
      {isSelected && (
        <>
          {/* URL editor — appears above the box when selected. */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: -34,
              left: 0,
              display: 'flex',
              gap: 4,
              alignItems: 'center'
            }}
          >
            {editingUrl ? (
              <>
                <input
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://"
                  autoFocus
                  className="h-6 px-1.5 text-[11px] rounded bg-white dark:bg-neutral-900 border border-neutral-400 text-neutral-900 dark:text-neutral-100 min-w-[12rem]"
                />
                <button
                  onClick={() => {
                    resizeLink(link.id, { url: urlDraft.trim() })
                    setEditingUrl(false)
                  }}
                  className="h-6 px-2 text-[11px] rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <span
                  className="h-6 px-1.5 text-[11px] rounded bg-white/95 dark:bg-neutral-900/95 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 max-w-[16rem] truncate inline-flex items-center"
                  title={link.url}
                >
                  🔗 {link.url || '(no URL)'}
                </span>
                <button
                  onClick={() => {
                    setUrlDraft(link.url)
                    setEditingUrl(true)
                  }}
                  className="h-6 px-2 text-[11px] rounded bg-neutral-700 text-white hover:bg-neutral-600"
                >
                  Edit
                </button>
              </>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => remove(link.id)}
              title="Delete link"
              aria-label="Delete link"
              className="h-6 w-6 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
            >
              ×
            </button>
          </div>

          <div style={{ ...handleStyle, top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }} onPointerDown={(e) => startResize(e, 'nw')} />
          <div style={{ ...handleStyle, top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }} onPointerDown={(e) => startResize(e, 'ne')} />
          <div style={{ ...handleStyle, bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }} onPointerDown={(e) => startResize(e, 'sw')} />
          <div style={{ ...handleStyle, bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }} onPointerDown={(e) => startResize(e, 'se')} />
        </>
      )}
    </div>
  )
}

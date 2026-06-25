import { useEffect, useRef, useState } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointCssToPdf, pointPdfToCss, type NoteAnnotation } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  note: NoteAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

const DRAG_THRESHOLD = 4 // px before a press becomes a drag

export default function StickyNote({ note, viewport, containerRef }: Props) {
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const remove = useAnnotationStore((s) => s.remove)
  const updateNoteText = useAnnotationStore((s) => s.updateNoteText)
  const moveNote = useAnnotationStore((s) => s.moveNote)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)

  const [draft, setDraft] = useState(note.text)
  const [isDragging, setIsDragging] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const pressRef = useRef<{ startX: number; startY: number; moved: boolean; snapshotted: boolean } | null>(null)

  const isOpen = selectedId === note.id

  useEffect(() => { setDraft(note.text) }, [note.text, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(e.target as Node)) {
        if (draft !== note.text) updateNoteText(note.id, draft)
        select(null)
      }
    }
    const t = setTimeout(() => window.addEventListener('mousedown', onClick), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onClick)
    }
  }, [isOpen, draft, note.text, note.id, updateNoteText, select])

  const { left, top } = pointPdfToCss(viewport, note.x, note.y)

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    pressRef.current = { startX: e.clientX, startY: e.clientY, moved: false, snapshotted: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current
    if (!press) return
    const dx = e.clientX - press.startX
    const dy = e.clientY - press.startY
    if (!press.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

    press.moved = true
    setIsDragging(true)

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top
    const { x, y } = pointCssToPdf(viewport, cssX, cssY)
    if (!press.snapshotted) {
      beginInteraction()
      press.snapshotted = true
    }
    moveNote(note.id, x, y, { commitHistory: false })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const press = pressRef.current
    pressRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (press && !press.moved) {
      select(isOpen ? null : note.id)
    }
    setIsDragging(false)
  }

  return (
    <>
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-md ring-1 ring-black/10 hover:scale-110 transition pointer-events-auto"
        style={{
          left,
          top,
          background: note.color,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        title={note.text || 'Note'}
      >
        💬
      </button>
      {isOpen && !isDragging && (
        <div
          ref={popoverRef}
          className="absolute z-20 w-64 rounded-lg shadow-xl bg-white dark:bg-neutral-800 ring-1 ring-black/10 dark:ring-white/10 pointer-events-auto"
          style={{ left: left + 16, top: top + 8 }}
          // Stop pointerdown too — AnnotationLayer's onPointerDown would otherwise
          // fire first (pointer events precede mouse events) and drop a new note
          // at the click location before the popover's button handler runs.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-xs font-medium text-neutral-500">Note</span>
            <button
              onClick={() => remove(note.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (draft !== note.text) updateNoteText(note.id, draft) }}
            placeholder="Type your note…"
            className="w-full h-24 p-3 text-sm bg-transparent outline-none resize-none text-neutral-800 dark:text-neutral-100"
          />
        </div>
      )}
    </>
  )
}

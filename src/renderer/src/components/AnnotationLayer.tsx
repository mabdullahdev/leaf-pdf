import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { useAnnotationStore } from '../store/annotationStore'
import { useSearchStore } from '../store/searchStore'
import { useSignatureStore } from '../store/signatureStore'
import {
  findCharAtPoint,
  flowSelection,
  pointCssToPdf,
  pointPdfToCss,
  textAnnotationRects,
  estimateStampWidth,
  estimateStampHeight,
  STAMP_FONT_SIZE,
  MARK_DEFAULT_SIZE,
  MARK_DEFAULT_STROKE,
  ATTACHED_IMAGE_ICON_SIZE,
  FORM_FIELD_DEFAULTS,
  type Annotation,
  type AttachedImageAnnotation,
  type FormFieldAnnotation,
  type FormFieldKind,
  type FreeTextAnnotation,
  type ImageAnnotation,
  type LinkAnnotation,
  type MarkAnnotation,
  type NoteAnnotation,
  type ShapeAnnotation,
  type SignatureAnnotation,
  type StampAnnotation,
  type TextAnnotation
} from '../lib/annotations'
import { computeRangeRect, extractAllText } from '../lib/search'
import { useDocumentStore } from '../store/documentStore'
import StickyNote from './StickyNote'
import FreeTextBox from './FreeTextBox'
import SignatureBox from './SignatureBox'
import StampBox from './StampBox'
import MarkBox from './MarkBox'
import ImageBox from './ImageBox'
import AttachedImageBox from './AttachedImageBox'
import LinkBox from './LinkBox'
import FormFieldBox from './FormFieldBox'
import EditableRegion from './EditableRegion'
import { extractEditableRegions } from '../lib/edit/regions'

// Stable empty-array fallback. Returning `?? []` from a Zustand selector
// allocates a new array on every snapshot read, which makes useSyncExternalStore
// think the store changed on every render → infinite re-render loop.
const EMPTY_ANNOTATIONS: Annotation[] = []

type Props = {
  pageNumber: number
  viewport: PageViewport
}

type CssPoint = { x: number; y: number }
type DragRect = { left: number; top: number; width: number; height: number }
type ShapeDrawing =
  | { kind: 'shape'; shape: 'rectangle' | 'oval' | 'line'; start: CssPoint; current: CssPoint }
  | { kind: 'ink'; points: CssPoint[] }

const SHAPE_STROKE_WIDTH = 2
const FREETEXT_DEFAULT_WIDTH_CSS = 200
const FREETEXT_DEFAULT_HEIGHT_CSS = 60
const SHAPE_MIN_SIZE_CSS = 4

export default function AnnotationLayer({ pageNumber, viewport }: Props) {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const shapeKind = useAnnotationStore((s) => s.shapeKind)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const pageAnnotations = useAnnotationStore((s) => s.byPage[pageNumber] ?? EMPTY_ANNOTATIONS)
  const cropRect = useAnnotationStore((s) => s.cropByPage[pageNumber])
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const addTextAnnotation = useAnnotationStore((s) => s.addTextAnnotation)
  const addNoteAnnotation = useAnnotationStore((s) => s.addNoteAnnotation)
  const addShapeAnnotation = useAnnotationStore((s) => s.addShapeAnnotation)
  const addFreeTextAnnotation = useAnnotationStore((s) => s.addFreeTextAnnotation)
  const addSignatureAnnotation = useAnnotationStore((s) => s.addSignatureAnnotation)
  const addStampAnnotation = useAnnotationStore((s) => s.addStampAnnotation)
  const addMarkAnnotation = useAnnotationStore((s) => s.addMarkAnnotation)
  const addImageAnnotation = useAnnotationStore((s) => s.addImageAnnotation)
  const addAttachedImageAnnotation = useAnnotationStore((s) => s.addAttachedImageAnnotation)
  const addLinkAnnotation = useAnnotationStore((s) => s.addLinkAnnotation)
  const addFormFieldAnnotation = useAnnotationStore((s) => s.addFormFieldAnnotation)
  const remove = useAnnotationStore((s) => s.remove)
  const select = useAnnotationStore((s) => s.select)

  const pageTexts = useSearchStore((s) => s.pageTexts)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<CssPoint | null>(null)
  const [dragRect, setDragRect] = useState<DragRect | null>(null)
  const drawingRef = useRef<ShapeDrawing | null>(null)
  const [drawing, setDrawing] = useState<ShapeDrawing | null>(null)

  const ensurePageTexts = useCallback(async () => {
    let texts = useSearchStore.getState().pageTexts
    if (texts) return texts
    const pdf = useDocumentStore.getState().pdf
    if (!pdf) return null
    texts = await extractAllText(pdf)
    useSearchStore.setState({ pageTexts: texts })
    return texts
  }, [])

  const isTextMarkupTool = tool === 'highlight' || tool === 'underline' || tool === 'strikethrough'

  const localPoint = (e: React.PointerEvent): CssPoint | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === 'select') return
    const pt = localPoint(e)
    if (!pt) return

    if (tool === 'note') {
      const { x, y } = pointCssToPdf(viewport, pt.x, pt.y)
      addNoteAnnotation({ pageNumber, x, y, text: '', color })
      return
    }

    if (tool === 'signature') {
      const sigStore = useSignatureStore.getState()
      const active = sigStore.signatures.find((s) => s.id === sigStore.activeId) ?? sigStore.signatures[0]
      if (!active) return
      // Default width in CSS px; height derived to preserve aspect ratio.
      const targetCssWidth = 180
      const aspect = active.pxHeight / Math.max(1, active.pxWidth)
      const widthPdf = targetCssWidth / viewport.scale
      const heightPdf = widthPdf * aspect
      // Center the signature on the click point.
      const center = pointCssToPdf(viewport, pt.x, pt.y)
      const x = center.x - widthPdf / 2
      const y = center.y + heightPdf / 2 // top-left in PDF user space (y grows up)
      addSignatureAnnotation({
        pageNumber,
        x,
        y,
        width: widthPdf,
        height: heightPdf,
        dataUrl: active.dataUrl
      })
      return
    }

    if (tool === 'stamp') {
      const store = useAnnotationStore.getState()
      const pending = store.pendingStamp
      if (!pending) return
      const text = pending.withDateTime || store.stampWithDateTime
        ? `${pending.text} — ${formatStampDateTime(new Date())}`
        : pending.text
      const width = estimateStampWidth(text, STAMP_FONT_SIZE)
      const height = estimateStampHeight(STAMP_FONT_SIZE)
      // Center the stamp on the click point.
      const center = pointCssToPdf(viewport, pt.x, pt.y)
      const x = center.x - width / 2
      const y = center.y + height / 2
      addStampAnnotation({
        pageNumber,
        x,
        y,
        width,
        height,
        text,
        color: pending.color,
        fontSize: STAMP_FONT_SIZE
      })
      // Stay in Stamp mode so the user can drop more.
      return
    }

    if (tool === 'mark') {
      const kind = useAnnotationStore.getState().pendingMarkKind
      if (!kind) return
      // Marks are intentionally tiny — size in PDF user-space units, not CSS.
      const size = MARK_DEFAULT_SIZE
      const center = pointCssToPdf(viewport, pt.x, pt.y)
      const x = center.x - size / 2
      const y = center.y + size / 2
      addMarkAnnotation({
        pageNumber,
        x,
        y,
        size,
        mark: kind,
        color: '#1f2937',
        strokeWidth: MARK_DEFAULT_STROKE
      })
      return
    }

    if (tool === 'image') {
      const pending = useAnnotationStore.getState().pendingImage
      if (!pending) return
      // Default to 200 CSS px wide; preserve aspect.
      const targetCssWidth = 200
      const widthPdf = targetCssWidth / viewport.scale
      const aspect = pending.pxHeight / Math.max(1, pending.pxWidth)
      const heightPdf = widthPdf * aspect
      const center = pointCssToPdf(viewport, pt.x, pt.y)
      const x = center.x - widthPdf / 2
      const y = center.y + heightPdf / 2
      addImageAnnotation({
        pageNumber,
        x,
        y,
        width: widthPdf,
        height: heightPdf,
        dataUrl: pending.dataUrl,
        format: pending.format
      })
      return
    }

    if (tool === 'attached-image') {
      const pending = useAnnotationStore.getState().pendingAttachment
      if (!pending) return
      const size = ATTACHED_IMAGE_ICON_SIZE
      const center = pointCssToPdf(viewport, pt.x, pt.y)
      const x = center.x - size / 2
      const y = center.y + size / 2
      addAttachedImageAnnotation({
        pageNumber,
        x,
        y,
        size,
        fileName: pending.fileName,
        mimeType: pending.mimeType,
        dataUrl: pending.dataUrl
      })
      return
    }

    // Form-field placement — single click drops the field at the cursor with
    // the kind's default footprint. Suppressed while preview is on.
    if (tool.startsWith('form-')) {
      const previewing = useAnnotationStore.getState().formPreview
      if (previewing) return
      const fieldType = tool.replace('form-', '') as FormFieldKind
      const def = FORM_FIELD_DEFAULTS[fieldType]
      const { x: cx, y: cy } = pointCssToPdf(viewport, pt.x, pt.y)
      const baseName = autoFieldName(useAnnotationStore.getState().byPage, fieldType)
      addFormFieldAnnotation({
        pageNumber,
        x: cx - def.width / 2,
        y: cy + def.height / 2,
        width: def.width,
        height: def.height,
        fieldType,
        name: baseName,
        value: '',
        options: fieldType === 'dropdown' || fieldType === 'listbox' ? ['Option 1', 'Option 2'] : undefined,
        required: false,
        readonly: false,
        optionValue: fieldType === 'radio' ? 'yes' : undefined
      })
      return
    }

    if (tool === 'freetext') {
      const { x, y } = pointCssToPdf(viewport, pt.x, pt.y)
      const width = FREETEXT_DEFAULT_WIDTH_CSS / viewport.scale
      const height = FREETEXT_DEFAULT_HEIGHT_CSS / viewport.scale
      const d = useAnnotationStore.getState().freeTextDefaults
      const id = addFreeTextAnnotation({
        pageNumber,
        x,
        y,
        width,
        height,
        text: '',
        color: d.color,
        fontSize: d.fontSize,
        fontFamily: d.fontFamily,
        bold: d.bold,
        italic: d.italic,
        underline: d.underline,
        align: d.align,
        backgroundColor: d.backgroundColor,
        borderColor: d.borderColor,
        strokeWidth: d.strokeWidth
      })
      select(id)
      // Stay in Text mode — clicking another empty spot drops another box.
      // Escape exits the tool (handled at the app level).
      return
    }

    if (tool === 'shape') {
      if (shapeKind === 'ink' || shapeKind === 'marker') {
        const ds: ShapeDrawing = { kind: 'ink', points: [pt] }
        drawingRef.current = ds
        setDrawing(ds)
      } else if (shapeKind === 'rectangle' || shapeKind === 'oval' || shapeKind === 'line') {
        const ds: ShapeDrawing = { kind: 'shape', shape: shapeKind, start: pt, current: pt }
        drawingRef.current = ds
        setDrawing(ds)
      }
      // 'redact' as a Shapes-dropdown selection isn't user-facing; the Protect
      // tool sets `tool === 'redact'` directly, which is handled below.
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    // Ink and Marker are first-class freehand tools — same drawing flow as
    // shape+ink, but commit with their own shape kind so save/render can
    // style them differently (marker is translucent).
    if (tool === 'ink' || tool === 'marker') {
      const ds: ShapeDrawing = { kind: 'ink', points: [pt] }
      drawingRef.current = ds
      setDrawing(ds)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    // Redact — drag a rectangle that gets saved as a solid black rect.
    if (tool === 'redact') {
      const ds: ShapeDrawing = { kind: 'shape', shape: 'rectangle', start: pt, current: pt }
      drawingRef.current = ds
      setDrawing(ds)
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (isTextMarkupTool || tool === 'link' || tool === 'crop') {
      // Link and Crop reuse the text-markup drag-rect plumbing; commit
      // branches on tool below.
      dragStartRef.current = pt
      setDragRect({ left: pt.x, top: pt.y, width: 0, height: 0 })
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current
    if (start) {
      const pt = localPoint(e)
      if (!pt) return
      setDragRect({
        left: Math.min(start.x, pt.x),
        top: Math.min(start.y, pt.y),
        width: Math.abs(pt.x - start.x),
        height: Math.abs(pt.y - start.y)
      })
      return
    }

    const ds = drawingRef.current
    if (!ds) return
    const pt = localPoint(e)
    if (!pt) return

    if (ds.kind === 'ink') {
      const next: ShapeDrawing = { kind: 'ink', points: [...ds.points, pt] }
      drawingRef.current = next
      setDrawing(next)
    } else {
      const next: ShapeDrawing = {
        kind: 'shape',
        shape: ds.shape,
        start: ds.start,
        current: pt
      }
      drawingRef.current = next
      setDrawing(next)
    }
  }

  const onPointerUp = async (e: React.PointerEvent) => {
    const start = dragStartRef.current
    if (start) {
      dragStartRef.current = null
      setDragRect(null)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const endPt = localPoint(e)
      if (!endPt) return

      // Crop tool commits a literal rectangle as the page's cropBox.
      if (tool === 'crop') {
        const minX = Math.min(start.x, endPt.x)
        const minY = Math.min(start.y, endPt.y)
        const maxX = Math.max(start.x, endPt.x)
        const maxY = Math.max(start.y, endPt.y)
        if (maxX - minX < 6 || maxY - minY < 6) return
        // PDF crop boxes use the y-grows-up coordinate system; convert each
        // corner separately, then derive a normalized rect.
        const tl = pointCssToPdf(viewport, minX, minY)
        const br = pointCssToPdf(viewport, maxX, maxY)
        const pdfX = Math.min(tl.x, br.x)
        const pdfY = Math.min(tl.y, br.y)
        const pdfW = Math.abs(br.x - tl.x)
        const pdfH = Math.abs(tl.y - br.y)
        useAnnotationStore.getState().setCropForPage(pageNumber, {
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH
        })
        return
      }

      // Link tool commits a literal rectangle, then prompts for a URL.
      if (tool === 'link') {
        const minX = Math.min(start.x, endPt.x)
        const minY = Math.min(start.y, endPt.y)
        const maxX = Math.max(start.x, endPt.x)
        const maxY = Math.max(start.y, endPt.y)
        const wCss = maxX - minX
        const hCss = maxY - minY
        if (wCss < 6 || hCss < 6) return
        const url = window.prompt('Enter URL for this link', 'https://') ?? ''
        if (!url.trim()) return
        const tl = pointCssToPdf(viewport, minX, minY)
        addLinkAnnotation({
          pageNumber,
          x: tl.x,
          y: tl.y,
          width: wCss / viewport.scale,
          height: hCss / viewport.scale,
          url: url.trim()
        })
        return
      }

      const texts = await ensurePageTexts()
      if (!texts) return
      const pageText = texts[pageNumber - 1]
      if (!pageText) return
      const startPos = findCharAtPoint(pageText, viewport, start.x, start.y)
      const endPos = findCharAtPoint(pageText, viewport, endPt.x, endPt.y)
      if (!startPos || !endPos) return
      const ranges = flowSelection(pageText, startPos, endPos)
      if (ranges.length === 0) return
      addTextAnnotation({
        type: tool as TextAnnotation['type'],
        pageNumber,
        ranges,
        color
      })
      return
    }

    const ds = drawingRef.current
    drawingRef.current = null
    setDrawing(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!ds) return

    if (ds.kind === 'ink') {
      if (ds.points.length < 2) return
      const points = ds.points.map((p) => pointCssToPdf(viewport, p.x, p.y))
      // Tool decides the saved shape kind and stroke. Falling back to the
      // legacy fixed width keeps existing Shapes→Ink behavior identical.
      const inkShape: 'ink' | 'marker' = tool === 'marker' ? 'marker' : 'ink'
      const sw = tool === 'ink' || tool === 'marker' ? strokeWidth : SHAPE_STROKE_WIDTH
      addShapeAnnotation({
        shape: inkShape,
        pageNumber,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        points,
        color,
        strokeWidth: sw
      })
    } else {
      const { start: s, current: c, shape } = ds
      if (Math.abs(c.x - s.x) < SHAPE_MIN_SIZE_CSS && Math.abs(c.y - s.y) < SHAPE_MIN_SIZE_CSS) {
        return
      }
      const p1 = pointCssToPdf(viewport, s.x, s.y)
      const p2 = pointCssToPdf(viewport, c.x, c.y)
      // Redact piggybacks on the rectangle drawing flow; commit it with its own
      // shape kind so save/render fill it solid black instead of drawing a border.
      const finalShape = tool === 'redact' ? 'redact' : shape
      const finalColor = tool === 'redact' ? '#000000' : color
      addShapeAnnotation({
        shape: finalShape,
        pageNumber,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        color: finalColor,
        strokeWidth: SHAPE_STROKE_WIDTH
      })
    }
  }

  const onPointerCancel = () => {
    dragStartRef.current = null
    setDragRect(null)
    drawingRef.current = null
    setDrawing(null)
  }

  const renderedRects = (() => {
    if (!pageTexts) return []
    const pageText = pageTexts[pageNumber - 1]
    if (!pageText) return []
    const all = []
    for (const ann of pageAnnotations) {
      if (ann.kind !== 'text') continue
      all.push(
        ...textAnnotationRects(ann, pageText, viewport, (item, range) =>
          computeRangeRect(item, range, viewport)
        )
      )
    }
    return all
  })()

  const notes = pageAnnotations.filter((a): a is NoteAnnotation => a.kind === 'note')
  const shapes = pageAnnotations.filter((a): a is ShapeAnnotation => a.kind === 'shape')
  const freetexts = pageAnnotations.filter((a): a is FreeTextAnnotation => a.kind === 'freetext')
  const signatures = pageAnnotations.filter((a): a is SignatureAnnotation => a.kind === 'signature')
  const stamps = pageAnnotations.filter((a): a is StampAnnotation => a.kind === 'stamp')
  const marks = pageAnnotations.filter((a): a is MarkAnnotation => a.kind === 'mark')
  const images = pageAnnotations.filter((a): a is ImageAnnotation => a.kind === 'image')
  const attachedImages = pageAnnotations.filter(
    (a): a is AttachedImageAnnotation => a.kind === 'attached-image'
  )
  const links = pageAnnotations.filter((a): a is LinkAnnotation => a.kind === 'link')
  const formFields = pageAnnotations.filter((a): a is FormFieldAnnotation => a.kind === 'form-field')

  const cursor = (() => {
    switch (tool) {
      case 'note':
        return 'cell'
      case 'highlight':
      case 'underline':
      case 'strikethrough':
        return 'text'
      case 'shape':
      case 'ink':
      case 'marker':
        return 'crosshair'
      case 'freetext':
        return 'text'
      case 'signature':
        return 'copy'
      case 'stamp':
        return 'copy'
      case 'mark':
      case 'image':
      case 'attached-image':
        return 'copy'
      case 'link':
        return 'crosshair'
      case 'edit-content':
        return 'default'
      case 'form-text':
      case 'form-checkbox':
      case 'form-radio':
      case 'form-dropdown':
      case 'form-listbox':
        return 'crosshair'
      case 'crop':
      case 'redact':
        return 'crosshair'
      default:
        return 'default'
    }
  })()

  const editMode = tool === 'edit-content'
  const editableRegions = useAnnotationStore((s) => s.editableRegions[pageNumber])
  const setEditableRegions = useAnnotationStore((s) => s.setEditableRegions)

  // Lazily detect regions on this page when entering Edit Text & Image mode.
  // We don't pass a sample canvas yet — color sampling needs the rendered
  // page canvas, which lives in PdfPage; v1 falls back to black text.
  useEffect(() => {
    if (!editMode) return
    if (editableRegions !== undefined) return
    let cancelled = false
    const pdf = useDocumentStore.getState().pdf
    if (!pdf) return
    void extractEditableRegions(pdf, pageNumber, null).then((regions) => {
      if (cancelled) return
      setEditableRegions(pageNumber, regions)
    })
    return () => {
      cancelled = true
    }
  }, [editMode, editableRegions, pageNumber, setEditableRegions])

  const interactive = tool !== 'select'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        cursor,
        pointerEvents: interactive ? 'auto' : 'none'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Highlight / underline / strikethrough overlay */}
      {renderedRects.map((r, i) => {
        const isSelected = r.annotationId === selectedId
        const base = {
          position: 'absolute' as const,
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height
        }
        const style: React.CSSProperties =
          r.variant === 'highlight'
            ? { ...base, background: r.color, opacity: 0.4, mixBlendMode: 'multiply' }
            : { ...base, background: r.color }
        return (
          <div
            key={`${r.annotationId}-${i}`}
            className={isSelected ? 'outline outline-2 outline-blue-500' : ''}
            style={{ ...style, pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation()
              select(r.annotationId === selectedId ? null : r.annotationId)
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId === r.annotationId) {
                remove(r.annotationId)
              }
            }}
            tabIndex={isSelected ? 0 : -1}
          />
        )
      })}

      {/* Text-markup drag preview */}
      {dragRect && (dragRect.width > 1 || dragRect.height > 1) && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: dragRect.left,
            top: dragRect.top,
            width: dragRect.width,
            height: dragRect.height,
            background: color,
            opacity: 0.2,
            outline: `1px dashed ${color}`
          }}
        />
      )}

      {/* SVG layer for shapes + shape drawing preview */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={viewport.width}
        height={viewport.height}
        style={{ overflow: 'visible' }}
      >
        {shapes.map((s) => (
          <ShapeElement
            key={s.id}
            shape={s}
            viewport={viewport}
            isSelected={selectedId === s.id}
            onSelect={() => select(selectedId === s.id ? null : s.id)}
          />
        ))}
        {drawing && (
          <DrawingPreview
            drawing={drawing}
            color={color}
            inkStrokeWidth={
              (tool === 'ink' || tool === 'marker' ? strokeWidth : SHAPE_STROKE_WIDTH) *
              viewport.scale
            }
            inkOpacity={tool === 'marker' ? 0.4 : 1}
          />
        )}
      </svg>

      {/* Free-text boxes */}
      <div className="absolute inset-0 pointer-events-none">
        {freetexts.map((f) => (
          <FreeTextBox key={f.id} freetext={f} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Signatures */}
      <div className="absolute inset-0 pointer-events-none">
        {signatures.map((s) => (
          <SignatureBox key={s.id} signature={s} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Stamps */}
      <div className="absolute inset-0 pointer-events-none">
        {stamps.map((s) => (
          <StampBox key={s.id} stamp={s} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Marks */}
      <div className="absolute inset-0 pointer-events-none">
        {marks.map((m) => (
          <MarkBox key={m.id} mark={m} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Inserted images */}
      <div className="absolute inset-0 pointer-events-none">
        {images.map((img) => (
          <ImageBox key={img.id} image={img} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Attached-image icons */}
      <div className="absolute inset-0 pointer-events-none">
        {attachedImages.map((a) => (
          <AttachedImageBox key={a.id} attached={a} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Link rectangles */}
      <div className="absolute inset-0 pointer-events-none">
        {links.map((l) => (
          <LinkBox key={l.id} link={l} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Form fields (design or preview mode) */}
      <div className="absolute inset-0 pointer-events-none">
        {formFields.map((f) => (
          <FormFieldBox key={f.id} field={f} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Crop preview — fades the area outside the crop rectangle. */}
      {cropRect && (
        <CropPreview rect={cropRect} viewport={viewport} pageNumber={pageNumber} />
      )}

      {/* Sticky notes */}
      <div className="absolute inset-0 pointer-events-none">
        {notes.map((n) => (
          <StickyNote key={n.id} note={n} viewport={viewport} containerRef={containerRef} />
        ))}
      </div>

      {/* Editable text regions (Edit Text & Image mode) */}
      {editMode && editableRegions && (
        <div className="absolute inset-0 pointer-events-none">
          {editableRegions.map((r) => (
            <EditableRegion key={r.id} region={r} viewport={viewport} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Format `YYYY-MM-DD HH:MM` for the "Stamp with date and time" toggle. */
/** Crop visualization: dims the area outside the saved crop rectangle and
 *  shows a small "Clear crop" affordance in its top-right. */
function CropPreview({
  rect,
  viewport,
  pageNumber
}: {
  rect: { x: number; y: number; width: number; height: number }
  viewport: import('pdfjs-dist').PageViewport
  pageNumber: number
}): JSX.Element {
  const tl = pointPdfToCss(viewport, rect.x, rect.y + rect.height)
  const widthCss = rect.width * viewport.scale
  const heightCss = rect.height * viewport.scale
  return (
    <>
      {/* Four overlay strips dim everything outside the rect. */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(15, 23, 42, 0.35)', clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${tl.top}px, ${tl.left}px ${tl.top}px, ${tl.left}px ${tl.top + heightCss}px, ${tl.left + widthCss}px ${tl.top + heightCss}px, ${tl.left + widthCss}px ${tl.top}px, 0 ${tl.top}px)` }} />
      <div
        className="absolute pointer-events-none border-2 border-blue-500"
        style={{ left: tl.left, top: tl.top, width: widthCss, height: heightCss }}
      />
      <button
        onClick={(e) => {
          e.stopPropagation()
          useAnnotationStore.getState().setCropForPage(pageNumber, null)
        }}
        title="Clear crop on this page"
        className="absolute h-6 px-2 text-[11px] rounded bg-blue-500 text-white shadow pointer-events-auto"
        style={{ left: tl.left + widthCss - 80, top: Math.max(2, tl.top - 28) }}
      >
        Clear crop
      </button>
    </>
  )
}

/** Generate a unique-ish field name like `text1`, `text2`, scanning every page
 *  for existing FormFieldAnnotations of the same kind. Radio groups intentionally
 *  share names within the same kind so users can co-locate them by hand. */
function autoFieldName(byPage: Record<number, Annotation[]>, kind: FormFieldKind): string {
  const prefix = kind === 'checkbox' ? 'check' : kind === 'radio' ? 'radio' : kind
  let max = 0
  const re = new RegExp(`^${prefix}(\\d+)$`)
  for (const arr of Object.values(byPage)) {
    for (const a of arr) {
      if (a.kind !== 'form-field' || a.fieldType !== kind) continue
      const m = re.exec(a.name)
      if (m) {
        const n = Number(m[1])
        if (n > max) max = n
      }
    }
  }
  return `${prefix}${max + 1}`
}

function formatStampDateTime(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function ShapeElement({
  shape,
  viewport,
  isSelected,
  onSelect
}: {
  shape: ShapeAnnotation
  viewport: PageViewport
  isSelected: boolean
  onSelect: () => void
}) {
  const sw = shape.strokeWidth * viewport.scale
  const isMarker = shape.shape === 'marker'
  const commonProps = {
    fill: 'none' as const,
    stroke: shape.color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity: isMarker ? 0.4 : 1,
    style: {
      pointerEvents: 'visiblePainted' as const,
      cursor: 'pointer'
    },
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      onSelect()
    }
  }
  const selectedOutline = isSelected
    ? {
        filter: 'drop-shadow(0 0 0 #3b82f6)'
      }
    : undefined

  if ((shape.shape === 'ink' || shape.shape === 'marker') && shape.points && shape.points.length >= 2) {
    const cssPts = shape.points.map((p) => pointPdfToCss(viewport, p.x, p.y))
    let d = `M ${cssPts[0].left} ${cssPts[0].top}`
    for (let i = 1; i < cssPts.length; i++) {
      d += ` L ${cssPts[i].left} ${cssPts[i].top}`
    }
    return (
      <g style={selectedOutline}>
        <path d={d} {...commonProps} />
        {isSelected && (
          <path
            d={d}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={sw + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.25}
            pointerEvents="none"
          />
        )}
      </g>
    )
  }

  const p1 = pointPdfToCss(viewport, shape.x1, shape.y1)
  const p2 = pointPdfToCss(viewport, shape.x2, shape.y2)

  if (shape.shape === 'line') {
    return (
      <g style={selectedOutline}>
        {isSelected && (
          <line
            x1={p1.left}
            y1={p1.top}
            x2={p2.left}
            y2={p2.top}
            stroke="#3b82f6"
            strokeWidth={sw + 4}
            opacity={0.25}
            pointerEvents="none"
          />
        )}
        <line x1={p1.left} y1={p1.top} x2={p2.left} y2={p2.top} {...commonProps} />
      </g>
    )
  }

  const x = Math.min(p1.left, p2.left)
  const y = Math.min(p1.top, p2.top)
  const w = Math.abs(p2.left - p1.left)
  const h = Math.abs(p2.top - p1.top)

  if (shape.shape === 'rectangle') {
    return (
      <g>
        {isSelected && (
          <rect
            x={x - 2}
            y={y - 2}
            width={w + 4}
            height={h + 4}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
        <rect x={x} y={y} width={w} height={h} {...commonProps} />
      </g>
    )
  }

  // Redact — opaque black fill, no border. Behavior matches save: the saved
  // PDF gets a solid black rectangle over the content.
  if (shape.shape === 'redact') {
    return (
      <g>
        {isSelected && (
          <rect
            x={x - 2}
            y={y - 2}
            width={w + 4}
            height={h + 4}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="#000000"
          stroke="none"
          style={{ pointerEvents: 'visiblePainted', cursor: 'pointer' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onSelect() }}
        />
      </g>
    )
  }

  // oval
  const cx = (p1.left + p2.left) / 2
  const cy = (p1.top + p2.top) / 2
  const rx = w / 2
  const ry = h / 2
  return (
    <g>
      {isSelected && (
        <rect
          x={x - 2}
          y={y - 2}
          width={w + 4}
          height={h + 4}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...commonProps} />
    </g>
  )
}

function DrawingPreview({
  drawing,
  color,
  inkStrokeWidth,
  inkOpacity
}: {
  drawing: ShapeDrawing
  color: string
  /** Stroke width (CSS px) applied to in-flight ink/marker strokes. */
  inkStrokeWidth: number
  /** Translucency for marker mode — 1 for ink. */
  inkOpacity: number
}) {
  const commonProps = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: SHAPE_STROKE_WIDTH,
    strokeDasharray: '4 3',
    opacity: 0.8,
    pointerEvents: 'none' as const
  }

  if (drawing.kind === 'ink') {
    if (drawing.points.length < 2) return null
    let d = `M ${drawing.points[0].x} ${drawing.points[0].y}`
    for (let i = 1; i < drawing.points.length; i++) {
      d += ` L ${drawing.points[i].x} ${drawing.points[i].y}`
    }
    return (
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={inkStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={inkOpacity}
        pointerEvents="none"
      />
    )
  }

  const { start, current, shape } = drawing
  if (shape === 'line') {
    return <line x1={start.x} y1={start.y} x2={current.x} y2={current.y} {...commonProps} strokeLinecap="round" />
  }
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  const w = Math.abs(current.x - start.x)
  const h = Math.abs(current.y - start.y)
  if (shape === 'rectangle') {
    return <rect x={x} y={y} width={w} height={h} {...commonProps} />
  }
  return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...commonProps} />
}

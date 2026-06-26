import * as pdfjsLib from 'pdfjs-dist'
import type { PageViewport } from 'pdfjs-dist'
import type { MatchRange, PageText, Rect, TextItem } from './search'
import { cumulativeCharWidths } from './search'

export type AnnotationType = 'highlight' | 'underline' | 'strikethrough' | 'note'

export type TextAnnotation = {
  id: string
  kind: 'text'
  type: 'highlight' | 'underline' | 'strikethrough'
  pageNumber: number
  ranges: MatchRange[]
  color: string
  createdAt: number
}

export type NoteAnnotation = {
  id: string
  kind: 'note'
  type: 'note'
  pageNumber: number
  /** Position in PDF user-space coordinates so the note moves with zoom. */
  x: number
  y: number
  text: string
  color: string
  createdAt: number
}

export type ShapeKind = 'rectangle' | 'oval' | 'line' | 'ink' | 'marker' | 'redact'

export type ShapeAnnotation = {
  id: string
  kind: 'shape'
  shape: ShapeKind
  pageNumber: number
  /** PDF user-space coords. For rect/oval/line: two corners or endpoints. For ink: ignored (use `points`). */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Ordered points in PDF user space (ink only). */
  points?: { x: number; y: number }[]
  color: string
  /** Stroke width in PDF user-space units (PDF points). */
  strokeWidth: number
  createdAt: number
}

export type FontFamily = 'Helvetica' | 'Times' | 'Courier'
export type TextAlign = 'left' | 'center' | 'right'

export type FreeTextAnnotation = {
  id: string
  kind: 'freetext'
  pageNumber: number
  /** Top-left corner in PDF user space. */
  x: number
  y: number
  /** Box dimensions in PDF user space. */
  width: number
  height: number
  text: string
  /** Text color. */
  color: string
  /** Font size in PDF user-space units. */
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
  /** Box background fill color; null = transparent. */
  backgroundColor: string | null
  /** Box border stroke color; null = no border. */
  borderColor: string | null
  /** Border stroke width in PDF user-space units. Ignored when borderColor is null. */
  strokeWidth: number
  createdAt: number
}

export const FONT_FAMILIES: { id: FontFamily; label: string; css: string }[] = [
  { id: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { id: 'Times', label: 'Times', css: '"Times New Roman", Times, serif' },
  { id: 'Courier', label: 'Courier', css: '"Courier New", Courier, monospace' }
]

export const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64] as const

export const TEXT_COLORS = [
  // Row 1 — neutrals
  { name: 'black', hex: '#000000' },
  { name: 'dark gray', hex: '#404040' },
  { name: 'gray', hex: '#737373' },
  { name: 'light gray', hex: '#d4d4d4' },
  { name: 'white', hex: '#ffffff' },
  { name: 'brown', hex: '#92400e' },
  // Row 2 — warms
  { name: 'dark red', hex: '#b91c1c' },
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'lime', hex: '#84cc16' },
  // Row 3 — cools
  { name: 'green', hex: '#22c55e' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'sky', hex: '#0ea5e9' },
  { name: 'blue', hex: '#3b82f6' },
  // Row 4 — purples / pinks
  { name: 'indigo', hex: '#6366f1' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'fuchsia', hex: '#d946ef' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'rose', hex: '#f43f5e' }
] as const

export type SignatureAnnotation = {
  id: string
  kind: 'signature'
  pageNumber: number
  /** Top-left corner in PDF user space. */
  x: number
  y: number
  /** Box dimensions in PDF user space. */
  width: number
  height: number
  /** PNG data URL — encodes the signature image with transparent background. */
  dataUrl: string
  createdAt: number
}

export type StampAnnotation = {
  id: string
  kind: 'stamp'
  pageNumber: number
  /** Top-left in PDF user space. */
  x: number
  y: number
  /** Box dimensions in PDF user space (text + padding). */
  width: number
  height: number
  /** Stamp label. */
  text: string
  /** Border + text color (hex). */
  color: string
  /** Font size in PDF user-space units. Stamps render as bold italic. */
  fontSize: number
  createdAt: number
}

/** Quick Fill & Sign mark types: the six glyphs shown in the toolbar grid. */
export type MarkKind = 'check' | 'cross' | 'dot' | 'dash' | 'square' | 'circle'

export type MarkAnnotation = {
  id: string
  kind: 'mark'
  pageNumber: number
  /** Top-left in PDF user space. */
  x: number
  y: number
  /** Always square; size in PDF user-space units. */
  size: number
  mark: MarkKind
  color: string
  /** Stroke width in PDF user-space units. */
  strokeWidth: number
  createdAt: number
}

/** Visible image dropped on the page (Fill & Sign → Image). Distinct from
 *  SignatureAnnotation so the UI and saved metadata aren't confused. */
export type ImageAnnotation = {
  id: string
  kind: 'image'
  pageNumber: number
  /** Top-left in PDF user space (y grows up). */
  x: number
  y: number
  width: number
  height: number
  /** PNG or JPEG data URL. */
  dataUrl: string
  /** Encoded format — determines whether to embed via embedPng or embedJpg. */
  format: 'png' | 'jpeg'
  createdAt: number
}

/** A PDF file-attachment marker — paperclip icon on the page + embedded file
 *  in the PDF's EmbeddedFiles dictionary. The displayed icon is just a hint;
 *  the real payload travels with the saved PDF. */
export type AttachedImageAnnotation = {
  id: string
  kind: 'attached-image'
  pageNumber: number
  /** Icon top-left in PDF user space. */
  x: number
  y: number
  /** Icon footprint — typically small (20–24 PDF units). */
  size: number
  /** Original file name to embed (preserved for reader Save-As). */
  fileName: string
  /** MIME type, used for the FileSpec entry. */
  mimeType: string
  /** Embedded file payload as a data URL. */
  dataUrl: string
  createdAt: number
}

export const MARK_DEFAULT_SIZE = 16
export const MARK_DEFAULT_STROKE = 2
export const ATTACHED_IMAGE_ICON_SIZE = 22

/** Clickable URL rectangle. Saved as a /Subtype /Link annotation with a
 *  /URI action so PDF readers open it in a browser. */
export type LinkAnnotation = {
  id: string
  kind: 'link'
  pageNumber: number
  /** Rect top-left in PDF user space (y grows up). */
  x: number
  y: number
  width: number
  height: number
  url: string
  createdAt: number
}

/** Document-wide decorations applied at save time. */
export type WatermarkSettings = {
  enabled: boolean
  text: string
  color: string
  opacity: number
  fontSize: number
  /** Rotation in degrees; 0 = horizontal, 45 = diagonal. */
  rotation: number
}

export type HeaderFooterSettings = {
  enabled: boolean
  headerLeft: string
  headerCenter: string
  headerRight: string
  footerLeft: string
  footerCenter: string
  footerRight: string
  /** Font size in PDF points for header/footer text. */
  fontSize: number
  color: string
  /** Distance from page edge in PDF user-space units. */
  margin: number
}

export type PageNumberPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** Available formats; `{n}` = current page, `{N}` = total pages. */
export type PageNumberFormat = '{n}' | '{n} / {N}' | 'Page {n}' | 'Page {n} of {N}'

export type PageNumberSettings = {
  enabled: boolean
  position: PageNumberPosition
  format: PageNumberFormat
  /** Number to assign to the first page (defaults to 1). */
  startFrom: number
  fontSize: number
  color: string
  margin: number
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  text: 'CONFIDENTIAL',
  color: '#9ca3af',
  opacity: 0.25,
  fontSize: 72,
  rotation: 45
}

export const DEFAULT_HEADER_FOOTER: HeaderFooterSettings = {
  enabled: false,
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
  fontSize: 9,
  color: '#525252',
  margin: 24
}

export const DEFAULT_PAGE_NUMBER: PageNumberSettings = {
  enabled: false,
  position: 'bottom-center',
  format: '{n} / {N}',
  startFrom: 1,
  fontSize: 9,
  color: '#525252',
  margin: 24
}

/** Kinds of fillable PDF form fields surfaced in the Form tab. */
export type FormFieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'listbox'

export type FormFieldAnnotation = {
  id: string
  kind: 'form-field'
  pageNumber: number
  /** Top-left in PDF user space. */
  x: number
  y: number
  width: number
  height: number
  fieldType: FormFieldKind
  /** Unique field name within the document. AcroForm uses this as the
   *  internal /T name; for radio buttons sharing a name forms a group. */
  name: string
  /** Initial value. For checkbox: '' (unchecked) or 'on'. For radio: the
   *  option that should be selected. For dropdown/listbox: one of the
   *  options. For text: free-form. */
  value: string
  /** Options for dropdown / listbox / radio. */
  options?: string[]
  required: boolean
  readonly: boolean
  /** For radio buttons: which option this individual widget represents.
   *  All radios with the same `name` form a group; the one whose
   *  `optionValue === value` shows as checked. */
  optionValue?: string
  createdAt: number
}

/** Default footprints in PDF user-space units per field kind. */
export const FORM_FIELD_DEFAULTS: Record<FormFieldKind, { width: number; height: number }> = {
  text: { width: 160, height: 22 },
  checkbox: { width: 16, height: 16 },
  radio: { width: 16, height: 16 },
  dropdown: { width: 160, height: 22 },
  listbox: { width: 160, height: 80 }
}

/** Per-paragraph editable region detected on a page in Edit mode. Persisted
 *  in the store for the lifetime of the document so the save pipeline can
 *  rebuild the visible text. Not an annotation — never appears in `byPage`. */
export type EditableTextRegion = {
  id: string
  pageNumber: number
  /** PDF user-space top-left. */
  x: number
  y: number
  width: number
  height: number
  /** Concatenated original text — used to pre-populate the editor and to
   *  decide whether the region is "edited" (i.e. value differs). */
  originalText: string
  /** Detected font size in PDF user-space units. */
  fontSize: number
  /** Detected line height in PDF user-space units. */
  lineHeight: number
  /** CSS font family stack for rendering the overlay. */
  fontFamily: string
  /** Resolved hex color sampled from the canvas at the item's center. */
  color: string
  /** Heuristic font-style flags from the embedded font name. */
  bold: boolean
  italic: boolean
}

export type StampPreset = {
  id: string
  label: string
  color: string
}

/** Preset stamps shown in the toolbar — five "approval/positive" greens, five "warning/restrictive" reds. */
export const STAMP_PRESETS: { greens: StampPreset[]; reds: StampPreset[] } = {
  greens: [
    { id: 'approved', label: 'Approved', color: '#22c55e' },
    { id: 'final', label: 'Final', color: '#22c55e' },
    { id: 'nfpr-green', label: 'NotForPublicRelease', color: '#22c55e' },
    { id: 'draft', label: 'Draft', color: '#22c55e' },
    { id: 'experimental', label: 'Experimental', color: '#22c55e' }
  ],
  reds: [
    { id: 'not-approved', label: 'NotApproved', color: '#ef4444' },
    { id: 'nfpr-red', label: 'NotForPublicRelease', color: '#ef4444' },
    { id: 'confidential', label: 'Confidential', color: '#ef4444' },
    { id: 'sold', label: 'Sold', color: '#ef4444' },
    { id: 'topsecret', label: 'TopSecret', color: '#ef4444' }
  ]
}

/** Default stamp font size in PDF user-space units (≈ 18 CSS px at scale 1). */
export const STAMP_FONT_SIZE = 18

/** Horizontal padding inside a stamp box (PDF user-space units). */
export const STAMP_PAD_X = 14

/** Vertical padding inside a stamp box (PDF user-space units). */
export const STAMP_PAD_Y = 8

/** Approximate width-of-text for HelveticaBoldOblique at the given font size.
 *  Used only to size the box at placement time; the on-screen text autosizes. */
export function estimateStampWidth(text: string, fontSize: number): number {
  // ≈0.58 advance per char for HelveticaBoldOblique at typical proportions.
  return Math.max(60, text.length * fontSize * 0.58 + STAMP_PAD_X * 2)
}

export function estimateStampHeight(fontSize: number): number {
  return fontSize + STAMP_PAD_Y * 2
}

export type Annotation =
  | TextAnnotation
  | NoteAnnotation
  | ShapeAnnotation
  | FreeTextAnnotation
  | SignatureAnnotation
  | StampAnnotation
  | MarkAnnotation
  | ImageAnnotation
  | AttachedImageAnnotation
  | LinkAnnotation
  | FormFieldAnnotation

export const ANNOTATION_COLORS = [
  { name: 'yellow', hex: '#fde047' },
  { name: 'green', hex: '#86efac' },
  { name: 'blue', hex: '#93c5fd' },
  { name: 'pink', hex: '#f9a8d4' },
  { name: 'orange', hex: '#fdba74' },
  { name: 'purple', hex: '#c4b5fd' }
] as const

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export type CharPosition = { itemIndex: number; charOffset: number }

/**
 * Find the (itemIndex, charOffset) closest to a CSS-px point on the page.
 *
 * Weights vertical distance heavily so a click between words on the same line
 * always lands on that line rather than jumping to an item on another line.
 */
export function findCharAtPoint(
  pageText: PageText,
  viewport: PageViewport,
  cssX: number,
  cssY: number
): CharPosition | null {
  if (pageText.items.length === 0) return null
  const Util = pdfjsLib.Util
  const [px, py] = Util.applyInverseTransform([cssX, cssY], viewport.transform)

  let bestItem = -1
  let bestDist = Infinity
  for (let i = 0; i < pageText.items.length; i++) {
    const item = pageText.items[i]
    if (item.width <= 0 || item.height <= 0 || item.str.length === 0) continue
    const ix0 = item.transform[4]
    const iy0 = item.transform[5]
    const ix1 = ix0 + item.width
    const iy1 = iy0 + item.height

    let vDist = 0
    if (py < iy0) vDist = iy0 - py
    else if (py > iy1) vDist = py - iy1

    let hDist = 0
    if (px < ix0) hDist = ix0 - px
    else if (px > ix1) hDist = px - ix1

    const dist = vDist * 10000 + hDist
    if (dist < bestDist) {
      bestDist = dist
      bestItem = i
    }
  }

  if (bestItem < 0) return null
  const item = pageText.items[bestItem]
  const widths = cumulativeCharWidths(item)
  const targetX = px - item.transform[4]
  let bestChar = 0
  let bestCharDist = Math.abs(widths[0] - targetX)
  for (let c = 1; c < widths.length; c++) {
    const d = Math.abs(widths[c] - targetX)
    if (d < bestCharDist) {
      bestCharDist = d
      bestChar = c
    }
  }
  return { itemIndex: bestItem, charOffset: bestChar }
}

/**
 * Reading-order selection between two char positions.
 * Walks pageText.items in index order (which is reading order for typical PDFs):
 *   first item: from start.charOffset to item end
 *   middle items: full
 *   last item: from item start to end.charOffset
 */
export function flowSelection(
  pageText: PageText,
  startPos: CharPosition,
  endPos: CharPosition
): MatchRange[] {
  let s = startPos
  let e = endPos
  if (
    s.itemIndex > e.itemIndex ||
    (s.itemIndex === e.itemIndex && s.charOffset > e.charOffset)
  ) {
    ;[s, e] = [e, s]
  }
  const ranges: MatchRange[] = []
  if (s.itemIndex === e.itemIndex) {
    if (e.charOffset > s.charOffset) {
      ranges.push({ itemIndex: s.itemIndex, start: s.charOffset, end: e.charOffset })
    }
    return ranges
  }
  const firstItem = pageText.items[s.itemIndex]
  if (firstItem && firstItem.str.length > s.charOffset) {
    ranges.push({ itemIndex: s.itemIndex, start: s.charOffset, end: firstItem.str.length })
  }
  for (let i = s.itemIndex + 1; i < e.itemIndex; i++) {
    const item = pageText.items[i]
    if (item.str.length > 0) {
      ranges.push({ itemIndex: i, start: 0, end: item.str.length })
    }
  }
  if (e.charOffset > 0) {
    ranges.push({ itemIndex: e.itemIndex, start: 0, end: e.charOffset })
  }
  return ranges
}

/**
 * Compute text-item char ranges intersected by a drag rectangle.
 *
 * Inputs in CSS px relative to the page canvas. Works in PDF user space internally
 * to keep math correct under any viewport scale/rotation. Retained for potential
 * "snapshot" / rect-select tools; flow selection is preferred for text annotations.
 */
export function rectToTextRanges(
  pageText: PageText,
  viewport: PageViewport,
  cssRect: Rect
): MatchRange[] {
  const Util = pdfjsLib.Util
  const p1 = Util.applyInverseTransform([cssRect.left, cssRect.top], viewport.transform)
  const p2 = Util.applyInverseTransform(
    [cssRect.left + cssRect.width, cssRect.top + cssRect.height],
    viewport.transform
  )
  const xMin = Math.min(p1[0], p2[0])
  const xMax = Math.max(p1[0], p2[0])
  const yMin = Math.min(p1[1], p2[1])
  const yMax = Math.max(p1[1], p2[1])

  const out: MatchRange[] = []
  for (let i = 0; i < pageText.items.length; i++) {
    const item = pageText.items[i]
    const ix = item.transform[4]
    const iyBase = item.transform[5]
    const iyTop = iyBase + item.height
    const iWidth = item.width
    if (iWidth <= 0 || item.height <= 0) continue
    // Vertical overlap: item spans [iyBase, iyTop]
    if (iyTop < yMin || iyBase > yMax) continue
    // Horizontal overlap: item spans [ix, ix + iWidth]
    if (ix + iWidth < xMin || ix > xMax) continue

    const startX = Math.max(0, xMin - ix)
    const endX = Math.min(iWidth, xMax - ix)
    if (endX <= startX) continue

    const widths = cumulativeCharWidths(item)
    const startChar = lowerBound(widths, startX, 'start')
    const endChar = lowerBound(widths, endX, 'end')
    if (endChar <= startChar) continue
    out.push({ itemIndex: i, start: startChar, end: endChar })
  }
  return out
}

/**
 * Bisect cumulative widths.
 * - 'start': first index whose width >= target (rounds inward — char fully past the target).
 * - 'end':   last index whose width <= target (rounds inward — char fully before the target).
 */
function lowerBound(widths: number[], target: number, mode: 'start' | 'end'): number {
  // Binary search over a sorted ascending array.
  let lo = 0
  let hi = widths.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (widths[mid] < target) lo = mid + 1
    else hi = mid
  }
  if (mode === 'start') {
    // widths[lo] is first >= target; clamp.
    return Math.max(0, Math.min(widths.length - 1, lo))
  }
  // 'end': largest index whose width <= target.
  if (widths[lo] > target && lo > 0) lo -= 1
  return Math.max(0, Math.min(widths.length - 1, lo))
}

export type RenderedAnnotationRect = Rect & {
  variant: 'highlight' | 'underline' | 'strikethrough'
  color: string
  annotationId: string
}

const UNDERLINE_THICKNESS = 2
const STRIKE_THICKNESS = 2

export function textAnnotationRects(
  ann: TextAnnotation,
  pageText: PageText,
  viewport: PageViewport,
  computeRect: (item: TextItem, range: MatchRange) => Rect
): RenderedAnnotationRect[] {
  const out: RenderedAnnotationRect[] = []
  for (const range of ann.ranges) {
    const item = pageText.items[range.itemIndex]
    if (!item) continue
    const rect = computeRect(item, range)
    if (ann.type === 'highlight') {
      out.push({ ...rect, variant: 'highlight', color: ann.color, annotationId: ann.id })
    } else if (ann.type === 'underline') {
      out.push({
        left: rect.left,
        top: rect.top + rect.height - UNDERLINE_THICKNESS,
        width: rect.width,
        height: UNDERLINE_THICKNESS,
        variant: 'underline',
        color: ann.color,
        annotationId: ann.id
      })
    } else {
      out.push({
        left: rect.left,
        top: rect.top + rect.height / 2 - STRIKE_THICKNESS / 2,
        width: rect.width,
        height: STRIKE_THICKNESS,
        variant: 'strikethrough',
        color: ann.color,
        annotationId: ann.id
      })
    }
  }
  // mark viewport as used so TS doesn't complain about unused parameter
  void viewport
  return out
}

/**
 * Convert a CSS-px point on the page to PDF user-space coords.
 * Used for placing sticky-note anchors that survive zoom.
 */
export function pointCssToPdf(viewport: PageViewport, cssX: number, cssY: number): { x: number; y: number } {
  const [x, y] = pdfjsLib.Util.applyInverseTransform([cssX, cssY], viewport.transform)
  return { x, y }
}

export function pointPdfToCss(viewport: PageViewport, x: number, y: number): { left: number; top: number } {
  const [cx, cy] = pdfjsLib.Util.applyTransform([x, y], viewport.transform)
  return { left: cx, top: cy }
}

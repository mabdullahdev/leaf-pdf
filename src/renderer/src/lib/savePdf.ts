import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFRef
} from 'pdf-lib'
import type {
  Annotation,
  AttachedImageAnnotation,
  EditableTextRegion,
  FontFamily,
  FormFieldAnnotation,
  FreeTextAnnotation,
  HeaderFooterSettings,
  ImageAnnotation,
  LinkAnnotation,
  MarkAnnotation,
  NoteAnnotation,
  PageNumberSettings,
  ShapeAnnotation,
  SignatureAnnotation,
  StampAnnotation,
  TextAnnotation,
  WatermarkSettings
} from './annotations'
import { cumulativeCharWidths, type PageText } from './search'

const AUTHOR = 'PDFgear'
const NOTE_ICON_SIZE = 18 // PDF user-space units for the sticky-note rect

/**
 * Bake the in-memory annotations into the supplied PDF bytes and return new bytes.
 *
 * NOTE: This always applies the *full* annotation set to the *originally loaded* bytes.
 * Calling it twice in a session is idempotent. Saving across sessions (closing and reopening
 * an already-annotated PDF, then saving again) will duplicate annotations — we don't yet
 * read embedded annotations back into the editor.
 */
export type DocumentDecor = {
  watermark?: WatermarkSettings
  headerFooter?: HeaderFooterSettings
  pageNumbering?: PageNumberSettings
}

export type RegionEdits = {
  /** Per-page detected regions, keyed by page number. Captured at edit time. */
  editableRegions?: Record<number, EditableTextRegion[]>
  /** regionId → new text. Only present when the user actually changed something. */
  editedRegions?: Record<string, string>
}

/** Per-page crop rectangle in PDF user space. */
export type PageCrops = Record<number, { x: number; y: number; width: number; height: number }>

export async function applyAnnotationsToPdf(
  originalBytes: Uint8Array,
  byPage: Record<number, Annotation[]>,
  pageTexts: PageText[] | null,
  decor: DocumentDecor = {},
  regionEdits: RegionEdits = {},
  pageCrops: PageCrops = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, { updateMetadata: false })
  const pages = pdfDoc.getPages()

  // Lazily embed standard fonts only as needed.
  const fontCache = new Map<StandardFonts, PDFFont>()
  const getFont = async (key: StandardFonts): Promise<PDFFont> => {
    let f = fontCache.get(key)
    if (!f) {
      f = await pdfDoc.embedFont(key)
      fontCache.set(key, f)
    }
    return f
  }

  for (const [pageNumStr, annotations] of Object.entries(byPage)) {
    const pageNum = Number(pageNumStr)
    const page = pages[pageNum - 1]
    if (!page || annotations.length === 0) continue
    const pageText = pageTexts?.[pageNum - 1]

    for (const ann of annotations) {
      if (ann.kind === 'text') {
        if (!pageText) continue
        const ref = buildTextMarkupAnnot(pdfDoc, page, ann, pageText)
        if (ref) addAnnotToPage(pdfDoc, page, ref)
      } else if (ann.kind === 'note') {
        const ref = buildNoteAnnot(pdfDoc, page, ann)
        if (ref) addAnnotToPage(pdfDoc, page, ref)
      } else if (ann.kind === 'shape') {
        drawShapeOnPage(page, ann)
      } else if (ann.kind === 'freetext') {
        const fontKey = pickStdFont(ann.fontFamily, ann.bold, ann.italic)
        const font = await getFont(fontKey)
        drawFreeTextOnPage(page, ann, font)
      } else if (ann.kind === 'signature') {
        await drawSignatureOnPage(pdfDoc, page, ann)
      } else if (ann.kind === 'stamp') {
        const font = await getFont(StandardFonts.HelveticaBoldOblique)
        drawStampOnPage(page, ann, font)
      } else if (ann.kind === 'mark') {
        drawMarkOnPage(page, ann)
      } else if (ann.kind === 'image') {
        await drawImageOnPage(pdfDoc, page, ann)
      } else if (ann.kind === 'attached-image') {
        await drawAttachedImageOnPage(pdfDoc, page, ann)
      } else if (ann.kind === 'link') {
        const ref = buildLinkAnnot(pdfDoc, page, ann)
        addAnnotToPage(pdfDoc, page, ref)
      } else if (ann.kind === 'form-field') {
        addFormFieldToPdf(pdfDoc, page, ann)
      }
    }
  }

  // Apply Edit Text & Image overrides BEFORE decor so watermarks/headers stay
  // on top. Strategy: cover each edited region with an opaque white rectangle,
  // then redraw the new text in the best-matching standard font + detected color.
  const edits = regionEdits.editedRegions ?? {}
  const regionsByPage = regionEdits.editableRegions ?? {}
  if (Object.keys(edits).length > 0 && Object.keys(regionsByPage).length > 0) {
    for (const [pageNumStr, regions] of Object.entries(regionsByPage)) {
      const pageIdx = Number(pageNumStr) - 1
      const page = pages[pageIdx]
      if (!page) continue
      for (const region of regions) {
        const next = edits[region.id]
        if (next === undefined || next === region.originalText) continue
        const fontKey = pickStdFont(familyFromStack(region.fontFamily), region.bold, region.italic)
        const font = await getFont(fontKey)
        drawEditedRegion(page, region, next, font)
      }
    }
  }

  // Document-wide decorations — applied to every page after per-page annotations
  // so they sit on top (watermark behavior is conventionally above content).
  if (decor.watermark?.enabled || decor.headerFooter?.enabled || decor.pageNumbering?.enabled) {
    const helveticaBoldOblique = await getFont(StandardFonts.HelveticaBoldOblique)
    const helvetica = await getFont(StandardFonts.Helvetica)
    const totalPages = pages.length
    for (let i = 0; i < totalPages; i++) {
      const page = pages[i]
      if (decor.watermark?.enabled) drawWatermarkOnPage(page, decor.watermark, helveticaBoldOblique)
      if (decor.headerFooter?.enabled) {
        drawHeaderFooterOnPage(page, decor.headerFooter, helvetica, i + 1, totalPages)
      }
      if (decor.pageNumbering?.enabled) {
        drawPageNumberOnPage(page, decor.pageNumbering, helvetica, i + 1, totalPages)
      }
    }
  }

  // Crop boxes are applied last so they survive every other transformation.
  // Setting a crop box doesn't remove content — it just tells the viewer to
  // clip rendering, which is what users intuitively expect from "crop".
  for (const [pageNumStr, rect] of Object.entries(pageCrops)) {
    const idx = Number(pageNumStr) - 1
    const page = pages[idx]
    if (!page) continue
    page.setCropBox(rect.x, rect.y, rect.width, rect.height)
  }

  return pdfDoc.save()
}

async function drawSignatureOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: SignatureAnnotation
): Promise<void> {
  const bytes = dataUrlToBytes(ann.dataUrl)
  if (!bytes) return
  const img = await pdfDoc.embedPng(bytes)
  // Signature stores top-left in PDF user space (y grows up). drawImage takes bottom-left.
  page.drawImage(img, {
    x: ann.x,
    y: ann.y - ann.height,
    width: ann.width,
    height: ann.height
  })
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const b64 = dataUrl.slice(comma + 1)
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const FONT_TABLE: Record<
  FontFamily,
  { plain: StandardFonts; bold: StandardFonts; italic: StandardFonts; boldItalic: StandardFonts }
> = {
  Helvetica: {
    plain: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique
  },
  Times: {
    plain: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic
  },
  Courier: {
    plain: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique
  }
}

function pickStdFont(family: FontFamily, bold: boolean, italic: boolean): StandardFonts {
  const row = FONT_TABLE[family]
  if (bold && italic) return row.boldItalic
  if (bold) return row.bold
  if (italic) return row.italic
  return row.plain
}

function drawShapeOnPage(page: PDFPage, ann: ShapeAnnotation): void {
  const [r, g, b] = hexToRgb(ann.color)
  const color = rgb(r, g, b)
  const sw = ann.strokeWidth

  if (ann.shape === 'rectangle') {
    const x = Math.min(ann.x1, ann.x2)
    const y = Math.min(ann.y1, ann.y2)
    const width = Math.abs(ann.x2 - ann.x1)
    const height = Math.abs(ann.y2 - ann.y1)
    page.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: sw })
  } else if (ann.shape === 'oval') {
    const x = (ann.x1 + ann.x2) / 2
    const y = (ann.y1 + ann.y2) / 2
    const xScale = Math.abs(ann.x2 - ann.x1) / 2
    const yScale = Math.abs(ann.y2 - ann.y1) / 2
    page.drawEllipse({ x, y, xScale, yScale, borderColor: color, borderWidth: sw })
  } else if (ann.shape === 'line') {
    page.drawLine({
      start: { x: ann.x1, y: ann.y1 },
      end: { x: ann.x2, y: ann.y2 },
      thickness: sw,
      color
    })
  } else if (ann.shape === 'redact') {
    // Solid black rectangle covering the redacted region. Note: the underlying
    // content stream is unchanged — this is visual redaction only. True
    // redaction (removing the text glyphs) needs content-stream rewriting.
    const x = Math.min(ann.x1, ann.x2)
    const y = Math.min(ann.y1, ann.y2)
    const width = Math.abs(ann.x2 - ann.x1)
    const height = Math.abs(ann.y2 - ann.y1)
    page.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) })
  } else if ((ann.shape === 'ink' || ann.shape === 'marker') && ann.points && ann.points.length >= 2) {
    // Marker = highlighter — same freehand stroke but rendered translucently
    // so underlying text remains readable.
    const opacity = ann.shape === 'marker' ? 0.4 : 1
    for (let i = 1; i < ann.points.length; i++) {
      page.drawLine({
        start: { x: ann.points[i - 1].x, y: ann.points[i - 1].y },
        end: { x: ann.points[i].x, y: ann.points[i].y },
        thickness: sw,
        color,
        opacity
      })
    }
  }
}

function drawFreeTextOnPage(page: PDFPage, ann: FreeTextAnnotation, font: PDFFont): void {
  // Background fill (drawn first so border + text overlay it).
  if (ann.backgroundColor) {
    const [br, bg, bb] = hexToRgb(ann.backgroundColor)
    page.drawRectangle({
      x: ann.x,
      y: ann.y - ann.height,
      width: ann.width,
      height: ann.height,
      color: rgb(br, bg, bb)
    })
  }

  // Border (no fill).
  if (ann.borderColor && ann.strokeWidth > 0) {
    const [br, bg, bb] = hexToRgb(ann.borderColor)
    page.drawRectangle({
      x: ann.x,
      y: ann.y - ann.height,
      width: ann.width,
      height: ann.height,
      borderColor: rgb(br, bg, bb),
      borderWidth: ann.strokeWidth
    })
  }

  if (!ann.text) return

  const [r, g, b] = hexToRgb(ann.color)
  const textColor = rgb(r, g, b)
  const fontSize = ann.fontSize
  const lineHeight = fontSize * 1.2
  const padding = 2 // matches FreeTextBox CSS padding
  const innerX = ann.x + padding
  const innerWidth = Math.max(1, ann.width - padding * 2)
  const innerTopY = ann.y - padding

  const lines = wrapText(font, ann.text, fontSize, innerWidth)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineWidth = font.widthOfTextAtSize(line, fontSize)
    let x = innerX
    if (ann.align === 'center') x = innerX + (innerWidth - lineWidth) / 2
    else if (ann.align === 'right') x = innerX + (innerWidth - lineWidth)
    // First-line baseline sits one font-size below the inner top, each subsequent
    // line drops by lineHeight (PDF y grows up → subtract).
    const baselineY = innerTopY - fontSize - i * lineHeight
    if (baselineY < ann.y - ann.height) break // clip lines that would fall outside the box

    if (line.length > 0) {
      page.drawText(line, { x, y: baselineY, size: fontSize, font, color: textColor })
      if (ann.underline) {
        const underlineY = baselineY - fontSize * 0.12
        page.drawLine({
          start: { x, y: underlineY },
          end: { x: x + lineWidth, y: underlineY },
          thickness: Math.max(0.5, fontSize * 0.05),
          color: textColor
        })
      }
    }
  }
}

function drawStampOnPage(page: PDFPage, ann: StampAnnotation, font: PDFFont): void {
  const [r, g, b] = hexToRgb(ann.color)
  const color = rgb(r, g, b)
  const borderWidth = Math.max(1, ann.fontSize * 0.1)

  // Border rectangle. Stamp `y` is the top in screen-space terms; PDF y grows up,
  // so the rect bottom is `y - height`.
  page.drawRectangle({
    x: ann.x,
    y: ann.y - ann.height,
    width: ann.width,
    height: ann.height,
    borderColor: color,
    borderWidth
  })

  // Center the text horizontally; baseline sits a touch above vertical center
  // so the visual cap-height aligns with the box midline.
  const textWidth = font.widthOfTextAtSize(ann.text, ann.fontSize)
  const cx = ann.x + (ann.width - textWidth) / 2
  const baselineY = ann.y - ann.height / 2 - ann.fontSize / 3
  page.drawText(ann.text, {
    x: cx,
    y: baselineY,
    size: ann.fontSize,
    font,
    color
  })
}

function drawMarkOnPage(page: PDFPage, ann: MarkAnnotation): void {
  const [r, g, b] = hexToRgb(ann.color)
  const color = rgb(r, g, b)
  const sw = ann.strokeWidth
  // Top-left in screen-space terms; convert to bottom-left for pdf-lib.
  const left = ann.x
  const right = ann.x + ann.size
  const top = ann.y
  const bottom = ann.y - ann.size
  const midX = (left + right) / 2
  const midY = (top + bottom) / 2
  const pad = ann.size * 0.18

  if (ann.mark === 'check') {
    // Two strokes: down-left to mid, then up-right to top.
    page.drawLine({
      start: { x: left + pad, y: midY + ann.size * 0.05 },
      end: { x: midX - ann.size * 0.05, y: bottom + pad },
      thickness: sw, color
    })
    page.drawLine({
      start: { x: midX - ann.size * 0.05, y: bottom + pad },
      end: { x: right - pad, y: top - pad * 0.3 },
      thickness: sw, color
    })
  } else if (ann.mark === 'cross') {
    page.drawLine({ start: { x: left + pad, y: top - pad }, end: { x: right - pad, y: bottom + pad }, thickness: sw, color })
    page.drawLine({ start: { x: right - pad, y: top - pad }, end: { x: left + pad, y: bottom + pad }, thickness: sw, color })
  } else if (ann.mark === 'dot') {
    page.drawEllipse({
      x: midX,
      y: midY,
      xScale: ann.size * 0.28,
      yScale: ann.size * 0.28,
      color
    })
  } else if (ann.mark === 'dash') {
    page.drawLine({
      start: { x: left + pad, y: midY },
      end: { x: right - pad, y: midY },
      thickness: sw, color
    })
  } else if (ann.mark === 'square') {
    page.drawRectangle({
      x: left + pad,
      y: bottom + pad,
      width: ann.size - pad * 2,
      height: ann.size - pad * 2,
      borderColor: color,
      borderWidth: sw
    })
  } else {
    // circle
    page.drawEllipse({
      x: midX,
      y: midY,
      xScale: ann.size / 2 - pad,
      yScale: ann.size / 2 - pad,
      borderColor: color,
      borderWidth: sw
    })
  }
}

async function drawImageOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: ImageAnnotation
): Promise<void> {
  const bytes = dataUrlToBytes(ann.dataUrl)
  if (!bytes) return
  const img =
    ann.format === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
  page.drawImage(img, {
    x: ann.x,
    y: ann.y - ann.height,
    width: ann.width,
    height: ann.height
  })
}

/** Drop a small thumbnail of the attached image AND embed the original file
 *  into the PDF's EmbeddedFiles dictionary. Most readers expose it via a
 *  "Attachments" panel; clicking the on-page icon doesn't open the file
 *  directly without a full FileAttachment annotation, which pdf-lib can't
 *  build natively — see notes below. */
async function drawAttachedImageOnPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: AttachedImageAnnotation
): Promise<void> {
  const bytes = dataUrlToBytes(ann.dataUrl)
  if (!bytes) return
  // Visual marker on the page: small image + a paperclip-ish border so it
  // reads as "this points to something".
  try {
    const isPng = ann.mimeType === 'image/png'
    const img = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
    page.drawRectangle({
      x: ann.x,
      y: ann.y - ann.size,
      width: ann.size,
      height: ann.size,
      borderColor: rgb(0.12, 0.16, 0.22),
      borderWidth: 0.8,
      color: rgb(1, 1, 1)
    })
    page.drawImage(img, {
      x: ann.x + 1,
      y: ann.y - ann.size + 1,
      width: ann.size - 2,
      height: ann.size - 2
    })
  } catch {
    // Non-embeddable formats (gif/webp) — just draw a labeled box.
    page.drawRectangle({
      x: ann.x,
      y: ann.y - ann.size,
      width: ann.size,
      height: ann.size,
      borderColor: rgb(0.12, 0.16, 0.22),
      borderWidth: 0.8,
      color: rgb(0.95, 0.95, 0.97)
    })
  }
  // Attach the original payload to the PDF so it travels with the file.
  // pdf-lib's `attach()` registers the file under EmbeddedFiles; PDF readers
  // surface it via their Attachments panel.
  await pdfDoc.attach(bytes, ann.fileName, {
    mimeType: ann.mimeType,
    description: 'PDFgear attachment',
    creationDate: new Date(ann.createdAt),
    modificationDate: new Date()
  })
}

/** Greedy word-wrap. Handles explicit newlines as paragraph breaks. */
function wrapText(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    const words = paragraph.split(/(\s+)/)
    let line = ''
    for (const token of words) {
      if (token === '') continue
      const candidate = line + token
      const w = font.widthOfTextAtSize(candidate, fontSize)
      if (w <= maxWidth || line === '') {
        line = candidate
      } else {
        out.push(line.trimEnd())
        line = token.trimStart()
      }
    }
    if (line) out.push(line)
  }
  return out
}

function buildTextMarkupAnnot(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: TextAnnotation,
  pageText: PageText
): PDFRef | null {
  const quads: number[] = []
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity

  for (const range of ann.ranges) {
    const item = pageText.items[range.itemIndex]
    if (!item) continue
    const widths = cumulativeCharWidths(item)
    const startX = item.transform[4] + (widths[range.start] ?? 0)
    const endX = item.transform[4] + (widths[range.end] ?? item.width)
    const baseY = item.transform[5]
    const topY = baseY + item.height
    if (endX <= startX || topY <= baseY) continue

    // QuadPoints order: top-left, top-right, bottom-left, bottom-right
    // (Adobe-compatible — many readers accept either ordering).
    quads.push(startX, topY, endX, topY, startX, baseY, endX, baseY)
    if (startX < xMin) xMin = startX
    if (baseY < yMin) yMin = baseY
    if (endX > xMax) xMax = endX
    if (topY > yMax) yMax = topY
  }
  if (quads.length === 0) return null

  const [r, g, b] = hexToRgb(ann.color)
  const subtype =
    ann.type === 'highlight' ? 'Highlight' : ann.type === 'underline' ? 'Underline' : 'StrikeOut'

  const dict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of(subtype),
    Rect: [xMin, yMin, xMax, yMax],
    QuadPoints: quads,
    C: [r, g, b],
    F: 4, // Print
    P: page.ref,
    T: PDFHexString.fromText(AUTHOR),
    Contents: PDFHexString.fromText(''),
    CreationDate: PDFString.of(pdfDateString(new Date(ann.createdAt))),
    M: PDFString.of(pdfDateString(new Date()))
  })
  return pdfDoc.context.register(dict)
}

function buildNoteAnnot(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: NoteAnnotation
): PDFRef {
  const [r, g, b] = hexToRgb(ann.color)
  const half = NOTE_ICON_SIZE / 2
  const dict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: [ann.x - half, ann.y - half, ann.x + half, ann.y + half],
    Contents: PDFHexString.fromText(ann.text || ''),
    C: [r, g, b],
    F: 4,
    P: page.ref,
    Name: PDFName.of('Comment'),
    Open: false,
    T: PDFHexString.fromText(AUTHOR),
    CreationDate: PDFString.of(pdfDateString(new Date(ann.createdAt))),
    M: PDFString.of(pdfDateString(new Date()))
  })
  return pdfDoc.context.register(dict)
}

/** Map our CSS font stack back to one of the three families pickStdFont knows. */
function familyFromStack(stack: string): FontFamily {
  const s = stack.toLowerCase()
  if (s.includes('courier') || s.includes('mono')) return 'Courier'
  if (s.includes('times') || s.includes('serif')) return 'Times'
  return 'Helvetica'
}

function drawEditedRegion(
  page: PDFPage,
  region: EditableTextRegion,
  newText: string,
  font: PDFFont
): void {
  const [cr, cg, cb] = hexToRgb(region.color)
  const textColor = rgb(cr, cg, cb)

  // Erase original glyphs by covering the region with white. A 1-unit bleed in
  // each direction handles antialiased edges that would otherwise leave fringes.
  const bleed = 1
  page.drawRectangle({
    x: region.x - bleed,
    y: region.y - region.height - bleed,
    width: region.width + bleed * 2,
    height: region.height + bleed * 2,
    color: rgb(1, 1, 1)
  })

  // Redraw the new content, wrapping per-line. We honor explicit newlines from
  // the editor and word-wrap each paragraph at the region's width.
  const fontSize = region.fontSize
  const lineHeight = Math.max(region.lineHeight, fontSize * 1.1)
  const innerLeft = region.x
  const innerTop = region.y
  const usableWidth = Math.max(1, region.width)

  const lines: string[] = []
  for (const para of newText.split(/\r?\n/)) {
    lines.push(...wrapText(font, para, fontSize, usableWidth))
  }
  for (let i = 0; i < lines.length; i++) {
    const baselineY = innerTop - fontSize - i * lineHeight
    if (baselineY < region.y - region.height - lineHeight) break
    if (lines[i].length === 0) continue
    page.drawText(lines[i], {
      x: innerLeft,
      y: baselineY,
      size: fontSize,
      font,
      color: textColor
    })
  }
}

/** Bake a designed form-field annotation into a real AcroForm widget on the
 *  page. Field names are reused across the document so radio buttons sharing a
 *  name automatically group into one PDF radio group. */
function addFormFieldToPdf(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: FormFieldAnnotation
): void {
  const form = pdfDoc.getForm()
  const x = ann.x
  const y = ann.y - ann.height
  const width = ann.width
  const height = ann.height

  try {
    if (ann.fieldType === 'text') {
      // pdf-lib upserts on createTextField when the name already exists; reuse
      // returns the existing field, which is exactly what we want for repeated
      // names. Any later widgets added share the same field value.
      const f = upsertTextField(form, ann.name)
      f.addToPage(page, { x, y, width, height })
      if (ann.value) f.setText(ann.value)
      if (ann.readonly) f.enableReadOnly()
      if (ann.required) f.enableRequired()
    } else if (ann.fieldType === 'checkbox') {
      const f = upsertCheckBox(form, ann.name)
      f.addToPage(page, { x, y, width, height })
      if (ann.value === 'on') f.check()
      if (ann.readonly) f.enableReadOnly()
      if (ann.required) f.enableRequired()
    } else if (ann.fieldType === 'radio') {
      const group = upsertRadioGroup(form, ann.name)
      const optionValue = ann.optionValue ?? 'on'
      group.addOptionToPage(optionValue, page, { x, y, width, height })
      if (ann.value && ann.value === optionValue) group.select(optionValue)
      if (ann.readonly) group.enableReadOnly()
      if (ann.required) group.enableRequired()
    } else if (ann.fieldType === 'dropdown') {
      const f = upsertDropdown(form, ann.name)
      f.setOptions(ann.options ?? [])
      f.addToPage(page, { x, y, width, height })
      if (ann.value) f.select(ann.value)
      if (ann.readonly) f.enableReadOnly()
      if (ann.required) f.enableRequired()
    } else if (ann.fieldType === 'listbox') {
      const f = upsertOptionList(form, ann.name)
      f.setOptions(ann.options ?? [])
      f.addToPage(page, { x, y, width, height })
      if (ann.value) f.select(ann.value)
      if (ann.readonly) f.enableReadOnly()
      if (ann.required) f.enableRequired()
    }
  } catch {
    // pdf-lib throws if a field name is already in use as a different kind.
    // Silently skip — the user can re-name in the designer to fix it.
  }
}

// Upsert helpers — pdf-lib throws on duplicate-name create, but its
// getField(name) returns null if absent. Wrap to "get if exists else create".
function upsertTextField(form: ReturnType<PDFDocument['getForm']>, name: string): ReturnType<ReturnType<PDFDocument['getForm']>['createTextField']> {
  const existing = safeGetField(form, name) as Record<string, unknown> | null
  if (existing && 'setText' in existing) return existing as unknown as ReturnType<ReturnType<PDFDocument['getForm']>['createTextField']>
  return form.createTextField(name)
}
function upsertCheckBox(form: ReturnType<PDFDocument['getForm']>, name: string): ReturnType<ReturnType<PDFDocument['getForm']>['createCheckBox']> {
  const existing = safeGetField(form, name) as Record<string, unknown> | null
  if (existing && 'check' in existing) return existing as unknown as ReturnType<ReturnType<PDFDocument['getForm']>['createCheckBox']>
  return form.createCheckBox(name)
}
function upsertRadioGroup(form: ReturnType<PDFDocument['getForm']>, name: string): ReturnType<ReturnType<PDFDocument['getForm']>['createRadioGroup']> {
  const existing = safeGetField(form, name) as Record<string, unknown> | null
  if (existing && 'addOptionToPage' in existing) return existing as unknown as ReturnType<ReturnType<PDFDocument['getForm']>['createRadioGroup']>
  return form.createRadioGroup(name)
}
function upsertDropdown(form: ReturnType<PDFDocument['getForm']>, name: string): ReturnType<ReturnType<PDFDocument['getForm']>['createDropdown']> {
  const existing = safeGetField(form, name) as Record<string, unknown> | null
  if (existing && 'setOptions' in existing && 'addToPage' in existing && !('isMultiselect' in existing)) {
    return existing as unknown as ReturnType<ReturnType<PDFDocument['getForm']>['createDropdown']>
  }
  return form.createDropdown(name)
}
function upsertOptionList(form: ReturnType<PDFDocument['getForm']>, name: string): ReturnType<ReturnType<PDFDocument['getForm']>['createOptionList']> {
  const existing = safeGetField(form, name) as Record<string, unknown> | null
  if (existing && 'isMultiselect' in existing) return existing as unknown as ReturnType<ReturnType<PDFDocument['getForm']>['createOptionList']>
  return form.createOptionList(name)
}

/** pdf-lib's getField throws when missing; wrap to return null instead. */
function safeGetField(form: ReturnType<PDFDocument['getForm']>, name: string): unknown {
  try {
    return form.getField(name)
  } catch {
    return null
  }
}

function buildLinkAnnot(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ann: LinkAnnotation
): PDFRef {
  // Build a /Link annotation with a /URI action so PDF readers open the URL in
  // the user's browser. Coordinates: link.x/y is top-left in our coord system;
  // PDF's Rect is [x1 y1 x2 y2] with y growing up.
  const x1 = ann.x
  const x2 = ann.x + ann.width
  const y1 = ann.y - ann.height
  const y2 = ann.y
  const dict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [x1, y1, x2, y2],
    Border: [0, 0, 0],
    F: 4,
    P: page.ref,
    A: pdfDoc.context.obj({
      Type: PDFName.of('Action'),
      S: PDFName.of('URI'),
      URI: PDFString.of(ann.url)
    }),
    CreationDate: PDFString.of(pdfDateString(new Date(ann.createdAt))),
    M: PDFString.of(pdfDateString(new Date()))
  })
  return pdfDoc.context.register(dict)
}

function drawWatermarkOnPage(page: PDFPage, w: WatermarkSettings, font: PDFFont): void {
  if (!w.text) return
  const [r, g, b] = hexToRgb(w.color)
  const color = rgb(r, g, b)
  const { width, height } = page.getSize()
  const textWidth = font.widthOfTextAtSize(w.text, w.fontSize)
  // Draw at the page center with the requested rotation. pdf-lib's `rotate`
  // rotates around the text's origin, so we offset by half the text width to
  // visually center it.
  const angleRad = (w.rotation * Math.PI) / 180
  const cx = width / 2
  const cy = height / 2
  const dx = (textWidth / 2) * Math.cos(angleRad)
  const dy = (textWidth / 2) * Math.sin(angleRad)
  page.drawText(w.text, {
    x: cx - dx,
    y: cy - dy,
    size: w.fontSize,
    font,
    color,
    opacity: w.opacity,
    rotate: degrees(w.rotation)
  })
}

/** Substitute {n} and {N} placeholders for current/total page numbers. */
function fmtNumber(template: string, current: number, total: number): string {
  return template.replace(/\{n\}/g, String(current)).replace(/\{N\}/g, String(total))
}

function drawHeaderFooterOnPage(
  page: PDFPage,
  s: HeaderFooterSettings,
  font: PDFFont,
  current: number,
  total: number
): void {
  const [r, g, b] = hexToRgb(s.color)
  const color = rgb(r, g, b)
  const { width, height } = page.getSize()
  const slots: { text: string; x: number; y: number; align: 'left' | 'center' | 'right' }[] = [
    { text: fmtNumber(s.headerLeft, current, total), x: s.margin, y: height - s.margin, align: 'left' },
    { text: fmtNumber(s.headerCenter, current, total), x: width / 2, y: height - s.margin, align: 'center' },
    { text: fmtNumber(s.headerRight, current, total), x: width - s.margin, y: height - s.margin, align: 'right' },
    { text: fmtNumber(s.footerLeft, current, total), x: s.margin, y: s.margin, align: 'left' },
    { text: fmtNumber(s.footerCenter, current, total), x: width / 2, y: s.margin, align: 'center' },
    { text: fmtNumber(s.footerRight, current, total), x: width - s.margin, y: s.margin, align: 'right' }
  ]
  for (const slot of slots) {
    if (!slot.text) continue
    const w = font.widthOfTextAtSize(slot.text, s.fontSize)
    const x = slot.align === 'left' ? slot.x : slot.align === 'right' ? slot.x - w : slot.x - w / 2
    page.drawText(slot.text, { x, y: slot.y, size: s.fontSize, font, color })
  }
}

function drawPageNumberOnPage(
  page: PDFPage,
  s: PageNumberSettings,
  font: PDFFont,
  current: number,
  total: number
): void {
  const [r, g, b] = hexToRgb(s.color)
  const color = rgb(r, g, b)
  const { width, height } = page.getSize()
  // startFrom shifts the numbering — e.g. cover page = 1 still draws on page 1.
  const shown = current + (s.startFrom - 1)
  const text = fmtNumber(s.format, shown, total + (s.startFrom - 1))
  const w = font.widthOfTextAtSize(text, s.fontSize)
  let x = s.margin
  let y = s.margin
  if (s.position.endsWith('center')) x = width / 2 - w / 2
  else if (s.position.endsWith('right')) x = width - s.margin - w
  if (s.position.startsWith('top')) y = height - s.margin
  page.drawText(text, { x, y, size: s.fontSize, font, color })
}

function addAnnotToPage(pdfDoc: PDFDocument, page: PDFPage, annotRef: PDFRef): void {
  const existing = page.node.lookup(PDFName.of('Annots'))
  if (existing instanceof PDFArray) {
    existing.push(annotRef)
  } else {
    page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]))
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255
  ]
}

function pdfDateString(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const tzMin = -date.getTimezoneOffset()
  const sign = tzMin >= 0 ? '+' : '-'
  return (
    'D:' +
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds()) +
    sign +
    pad(Math.floor(Math.abs(tzMin) / 60)) +
    "'" +
    pad(Math.abs(tzMin) % 60) +
    "'"
  )
}

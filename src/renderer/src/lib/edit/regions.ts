import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { EditableTextRegion } from '../annotations'

/** Y-distance below which two text items count as the same line (as a fraction
 *  of the larger item's height). Tighter than half so x-height differences don't
 *  break paragraph clustering. */
const SAME_LINE_TOL = 0.4
/** Vertical gap between lines, expressed as a multiple of the line height,
 *  above which we treat the next line as a new paragraph. */
const PARAGRAPH_GAP_MULTIPLE = 1.6
/** Horizontal start-position drift (PDF units) that still counts as the same paragraph. */
const PARAGRAPH_X_TOL = 8

type RawItem = {
  str: string
  x: number
  y: number
  width: number
  height: number
  fontName: string
}

/** Extract paragraph-level editable regions for one page. */
export async function extractEditableRegions(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  /** Optional rendered canvas at PDF-space scale=1 used to sample text colors.
   *  When omitted, every region falls back to black. */
  sampleCanvas: HTMLCanvasElement | null = null
): Promise<EditableTextRegion[]> {
  const page = await pdf.getPage(pageNumber)
  // Force fonts to load. getOperatorList registers every font the page uses
  // as a CSS @font-face — getTextContent alone doesn't. Without this the
  // styles[fontKey].fontFamily we read below may point at a not-yet-loaded
  // font that the browser will silently substitute.
  await page.getOperatorList()
  const content = await page.getTextContent()
  const styles = (content as unknown as { styles: Record<string, { fontFamily?: string }> }).styles ?? {}

  const items: RawItem[] = []
  for (const raw of content.items) {
    if (!('str' in raw)) continue
    if (!raw.str || raw.str.trim().length === 0) continue
    // transform = [scaleX, skewY, skewX, scaleY, tx, ty]; ty is the baseline.
    const t = raw.transform
    items.push({
      str: raw.str,
      x: t[4],
      y: t[5],
      width: raw.width,
      height: raw.height || Math.hypot(t[2], t[3]),
      fontName: raw.fontName ?? ''
    })
  }
  if (items.length === 0) {
    page.cleanup()
    return []
  }

  // Sort by Y descending (top first in PDF coords), then X ascending.
  items.sort((a, b) => (b.y - a.y) || (a.x - b.x))

  // 1) Group into lines.
  type Line = { items: RawItem[]; yMin: number; yMax: number; height: number }
  const lines: Line[] = []
  for (const it of items) {
    const last = lines[lines.length - 1]
    const tol = it.height * SAME_LINE_TOL
    if (last && Math.abs(last.yMin - it.y) <= tol) {
      last.items.push(it)
      last.yMin = Math.min(last.yMin, it.y)
      last.yMax = Math.max(last.yMax, it.y + it.height)
      last.height = Math.max(last.height, it.height)
    } else {
      lines.push({ items: [it], yMin: it.y, yMax: it.y + it.height, height: it.height })
    }
  }
  // Sort each line's items left-to-right.
  for (const line of lines) line.items.sort((a, b) => a.x - b.x)

  // 2) Group lines into paragraphs by line-gap + left-edge alignment.
  type Paragraph = { lines: Line[]; xMin: number; xMax: number; yMin: number; yMax: number; height: number }
  const paragraphs: Paragraph[] = []
  for (const line of lines) {
    const xMin = line.items[0].x
    const xMax = line.items.reduce((m, i) => Math.max(m, i.x + i.width), 0)
    const last = paragraphs[paragraphs.length - 1]
    const gap = last ? last.yMin - line.yMax : Infinity
    if (
      last &&
      gap >= 0 &&
      gap <= last.height * (PARAGRAPH_GAP_MULTIPLE - 1) &&
      Math.abs(last.xMin - xMin) <= PARAGRAPH_X_TOL
    ) {
      last.lines.push(line)
      last.xMin = Math.min(last.xMin, xMin)
      last.xMax = Math.max(last.xMax, xMax)
      last.yMin = Math.min(last.yMin, line.yMin)
      last.yMax = Math.max(last.yMax, line.yMax)
      last.height = Math.max(last.height, line.height)
    } else {
      paragraphs.push({ lines: [line], xMin, xMax, yMin: line.yMin, yMax: line.yMax, height: line.height })
    }
  }

  // 3) Resolve style per paragraph. Take the dominant font from the first line
  //    and sample color from the canvas if provided.
  const out: EditableTextRegion[] = []
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const firstItem = p.lines[0].items[0]
    const fontKey = firstItem.fontName
    const fontInfo = styles[fontKey] ?? {}
    const fontFamily = guessFontStack(fontKey, fontInfo.fontFamily)
    const { bold, italic } = classifyFont(fontKey, fontInfo.fontFamily)
    const lineHeight = p.lines.length > 1
      ? (p.yMax - p.yMin) / p.lines.length
      : p.height * 1.2
    const color = sampleCanvas
      ? samplePixelColor(sampleCanvas, page, firstItem.x + firstItem.width / 2, firstItem.y + firstItem.height / 2)
      : '#000000'
    const text = p.lines.map((line) => line.items.map((it) => it.str).join('')).join('\n')
    out.push({
      id: `region:${pageNumber}:${i}`,
      pageNumber,
      x: p.xMin,
      y: p.yMax, // top-left in the y-grows-up PDF coord space
      width: p.xMax - p.xMin,
      height: p.yMax - p.yMin,
      originalText: text,
      fontSize: p.height,
      lineHeight,
      fontFamily,
      color,
      bold,
      italic
    })
  }

  page.cleanup()
  return out
}

/** Build a CSS font stack that puts the *actual* pdfjs-loaded family first, then
 *  falls back to a same-class system font so unsupported glyphs still render. */
function guessFontStack(fontName: string, resolved?: string): string {
  const name = `${fontName} ${resolved ?? ''}`.toLowerCase()
  const fallback =
    name.includes('mono') || name.includes('courier')
      ? '"Courier New", Courier, monospace'
      : name.includes('times') || name.includes('roman') || name.includes('serif')
        ? '"Times New Roman", Times, serif'
        : 'Helvetica, Arial, sans-serif'

  // pdfjs renders every page font as a CSS @font-face whose family name is
  // exposed here. Prefer it — that's how we match the original glyphs.
  if (resolved && resolved.trim().length > 0) {
    // resolved may itself already be a stack (e.g. `g_d0_f1, sans-serif`).
    // Append our class-matched fallback in case the embedded font is subsetted
    // and lacks any character the user types.
    return `${resolved}, ${fallback}`
  }
  return fallback
}

function classifyFont(fontName: string, resolved?: string): { bold: boolean; italic: boolean } {
  const n = `${fontName} ${resolved ?? ''}`.toLowerCase()
  return {
    bold: /bold|black|heavy|semibold|demibold/.test(n),
    italic: /italic|oblique/.test(n)
  }
}

function samplePixelColor(
  canvas: HTMLCanvasElement,
  page: PDFPageProxy,
  pdfX: number,
  pdfY: number
): string {
  // Map PDF coords → canvas pixels using the canvas's recorded CSS size.
  // We assume the canvas was rendered at scale=1 viewport. If devicePixelRatio
  // scaling was applied, walking via canvas.width/canvas.height handles it.
  const vp = page.getViewport({ scale: 1 })
  const [cssX, cssY] = applyTransform(pdfX, pdfY, vp.transform)
  const sx = Math.round((cssX / vp.width) * canvas.width)
  const sy = Math.round((cssY / vp.height) * canvas.height)
  if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) return '#000000'
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return '#000000'
  try {
    const data = ctx.getImageData(sx, sy, 1, 1).data
    // Bail out if we landed on white-ish background.
    if (data[0] > 240 && data[1] > 240 && data[2] > 240) return '#000000'
    return `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return '#000000'
  }
}

function applyTransform(x: number, y: number, m: number[]): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

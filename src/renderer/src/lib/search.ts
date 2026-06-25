import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist'

export type TextItem = {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

export type PageText = {
  pageNumber: number
  items: TextItem[]
  fullText: string
  /** Start offset of each item within `fullText`. */
  itemOffsets: number[]
}

export type MatchRange = {
  itemIndex: number
  /** Start char offset within `items[itemIndex].str`. */
  start: number
  /** End char offset (exclusive) within `items[itemIndex].str`. */
  end: number
}

export type Match = {
  pageNumber: number
  /** One range per text item the match spans (1 for intra-item, 2+ for cross-item). */
  ranges: MatchRange[]
}

export type SearchOptions = {
  matchCase: boolean
  wholeWord: boolean
  regex: boolean
}

export type SearchError = { kind: 'regex'; message: string }

export type Rect = { left: number; top: number; width: number; height: number }

export async function extractAllText(pdf: PDFDocumentProxy): Promise<PageText[]> {
  const out: PageText[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const raw of content.items) {
      if (!('str' in raw)) continue
      items.push({
        str: raw.str,
        transform: raw.transform,
        width: raw.width,
        height: raw.height,
        hasEOL: raw.hasEOL
      })
    }
    let fullText = ''
    const itemOffsets: number[] = []
    for (const item of items) {
      itemOffsets.push(fullText.length)
      fullText += item.str
      if (item.hasEOL) fullText += '\n'
    }
    out.push({ pageNumber: n, items, fullText, itemOffsets })
    page.cleanup()
  }
  return out
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

export function searchAllPages(
  pages: PageText[],
  query: string,
  options: SearchOptions
): { matches: Match[]; error: SearchError | null } {
  if (!query) return { matches: [], error: null }

  let regex: RegExp
  try {
    regex = buildRegex(query, options)
  } catch (err) {
    return { matches: [], error: { kind: 'regex', message: err instanceof Error ? err.message : String(err) } }
  }

  const out: Match[] = []
  for (const page of pages) {
    regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(page.fullText)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (end === start) {
        regex.lastIndex = start + 1
        continue
      }
      const ranges = matchToItemRanges(start, end, page.itemOffsets, page.items)
      if (ranges.length > 0) {
        out.push({ pageNumber: page.pageNumber, ranges })
      }
    }
  }
  return { matches: out, error: null }
}

function buildRegex(query: string, options: SearchOptions): RegExp {
  const flags = options.matchCase ? 'gu' : 'gui'
  if (options.regex) {
    const body = options.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${query})(?![\\p{L}\\p{N}_])` : query
    return new RegExp(body, flags)
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = options.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${escaped})(?![\\p{L}\\p{N}_])` : escaped
  return new RegExp(body, flags)
}

// Keep helper retained for potential future non-regex paths.
export function isWordBoundary(text: string, pos: number): boolean {
  const ch = text[pos]
  if (ch === undefined) return true
  return !WORD_CHAR.test(ch)
}

function matchToItemRanges(
  matchStart: number,
  matchEnd: number,
  itemOffsets: number[],
  items: TextItem[]
): MatchRange[] {
  const ranges: MatchRange[] = []
  for (let i = 0; i < items.length; i++) {
    const itemStart = itemOffsets[i]
    const itemEnd = itemStart + items[i].str.length
    const overlapStart = Math.max(itemStart, matchStart)
    const overlapEnd = Math.min(itemEnd, matchEnd)
    if (overlapStart < overlapEnd) {
      ranges.push({
        itemIndex: i,
        start: overlapStart - itemStart,
        end: overlapEnd - itemStart
      })
    }
  }
  return ranges
}

// --- Per-item character width measurement (cached) ---

const widthCache = new WeakMap<TextItem, number[]>()
let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  measureCtx = c.getContext('2d')
  return measureCtx
}

/**
 * Returns cumulative character widths in PDF user-space units.
 * widths[i] is the distance from the item's left edge to the start of character i.
 * widths.length === item.str.length + 1 (so widths[N] === item.width).
 *
 * Uses canvas measureText with sans-serif as a font proxy, then normalises so
 * the total width matches the PDF's reported item.width. Result is cached per
 * item via WeakMap.
 */
export function cumulativeCharWidths(item: TextItem): number[] {
  const cached = widthCache.get(item)
  if (cached) return cached

  const len = item.str.length
  if (len === 0) {
    const empty = [0]
    widthCache.set(item, empty)
    return empty
  }
  if (item.width <= 0) {
    const flat: number[] = []
    for (let i = 0; i <= len; i++) flat.push(0)
    widthCache.set(item, flat)
    return flat
  }

  const ctx = getMeasureCtx()
  if (!ctx) {
    const uniform: number[] = []
    for (let i = 0; i <= len; i++) uniform.push((item.width * i) / len)
    widthCache.set(item, uniform)
    return uniform
  }

  const fontSize = Math.max(1, Math.hypot(item.transform[2], item.transform[3]))
  ctx.font = `${fontSize}px sans-serif`
  const fullMeasured = ctx.measureText(item.str).width
  if (fullMeasured <= 0) {
    const uniform: number[] = []
    for (let i = 0; i <= len; i++) uniform.push((item.width * i) / len)
    widthCache.set(item, uniform)
    return uniform
  }

  const ratio = item.width / fullMeasured
  const cum: number[] = [0]
  for (let i = 1; i < len; i++) {
    cum.push(ctx.measureText(item.str.substring(0, i)).width * ratio)
  }
  cum.push(item.width)
  widthCache.set(item, cum)
  return cum
}

/**
 * Bounding rect for a substring of a text item, in viewport CSS px (top-left origin).
 * Uses cached per-character widths so highlight rects align tightly with the rendered text.
 */
export function computeRangeRect(item: TextItem, range: MatchRange, viewport: PageViewport): Rect {
  const widths = cumulativeCharWidths(item)
  const startW = widths[range.start] ?? 0
  const endW = widths[range.end] ?? item.width

  const tr = item.transform
  const px = tr[4]
  const py = tr[5]
  const h = item.height

  const sx = px + startW
  const ex = px + endW

  const Util = pdfjsLib.Util
  const [bx, by] = Util.applyTransform([sx, py], viewport.transform)
  const [tx, ty] = Util.applyTransform([ex, py + h], viewport.transform)

  const left = Math.min(bx, tx)
  const right = Math.max(bx, tx)
  const top = Math.min(by, ty)
  const bottom = Math.max(by, ty)

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  }
}

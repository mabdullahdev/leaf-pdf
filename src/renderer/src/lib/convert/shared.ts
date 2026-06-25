import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

export const IMAGE_SCALE = 2

/** Strip extension from a filename, e.g. "doc.pdf" → "doc". */
export function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

/** Join a directory and filename using forward slashes; Node fs handles both separators. */
export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[/\\]$/, '')}/${name}`
}

/** Render a single page to a PNG/JPEG blob via an offscreen canvas. */
export async function renderPageToBlob(
  page: PDFPageProxy,
  format: 'image/png' | 'image/jpeg',
  scale = IMAGE_SCALE
): Promise<Blob> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: format === 'image/png' })
  if (!ctx) throw new Error('canvas 2d context unavailable')
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  await page.render({ canvasContext: ctx, viewport }).promise
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      format,
      format === 'image/jpeg' ? 0.92 : undefined
    )
  })
}

export async function blobToBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer())
}

/** Per-page plain text via pdfjs getTextContent — collapses adjacent fragments
 *  and inserts newlines on hasEOL markers. */
export async function extractPagesText(pdf: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    let s = ''
    for (const raw of content.items) {
      if (!('str' in raw)) continue
      s += raw.str
      if (raw.hasEOL) s += '\n'
    }
    out.push(s)
    page.cleanup()
  }
  return out
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeHtml(s: string): string {
  return escapeXml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function escapeRtf(s: string): string {
  // Escape RTF metacharacters, then convert non-ASCII to \uNNNN? sequences.
  const meta = s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
  let out = ''
  for (const ch of meta) {
    const code = ch.codePointAt(0) ?? 0
    if (code > 127) {
      // RTF \u uses signed 16-bit; cap to valid range, follow with `?` fallback.
      const v = code > 32767 ? code - 65536 : code
      out += `\\u${v}?`
    } else if (ch === '\n') {
      out += '\\par '
    } else {
      out += ch
    }
  }
  return out
}

/** Very-rough RTF → plain text. Strips control words, font/color/info groups, braces. */
export function rtfToPlainText(rtf: string): string {
  let s = rtf
  // Drop common non-text groups (single nesting level handled).
  s = s.replace(/\{\\(fonttbl|colortbl|stylesheet|info|generator|listtable|listoverridetable|rsidtbl|themedata|datastore|latentstyles)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
  // Drop {\* ... } destinations.
  s = s.replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
  // \uNNNN? — convert to its character (signed 16-bit).
  s = s.replace(/\\u(-?\d+)\??/g, (_m, v: string) => {
    const code = (Number(v) + 65536) % 65536
    try { return String.fromCodePoint(code) } catch { return '' }
  })
  // \'XX — hex byte.
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
  // Paragraphs / lines / tabs.
  s = s.replace(/\\par\b\s?/g, '\n').replace(/\\line\b\s?/g, '\n').replace(/\\tab\b\s?/g, '\t')
  // Strip remaining control words \word[-]NNN.
  s = s.replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
  // Unescape literal braces / backslash.
  s = s.replace(/\\\{/g, '{').replace(/\\\}/g, '}').replace(/\\\\/g, '\\')
  // Drop any remaining braces.
  s = s.replace(/[{}]/g, '')
  return s.trim()
}

/** Wrap text into lines that fit within `maxWidth` for the given font/size. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number
): string[] {
  const out: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph === '') { out.push(''); continue }
    const words = paragraph.split(/(\s+)/)
    let line = ''
    for (const w of words) {
      const candidate = line + w
      if (measure(candidate) <= maxWidth || line === '') {
        line = candidate
      } else {
        out.push(line.trimEnd())
        line = w.trimStart()
      }
    }
    if (line) out.push(line.trimEnd())
  }
  return out
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await window.api.writeFile(path, bytes)
}

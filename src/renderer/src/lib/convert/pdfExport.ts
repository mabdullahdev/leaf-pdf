import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  IMAGE_SCALE,
  blobToBytes,
  escapeHtml,
  escapeRtf,
  escapeXml,
  extractPagesText,
  joinPath,
  renderPageToBlob,
  stripExt,
  writeBytes
} from './shared'

type ExportCtx = {
  pdf: PDFDocumentProxy
  fileName: string
}

/** Render every page to a PNG/JPEG and write to a directory the user picks. */
export async function pdfToImages(
  ctx: ExportCtx,
  format: 'image/png' | 'image/jpeg'
): Promise<string | null> {
  const ext = format === 'image/png' ? 'png' : 'jpg'
  const dir = await window.api.showOpenDirectoryDialog(
    `Choose output folder for ${ext.toUpperCase()} pages`
  )
  if (!dir) return null
  const base = stripExt(ctx.fileName)
  const pad = String(ctx.pdf.numPages).length
  for (let n = 1; n <= ctx.pdf.numPages; n++) {
    const page = await ctx.pdf.getPage(n)
    const blob = await renderPageToBlob(page, format, IMAGE_SCALE)
    const bytes = await blobToBytes(blob)
    const name = `${base}-page-${String(n).padStart(pad, '0')}.${ext}`
    await writeBytes(joinPath(dir, name), bytes)
    page.cleanup()
  }
  return dir
}

export async function pdfToTxt(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save TXT',
    defaultName: stripExt(ctx.fileName) + '.txt',
    filters: [{ name: 'Plain text', extensions: ['txt'] }]
  })
  if (!path) return null
  const pages = await extractPagesText(ctx.pdf)
  const body = pages.join('\n\n\n\n') // form-feed between pages
  await writeBytes(path, new TextEncoder().encode(body))
  return path
}

export async function pdfToHtml(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save HTML',
    defaultName: stripExt(ctx.fileName) + '.html',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  })
  if (!path) return null
  const pages = await extractPagesText(ctx.pdf)
  const title = escapeHtml(stripExt(ctx.fileName))
  const sections = pages
    .map(
      (p, i) =>
        `<section class="page" data-page="${i + 1}"><pre>${escapeHtml(p)}</pre></section>`
    )
    .join('\n')
  const html =
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<title>${title}</title>\n` +
    `<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#111}` +
    `.page{padding:1.5rem 0;border-bottom:1px solid #ddd}` +
    `.page pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5;margin:0}` +
    `</style>\n</head>\n<body>\n<h1>${title}</h1>\n${sections}\n</body>\n</html>\n`
  await writeBytes(path, new TextEncoder().encode(html))
  return path
}

export async function pdfToXml(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save XML',
    defaultName: stripExt(ctx.fileName) + '.xml',
    filters: [{ name: 'XML', extensions: ['xml'] }]
  })
  if (!path) return null
  const pages = await extractPagesText(ctx.pdf)
  const body = pages
    .map((p, i) => `  <page number="${i + 1}">\n    <text>${escapeXml(p)}</text>\n  </page>`)
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<document source="${escapeXml(ctx.fileName)}">\n${body}\n</document>\n`
  await writeBytes(path, new TextEncoder().encode(xml))
  return path
}

export async function pdfToRtf(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save RTF',
    defaultName: stripExt(ctx.fileName) + '.rtf',
    filters: [{ name: 'RTF', extensions: ['rtf'] }]
  })
  if (!path) return null
  const pages = await extractPagesText(ctx.pdf)
  const body = pages.map((p) => escapeRtf(p)).join('\\page ')
  const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 ${body}}`
  await writeBytes(path, new TextEncoder().encode(rtf))
  return path
}

export async function pdfToWord(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save Word document',
    defaultName: stripExt(ctx.fileName) + '.docx',
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  })
  if (!path) return null
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx')
  const pages = await extractPagesText(ctx.pdf)
  const children = pages.flatMap((p, pageIdx) => {
    const paragraphs = p.split(/\r?\n/).map(
      (line) => new Paragraph({ children: [new TextRun(line)] })
    )
    if (pageIdx < pages.length - 1) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
    }
    return paragraphs
  })
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  await writeBytes(path, await blobToBytes(blob))
  return path
}

export async function pdfToExcel(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save Excel workbook',
    defaultName: stripExt(ctx.fileName) + '.xlsx',
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
  })
  if (!path) return null
  const ExcelJS = (await import('exceljs')).default
  const pages = await extractPagesText(ctx.pdf)
  const wb = new ExcelJS.Workbook()
  pages.forEach((p, i) => {
    const ws = wb.addWorksheet(`Page ${i + 1}`)
    const lines = p.split(/\r?\n/)
    for (const line of lines) ws.addRow([line])
    ws.getColumn(1).width = 80
  })
  const buf = await wb.xlsx.writeBuffer()
  await writeBytes(path, new Uint8Array(buf as ArrayBuffer))
  return path
}

export async function pdfToPpt(ctx: ExportCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save PowerPoint',
    defaultName: stripExt(ctx.fileName) + '.pptx',
    filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
  })
  if (!path) return null
  const pptxgen = (await import('pptxgenjs')).default
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'

  for (let n = 1; n <= ctx.pdf.numPages; n++) {
    const page = await ctx.pdf.getPage(n)
    const blob = await renderPageToBlob(page, 'image/png', IMAGE_SCALE)
    const dataUrl = await blobToDataUrl(blob)
    const slide = pres.addSlide()
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: '100%', h: '100%' })
    page.cleanup()
  }
  const result = await pres.write({ outputType: 'blob' })
  const blob = result instanceof Blob ? result : new Blob([result as ArrayBuffer])
  await writeBytes(path, await blobToBytes(blob))
  return path
}

async function blobToDataUrl(b: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('FileReader failed'))
    r.readAsDataURL(b)
  })
}

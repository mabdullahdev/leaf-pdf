import { PDFDocument } from 'pdf-lib'
import { joinPath, stripExt, writeBytes } from './shared'

type ToolCtx = {
  originalBytes: Uint8Array
  fileName: string
}

export async function mergePdf(ctx: ToolCtx): Promise<string | null> {
  const inputs = await window.api.showOpenFilesDialog({
    title: 'Choose PDF(s) to append',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    multi: true
  })
  if (!inputs || inputs.length === 0) return null
  const path = await window.api.showSaveFileDialog({
    title: 'Save merged PDF',
    defaultName: stripExt(ctx.fileName) + '-merged.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!path) return null

  const out = await PDFDocument.create()
  await copyAllPages(out, ctx.originalBytes)
  for (const inputPath of inputs) {
    const file = await window.api.readFile(inputPath)
    await copyAllPages(out, file.bytes)
  }
  const bytes = await out.save()
  await writeBytes(path, bytes)
  return path
}

export async function splitPdf(ctx: ToolCtx): Promise<string | null> {
  const dir = await window.api.showOpenDirectoryDialog('Choose output folder')
  if (!dir) return null
  const src = await PDFDocument.load(ctx.originalBytes)
  const total = src.getPageCount()
  const base = stripExt(ctx.fileName)
  const pad = String(total).length
  for (let i = 0; i < total; i++) {
    const out = await PDFDocument.create()
    const [copied] = await out.copyPages(src, [i])
    out.addPage(copied)
    const bytes = await out.save()
    const name = `${base}-page-${String(i + 1).padStart(pad, '0')}.pdf`
    await writeBytes(joinPath(dir, name), bytes)
  }
  return dir
}

export async function compressPdf(ctx: ToolCtx): Promise<string | null> {
  const path = await window.api.showSaveFileDialog({
    title: 'Save compressed PDF',
    defaultName: stripExt(ctx.fileName) + '-compressed.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!path) return null
  // Re-save with object streams + recomputed xref. pdf-lib doesn't re-encode
  // images, so savings come from deduplication and the more compact xref form.
  const src = await PDFDocument.load(ctx.originalBytes, { updateMetadata: false })
  const bytes = await src.save({ useObjectStreams: true, addDefaultPage: false })
  await writeBytes(path, bytes)
  return path
}

async function copyAllPages(target: PDFDocument, srcBytes: Uint8Array): Promise<void> {
  const src = await PDFDocument.load(srcBytes)
  const indices = src.getPageIndices()
  const copied = await target.copyPages(src, indices)
  for (const page of copied) target.addPage(page)
}

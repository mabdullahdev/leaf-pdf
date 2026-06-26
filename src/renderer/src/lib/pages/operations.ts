import { PDFDocument, degrees } from 'pdf-lib'
import { joinPath, stripExt } from '../convert/shared'

/** Rotate a set of pages clockwise (right) or counterclockwise (left) by 90°.
 *  Returns the mutated bytes; caller is responsible for reloading the document. */
export async function rotatePages(
  bytes: Uint8Array,
  pageNumbers: Set<number>,
  direction: 'left' | 'right'
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const pages = pdf.getPages()
  const delta = direction === 'right' ? 90 : -90
  for (const n of pageNumbers) {
    const page = pages[n - 1]
    if (!page) continue
    const cur = page.getRotation().angle
    page.setRotation(degrees(((cur + delta) % 360 + 360) % 360))
  }
  return pdf.save()
}

/** Delete a set of pages and return the new bytes. */
export async function deletePages(
  bytes: Uint8Array,
  pageNumbers: Set<number>
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  // Remove from highest to lowest so indices don't shift under us.
  const sorted = Array.from(pageNumbers).sort((a, b) => b - a)
  for (const n of sorted) {
    if (n >= 1 && n <= pdf.getPageCount()) pdf.removePage(n - 1)
  }
  return pdf.save()
}

/** Insert a blank page after the given 1-indexed page number (or at the end
 *  when `after` is 0 or omitted). The blank inherits dimensions from the
 *  reference page when available, else US Letter. */
export async function insertBlankPage(
  bytes: Uint8Array,
  after: number
): Promise<{ bytes: Uint8Array; insertedAt: number }> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const count = pdf.getPageCount()
  const insertIdx = Math.max(0, Math.min(count, after))
  // Inherit dimensions from the neighbor we're inserting after; falls back to US Letter.
  const ref = pdf.getPages()[Math.max(0, insertIdx - 1)]
  const size: [number, number] = ref ? [ref.getWidth(), ref.getHeight()] : [612, 792]
  pdf.insertPage(insertIdx, size)
  return { bytes: await pdf.save(), insertedAt: insertIdx + 1 }
}

/** Build a new PDF with only the selected pages, in their original order. */
export async function extractPages(
  bytes: Uint8Array,
  pageNumbers: Set<number>
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes)
  const indices = Array.from(pageNumbers).sort((a, b) => a - b).map((n) => n - 1)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, indices)
  for (const p of copied) out.addPage(p)
  return out.save()
}

/** Append every page of `extra` to the end of `original`. */
export async function appendDocument(
  original: Uint8Array,
  extra: Uint8Array
): Promise<Uint8Array> {
  const target = await PDFDocument.load(original, { updateMetadata: false })
  const src = await PDFDocument.load(extra)
  const copied = await target.copyPages(src, src.getPageIndices())
  for (const p of copied) target.addPage(p)
  return target.save()
}

/** Split the document into two new PDFs at the given 1-indexed split point.
 *  Pages 1..splitAfter become "part-1", pages (splitAfter+1)..end become "part-2".
 *  Writes both to the chosen directory and returns the directory path. */
export async function splitAt(
  bytes: Uint8Array,
  baseName: string,
  splitAfter: number,
  dir: string,
  writeBytes: (path: string, data: Uint8Array) => Promise<void>
): Promise<{ part1Path: string; part2Path: string }> {
  const src = await PDFDocument.load(bytes)
  const total = src.getPageCount()
  const clamped = Math.max(1, Math.min(total - 1, splitAfter))

  const part1 = await PDFDocument.create()
  const a = await part1.copyPages(src, range(0, clamped))
  for (const p of a) part1.addPage(p)
  const part1Bytes = await part1.save()

  const part2 = await PDFDocument.create()
  const b = await part2.copyPages(src, range(clamped, total))
  for (const p of b) part2.addPage(p)
  const part2Bytes = await part2.save()

  const base = stripExt(baseName)
  const part1Path = joinPath(dir, `${base}-part-1.pdf`)
  const part2Path = joinPath(dir, `${base}-part-2.pdf`)
  await writeBytes(part1Path, part1Bytes)
  await writeBytes(part2Path, part2Bytes)
  return { part1Path, part2Path }
}

function range(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let i = lo; i < hi; i++) out.push(i)
  return out
}

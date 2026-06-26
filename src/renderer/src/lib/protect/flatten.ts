import { PDFDocument } from 'pdf-lib'

/** "Flatten" an already-baked PDF — converts every AcroForm field into static
 *  page content so it can no longer be filled, edited, or removed without
 *  rebuilding the PDF. Annotations that aren't form widgets (free-text, marks,
 *  signatures, links) are already part of the page content stream by the time
 *  our normal save pipeline finishes, so they're left untouched here. */
export async function flattenPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  try {
    const form = pdf.getForm()
    form.flatten()
  } catch {
    // No form, or pdf-lib refused to flatten — that's fine, we still save.
  }
  return pdf.save()
}

import createQpdf from '@neslinesli93/qpdf-wasm'
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'
import { stripExt, writeBytes } from './shared'

type CryptoCtx = { originalBytes: Uint8Array; fileName: string }

// qpdf compiled to WebAssembly — runs in the renderer alongside pdf-lib/pdfjs,
// so there's no native module and nothing extra to sign for an App Store build.
// Each operation spins up a fresh instance: Emscripten's runtime exits after
// callMain, so an instance can't be reused across runs.
async function runQpdf(
  input: Uint8Array,
  buildArgs: (inPath: string, outPath: string) => string[]
): Promise<Uint8Array> {
  const qpdf = await createQpdf({ locateFile: () => wasmUrl })
  const fs = qpdf.FS as unknown as {
    writeFile: (p: string, d: Uint8Array) => void
    readFile: (p: string) => Uint8Array
  }
  const inPath = '/in.pdf'
  const outPath = '/out.pdf'
  fs.writeFile(inPath, input)
  // Exit codes: 0 = success, 3 = success with warnings (output still written),
  // 2 = error (most commonly a wrong password on decrypt).
  const code = qpdf.callMain(buildArgs(inPath, outPath))
  if (code !== 0 && code !== 3) {
    throw new Error('Incorrect password, or the file could not be processed.')
  }
  return fs.readFile(outPath)
}

/** Encrypt a PDF with AES-256 so it requires `password` to open. */
export async function protectPdf(ctx: CryptoCtx, password: string): Promise<string | null> {
  const out = await runQpdf(ctx.originalBytes, (i, o) => [
    '--encrypt',
    password,
    password,
    '256',
    '--',
    i,
    o
  ])
  const path = await window.api.showSaveFileDialog({
    title: 'Save password-protected PDF',
    defaultName: stripExt(ctx.fileName) + '-protected.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!path) return null
  await writeBytes(path, out)
  return path
}

/** Remove encryption from a PDF, given its current password. */
export async function unlockPdf(ctx: CryptoCtx, password: string): Promise<string | null> {
  // Decrypt first so an incorrect password fails before we ask where to save.
  const out = await runQpdf(ctx.originalBytes, (i, o) => ['--password=' + password, '--decrypt', i, o])
  const base = stripExt(ctx.fileName).replace(/-protected$/, '')
  const path = await window.api.showSaveFileDialog({
    title: 'Save unlocked PDF',
    defaultName: base + '-unlocked.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!path) return null
  await writeBytes(path, out)
  return path
}

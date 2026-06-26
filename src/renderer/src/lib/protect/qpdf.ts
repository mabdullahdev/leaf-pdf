/**
 * QPDF wrapper for in-app encryption / decryption.
 *
 * Uses @neslinesli93/qpdf-wasm — a WebAssembly build of QPDF that exposes the
 * same CLI as the native binary. We mount input bytes into the wasm FS, run
 * `callMain([...args])`, then read the output back.
 *
 * The wasm module + module factory get cached at the file level so a single
 * tab can encrypt/decrypt multiple files without paying the ~3 MB cold load
 * more than once.
 */

// Vite serves the wasm asset for us; ?url returns a runtime URL the qpdf
// factory's `locateFile` callback can fetch.
// @ts-ignore vite asset import (no .d.ts for the ?url suffix)
import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

type QpdfInstance = {
  callMain: (args: string[]) => number
  FS: {
    mkdir: (path: string) => void
    mount: (
      type: unknown,
      opts: { blobs: { name: string; data: Blob }[] },
      mountPoint: string
    ) => void
    unmount: (path: string) => void
    readFile: (path: string) => Uint8Array
    writeFile?: (path: string, data: Uint8Array) => void
  }
  WORKERFS: unknown
}

let cachedFactory: ((opts: { locateFile: () => string }) => Promise<QpdfInstance>) | null = null

async function getQpdf(): Promise<QpdfInstance> {
  if (!cachedFactory) {
    // @vite-ignore — optional dep; the friendly message surfaces in the caller.
    const mod = await import(/* @vite-ignore */ '@neslinesli93/qpdf-wasm').catch(() => null)
    if (!mod) {
      throw new Error(
        'PDF protection engine not installed. Run `npm install @neslinesli93/qpdf-wasm` and reload.'
      )
    }
    cachedFactory = mod.default
  }
  return cachedFactory!({ locateFile: () => qpdfWasmUrl as string })
}

export type EncryptOptions = {
  userPassword: string
  ownerPassword: string
  /** PDF-32000 spec: 40 / 128 / 256 bits. We default to 256 (AES). */
  keyBits?: 40 | 128 | 256
  /** Whether the resulting PDF permits these capabilities (sets QPDF flags). */
  allowPrint?: boolean
  allowModify?: boolean
  allowExtract?: boolean
  allowAnnotate?: boolean
}

/** Run qpdf with the supplied input bytes and CLI args, return the output bytes. */
async function runQpdf(input: Uint8Array, args: (input: string, output: string) => string[]): Promise<Uint8Array> {
  const inst = await getQpdf()
  // Cast to satisfy the BlobPart overload — Uint8Array is structurally fine.
  const blob = new Blob([input as unknown as ArrayBuffer], { type: 'application/pdf' })
  // Use a fresh mount point per call so concurrent runs don't collide.
  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const inDir = `/in_${stamp}`
  const inPath = `${inDir}/input.pdf`
  const outPath = `/out_${stamp}.pdf`
  inst.FS.mkdir(inDir)
  inst.FS.mount(inst.WORKERFS, { blobs: [{ name: 'input.pdf', data: blob }] }, inDir)
  try {
    const rc = inst.callMain(args(inPath, outPath))
    if (rc !== 0) {
      // qpdf prints a usable message to stderr; we lose that detail through
      // the wasm boundary, so a generic message is the best we can do.
      throw new Error(`qpdf exited with status ${rc} — verify the password and try again.`)
    }
    return inst.FS.readFile(outPath)
  } finally {
    try { inst.FS.unmount(inDir) } catch { /* ignore */ }
  }
}

export async function encryptPdf(input: Uint8Array, opts: EncryptOptions): Promise<Uint8Array> {
  const keyBits = opts.keyBits ?? 256
  const flagPair = (allowed: boolean | undefined): string => (allowed === false ? 'n' : 'y')
  // QPDF encrypt grammar:
  //   --encrypt USER OWNER 40|128|256 [perm-options] --
  // Permission flag semantics differ slightly by key size; we use the safe
  // common subset.
  return runQpdf(input, (input, output) => {
    const args: string[] = [
      '--encrypt', opts.userPassword, opts.ownerPassword, String(keyBits),
      `--print=${opts.allowPrint === false ? 'none' : 'full'}`,
      `--modify=${opts.allowModify === false ? 'none' : 'all'}`,
      `--extract=${flagPair(opts.allowExtract)}`,
      `--annotate=${flagPair(opts.allowAnnotate)}`,
      '--',
      input,
      output
    ]
    return args
  })
}

export async function decryptPdf(input: Uint8Array, password: string): Promise<Uint8Array> {
  return runQpdf(input, (input, output) => [
    `--password=${password}`,
    '--decrypt',
    input,
    output
  ])
}

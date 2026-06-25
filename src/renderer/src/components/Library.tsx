import { useMemo, useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useRecentFilesStore, type RecentFile } from '../store/recentFilesStore'
import { loadDocument } from '../lib/pdfRenderer'
import { mergePdf, splitPdf, compressPdf } from '../lib/convert/pdfTools'
import { pdfToWord } from '../lib/convert/pdfExport'

type SortKey = 'recent' | 'name' | 'size'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const sameDay = new Date(then).toDateString() === new Date(now).toDateString()
  if (sameDay) return 'Today'
  const oneDay = 86400_000
  if (diffMs < 2 * oneDay) return 'Yesterday'
  if (diffMs < 7 * oneDay) return `${Math.floor(diffMs / oneDay)}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Bucket label for date grouping — Today / Yesterday / This Week / Earlier. */
function dateBucket(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const oneDay = 86400_000
  const sameDay = new Date(then).toDateString() === new Date(now).toDateString()
  if (sameDay) return 'Today'
  if (now - then < 2 * oneDay) return 'Yesterday'
  if (now - then < 7 * oneDay) return 'This Week'
  return 'Earlier'
}

/** A stable, deterministic tint for a filename — gives each badge a recognizable color. */
function tintFor(name: string): string {
  const tints = [
    'bg-rose-100 dark:bg-rose-900/20',
    'bg-amber-100 dark:bg-amber-900/20',
    'bg-emerald-100 dark:bg-emerald-900/20',
    'bg-sky-100 dark:bg-sky-900/20',
    'bg-violet-100 dark:bg-violet-900/20'
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return tints[h % tints.length]
}

function Icon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24'
  }
  switch (name) {
    case 'search':
      return (
        <svg {...common} className={className}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common} className={className}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'folder':
      return (
        <svg {...common} className={className}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        </svg>
      )
    case 'fileText':
      return (
        <svg {...common} className={className}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
          <path d="M14 3v6h6" />
        </svg>
      )
    case 'pin':
      return (
        <svg {...common} className={className}>
          <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
          <path d="M12 15v5" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common} className={className}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      )
    case 'merge':
      return (
        <svg {...common} className={className}>
          <path d="M7 3v6a4 4 0 0 0 4 4h6" />
          <path d="M14 10l3 3-3 3" />
        </svg>
      )
    case 'split':
      return (
        <svg {...common} className={className}>
          <path d="M17 3v6a4 4 0 0 1-4 4H6" />
          <path d="M9 16l-3-3 3-3" />
        </svg>
      )
    case 'compress':
      return (
        <svg {...common} className={className}>
          <path d="M9 3v4a2 2 0 0 1-2 2H3" />
          <path d="M15 3v4a2 2 0 0 0 2 2h4" />
          <path d="M9 21v-4a2 2 0 0 0-2-2H3" />
          <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
        </svg>
      )
    case 'word':
      return (
        <svg {...common} className={className}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
          <path d="M14 3v6h6" />
          <path d="m8.5 12 1 5 1.5-3.5L12.5 17l1-5" />
        </svg>
      )
    default:
      return null
  }
}

function PdfBadge({ name, className = 'w-9 h-11' }: { name: string; className?: string }) {
  return (
    <div
      className={`shrink-0 rounded-md ring-1 ring-neutral-200 dark:ring-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-700 ${tintFor(name)} ${className}`}
    >
      PDF
    </div>
  )
}

function PdfRow({
  file,
  onOpen,
  onTogglePin,
  onRemove
}: {
  file: RecentFile
  onOpen: (f: RecentFile) => void
  onTogglePin: (docKey: string) => void
  onRemove: (docKey: string) => void
}) {
  return (
    <div className="group relative flex items-center rounded-lg hover:bg-white dark:hover:bg-neutral-900 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 transition">
      <button
        onClick={() => onOpen(file)}
        className="flex-1 min-w-0 text-left flex items-center gap-3 px-3 py-2.5"
      >
        <PdfBadge name={file.name} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-neutral-800 dark:text-neutral-200 truncate">{file.name}</div>
          <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500 tabular-nums flex items-center gap-1.5">
            <span>{file.pageCount} pages</span>
            <span>·</span>
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>·</span>
            <span>{timeAgo(file.lastOpenedAt)}</span>
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button
          onClick={() => onTogglePin(file.docKey)}
          title={file.pinned ? 'Unpin' : 'Pin'}
          className={`w-7 h-7 rounded-md flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-800 ${
            file.pinned ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          <Icon name="pin" className="w-4 h-4" />
        </button>
        <button
          onClick={() => onRemove(file.docKey)}
          title="Remove from recents"
          className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition disabled:opacity-50 disabled:pointer-events-none"
    >
      <Icon name={icon} className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
    </button>
  )
}

export default function Library() {
  const loadFromDialog = useDocumentStore((s) => s.loadFromDialog)
  const files = useRecentFilesStore((s) => s.files)
  const togglePin = useRecentFilesStore((s) => s.togglePin)
  const removeRecent = useRecentFilesStore((s) => s.remove)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return files
    const q = query.toLowerCase()
    return files.filter((f) => f.name.toLowerCase().includes(q))
  }, [files, query])

  const pinned = useMemo(
    () => filtered.filter((f) => f.pinned).sort((a, b) => a.name.localeCompare(b.name)),
    [filtered]
  )

  const recent = useMemo(() => {
    const list = filtered.filter((f) => !f.pinned)
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'size') return [...list].sort((a, b) => b.sizeBytes - a.sizeBytes)
    return [...list].sort(
      (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
    )
  }, [filtered, sort])

  /** When sorting by recency, break the list into Today / Yesterday / This Week / Earlier. */
  const recentGroups = useMemo(() => {
    if (sort !== 'recent') return [{ label: null as string | null, items: recent }]
    const order = ['Today', 'Yesterday', 'This Week', 'Earlier']
    const map = new Map<string, RecentFile[]>()
    for (const f of recent) {
      const b = dateBucket(f.lastOpenedAt)
      if (!map.has(b)) map.set(b, [])
      map.get(b)!.push(f)
    }
    return order.filter((l) => map.has(l)).map((l) => ({ label: l as string | null, items: map.get(l)! }))
  }, [recent, sort])

  const openRecent = async (f: RecentFile): Promise<void> => {
    if (!f.path) {
      // Local-only doc (drag-dropped) — can't reload from disk. Prompt for a fresh open.
      void loadFromDialog()
      return
    }
    try {
      const result = await window.api.openFilePath(f.path)
      await useDocumentStore.getState().loadBytes(result.bytes, result.name, result.path)
    } catch (err) {
      useDocumentStore.setState({
        error: err instanceof Error ? err.message : `Could not open ${f.name}`
      })
    }
  }

  /** Quick tools operate on a PDF the user picks here, without first opening it in the viewer. */
  const runTool = async (
    label: string,
    needsRender: boolean,
    run: (ctx: {
      originalBytes: Uint8Array
      fileName: string
      pdf?: Awaited<ReturnType<typeof loadDocument>>
    }) => Promise<string | null>
  ): Promise<void> => {
    const picked = await window.api.openFile()
    if (!picked) return
    setBusy(label)
    setToast(null)
    let pdf: Awaited<ReturnType<typeof loadDocument>> | undefined
    try {
      if (needsRender) pdf = await loadDocument(picked.bytes)
      const out = await run({ originalBytes: picked.bytes, fileName: picked.name, pdf })
      if (out) setToast(`${label} complete · saved to ${out}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : `${label} failed`)
    } finally {
      pdf?.destroy()
      setBusy(null)
    }
  }

  const hasFiles = files.length > 0

  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Title bar — drag region; the macOS traffic lights overlay top-left (titleBarStyle: hiddenInset). */}
      <div className="h-10 shrink-0 flex items-center justify-center text-xs font-medium text-neutral-500 dark:text-neutral-500 select-none [-webkit-app-region:drag]">
        PDFgear
      </div>

      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-8 pt-4 pb-12">
          {/* Header */}
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {hasFiles ? 'Your documents' : 'Welcome to PDFgear'}
              </h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {hasFiles
                  ? `${files.length} document${files.length === 1 ? '' : 's'} in your library`
                  : 'Open a PDF to read, annotate, and sign — or drop one anywhere.'}
              </p>
            </div>
            <button
              onClick={() => void loadFromDialog()}
              className="shrink-0 h-9 inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition shadow-sm"
            >
              <Icon name="folder" className="w-4 h-4" />
              Open PDF
            </button>
          </div>

          {/* Quick tools */}
          <div className="mt-6 grid grid-cols-4 gap-3">
            <ToolButton
              icon="merge"
              label="Merge"
              disabled={busy !== null}
              onClick={() => void runTool('Merge', false, (c) => mergePdf(c))}
            />
            <ToolButton
              icon="split"
              label="Split"
              disabled={busy !== null}
              onClick={() => void runTool('Split', false, (c) => splitPdf(c))}
            />
            <ToolButton
              icon="compress"
              label="Compress"
              disabled={busy !== null}
              onClick={() => void runTool('Compress', false, (c) => compressPdf(c))}
            />
            <ToolButton
              icon="word"
              label="To Word"
              disabled={busy !== null}
              onClick={() =>
                void runTool('Convert to Word', true, (c) =>
                  pdfToWord({ pdf: c.pdf!, fileName: c.fileName })
                )
              }
            />
          </div>

          {busy && (
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{busy}… choose a file and output to continue.</p>
          )}
          {toast && (
            <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 truncate">{toast}</p>
          )}

          {/* Recents */}
          {!hasFiles ? (
            <button
              onClick={() => void loadFromDialog()}
              className="mt-8 w-full rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 p-12 text-center text-sm text-neutral-500 dark:text-neutral-500 hover:border-neutral-400 dark:hover:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300 transition flex flex-col items-center gap-2"
            >
              <Icon name="fileText" className="w-6 h-6" />
              No recent documents — click here, or drop a PDF anywhere in this window.
            </button>
          ) : (
            <>
              {/* Search + sort */}
              <div className="mt-8 flex items-center gap-3">
                <div className="relative flex-1">
                  <Icon
                    name="search"
                    className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search recent files…"
                    className="w-full h-9 pl-9 pr-3 rounded-lg text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-9 px-3 rounded-lg text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-neutral-700 dark:text-neutral-300"
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              </div>

              {filtered.length === 0 && (
                <p className="mt-10 text-center text-sm text-neutral-500 dark:text-neutral-500">
                  No files match “{query}”.
                </p>
              )}

              {/* Pinned */}
              {pinned.length > 0 && (
                <section className="mt-6">
                  <h2 className="px-1 text-[11px] font-semibold tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
                    PINNED
                  </h2>
                  <div className="mt-2 flex flex-col gap-0.5">
                    {pinned.map((f) => (
                      <PdfRow
                        key={f.docKey}
                        file={f}
                        onOpen={openRecent}
                        onTogglePin={togglePin}
                        onRemove={removeRecent}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Recent */}
              {recent.length > 0 &&
                recentGroups.map((group, gi) => (
                  <section key={group.label ?? gi} className="mt-6">
                    <h2 className="px-1 text-[11px] font-semibold tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
                      {group.label ?? 'RECENT'}
                    </h2>
                    <div className="mt-2 flex flex-col gap-0.5">
                      {group.items.map((f) => (
                        <PdfRow
                          key={f.docKey}
                          file={f}
                          onOpen={openRecent}
                          onTogglePin={togglePin}
                          onRemove={removeRecent}
                        />
                      ))}
                    </div>
                  </section>
                ))}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useRecentFilesStore, type RecentFile } from '../store/recentFilesStore'
import { loadDocument, renderPageToCanvas } from '../lib/pdfRenderer'
import { mergePdf, splitPdf, compressPdf } from '../lib/convert/pdfTools'
import { pdfToWord } from '../lib/convert/pdfExport'
import { protectPdf, unlockPdf } from '../lib/convert/pdfCrypto'

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

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** A stable, deterministic tint for a filename — used as a placeholder before the thumbnail renders. */
function tintFor(name: string): string {
  const tints = [
    'from-rose-400 to-rose-500',
    'from-amber-400 to-amber-500',
    'from-emerald-400 to-emerald-500',
    'from-sky-400 to-sky-500',
    'from-violet-400 to-violet-500'
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return tints[h % tints.length]
}

// ── First-page thumbnail rendering ──────────────────────────────────────────
// Real page previews are the single biggest premium signal for a PDF app.
// Results are cached per-doc for the session and rendered through a small
// concurrency limiter so opening the library never spawns dozens of workers.
const THUMB_W = 260
const thumbCache = new Map<string, string>()
let activeRenders = 0
const renderQueue: Array<() => void> = []

function pumpQueue(): void {
  while (activeRenders < 3 && renderQueue.length > 0) {
    activeRenders++
    const job = renderQueue.shift()!
    job()
  }
}

function scheduleThumb(fn: () => Promise<void>): void {
  renderQueue.push(() =>
    fn().finally(() => {
      activeRenders--
      pumpQueue()
    })
  )
  pumpQueue()
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
    case 'eye':
      return (
        <svg {...common} className={className}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...common} className={className}>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      )
    case 'sign':
      return (
        <svg {...common} className={className}>
          <path d="M3 19c3-1 4-7 6-7s1 4 3 4 3-9 5-9" />
          <path d="M3 21h18" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common} className={className}>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 'unlock':
      return (
        <svg {...common} className={className}>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 7.5-2" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common} className={className}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...common} className={className}>
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      )
    default:
      return null
  }
}

function RecentThumbnail({ file }: { file: RecentFile }) {
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(file.docKey) ?? null)

  useEffect(() => {
    if (url || !file.path) return
    let cancelled = false
    scheduleThumb(async () => {
      if (cancelled) return
      try {
        const res = await window.api.readFile(file.path!)
        const pdf = await loadDocument(res.bytes)
        const page = await pdf.getPage(1)
        const canvas = document.createElement('canvas')
        const vp = page.getViewport({ scale: 1 })
        await renderPageToCanvas(page, canvas, THUMB_W / vp.width)
        const data = canvas.toDataURL('image/jpeg', 0.82)
        page.cleanup()
        pdf.destroy()
        thumbCache.set(file.docKey, data)
        if (!cancelled) setUrl(data)
      } catch {
        // leave the placeholder in place on failure
      }
    })
    return () => {
      cancelled = true
    }
  }, [file.docKey, file.path, url])

  if (url) {
    return <img src={url} alt="" className="w-full h-full object-cover object-top" draggable={false} />
  }
  return (
    <div className={`w-full h-full bg-gradient-to-br ${tintFor(file.name)} flex items-center justify-center`}>
      <span className="text-white/90 text-xs font-bold tracking-wide">PDF</span>
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
    <div className="group relative flex items-center rounded-xl border border-transparent hover:bg-white dark:hover:bg-white/[0.04] hover:border-neutral-200 dark:hover:border-white/10 hover:shadow-sm transition">
      <button
        onClick={() => onOpen(file)}
        className="flex-1 min-w-0 flex items-center gap-3.5 px-3 py-2.5 text-left"
      >
        <div className="shrink-0 w-10 h-[52px] rounded-md overflow-hidden bg-white ring-1 ring-black/5 dark:ring-white/10 shadow-sm">
          <RecentThumbnail file={file} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {file.pinned && <Icon name="pin" className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {file.name.replace(/\.pdf$/i, '')}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500 tabular-nums">
            {file.pageCount} pages · {formatBytes(file.sizeBytes)} · {timeAgo(file.lastOpenedAt)}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button
          onClick={() => onTogglePin(file.docKey)}
          title={file.pinned ? 'Unpin' : 'Pin'}
          className={`w-7 h-7 rounded-lg flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-white/10 ${
            file.pinned ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          <Icon name="pin" className="w-4 h-4" />
        </button>
        <button
          onClick={() => onRemove(file.docKey)}
          title="Remove from recents"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10"
        >
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ToolCard({
  icon,
  label,
  hint,
  accent,
  onClick,
  disabled
}: {
  icon: string
  label: string
  hint: string
  accent: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group text-left flex items-center gap-3 p-3.5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:bg-neutral-50 dark:hover:bg-white/[0.06] hover:border-neutral-300 dark:hover:border-white/20 hover:shadow-md transition disabled:opacity-50 disabled:pointer-events-none"
    >
      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br ${accent}`}>
        <Icon name={icon} className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</span>
        <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{hint}</span>
      </span>
    </button>
  )
}

function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-9 h-9 rounded-xl bg-neutral-100 dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <div>
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{desc}</div>
      </div>
    </div>
  )
}

type PasswordRequest = {
  title: string
  subtitle: string
  /** true → set a new password (with confirmation); false → enter an existing one. */
  confirm: boolean
  cta: string
  resolve: (value: string | null) => void
}

function PasswordModal({ request }: { request: PasswordRequest }) {
  const [pw, setPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [show, setShow] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => clearTimeout(t)
  }, [])

  const mismatch = request.confirm && confirmPw.length > 0 && pw !== confirmPw
  const valid = pw.length > 0 && (!request.confirm || pw === confirmPw)

  const submit = (): void => {
    if (valid) request.resolve(pw)
  }
  const cancel = (): void => request.resolve(null)

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] px-4" onMouseDown={cancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 ring-1 ring-black/10 dark:ring-white/10 shadow-2xl p-5"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-amber-500 to-orange-600">
            <Icon name={request.confirm ? 'lock' : 'unlock'} className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{request.title}</h3>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{request.subtitle}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="relative">
            <input
              ref={inputRef}
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={onKey}
              placeholder="Password"
              className="w-full h-10 px-3 pr-16 rounded-xl text-sm bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {request.confirm && (
            <input
              type={show ? 'text' : 'password'}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              onKeyDown={onKey}
              placeholder="Confirm password"
              className={`w-full h-10 px-3 rounded-xl text-sm bg-neutral-50 dark:bg-white/[0.04] border focus:outline-none focus:ring-2 ${
                mismatch
                  ? 'border-rose-400 focus:ring-rose-500/40'
                  : 'border-neutral-200 dark:border-white/10 focus:ring-indigo-500/40 focus:border-indigo-500/50'
              }`}
            />
          )}
          {mismatch && <p className="text-[11px] text-rose-500">Passwords don’t match.</p>}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={cancel}
            className="h-9 px-4 rounded-lg text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 shadow-sm disabled:opacity-50 disabled:pointer-events-none transition"
          >
            {request.cta}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Command palette (⌘K) ────────────────────────────────────────────────────
type Command = {
  id: string
  title: string
  subtitle?: string
  icon: string
  accent: string
  kind: 'Action' | 'Open'
  keywords?: string
  run: () => void
}

/** Subsequence fuzzy match — returns 0 for no match, higher is better. */
function fuzzyScore(query: string, text: string): number {
  let ti = 0
  let score = 0
  let streak = 0
  for (let qi = 0; qi < query.length; qi++) {
    const ch = query[qi]
    let found = -1
    for (let j = ti; j < text.length; j++) {
      if (text[j] === ch) {
        found = j
        break
      }
    }
    if (found === -1) return 0
    streak = found === ti ? streak + 2 : 1
    score += streak + (found > 0 && text[found - 1] === ' ' ? 3 : 0)
    ti = found + 1
  }
  return score + Math.max(0, 12 - text.length / 8)
}

function CommandPalette({
  open,
  onClose,
  commands
}: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      const t = setTimeout(() => inputRef.current?.focus(), 10)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return commands
    return commands
      .map((c) => ({ c, s: fuzzyScore(query, `${c.title} ${c.keywords ?? ''}`.toLowerCase()) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c)
  }, [q, commands])

  useEffect(() => setActive(0), [q])

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  if (!open) return null

  const clamped = Math.min(active, Math.max(0, results.length - 1))
  const choose = (i: number): void => {
    const c = results[i]
    if (c) {
      onClose()
      c.run()
    }
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(clamped)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-neutral-900 ring-1 ring-black/10 dark:ring-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 border-b border-neutral-200 dark:border-white/10">
          <Icon name="search" className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search files and tools…"
            className="flex-1 h-12 bg-transparent text-[15px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-500">
              No matches for “{q}”
            </div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                data-active={i === clamped}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(i)}
                className={`w-full flex items-center gap-3 px-3 mx-0 text-left rounded-lg ${
                  i === clamped ? 'bg-indigo-500/10' : ''
                }`}
              >
                <span
                  className={`my-1.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br ${c.accent}`}
                >
                  <Icon name={c.icon} className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1 py-1.5">
                  <span className="block text-sm text-neutral-800 dark:text-neutral-100 truncate">
                    {c.title}
                  </span>
                  {c.subtitle && (
                    <span className="block text-[11px] text-neutral-500 dark:text-neutral-500 truncate">
                      {c.subtitle}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-600 pr-1">
                  {c.kind}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-neutral-200 dark:border-white/10 text-[11px] text-neutral-400 dark:text-neutral-600">
          <span>↵ open</span>
          <span>↑↓ navigate</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
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
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; title: string; detail?: string } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [pwRequest, setPwRequest] = useState<PasswordRequest | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      if (out) setToast({ kind: 'success', title: `${label} complete`, detail: out })
    } catch (err) {
      setToast({ kind: 'error', title: `${label} failed`, detail: err instanceof Error ? err.message : undefined })
    } finally {
      pdf?.destroy()
      setBusy(null)
    }
  }

  const askPassword = (opts: Omit<PasswordRequest, 'resolve'>): Promise<string | null> =>
    new Promise((resolve) => setPwRequest({ ...opts, resolve: (v) => { setPwRequest(null); resolve(v) } }))

  /** Pick a PDF, collect a password, then run an encrypt/decrypt operation. */
  const runCrypto = async (
    label: string,
    confirm: boolean,
    op: (ctx: { originalBytes: Uint8Array; fileName: string }, password: string) => Promise<string | null>
  ): Promise<void> => {
    const picked = await window.api.openFile()
    if (!picked) return
    const password = await askPassword(
      confirm
        ? { title: 'Set a password', subtitle: picked.name, confirm: true, cta: 'Protect' }
        : { title: 'Enter the PDF password', subtitle: picked.name, confirm: false, cta: 'Unlock' }
    )
    if (!password) return
    setBusy(label)
    setToast(null)
    try {
      const out = await op({ originalBytes: picked.bytes, fileName: picked.name }, password)
      if (out) setToast({ kind: 'success', title: `${label} complete`, detail: out })
    } catch (err) {
      setToast({ kind: 'error', title: `${label} failed`, detail: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  const commands = useMemo<Command[]>(() => {
    const actions: Command[] = [
      {
        id: 'open',
        title: 'Open PDF…',
        subtitle: 'Browse for a file',
        icon: 'folder',
        accent: 'from-indigo-500 to-violet-600',
        kind: 'Action',
        keywords: 'open file browse new',
        run: () => void loadFromDialog()
      },
      {
        id: 'merge',
        title: 'Merge PDFs',
        subtitle: 'Combine files into one',
        icon: 'merge',
        accent: 'from-indigo-500 to-indigo-600',
        kind: 'Action',
        keywords: 'combine join append',
        run: () => void runTool('Merge', false, (c) => mergePdf(c))
      },
      {
        id: 'split',
        title: 'Split PDF',
        subtitle: 'One file per page',
        icon: 'split',
        accent: 'from-sky-500 to-sky-600',
        kind: 'Action',
        keywords: 'separate pages extract',
        run: () => void runTool('Split', false, (c) => splitPdf(c))
      },
      {
        id: 'compress',
        title: 'Compress PDF',
        subtitle: 'Shrink file size',
        icon: 'compress',
        accent: 'from-emerald-500 to-emerald-600',
        kind: 'Action',
        keywords: 'reduce smaller optimize',
        run: () => void runTool('Compress', false, (c) => compressPdf(c))
      },
      {
        id: 'word',
        title: 'Convert to Word',
        subtitle: 'Export as .docx',
        icon: 'word',
        accent: 'from-blue-500 to-blue-600',
        kind: 'Action',
        keywords: 'docx export convert microsoft',
        run: () =>
          void runTool('Convert to Word', true, (c) => pdfToWord({ pdf: c.pdf!, fileName: c.fileName }))
      },
      {
        id: 'protect',
        title: 'Protect PDF',
        subtitle: 'Add a password (AES-256)',
        icon: 'lock',
        accent: 'from-amber-500 to-orange-600',
        kind: 'Action',
        keywords: 'password encrypt secure lock',
        run: () => void runCrypto('Protect', true, (c, pw) => protectPdf(c, pw))
      },
      {
        id: 'unlock',
        title: 'Unlock PDF',
        subtitle: 'Remove a password',
        icon: 'unlock',
        accent: 'from-amber-500 to-orange-600',
        kind: 'Action',
        keywords: 'password decrypt remove unlock',
        run: () => void runCrypto('Unlock', false, (c, pw) => unlockPdf(c, pw))
      }
    ]
    const recents: Command[] = files.map((f) => ({
      id: `recent:${f.docKey}`,
      title: f.name.replace(/\.pdf$/i, ''),
      subtitle: `${f.pageCount} pages · ${formatBytes(f.sizeBytes)} · ${timeAgo(f.lastOpenedAt)}`,
      icon: 'fileText',
      accent: 'from-neutral-500 to-neutral-600',
      kind: 'Open',
      keywords: f.name,
      run: () => void openRecent(f)
    }))
    return [...actions, ...recents]
    // openRecent/runTool are stable in behavior across renders; depend on files + loadFromDialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, loadFromDialog])

  const hasFiles = files.length > 0

  return (
    <div className="relative h-screen overflow-hidden bg-neutral-50 dark:bg-[#0b0b0f] text-neutral-900 dark:text-neutral-100">
      {/* Ambient brand glow — premium depth without a heavy hero image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[520px] rounded-full bg-indigo-500/15 dark:bg-indigo-500/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-0 w-[480px] h-[480px] rounded-full bg-fuchsia-500/10 dark:bg-fuchsia-500/15 blur-[120px]"
      />

      {/* Title bar — drag region; macOS traffic lights overlay top-left (titleBarStyle: hiddenInset). */}
      <div className="relative z-10 h-10 shrink-0 flex items-center justify-center text-xs font-medium text-neutral-400 dark:text-neutral-600 select-none [-webkit-app-region:drag]" />

      <main className="relative z-10 h-[calc(100vh-2.5rem)] overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 pb-16">
          {/* Hero */}
          <div className="flex items-end justify-between gap-6 pt-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Icon name="fileText" className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  {hasFiles
                    ? `${files.length} document${files.length === 1 ? '' : 's'} in your library`
                    : 'Open a PDF to read, annotate, and sign'}
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden sm:inline-flex h-11 items-center gap-2 pl-3 pr-2 rounded-xl text-sm text-neutral-500 dark:text-neutral-400 bg-white/70 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/[0.07] transition"
                title="Quick search (⌘K)"
              >
                <Icon name="search" className="w-4 h-4" />
                <span>Search</span>
                <kbd className="ml-1 text-[10px] font-sans px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                  ⌘K
                </kbd>
              </button>
              <button
                onClick={() => void loadFromDialog()}
                className="h-11 inline-flex items-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-700 shadow-lg shadow-indigo-500/25 active:scale-[0.98] transition"
              >
                <Icon name="folder" className="w-4 h-4" />
                Open PDF
              </button>
            </div>
          </div>

          {/* Quick tools */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <ToolCard
              icon="merge"
              label="Merge"
              hint="Combine PDFs into one"
              accent="from-indigo-500 to-indigo-600"
              disabled={busy !== null}
              onClick={() => void runTool('Merge', false, (c) => mergePdf(c))}
            />
            <ToolCard
              icon="split"
              label="Split"
              hint="One file per page"
              accent="from-sky-500 to-sky-600"
              disabled={busy !== null}
              onClick={() => void runTool('Split', false, (c) => splitPdf(c))}
            />
            <ToolCard
              icon="compress"
              label="Compress"
              hint="Shrink file size"
              accent="from-emerald-500 to-emerald-600"
              disabled={busy !== null}
              onClick={() => void runTool('Compress', false, (c) => compressPdf(c))}
            />
            <ToolCard
              icon="word"
              label="To Word"
              hint="Export as .docx"
              accent="from-blue-500 to-blue-600"
              disabled={busy !== null}
              onClick={() =>
                void runTool('Convert to Word', true, (c) => pdfToWord({ pdf: c.pdf!, fileName: c.fileName }))
              }
            />
            <ToolCard
              icon="lock"
              label="Protect"
              hint="Add a password"
              accent="from-amber-500 to-orange-600"
              disabled={busy !== null}
              onClick={() => void runCrypto('Protect', true, (c, pw) => protectPdf(c, pw))}
            />
            <ToolCard
              icon="unlock"
              label="Unlock"
              hint="Remove a password"
              accent="from-rose-500 to-pink-600"
              disabled={busy !== null}
              onClick={() => void runCrypto('Unlock', false, (c, pw) => unlockPdf(c, pw))}
            />
          </div>

          {/* Recents / empty state */}
          {!hasFiles ? (
            <div className="mt-8 rounded-3xl border border-neutral-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur p-10">
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <h2 className="text-lg font-semibold">A faster way to work with PDFs.</h2>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    Native macOS performance, a beautiful reader, and the editing tools you reach for every day.
                  </p>
                  <div className="mt-6 space-y-4">
                    <FeatureItem icon="eye" title="Read anything" desc="Crisp rendering, fast search, dark mode." />
                    <FeatureItem icon="edit" title="Annotate & markup" desc="Highlights, notes, shapes, and text." />
                    <FeatureItem icon="sign" title="Fill & sign" desc="Drop your signature and finish forms." />
                  </div>
                  <button
                    onClick={() => void loadFromDialog()}
                    className="mt-7 h-11 inline-flex items-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/25 active:scale-[0.98] transition"
                  >
                    <Icon name="folder" className="w-4 h-4" />
                    Open your first PDF
                  </button>
                </div>
                <button
                  onClick={() => void loadFromDialog()}
                  className="aspect-[4/3] rounded-2xl border-2 border-dashed border-neutral-300 dark:border-white/15 hover:border-indigo-400 dark:hover:border-indigo-400/60 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition flex flex-col items-center justify-center gap-3 text-neutral-500 dark:text-neutral-400"
                >
                  <span className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center">
                    <Icon name="plus" className="w-6 h-6" />
                  </span>
                  <span className="text-sm font-medium">Drop a PDF here</span>
                  <span className="text-xs">or click to browse</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Search + sort */}
              <div className="mt-10 flex items-center gap-3">
                <div className="relative flex-1">
                  <Icon
                    name="search"
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search recent files…"
                    className="w-full h-10 pl-10 pr-3 rounded-xl text-sm bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                  />
                </div>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-10 px-3 rounded-xl text-sm bg-white dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-neutral-700 dark:text-neutral-300"
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              </div>

              {filtered.length === 0 && (
                <p className="mt-12 text-center text-sm text-neutral-500 dark:text-neutral-500">
                  No files match “{query}”.
                </p>
              )}

              {pinned.length > 0 && (
                <section className="mt-8">
                  <h2 className="px-0.5 text-[11px] font-semibold tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
                    PINNED
                  </h2>
                  <div className="mt-3 flex flex-col gap-0.5">
                    {pinned.map((f) => (
                      <PdfRow key={f.docKey} file={f} onOpen={openRecent} onTogglePin={togglePin} onRemove={removeRecent} />
                    ))}
                  </div>
                </section>
              )}

              {recent.length > 0 &&
                recentGroups.map((group, gi) => (
                  <section key={group.label ?? gi} className="mt-8">
                    <h2 className="px-0.5 text-[11px] font-semibold tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
                      {group.label ?? 'RECENT'}
                    </h2>
                    <div className="mt-3 flex flex-col gap-0.5">
                      {group.items.map((f) => (
                        <PdfRow key={f.docKey} file={f} onOpen={openRecent} onTogglePin={togglePin} onRemove={removeRecent} />
                      ))}
                    </div>
                  </section>
                ))}
            </>
          )}
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      {pwRequest && <PasswordModal key={pwRequest.title + pwRequest.subtitle} request={pwRequest} />}

      {/* Floating status — busy spinner while a tool runs, then a result toast. */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 w-full max-w-md pointer-events-none flex justify-center">
        {busy ? (
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur">
            <span className="w-4 h-4 rounded-full border-2 border-neutral-300 border-t-indigo-500 animate-spin" />
            <span className="text-sm text-neutral-700 dark:text-neutral-200">Working on {busy}…</span>
          </div>
        ) : toast ? (
          <div className="pointer-events-auto flex items-start gap-3 w-full px-4 py-3 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur">
            <span
              className={`shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-white ${
                toast.kind === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            >
              <Icon name={toast.kind === 'success' ? 'check' : 'alert'} className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{toast.title}</div>
              {toast.detail && (
                <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 truncate" title={toast.detail}>
                  {toast.kind === 'success' ? `Saved ${toast.detail.split('/').pop()}` : toast.detail}
                </div>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 -mr-1 w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

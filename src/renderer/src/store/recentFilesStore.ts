import { create } from 'zustand'

export type RecentFile = {
  /** Stable identifier — matches docKey in documentStore. */
  docKey: string
  name: string
  /** Absolute filesystem path, null for drag-dropped or unsaved local docs. */
  path: string | null
  pageCount: number
  sizeBytes: number
  /** ISO timestamp of the last time this file was opened. */
  lastOpenedAt: string
  /** Whether the user has pinned this file. Pinned files surface in the Pinned grid. */
  pinned: boolean
}

type RecentState = {
  files: RecentFile[]
  addOrUpdate: (entry: Omit<RecentFile, 'pinned' | 'lastOpenedAt'> & { pinned?: boolean }) => void
  togglePin: (docKey: string) => void
  remove: (docKey: string) => void
  clear: () => void
}

const STORAGE_KEY = 'pdfgear:recent-files'
const MAX_RECENT = 60

function loadRecent(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is RecentFile =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as RecentFile).docKey === 'string' &&
        typeof (e as RecentFile).name === 'string'
    )
  } catch {
    return []
  }
}

function persist(files: RecentFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  } catch {
    // quota / disabled — silent
  }
}

export const useRecentFilesStore = create<RecentState>((set, get) => ({
  files: loadRecent(),

  addOrUpdate: (entry) => {
    const now = new Date().toISOString()
    const existing = get().files.find((f) => f.docKey === entry.docKey)
    const next: RecentFile = {
      docKey: entry.docKey,
      name: entry.name,
      path: entry.path,
      pageCount: entry.pageCount,
      sizeBytes: entry.sizeBytes,
      lastOpenedAt: now,
      pinned: entry.pinned ?? existing?.pinned ?? false
    }
    const rest = get().files.filter((f) => f.docKey !== entry.docKey)
    const updated = [next, ...rest].slice(0, MAX_RECENT)
    set({ files: updated })
    persist(updated)
  },

  togglePin: (docKey) => {
    const updated = get().files.map((f) =>
      f.docKey === docKey ? { ...f, pinned: !f.pinned } : f
    )
    set({ files: updated })
    persist(updated)
  },

  remove: (docKey) => {
    const updated = get().files.filter((f) => f.docKey !== docKey)
    set({ files: updated })
    persist(updated)
  },

  clear: () => {
    set({ files: [] })
    persist([])
  }
}))

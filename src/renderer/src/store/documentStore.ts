import { create } from 'zustand'
import type { PageViewport } from 'pdfjs-dist'
import { loadDocument, type PDFDocumentProxy } from '../lib/pdfRenderer'
import { useRecentFilesStore } from './recentFilesStore'

export type FitMode = 'manual' | 'width' | 'page'
export type ViewMode = 'single' | 'double'

type DocState = {
  pdf: PDFDocumentProxy | null
  fileName: string | null
  filePath: string | null
  /** Stable identifier for the current document used as a persistence key. */
  docKey: string | null
  /** Independent copy of the loaded PDF bytes, retained for save (pdf.js transfers its copy to a worker). */
  originalBytes: Uint8Array | null
  numPages: number
  currentPage: number
  scale: number
  fitMode: FitMode
  viewMode: ViewMode
  scrollingEnabled: boolean
  loading: boolean
  saving: boolean
  /** Label of the current background conversion, e.g. "PDF to Word". Null when idle. */
  converting: string | null
  error: string | null
  /** True when there are in-memory annotations that differ from the last-saved state. */
  dirty: boolean
  /** Latest rendered viewport per page (1-indexed key). Used for precise scroll-to-match. */
  pageViewports: Record<number, PageViewport>

  loadBytes: (bytes: Uint8Array, name: string, path: string | null) => Promise<void>
  loadFromDialog: () => Promise<void>
  closeDocument: () => void
  setCurrentPage: (n: number) => void
  setScale: (s: number, fitMode?: FitMode) => void
  zoomIn: () => void
  zoomOut: () => void
  setViewMode: (m: ViewMode) => void
  setScrollingEnabled: (v: boolean) => void
  setPageViewport: (page: number, viewport: PageViewport) => void
  markDirty: () => void
  markClean: () => void
  setConverting: (label: string | null) => void
  setError: (msg: string | null) => void
  /** Save annotations into the PDF. Returns the written path or null if cancelled. */
  save: (opts?: { saveAs?: boolean }) => Promise<string | null>
}

function deriveDocKey(name: string, path: string | null, byteLength: number): string {
  if (path) return `path:${path}`
  return `local:${name}|${byteLength}`
}

function basenameOf(p: string): string {
  return p.split(/[/\\]/).pop() ?? p
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 1.2

export const useDocumentStore = create<DocState>((set, get) => ({
  pdf: null,
  fileName: null,
  filePath: null,
  docKey: null,
  originalBytes: null,
  numPages: 0,
  currentPage: 1,
  scale: 1,
  fitMode: 'width',
  viewMode: 'single',
  scrollingEnabled: true,
  loading: false,
  saving: false,
  converting: null,
  error: null,
  dirty: false,
  pageViewports: {},

  loadBytes: async (bytes, name, path) => {
    set({ loading: true, error: null, pageViewports: {}, dirty: false })
    try {
      const prev = get().pdf
      if (prev) await prev.destroy()
      // Keep an independent copy for save — pdf.js transfers `bytes.buffer` to its worker.
      const originalBytes = new Uint8Array(bytes)
      const pdf = await loadDocument(bytes)
      const docKey = deriveDocKey(name, path, originalBytes.byteLength)
      set({
        pdf,
        fileName: name,
        filePath: path,
        docKey,
        originalBytes,
        numPages: pdf.numPages,
        currentPage: 1,
        loading: false
      })
      useRecentFilesStore.getState().addOrUpdate({
        docKey,
        name,
        path,
        pageCount: pdf.numPages,
        sizeBytes: originalBytes.byteLength
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  loadFromDialog: async () => {
    const result = await window.api.openFile()
    if (!result) return
    await get().loadBytes(result.bytes, result.name, result.path)
  },

  closeDocument: () => {
    const prev = get().pdf
    if (prev) prev.destroy()
    set({
      pdf: null,
      fileName: null,
      filePath: null,
      docKey: null,
      originalBytes: null,
      numPages: 0,
      currentPage: 1,
      error: null,
      dirty: false,
      pageViewports: {}
    })
  },

  setCurrentPage: (n) => {
    const { numPages } = get()
    set({ currentPage: Math.min(Math.max(1, n), Math.max(1, numPages)) })
  },

  setScale: (s, fitMode = 'manual') => {
    set({ scale: Math.min(Math.max(s, MIN_SCALE), MAX_SCALE), fitMode })
  },

  zoomIn: () => set((st) => ({ scale: Math.min(st.scale * ZOOM_STEP, MAX_SCALE), fitMode: 'manual' })),
  zoomOut: () => set((st) => ({ scale: Math.max(st.scale / ZOOM_STEP, MIN_SCALE), fitMode: 'manual' })),

  setViewMode: (m) => set({ viewMode: m }),
  setScrollingEnabled: (v) => set({ scrollingEnabled: v }),

  setPageViewport: (page, viewport) => {
    const existing = get().pageViewports[page]
    // Skip the update if nothing observable changed for this page.
    // Without this, every PdfPage render produces a new viewport object,
    // mutating pageViewports, re-rendering PdfViewer, and looping.
    if (
      existing &&
      existing.scale === viewport.scale &&
      existing.width === viewport.width &&
      existing.height === viewport.height &&
      existing.rotation === viewport.rotation
    ) {
      return
    }
    set((st) => ({ pageViewports: { ...st.pageViewports, [page]: viewport } }))
  },

  markDirty: () => {
    if (!get().dirty) set({ dirty: true })
  },
  markClean: () => set({ dirty: false }),
  setConverting: (label) => set({ converting: label }),
  setError: (msg) => set({ error: msg }),

  save: async (opts) => {
    // Lazy imports avoid circular module load (annotation + search stores reference doc store).
    const { applyAnnotationsToPdf } = await import('../lib/savePdf')
    const { useAnnotationStore } = await import('./annotationStore')
    const { useSearchStore } = await import('./searchStore')
    const { extractAllText } = await import('../lib/search')

    const { originalBytes, filePath, fileName, pdf } = get()
    if (!originalBytes) {
      set({ error: 'No document loaded' })
      return null
    }

    let targetPath = opts?.saveAs ? null : filePath
    if (!targetPath) {
      targetPath = await window.api.showSaveDialog(fileName ?? 'document.pdf')
      if (!targetPath) return null
    }

    set({ saving: true, error: null })
    try {
      let pageTexts = useSearchStore.getState().pageTexts
      if (!pageTexts && pdf) {
        pageTexts = await extractAllText(pdf)
        useSearchStore.setState({ pageTexts })
      }
      const annState = useAnnotationStore.getState()
      const byPage = annState.byPage
      const newBytes = await applyAnnotationsToPdf(
        originalBytes,
        byPage,
        pageTexts,
        {
          watermark: annState.watermark,
          headerFooter: annState.headerFooter,
          pageNumbering: annState.pageNumbering
        },
        {
          editableRegions: annState.editableRegions,
          editedRegions: annState.editedRegions
        },
        annState.cropByPage
      )
      const result = await window.api.writeFile(targetPath, newBytes)
      const writtenPath = result.path

      set({
        filePath: writtenPath,
        fileName: basenameOf(writtenPath),
        docKey: `path:${writtenPath}`,
        saving: false,
        dirty: false
      })
      return writtenPath
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }
}))

export type TabId =
  | 'home'
  | 'annotations'
  | 'fill-sign'
  | 'edit'
  | 'pages'
  | 'form'
  | 'tools'
  | 'protect'

type UiState = {
  isDark: boolean
  sidebarOpen: boolean
  closeConfirmOpen: boolean
  /** Active toolbar tab — also drives which main-area view is rendered (PdfViewer vs PagesGrid). */
  activeTab: TabId
  toggleDark: () => void
  toggleSidebar: () => void
  setDark: (v: boolean) => void
  setCloseConfirmOpen: (v: boolean) => void
  setActiveTab: (t: TabId) => void
  /** Close the current document, prompting first if there are unsaved changes. */
  requestCloseDocument: () => void
}

const STORAGE_KEY = 'pdfgear:ui'

function loadUi(): { isDark: boolean; sidebarOpen: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { isDark: true, sidebarOpen: true, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { isDark: window.matchMedia('(prefers-color-scheme: dark)').matches, sidebarOpen: true }
}

function persistUi(state: { isDark: boolean; sidebarOpen: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export const useUiStore = create<UiState>((set, get) => {
  const initial = loadUi()
  return {
    isDark: initial.isDark,
    sidebarOpen: initial.sidebarOpen,
    closeConfirmOpen: false,
    activeTab: 'home' as TabId,
    toggleDark: () => {
      const next = !get().isDark
      set({ isDark: next })
      persistUi({ isDark: next, sidebarOpen: get().sidebarOpen })
    },
    toggleSidebar: () => {
      const next = !get().sidebarOpen
      set({ sidebarOpen: next })
      persistUi({ isDark: get().isDark, sidebarOpen: next })
    },
    setDark: (v) => {
      set({ isDark: v })
      persistUi({ isDark: v, sidebarOpen: get().sidebarOpen })
    },
    setCloseConfirmOpen: (v) => set({ closeConfirmOpen: v }),
    setActiveTab: (t) => set({ activeTab: t }),
    requestCloseDocument: () => {
      const doc = useDocumentStore.getState()
      if (!doc.pdf) return
      if (doc.dirty) set({ closeConfirmOpen: true })
      else doc.closeDocument()
    }
  }
})

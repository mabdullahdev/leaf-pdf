import { create } from 'zustand'

type PagesState = {
  /** 1-indexed page numbers currently selected in the Pages grid. */
  selection: Set<number>
  /** Most recent click anchor — used to compute shift-range selection. */
  anchor: number | null
  /** Grid thumbnail size in CSS px (driven by Zoom in / Zoom out toolbar buttons). */
  thumbWidth: number
  /** Pending mutation pause — used to suppress thumbnail flicker during rebuilds. */
  busy: boolean

  select: (pageNumber: number, mode: 'single' | 'toggle' | 'range') => void
  selectAll: (totalPages: number) => void
  clear: () => void
  /** Set the selection set directly. Used after mutations to keep newly-shifted pages selected. */
  setSelection: (ids: Iterable<number>) => void
  setThumbWidth: (w: number) => void
  zoomIn: () => void
  zoomOut: () => void
  setBusy: (v: boolean) => void
}

const MIN_THUMB = 140
const MAX_THUMB = 320
const DEFAULT_THUMB = 200

export const usePagesStore = create<PagesState>((set, get) => ({
  selection: new Set<number>(),
  anchor: null,
  thumbWidth: DEFAULT_THUMB,
  busy: false,

  select: (pageNumber, mode) => {
    set((st) => {
      if (mode === 'single') {
        return { selection: new Set([pageNumber]), anchor: pageNumber }
      }
      if (mode === 'toggle') {
        const next = new Set(st.selection)
        if (next.has(pageNumber)) next.delete(pageNumber)
        else next.add(pageNumber)
        return { selection: next, anchor: pageNumber }
      }
      // range: extend from anchor (or from min already-selected) to pageNumber
      const anchor = st.anchor ?? (st.selection.size > 0
        ? Math.min(...Array.from(st.selection))
        : pageNumber)
      const lo = Math.min(anchor, pageNumber)
      const hi = Math.max(anchor, pageNumber)
      const next = new Set<number>()
      for (let n = lo; n <= hi; n++) next.add(n)
      return { selection: next, anchor }
    })
  },

  selectAll: (totalPages) => {
    const next = new Set<number>()
    for (let n = 1; n <= totalPages; n++) next.add(n)
    set({ selection: next, anchor: 1 })
  },

  clear: () => set({ selection: new Set(), anchor: null }),

  setSelection: (ids) => {
    const next = new Set<number>()
    for (const id of ids) next.add(id)
    set({ selection: next })
  },

  setThumbWidth: (w) => set({ thumbWidth: Math.max(MIN_THUMB, Math.min(MAX_THUMB, w)) }),

  zoomIn: () => set({ thumbWidth: Math.min(MAX_THUMB, get().thumbWidth + 40) }),
  zoomOut: () => set({ thumbWidth: Math.max(MIN_THUMB, get().thumbWidth - 40) }),
  setBusy: (v) => set({ busy: v })
}))

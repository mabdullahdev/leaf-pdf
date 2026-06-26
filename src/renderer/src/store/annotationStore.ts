import { create } from 'zustand'
import {
  ANNOTATION_COLORS,
  DEFAULT_HEADER_FOOTER,
  DEFAULT_PAGE_NUMBER,
  DEFAULT_WATERMARK,
  type Annotation,
  type AttachedImageAnnotation,
  type EditableTextRegion,
  type FontFamily,
  type FormFieldAnnotation,
  type FormFieldKind,
  type FreeTextAnnotation,
  type HeaderFooterSettings,
  type ImageAnnotation,
  type LinkAnnotation,
  type MarkAnnotation,
  type MarkKind,
  type NoteAnnotation,
  type PageNumberSettings,
  type ShapeAnnotation,
  type ShapeKind,
  type SignatureAnnotation,
  type StampAnnotation,
  type TextAlign,
  type TextAnnotation,
  type WatermarkSettings
} from '../lib/annotations'

export type FreeTextDefaults = {
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
  color: string
  backgroundColor: string | null
  borderColor: string | null
  strokeWidth: number
}

const DEFAULT_FREETEXT: FreeTextDefaults = {
  fontSize: 12,
  fontFamily: 'Helvetica',
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#000000',
  backgroundColor: null,
  borderColor: null,
  strokeWidth: 0
}
import { useDocumentStore } from './documentStore'

export type Tool =
  | 'select'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'note'
  | 'shape'
  | 'freetext'
  | 'signature'
  | 'stamp'
  | 'mark'
  | 'image'
  | 'attached-image'
  | 'ink'
  | 'marker'
  | 'link'
  | 'edit-content'
  | 'form-text'
  | 'form-checkbox'
  | 'form-radio'
  | 'form-dropdown'
  | 'form-listbox'
  | 'crop'
  | 'redact'

/** Per-page crop rects set via the Crop tool. Applied at save time. */
export type CropRect = { x: number; y: number; width: number; height: number }

/** Per-tool default stroke widths in PDF user-space units. */
export const INK_DEFAULT_STROKE = 2
export const MARKER_DEFAULT_STROKE = 12
/** Translucency applied to marker strokes (matches a highlighter). */
export const MARKER_OPACITY = 0.4

/** Template held in-flight between picking an image and clicking the page. */
export type PendingImage = {
  dataUrl: string
  format: 'png' | 'jpeg'
  /** Original pixel dimensions — used to preserve aspect when sizing. */
  pxWidth: number
  pxHeight: number
}

/** Template for an in-flight attached file. */
export type PendingAttachment = {
  fileName: string
  mimeType: string
  dataUrl: string
}

/** Template held in-flight between picking a stamp preset and clicking the page. */
export type PendingStamp = {
  text: string
  color: string
  /** Append " — YYYY-MM-DD HH:MM" to the text at placement time. */
  withDateTime: boolean
}

type ByPage = Record<number, Annotation[]>

type AnnotationState = {
  tool: Tool
  color: string
  shapeKind: ShapeKind
  /** Active stroke width for shape/ink/marker tools (PDF user-space units). */
  strokeWidth: number
  freeTextDefaults: FreeTextDefaults
  byPage: ByPage
  selectedId: string | null
  /** When the Stamp tool is active, this holds the template for the next click. */
  pendingStamp: PendingStamp | null
  /** Sticky toggle on the Stamp dropdown — applies to the next placed stamp. */
  stampWithDateTime: boolean
  /** Currently armed Fill & Sign mark kind. */
  pendingMarkKind: MarkKind | null
  /** Currently armed insertable image. */
  pendingImage: PendingImage | null
  /** Currently armed file attachment. */
  pendingAttachment: PendingAttachment | null
  /** Document-wide watermark — applied on every page at save time. */
  watermark: WatermarkSettings
  /** Per-position header & footer text — applied on every page at save time. */
  headerFooter: HeaderFooterSettings
  /** Page-number stamp — applied on every page at save time. */
  pageNumbering: PageNumberSettings
  /** Per-page detected editable regions. Populated lazily as pages enter Edit mode. */
  editableRegions: Record<number, EditableTextRegion[]>
  /** Override map keyed by region id → new text (when different from original). */
  editedRegions: Record<string, string>
  /** When true, Form fields render as live, fillable inputs instead of design
   *  rectangles. Drives the Preview toggle on the Form toolbar. */
  formPreview: boolean
  /** Per-page crop rectangles (PDF user-space). Applied at save time. */
  cropByPage: Record<number, CropRect>
  /** Past snapshots of byPage for undo. Most-recent at the end. */
  history: ByPage[]
  /** Snapshots created by undo, available to redo. Next-to-redo at index 0. */
  future: ByPage[]

  setTool: (t: Tool) => void
  setColor: (hex: string) => void
  setShapeKind: (k: ShapeKind) => void
  setStrokeWidth: (w: number) => void
  setFreeTextDefaults: (patch: Partial<FreeTextDefaults>) => void
  addTextAnnotation: (a: Omit<TextAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  addNoteAnnotation: (a: Omit<NoteAnnotation, 'id' | 'kind' | 'type' | 'createdAt'>) => string
  addShapeAnnotation: (a: Omit<ShapeAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  addFreeTextAnnotation: (a: Omit<FreeTextAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  addSignatureAnnotation: (a: Omit<SignatureAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  addStampAnnotation: (a: Omit<StampAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  moveStamp: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  setPendingStamp: (p: PendingStamp | null) => void
  setStampWithDateTime: (v: boolean) => void
  addMarkAnnotation: (a: Omit<MarkAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  moveMark: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  setPendingMarkKind: (k: MarkKind | null) => void
  addImageAnnotation: (a: Omit<ImageAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  moveImage: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  resizeImage: (
    id: string,
    patch: { x?: number; y?: number; width?: number; height?: number },
    opts?: { commitHistory?: boolean }
  ) => void
  setPendingImage: (p: PendingImage | null) => void
  addAttachedImageAnnotation: (
    a: Omit<AttachedImageAnnotation, 'id' | 'kind' | 'createdAt'>
  ) => string
  moveAttachedImage: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  setPendingAttachment: (p: PendingAttachment | null) => void
  addLinkAnnotation: (a: Omit<LinkAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  moveLink: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  resizeLink: (
    id: string,
    patch: { x?: number; y?: number; width?: number; height?: number; url?: string },
    opts?: { commitHistory?: boolean }
  ) => void
  setWatermark: (patch: Partial<WatermarkSettings>) => void
  setHeaderFooter: (patch: Partial<HeaderFooterSettings>) => void
  setPageNumbering: (patch: Partial<PageNumberSettings>) => void
  setEditableRegions: (pageNumber: number, regions: EditableTextRegion[]) => void
  setRegionEdit: (regionId: string, text: string | null) => void
  clearAllRegionEdits: () => void
  addFormFieldAnnotation: (a: Omit<FormFieldAnnotation, 'id' | 'kind' | 'createdAt'>) => string
  moveFormField: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  resizeFormField: (
    id: string,
    patch: { x?: number; y?: number; width?: number; height?: number },
    opts?: { commitHistory?: boolean }
  ) => void
  updateFormField: (id: string, patch: Partial<Omit<FormFieldAnnotation, 'id' | 'kind' | 'createdAt'>>) => void
  setFormPreview: (v: boolean) => void
  setCropForPage: (pageNumber: number, rect: CropRect | null) => void
  moveSignature: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  resizeSignature: (
    id: string,
    patch: { x?: number; y?: number; width?: number; height?: number },
    opts?: { commitHistory?: boolean }
  ) => void
  updateNoteText: (id: string, text: string) => void
  moveNote: (id: string, x: number, y: number, opts?: { commitHistory?: boolean }) => void
  updateFreeText: (
    id: string,
    patch: Partial<Omit<FreeTextAnnotation, 'id' | 'kind' | 'createdAt' | 'pageNumber'>>,
    opts?: { commitHistory?: boolean }
  ) => void
  findAnnotation: (id: string) => Annotation | null
  remove: (id: string) => void
  select: (id: string | null) => void
  /** Snapshot current state into history. Call once at the start of a drag/resize
   *  so the live pointermove updates can skip history and collapse into one undo step. */
  beginInteraction: () => void
  undo: () => void
  redo: () => void
  reset: () => void
}

const HISTORY_LIMIT = 50

function colorForTool(tool: Tool): string {
  switch (tool) {
    case 'underline': return '#3b82f6'
    case 'strikethrough': return '#ef4444'
    default: return ANNOTATION_COLORS[0].hex
  }
}


/** Push the *current* byPage onto history and clear the redo stack. */
function withHistory(st: AnnotationState, nextByPage: ByPage): Pick<AnnotationState, 'byPage' | 'history' | 'future'> {
  return {
    byPage: nextByPage,
    history: [...st.history, st.byPage].slice(-HISTORY_LIMIT),
    future: []
  }
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  tool: 'select',
  color: ANNOTATION_COLORS[0].hex,
  shapeKind: 'rectangle',
  strokeWidth: INK_DEFAULT_STROKE,
  freeTextDefaults: DEFAULT_FREETEXT,
  byPage: {},
  selectedId: null,
  pendingStamp: null,
  stampWithDateTime: false,
  pendingMarkKind: null,
  pendingImage: null,
  pendingAttachment: null,
  watermark: DEFAULT_WATERMARK,
  headerFooter: DEFAULT_HEADER_FOOTER,
  pageNumbering: DEFAULT_PAGE_NUMBER,
  editableRegions: {},
  editedRegions: {},
  formPreview: false,
  cropByPage: {},
  history: [],
  future: [],

  setTool: (t) =>
    set((st) => ({
      tool: t,
      color: t === 'select' ? st.color : colorForTool(t),
      // Seed a sensible stroke width per tool — only when switching from a tool
      // that uses a different default, so user-tuned values aren't clobbered
      // mid-session.
      strokeWidth:
        t === 'marker' && st.tool !== 'marker'
          ? MARKER_DEFAULT_STROKE
          : (t === 'ink' || t === 'shape') && st.tool === 'marker'
            ? INK_DEFAULT_STROKE
            : st.strokeWidth,
      // Drop any in-flight template the moment we leave its tool.
      pendingStamp: t === 'stamp' ? st.pendingStamp : null,
      pendingMarkKind: t === 'mark' ? st.pendingMarkKind : null,
      pendingImage: t === 'image' ? st.pendingImage : null,
      pendingAttachment: t === 'attached-image' ? st.pendingAttachment : null
    })),
  setColor: (hex) => set({ color: hex }),
  setShapeKind: (k) => set({ shapeKind: k }),
  setStrokeWidth: (w) => set({ strokeWidth: Math.max(0.25, Math.min(60, w)) }),
  setFreeTextDefaults: (patch) => set((st) => ({ freeTextDefaults: { ...st.freeTextDefaults, ...patch } })),
  findAnnotation: (id) => {
    for (const arr of Object.values(get().byPage)) {
      for (const a of arr) if (a.id === id) return a
    }
    return null
  },

  addTextAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: TextAnnotation = {
      id,
      kind: 'text',
      createdAt: Date.now(),
      ...a
    }
    set((st) =>
      withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      })
    )
    return id
  },

  addNoteAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: NoteAnnotation = {
      id,
      kind: 'note',
      type: 'note',
      createdAt: Date.now(),
      ...a
    }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  addShapeAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: ShapeAnnotation = {
      id,
      kind: 'shape',
      createdAt: Date.now(),
      ...a
    }
    set((st) =>
      withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      })
    )
    return id
  },

  addFreeTextAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: FreeTextAnnotation = {
      id,
      kind: 'freetext',
      createdAt: Date.now(),
      ...a
    }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  addSignatureAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: SignatureAnnotation = {
      id,
      kind: 'signature',
      createdAt: Date.now(),
      ...a
    }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  addStampAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: StampAnnotation = {
      id,
      kind: 'stamp',
      createdAt: Date.now(),
      ...a
    }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  moveStamp: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'stamp' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  setPendingStamp: (p) => set({ pendingStamp: p }),
  setStampWithDateTime: (v) => set({ stampWithDateTime: v }),

  addMarkAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: MarkAnnotation = { id, kind: 'mark', createdAt: Date.now(), ...a }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  moveMark: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'mark' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  setPendingMarkKind: (k) => set({ pendingMarkKind: k }),

  addImageAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: ImageAnnotation = { id, kind: 'image', createdAt: Date.now(), ...a }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  moveImage: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'image' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  resizeImage: (id, patch, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'image') {
            const next = { ...a, ...patch }
            if (
              next.x !== a.x || next.y !== a.y ||
              next.width !== a.width || next.height !== a.height
            ) {
              changed = true
              return next
            }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  setPendingImage: (p) => set({ pendingImage: p }),

  addAttachedImageAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: AttachedImageAnnotation = { id, kind: 'attached-image', createdAt: Date.now(), ...a }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  moveAttachedImage: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'attached-image' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  setPendingAttachment: (p) => set({ pendingAttachment: p }),

  addLinkAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: LinkAnnotation = { id, kind: 'link', createdAt: Date.now(), ...a }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  moveLink: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'link' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  resizeLink: (id, patch, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'link') {
            const next = { ...a, ...patch }
            if (
              next.x !== a.x || next.y !== a.y ||
              next.width !== a.width || next.height !== a.height ||
              next.url !== a.url
            ) {
              changed = true
              return next
            }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  // Document-decor settings — purely metadata, not part of byPage and not in
  // the undo history. Side-effect them straight onto the slice.
  setWatermark: (patch) =>
    set((st) => ({ watermark: { ...st.watermark, ...patch } })),
  setHeaderFooter: (patch) =>
    set((st) => ({ headerFooter: { ...st.headerFooter, ...patch } })),
  setPageNumbering: (patch) =>
    set((st) => ({ pageNumbering: { ...st.pageNumbering, ...patch } })),

  setEditableRegions: (pageNumber, regions) =>
    set((st) => ({ editableRegions: { ...st.editableRegions, [pageNumber]: regions } })),

  setRegionEdit: (regionId, text) =>
    set((st) => {
      const next = { ...st.editedRegions }
      if (text === null) delete next[regionId]
      else next[regionId] = text
      return { editedRegions: next }
    }),

  clearAllRegionEdits: () => set({ editedRegions: {} }),

  addFormFieldAnnotation: (a) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const ann: FormFieldAnnotation = { id, kind: 'form-field', createdAt: Date.now(), ...a }
    set((st) => ({
      ...withHistory(st, {
        ...st.byPage,
        [a.pageNumber]: [...(st.byPage[a.pageNumber] ?? []), ann]
      }),
      selectedId: id
    }))
    return id
  },

  moveFormField: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'form-field' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  resizeFormField: (id, patch, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'form-field') {
            const next = { ...a, ...patch }
            if (
              next.x !== a.x || next.y !== a.y ||
              next.width !== a.width || next.height !== a.height
            ) {
              changed = true
              return next
            }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  updateFormField: (id, patch) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'form-field') {
            const next = { ...a, ...patch } as FormFieldAnnotation
            let diff = false
            for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
              if ((a as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key]) {
                diff = true; break
              }
            }
            if (diff) { changed = true; return next }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      return withHistory(st, out)
    })
  },

  setFormPreview: (v) => set({ formPreview: v }),

  setCropForPage: (pageNumber, rect) =>
    set((st) => {
      const next = { ...st.cropByPage }
      if (rect === null) delete next[pageNumber]
      else next[pageNumber] = rect
      return { cropByPage: next }
    }),

  moveSignature: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'signature' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  resizeSignature: (id, patch, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'signature') {
            const next = { ...a, ...patch }
            if (
              next.x !== a.x ||
              next.y !== a.y ||
              next.width !== a.width ||
              next.height !== a.height
            ) {
              changed = true
              return next
            }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  updateFreeText: (id, patch, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'freetext') {
            const next = { ...a, ...patch }
            // Bail out if nothing in the patched fields actually changed.
            let diff = false
            for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
              if ((a as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key]) {
                diff = true
                break
              }
            }
            if (diff) {
              changed = true
              return next
            }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  updateNoteText: (id, text) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'note' && a.text !== text) {
            changed = true
            return { ...a, text }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      return withHistory(st, out)
    })
  },

  moveNote: (id, x, y, opts) => {
    set((st) => {
      const out: ByPage = {}
      let changed = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const mapped = arr.map((a) => {
          if (a.id === id && a.kind === 'note' && (a.x !== x || a.y !== y)) {
            changed = true
            return { ...a, x, y }
          }
          return a
        })
        out[Number(pn)] = mapped
      }
      if (!changed) return st
      if (opts?.commitHistory === false) return { byPage: out }
      return withHistory(st, out)
    })
  },

  beginInteraction: () => {
    set((st) => ({
      history: [...st.history, st.byPage].slice(-HISTORY_LIMIT),
      future: []
    }))
  },

  remove: (id) => {
    set((st) => {
      const out: ByPage = {}
      let found = false
      for (const [pn, arr] of Object.entries(st.byPage)) {
        const filtered = arr.filter((a) => {
          if (a.id === id) { found = true; return false }
          return true
        })
        if (filtered.length > 0) out[Number(pn)] = filtered
      }
      if (!found) return st
      return {
        ...withHistory(st, out),
        selectedId: st.selectedId === id ? null : st.selectedId
      }
    })
  },

  select: (id) => set({ selectedId: id }),

  undo: () => {
    set((st) => {
      if (st.history.length === 0) return st
      const prev = st.history[st.history.length - 1]
      return {
        byPage: prev,
        history: st.history.slice(0, -1),
        future: [st.byPage, ...st.future].slice(0, HISTORY_LIMIT),
        selectedId: null
      }
    })
  },

  redo: () => {
    set((st) => {
      if (st.future.length === 0) return st
      const next = st.future[0]
      return {
        byPage: next,
        history: [...st.history, st.byPage].slice(-HISTORY_LIMIT),
        future: st.future.slice(1),
        selectedId: null
      }
    })
  },

  reset: () =>
    set({
      byPage: {},
      selectedId: null,
      history: [],
      future: [],
      pendingStamp: null,
      pendingMarkKind: null,
      pendingImage: null,
      pendingAttachment: null,
      editableRegions: {},
      editedRegions: {}
    })
}))

// Mark the document dirty on every annotation change. Annotations are session-only —
// closing without Save discards them. The close-confirm dialog asks before that loss.
if (typeof window !== 'undefined') {
  useAnnotationStore.subscribe((state, prev) => {
    if (state.byPage === prev.byPage && state.editedRegions === prev.editedRegions) return
    if (!useDocumentStore.getState().docKey) return
    useDocumentStore.getState().markDirty()
  })
}

import { create } from 'zustand'

export type SavedSignature = {
  id: string
  /** PNG data URL. */
  dataUrl: string
  /** Image intrinsic pixel dimensions — used to preserve aspect ratio on placement. */
  pxWidth: number
  pxHeight: number
  createdAt: number
}

type SignatureState = {
  signatures: SavedSignature[]
  activeId: string | null
  add: (sig: Omit<SavedSignature, 'id' | 'createdAt'>) => string
  remove: (id: string) => void
  setActive: (id: string | null) => void
}

const STORAGE_KEY = 'pdfgear:signatures:v1'

type Persisted = { signatures: SavedSignature[]; activeId: string | null }

function load(): Persisted {
  if (typeof window === 'undefined') return { signatures: [], activeId: null }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { signatures: [], activeId: null }
    const parsed = JSON.parse(raw) as Persisted
    if (!Array.isArray(parsed.signatures)) return { signatures: [], activeId: null }
    return { signatures: parsed.signatures, activeId: parsed.activeId ?? null }
  } catch {
    return { signatures: [], activeId: null }
  }
}

function persist(s: Persisted): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore quota errors */
  }
}

const initial = load()

export const useSignatureStore = create<SignatureState>((set, get) => ({
  signatures: initial.signatures,
  activeId: initial.activeId,
  add: (sig) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    const next: SavedSignature = { id, createdAt: Date.now(), ...sig }
    const signatures = [...get().signatures, next]
    set({ signatures, activeId: id })
    persist({ signatures, activeId: id })
    return id
  },
  remove: (id) => {
    const signatures = get().signatures.filter((s) => s.id !== id)
    const activeId = get().activeId === id ? signatures[0]?.id ?? null : get().activeId
    set({ signatures, activeId })
    persist({ signatures, activeId })
  },
  setActive: (id) => {
    set({ activeId: id })
    persist({ signatures: get().signatures, activeId: id })
  }
}))

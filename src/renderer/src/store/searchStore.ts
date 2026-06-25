import { create } from 'zustand'
import {
  extractAllText,
  searchAllPages,
  type Match,
  type PageText,
  type SearchError,
  type SearchOptions
} from '../lib/search'
import { useDocumentStore } from './documentStore'

type SearchState = {
  query: string
  options: SearchOptions
  matches: Match[]
  currentIndex: number
  pageTexts: PageText[] | null
  isExtracting: boolean
  error: SearchError | null

  setQuery: (q: string) => Promise<void>
  setOption: <K extends keyof SearchOptions>(key: K, value: boolean) => Promise<void>
  next: () => void
  prev: () => void
  clear: () => void
  reset: () => void
}

async function runSearch(query: string, options: SearchOptions, set: (p: Partial<SearchState>) => void, get: () => SearchState): Promise<void> {
  if (!query) {
    set({ matches: [], currentIndex: -1, error: null })
    return
  }
  let pageTexts = get().pageTexts
  if (!pageTexts) {
    const pdf = useDocumentStore.getState().pdf
    if (!pdf) return
    set({ isExtracting: true })
    try {
      pageTexts = await extractAllText(pdf)
    } catch (err) {
      set({ isExtracting: false })
      console.error('text extraction failed', err)
      return
    }
    if (get().query !== query || get().options !== options) {
      set({ pageTexts, isExtracting: false })
      return
    }
    set({ pageTexts, isExtracting: false })
  }
  const { matches, error } = searchAllPages(pageTexts, query, options)
  set({ matches, error, currentIndex: matches.length > 0 ? 0 : -1 })
  if (matches.length > 0) {
    useDocumentStore.getState().setCurrentPage(matches[0].pageNumber)
  }
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  options: { matchCase: false, wholeWord: false, regex: false },
  matches: [],
  currentIndex: -1,
  pageTexts: null,
  isExtracting: false,
  error: null,

  setQuery: async (q) => {
    set({ query: q })
    await runSearch(q, get().options, set, get)
  },

  setOption: async (key, value) => {
    const next = { ...get().options, [key]: value }
    set({ options: next })
    await runSearch(get().query, next, set, get)
  },

  next: () => {
    const { matches, currentIndex } = get()
    if (matches.length === 0) return
    const ni = (currentIndex + 1) % matches.length
    set({ currentIndex: ni })
    useDocumentStore.getState().setCurrentPage(matches[ni].pageNumber)
  },

  prev: () => {
    const { matches, currentIndex } = get()
    if (matches.length === 0) return
    const ni = (currentIndex - 1 + matches.length) % matches.length
    set({ currentIndex: ni })
    useDocumentStore.getState().setCurrentPage(matches[ni].pageNumber)
  },

  clear: () => set({ query: '', matches: [], currentIndex: -1, error: null }),

  reset: () => set({ query: '', matches: [], currentIndex: -1, pageTexts: null, error: null })
}))

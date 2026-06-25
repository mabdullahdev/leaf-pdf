import { useEffect, useRef, useState } from 'react'
import { useSearchStore } from '../store/searchStore'
import { useDocumentStore } from '../store/documentStore'

function Svg({ children, className = 'w-3.5 h-3.5' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

function OptionRow({
  active,
  onClick,
  label,
  hint,
  chip
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
  chip: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition ${
        active
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700/70'
      }`}
    >
      <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-semibold ${
        active ? 'bg-blue-500/20' : 'bg-neutral-200 dark:bg-neutral-700'
      }`}>
        {chip}
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{hint}</span>
    </button>
  )
}

export default function SearchBar() {
  const query = useSearchStore((s) => s.query)
  const options = useSearchStore((s) => s.options)
  const matches = useSearchStore((s) => s.matches)
  const currentIndex = useSearchStore((s) => s.currentIndex)
  const isExtracting = useSearchStore((s) => s.isExtracting)
  const error = useSearchStore((s) => s.error)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setOption = useSearchStore((s) => s.setOption)
  const next = useSearchStore((s) => s.next)
  const prev = useSearchStore((s) => s.prev)
  const clear = useSearchStore((s) => s.clear)

  const numPages = useDocumentStore((s) => s.numPages)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [showOptions, setShowOptions] = useState(false)

  useEffect(() => {
    const onFocus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('pdfgear:focus-search', onFocus)
    return () => window.removeEventListener('pdfgear:focus-search', onFocus)
  }, [])

  useEffect(() => {
    if (!showOptions) return
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setShowOptions(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showOptions])

  if (numPages === 0) return null

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prev()
      else next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      clear()
      inputRef.current?.blur()
    }
  }

  const status = (() => {
    if (error) return '!'
    if (isExtracting) return '…'
    if (!query) return ''
    if (matches.length === 0) return '0/0'
    return `${currentIndex + 1}/${matches.length}`
  })()

  const anyOption = options.matchCase || options.wholeWord || options.regex
  const hasMatches = matches.length > 0

  return (
    <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
      <div className="relative h-7 inline-flex items-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md focus-within:ring-2 focus-within:ring-blue-500/40">
        <span className="pl-2 text-neutral-400 dark:text-neutral-500">
          <Svg className="w-3.5 h-3.5">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m13.5 13.5-3-3" />
          </Svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => void setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Find in document"
          spellCheck={false}
          aria-invalid={!!error}
          title={error?.message ?? undefined}
          className={`w-48 h-full pl-1.5 pr-2 bg-transparent text-sm outline-none ${
            error ? 'text-red-500' : 'text-neutral-900 dark:text-neutral-100'
          }`}
        />
        {status && (
          <span
            className={`pr-2 text-xs tabular-nums shrink-0 ${
              error ? 'text-red-500' : 'text-neutral-500'
            }`}
          >
            {status}
          </span>
        )}
      </div>

      {/* Options popover */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setShowOptions((v) => !v)}
          title="Search options"
          aria-haspopup="true"
          aria-expanded={showOptions}
          className={`relative h-7 w-7 inline-flex items-center justify-center rounded-md transition ${
            showOptions
              ? 'bg-neutral-300 dark:bg-neutral-700 text-neutral-900 dark:text-white'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
          }`}
        >
          <Svg>
            <path d="M2.5 4h11" />
            <path d="M4.5 8h7" />
            <path d="M6.5 12h3" />
          </Svg>
          {anyOption && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
          )}
        </button>
        {showOptions && (
          <div className="absolute top-full right-0 mt-1.5 w-52 p-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-30">
            <OptionRow
              active={options.matchCase}
              onClick={() => void setOption('matchCase', !options.matchCase)}
              label="Match case"
              hint="Aa"
              chip="Aa"
            />
            <OptionRow
              active={options.wholeWord}
              onClick={() => void setOption('wholeWord', !options.wholeWord)}
              label="Whole word"
              hint="W"
              chip="W"
            />
            <OptionRow
              active={options.regex}
              onClick={() => void setOption('regex', !options.regex)}
              label="Regular expression"
              hint=".*"
              chip=".*"
            />
          </div>
        )}
      </div>

      {/* Prev / next */}
      <button
        onClick={prev}
        disabled={!hasMatches}
        title="Previous match (Shift+Enter)"
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition"
      >
        <Svg><path d="M4 10l4-4 4 4" /></Svg>
      </button>
      <button
        onClick={next}
        disabled={!hasMatches}
        title="Next match (Enter)"
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition"
      >
        <Svg><path d="M4 6l4 4 4-4" /></Svg>
      </button>
    </div>
  )
}

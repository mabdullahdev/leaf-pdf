import { useDocumentStore, useUiStore } from '../store/documentStore'
import SearchBar from './SearchBar'

function IconButton({
  onClick,
  title,
  children,
  disabled
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="h-8 px-2.5 rounded-md text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition [-webkit-app-region:no-drag]"
    >
      {children}
    </button>
  )
}

// Page nav / zoom / fit / dark-mode controls live in the bottom floating
// ViewModeBar — the top toolbar got crowded enough to truncate page numbers.
export default function Toolbar() {
  const fileName = useDocumentStore((s) => s.fileName)
  const dirty = useDocumentStore((s) => s.dirty)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const requestCloseDocument = useUiStore((s) => s.requestCloseDocument)

  return (
    <header className="relative z-30 h-12 flex items-center px-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur select-none [-webkit-app-region:drag]">
      <div className="pl-20 pr-2 flex items-center gap-1 min-w-0">
        <IconButton onClick={toggleSidebar} title="Toggle sidebar">☰</IconButton>
        {fileName && (
          <span
            className="ml-2 pl-2.5 pr-1 h-8 inline-flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-200 rounded-md bg-neutral-200/70 dark:bg-neutral-800/70 max-w-[24rem] min-w-0 [-webkit-app-region:no-drag]"
            title={fileName}
          >
            <span className="truncate min-w-0">{fileName}</span>
            {dirty && <span className="text-amber-500 shrink-0" title="Unsaved annotations">●</span>}
            <button
              onClick={requestCloseDocument}
              title="Close file (⌘W)"
              aria-label="Close file"
              className="shrink-0 ml-0.5 h-5 w-5 inline-flex items-center justify-center rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-300/70 dark:hover:bg-neutral-700/70 transition"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </span>
        )}
      </div>

      <div className="flex-1 flex justify-center">
        <SearchBar />
      </div>

      {/* Right side intentionally empty — page nav / zoom / fit / dark live in ViewModeBar. */}
      <div className="w-20 pr-2" aria-hidden />
    </header>
  )
}

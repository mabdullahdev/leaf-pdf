import { useDocumentStore, useUiStore } from '../store/documentStore'

function BarButton({
  active,
  title,
  onClick,
  disabled,
  className = '',
  children
}: {
  active?: boolean
  title: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`h-8 inline-flex items-center justify-center rounded-md transition disabled:opacity-40 disabled:hover:bg-transparent ${
        active
          ? 'bg-neutral-700/80 text-white'
          : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'
      } ${className}`}
    >
      {children}
    </button>
  )
}

function Svg({ children, className = 'w-4 h-4' }: { children: React.ReactNode; className?: string }) {
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

function Divider() {
  return <div className="w-px h-5 bg-neutral-700/70 mx-0.5 shrink-0" />
}

export default function ViewModeBar() {
  const numPages = useDocumentStore((s) => s.numPages)
  const currentPage = useDocumentStore((s) => s.currentPage)
  const scale = useDocumentStore((s) => s.scale)
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage)
  const setScale = useDocumentStore((s) => s.setScale)
  const zoomIn = useDocumentStore((s) => s.zoomIn)
  const zoomOut = useDocumentStore((s) => s.zoomOut)
  const viewMode = useDocumentStore((s) => s.viewMode)
  const scrollingEnabled = useDocumentStore((s) => s.scrollingEnabled)
  const setViewMode = useDocumentStore((s) => s.setViewMode)
  const setScrollingEnabled = useDocumentStore((s) => s.setScrollingEnabled)

  const isDark = useUiStore((s) => s.isDark)
  const toggleDark = useUiStore((s) => s.toggleDark)

  // Don't render an empty floating bar before a document is open.
  if (numPages === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center z-20">
      <div className="pointer-events-auto inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-neutral-900/90 dark:bg-neutral-900/90 ring-1 ring-black/40 shadow-lg backdrop-blur">
        {/* Page nav */}
        <BarButton
          title="Previous page"
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-8"
        >
          <Svg><path d="M11 3 5 8l6 5" /></Svg>
        </BarButton>
        <BarButton
          title="Next page"
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={currentPage >= numPages}
          className="w-8"
        >
          <Svg><path d="M5 3l6 5-6 5" /></Svg>
        </BarButton>
        <div className="inline-flex items-center gap-1 px-1.5">
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(e) => setCurrentPage(parseInt(e.target.value || '1', 10))}
            aria-label="Current page"
            className="w-10 h-6 px-1 text-center rounded bg-neutral-800 border border-neutral-700 text-xs tabular-nums text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
          />
          <span className="text-xs tabular-nums text-neutral-400">/ {numPages}</span>
        </div>

        <Divider />

        {/* Zoom */}
        <BarButton title="Zoom out (⌘-)" onClick={zoomOut} className="w-8">
          <Svg><path d="M3 8h10" /></Svg>
        </BarButton>
        <button
          onClick={() => setScale(1, 'manual')}
          title="Reset zoom (100%)"
          className="h-8 min-w-[3rem] px-2 text-xs tabular-nums text-neutral-300 hover:text-white hover:bg-neutral-700/50 rounded-md transition"
        >
          {Math.round(scale * 100)}%
        </button>
        <BarButton title="Zoom in (⌘=)" onClick={zoomIn} className="w-8">
          <Svg><path d="M8 3v10M3 8h10" /></Svg>
        </BarButton>

        <Divider />

        {/* Fit */}
        <BarButton title="Fit width (⌘1)" onClick={() => setScale(scale, 'width')} className="w-8">
          <Svg>
            <path d="M2 8h12" />
            <path d="M5 5 2 8l3 3" />
            <path d="M11 5l3 3-3 3" />
          </Svg>
        </BarButton>
        <BarButton title="Fit page (⌘2)" onClick={() => setScale(scale, 'page')} className="w-8">
          <Svg>
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
          </Svg>
        </BarButton>

        <Divider />

        {/* View modes */}
        <BarButton
          title="Single page view"
          active={viewMode === 'single'}
          onClick={() => setViewMode('single')}
          className="w-9"
        >
          <Svg>
            <rect x="4" y="2.5" width="8" height="11" rx="1" />
            <path d="M4 5h8" />
          </Svg>
        </BarButton>
        <BarButton
          title="Double page view"
          active={viewMode === 'double'}
          onClick={() => setViewMode('double')}
          className="w-9"
        >
          <Svg>
            <rect x="2.5" y="2.5" width="5" height="11" rx="1" />
            <rect x="8.5" y="2.5" width="5" height="11" rx="1" />
          </Svg>
        </BarButton>
        <BarButton
          title={scrollingEnabled ? 'Disable scrolling' : 'Enable scrolling'}
          active={!scrollingEnabled}
          onClick={() => setScrollingEnabled(!scrollingEnabled)}
          className="w-9"
        >
          <Svg>
            <path d="M3 8h10" />
            <path d="M5 5 3 8l2 3" />
            <path d="m11 5 2 3-2 3" />
          </Svg>
        </BarButton>

        <Divider />

        {/* Dark mode */}
        <BarButton
          title="Toggle dark mode (⌘⇧D)"
          onClick={toggleDark}
          className="w-9"
        >
          {isDark ? (
            <Svg>
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M3.3 12.7l1.1-1.1M11.6 4.4l1.1-1.1" />
            </Svg>
          ) : (
            <Svg>
              <path d="M13.5 9.5A5 5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
            </Svg>
          )}
        </BarButton>
      </div>
    </div>
  )
}

import { useDocumentStore } from '../store/documentStore'
import Thumbnail from './Thumbnail'

export default function Sidebar() {
  const pdf = useDocumentStore((s) => s.pdf)
  const numPages = useDocumentStore((s) => s.numPages)
  const currentPage = useDocumentStore((s) => s.currentPage)
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage)

  if (!pdf) {
    return (
      <aside className="w-48 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60" />
    )
  }

  return (
    <aside className="w-48 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 overflow-y-auto">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 sticky top-0 bg-neutral-50/95 dark:bg-neutral-950/80 backdrop-blur">
        Pages
      </div>
      <div className="flex flex-col gap-1 p-1">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <Thumbnail
            key={n}
            pdf={pdf}
            pageNumber={n}
            active={n === currentPage}
            onClick={() => setCurrentPage(n)}
          />
        ))}
      </div>
    </aside>
  )
}

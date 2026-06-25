import { useEffect } from 'react'
import Toolbar from './components/Toolbar'
import AnnotationToolbar from './components/AnnotationToolbar'
import Sidebar from './components/Sidebar'
import PdfViewer from './components/PdfViewer'
import ViewModeBar from './components/ViewModeBar'
import Library from './components/Library'
import CloseConfirmDialog from './components/CloseConfirmDialog'
import { useDocumentStore, useUiStore } from './store/documentStore'
import { useSearchStore } from './store/searchStore'
import { useAnnotationStore } from './store/annotationStore'

export default function App() {
  const pdf = useDocumentStore((s) => s.pdf)
  const isDark = useUiStore((s) => s.isDark)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleDark = useUiStore((s) => s.toggleDark)
  const loadFromDialog = useDocumentStore((s) => s.loadFromDialog)
  const loadBytes = useDocumentStore((s) => s.loadBytes)
  const requestCloseDocument = useUiStore((s) => s.requestCloseDocument)
  const zoomIn = useDocumentStore((s) => s.zoomIn)
  const zoomOut = useDocumentStore((s) => s.zoomOut)
  const setScale = useDocumentStore((s) => s.setScale)
  const save = useDocumentStore((s) => s.save)
  const error = useDocumentStore((s) => s.error)
  const loading = useDocumentStore((s) => s.loading)
  const saving = useDocumentStore((s) => s.saving)
  const converting = useDocumentStore((s) => s.converting)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => {
    useSearchStore.getState().reset()
    useAnnotationStore.getState().reset()
    useDocumentStore.getState().markClean()
  }, [pdf])

  useEffect(() => {
    return window.api.onMenu((event) => {
      const docState = useDocumentStore.getState()
      switch (event) {
        case 'open': loadFromDialog(); break
        case 'close':
          if (docState.pdf) requestCloseDocument()
          else void window.api.closeWindow()
          break
        case 'save': void save(); break
        case 'save-as': void save({ saveAs: true }); break
        case 'zoom-in': zoomIn(); break
        case 'zoom-out': zoomOut(); break
        case 'fit-width': setScale(docState.scale, 'width'); break
        case 'fit-page': setScale(docState.scale, 'page'); break
        case 'toggle-dark': toggleDark(); break
        case 'find': window.dispatchEvent(new CustomEvent('pdfgear:focus-search')); break
      }
    })
  }, [loadFromDialog, requestCloseDocument, save, zoomIn, zoomOut, setScale, toggleDark])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (meta && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('pdfgear:focus-search'))
      } else if (meta && !isEditing && e.key.toLowerCase() === 'z') {
        // Don't override Cmd+Z while the user is in a text field — that's native text undo.
        e.preventDefault()
        if (e.shiftKey) useAnnotationStore.getState().redo()
        else useAnnotationStore.getState().undo()
      } else if (e.key === 'Escape') {
        useSearchStore.getState().clear()
        useAnnotationStore.getState().select(null)
        useAnnotationStore.getState().setTool('select')
      } else if (!isEditing && (e.key === 'Backspace' || e.key === 'Delete')) {
        const sel = useAnnotationStore.getState().selectedId
        if (sel) {
          e.preventDefault()
          useAnnotationStore.getState().remove(sel)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.pdf')) return
      const buf = await file.arrayBuffer()
      await loadBytes(new Uint8Array(buf), file.name, null)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [loadBytes])

  if (!pdf) {
    return (
      <div className="h-screen relative">
        <Library />
        {loading && (
          <div className="absolute inset-x-0 top-12 flex justify-center pointer-events-none">
            <div className="px-3 py-1 text-xs bg-black/80 text-white rounded-full">Loading…</div>
          </div>
        )}
        {error && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-3 py-2 text-sm bg-red-600 text-white rounded shadow">
            {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <Toolbar />
      <AnnotationToolbar />
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && <Sidebar />}
        <PdfViewer />
        <ViewModeBar />
      </div>
      {(loading || saving || converting) && (
        <div className="absolute inset-x-0 top-12 flex justify-center pointer-events-none">
          <div className="px-3 py-1 text-xs bg-black/80 text-white rounded-full">
            {converting ? `${converting}…` : saving ? 'Saving…' : 'Loading…'}
          </div>
        </div>
      )}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 text-sm bg-red-600 text-white rounded shadow">
          {error}
        </div>
      )}
      <CloseConfirmDialog />
    </div>
  )
}

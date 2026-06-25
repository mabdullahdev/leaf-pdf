import { useEffect, useRef } from 'react'
import { useDocumentStore, useUiStore } from '../store/documentStore'

export default function CloseConfirmDialog() {
  const open = useUiStore((s) => s.closeConfirmOpen)
  const setOpen = useUiStore((s) => s.setCloseConfirmOpen)
  const fileName = useDocumentStore((s) => s.fileName)
  const saving = useDocumentStore((s) => s.saving)
  const save = useDocumentStore((s) => s.save)
  const closeDocument = useDocumentStore((s) => s.closeDocument)

  const saveBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    saveBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const handleSave = async () => {
    const path = await save()
    // Only close if the save succeeded (path === null means user cancelled the Save dialog or save failed).
    if (path) {
      setOpen(false)
      closeDocument()
    }
  }

  const handleDiscard = () => {
    setOpen(false)
    closeDocument()
  }

  const handleCancel = () => {
    setOpen(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[24rem] rounded-lg shadow-xl bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-800 p-5"
      >
        <h2 id="close-confirm-title" className="text-base font-semibold">
          Save changes before closing?
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {fileName ? (
            <>
              You have unsaved changes in <span className="font-medium">{fileName}</span>. If you
              close without saving, your changes will be lost.
            </>
          ) : (
            'You have unsaved changes. If you close without saving, your changes will be lost.'
          )}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={handleDiscard}
            disabled={saving}
            className="h-9 px-3 rounded-md text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition"
          >
            Don&apos;t Save
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="h-9 px-3 rounded-md text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            ref={saveBtnRef}
            onClick={() => void handleSave()}
            disabled={saving}
            className="h-9 px-4 rounded-md text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60 transition"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

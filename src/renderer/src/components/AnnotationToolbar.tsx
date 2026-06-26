import { Fragment, useEffect, useRef, useState } from 'react'
import { useDocumentStore, useUiStore } from '../store/documentStore'
import { usePagesStore } from '../store/pagesStore'
import { useAnnotationStore, type Tool } from '../store/annotationStore'
import { useSignatureStore } from '../store/signatureStore'
import {
  ANNOTATION_COLORS,
  STAMP_PRESETS,
  type FreeTextAnnotation,
  type MarkKind,
  type PageNumberFormat,
  type PageNumberPosition,
  type ShapeKind
} from '../lib/annotations'
import { MarkGlyph } from './MarkBox'
import FreeTextFormatBar from './FreeTextFormatBar'
import CreateSignatureModal from './CreateSignatureModal'

type ToolEntry = { id: Tool; label: string; title: string; icon: React.ReactNode }

function Svg({ children, className = 'w-4 h-4' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

const TOOLS: ToolEntry[] = [
  {
    id: 'select',
    label: 'Select',
    title: 'Select / pan',
    icon: (
      <Svg>
        <path d="M5 3l6 16 2-7 7-2L5 3Z" />
      </Svg>
    )
  },
  {
    id: 'highlight',
    label: 'Highlight',
    title: 'Highlight text — drag across text',
    icon: (
      <Svg>
        <path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" />
        <path d="M3 21h8" />
      </Svg>
    )
  },
  {
    id: 'underline',
    label: 'Underline',
    title: 'Underline text — drag across text',
    icon: (
      <Svg>
        <path d="M7 4v8a5 5 0 0 0 10 0V4" />
        <path d="M5 20h14" />
      </Svg>
    )
  },
  {
    id: 'strikethrough',
    label: 'Strike',
    title: 'Strike-through text — drag across text',
    icon: (
      <Svg>
        <path d="M5 12h14" />
        <path d="M16 7a4 4 0 0 0-4-3c-2 0-4 1.2-4 3.5 0 1.3.8 2.2 2 2.7" />
        <path d="M8 17a4 4 0 0 0 4 3c2.5 0 4-1.3 4-3.3 0-1.3-.7-2.2-2-2.7" />
      </Svg>
    )
  },
  {
    id: 'note',
    label: 'Note',
    title: 'Sticky note — click to place',
    icon: (
      <Svg>
        <path d="M21 12a8 8 0 0 1-12 6.9L3 21l2.1-6A8 8 0 1 1 21 12Z" />
      </Svg>
    )
  }
]

const SHAPES: { id: ShapeKind; label: string; icon: React.ReactNode }[] = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    icon: (
      <Svg className="w-4 h-4">
        <rect x="3" y="6" width="18" height="12" rx="0.5" />
      </Svg>
    )
  },
  {
    id: 'oval',
    label: 'Oval',
    icon: (
      <Svg className="w-4 h-4">
        <ellipse cx="12" cy="12" rx="9" ry="6" />
      </Svg>
    )
  },
  {
    id: 'line',
    label: 'Line',
    icon: (
      <Svg className="w-4 h-4">
        <path d="M5 18 19 6" />
      </Svg>
    )
  },
  {
    id: 'ink',
    label: 'Ink',
    icon: (
      <Svg className="w-4 h-4">
        <path d="M4 17c2-3 4-6 6-6s2 4 4 4 4-3 6-5" />
      </Svg>
    )
  }
]

const TextIcon = (
  <Svg>
    <path d="M5 6h14" />
    <path d="M12 6v13" />
  </Svg>
)

const ShapesIcon = (
  <Svg>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
  </Svg>
)

const SignatureIcon = (
  <Svg>
    <path d="M3 17c3-1 5-7 8-7s2 5 4 5 3-2 6-3" />
    <path d="M3 20h18" />
  </Svg>
)

const StampIcon = (
  <Svg>
    <path d="M9 3h6l-1 5h3v4H7v-4h3l-1-5Z" />
    <path d="M5 16h14" />
    <path d="M5 20h14" />
  </Svg>
)

const InkIcon = (
  <Svg>
    <path d="m16 4 4 4-9 9-5 1 1-5 9-9Z" />
    <path d="m13 7 4 4" />
  </Svg>
)

const MarkerIcon = (
  <Svg>
    <path d="M3 20h7l9-9-5-5-9 9-2 5Z" />
    <path d="M14 7l3 3" />
  </Svg>
)

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'annotations', label: 'Annotations' },
  { id: 'fill-sign', label: 'Fill & Sign' },
  { id: 'edit', label: 'Edit' },
  { id: 'pages', label: 'Pages' },
  { id: 'form', label: 'Form' },
  { id: 'tools', label: 'Tools' },
  { id: 'protect', label: 'Protect' }
] as const

const ConvertIcon = (
  <Svg>
    <path d="M4 7h11l-3-3" />
    <path d="M20 17H9l3 3" />
  </Svg>
)

export type ConvertId =
  | 'pdf-to-word'
  | 'pdf-to-excel'
  | 'pdf-to-ppt'
  | 'pdf-to-png'
  | 'pdf-to-jpeg'
  | 'pdf-to-rtf'
  | 'pdf-to-txt'
  | 'pdf-to-html'
  | 'pdf-to-xml'
  | 'image-to-pdf'
  | 'rtf-to-pdf'
  | 'txt-to-pdf'
  | 'merge-pdf'
  | 'split-pdf'
  | 'compress-pdf'

type ConvertItem = {
  id: ConvertId
  label: string
  badge: string
  tint: string
  /** True when this item requires a document already loaded. */
  needsDoc: boolean
}

const CONVERT_GROUPS: { title: string; items: ConvertItem[] }[] = [
  {
    title: 'Export from PDF',
    items: [
      { id: 'pdf-to-word', label: 'PDF to Word', badge: 'W', tint: '#2563eb', needsDoc: true },
      { id: 'pdf-to-excel', label: 'PDF to Excel', badge: 'X', tint: '#16a34a', needsDoc: true },
      { id: 'pdf-to-ppt', label: 'PDF to PPT', badge: 'P', tint: '#ea580c', needsDoc: true },
      { id: 'pdf-to-png', label: 'PDF to PNG', badge: 'IMG', tint: '#a855f7', needsDoc: true },
      { id: 'pdf-to-jpeg', label: 'PDF to JPEG', badge: 'IMG', tint: '#a855f7', needsDoc: true },
      { id: 'pdf-to-rtf', label: 'PDF to RTF', badge: 'R', tint: '#7c3aed', needsDoc: true },
      { id: 'pdf-to-txt', label: 'PDF to TXT', badge: 'T', tint: '#0ea5e9', needsDoc: true },
      { id: 'pdf-to-html', label: 'PDF to HTML', badge: '</>', tint: '#0284c7', needsDoc: true },
      { id: 'pdf-to-xml', label: 'PDF to XML', badge: 'XML', tint: '#475569', needsDoc: true }
    ]
  },
  {
    title: 'Convert to PDF',
    items: [
      { id: 'image-to-pdf', label: 'Image to PDF', badge: 'IMG', tint: '#a855f7', needsDoc: false },
      { id: 'rtf-to-pdf', label: 'RTF to PDF', badge: 'R', tint: '#7c3aed', needsDoc: false },
      { id: 'txt-to-pdf', label: 'TXT to PDF', badge: 'T', tint: '#0ea5e9', needsDoc: false }
    ]
  },
  {
    title: 'PDF tools',
    items: [
      { id: 'merge-pdf', label: 'Merge PDF', badge: '⇒', tint: '#0891b2', needsDoc: true },
      { id: 'split-pdf', label: 'Split PDF', badge: '⇋', tint: '#0891b2', needsDoc: true },
      { id: 'compress-pdf', label: 'Compress PDF', badge: '↘', tint: '#65a30d', needsDoc: true }
    ]
  }
]

type TabId = (typeof TABS)[number]['id']

export default function AnnotationToolbar() {
  const numPages = useDocumentStore((s) => s.numPages)
  const pdf = useDocumentStore((s) => s.pdf)
  const originalBytes = useDocumentStore((s) => s.originalBytes)
  const fileName = useDocumentStore((s) => s.fileName)
  const setConverting = useDocumentStore((s) => s.setConverting)
  const setError = useDocumentStore((s) => s.setError)
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const shapeKind = useAnnotationStore((s) => s.shapeKind)
  const setTool = useAnnotationStore((s) => s.setTool)
  const setColor = useAnnotationStore((s) => s.setColor)
  const setShapeKind = useAnnotationStore((s) => s.setShapeKind)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const byPage = useAnnotationStore((s) => s.byPage)
  const undo = useAnnotationStore((s) => s.undo)
  const redo = useAnnotationStore((s) => s.redo)
  const canUndo = useAnnotationStore((s) => s.history.length > 0)
  const canRedo = useAnnotationStore((s) => s.future.length > 0)

  const selectedFreeText: FreeTextAnnotation | null = (() => {
    if (!selectedId) return null
    for (const arr of Object.values(byPage)) {
      for (const a of arr) {
        if (a.id === selectedId && a.kind === 'freetext') return a
      }
    }
    return null
  })()

  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [signatureModalOpen, setSignatureModalOpen] = useState(false)
  const [stampOpen, setStampOpen] = useState(false)
  /** Whether the Presets submenu is expanded inside the Stamp dropdown. */
  const [presetsOpen, setPresetsOpen] = useState(false)
  /** Customize-stamp panel state, surfaced inside the Stamp dropdown. */
  const [customStampOpen, setCustomStampOpen] = useState(false)
  const [customStampText, setCustomStampText] = useState('Approved')
  const [customStampColor, setCustomStampColor] = useState('#22c55e')
  const [watermarkOpen, setWatermarkOpen] = useState(false)
  const [hfOpen, setHfOpen] = useState(false)
  const [pageNumOpen, setPageNumOpen] = useState(false)
  const shapesRef = useRef<HTMLDivElement>(null)
  const convertRef = useRef<HTMLDivElement>(null)
  const signatureRef = useRef<HTMLDivElement>(null)
  const stampRef = useRef<HTMLDivElement>(null)
  const watermarkRef = useRef<HTMLDivElement>(null)
  const hfRef = useRef<HTMLDivElement>(null)
  const pageNumRef = useRef<HTMLDivElement>(null)
  const stampActive = useAnnotationStore((s) => s.tool === 'stamp')
  const stampWithDateTime = useAnnotationStore((s) => s.stampWithDateTime)
  const setPendingStamp = useAnnotationStore((s) => s.setPendingStamp)
  const setStampWithDateTime = useAnnotationStore((s) => s.setStampWithDateTime)
  const markActive = useAnnotationStore((s) => s.tool === 'mark')
  const pendingMarkKind = useAnnotationStore((s) => s.pendingMarkKind)
  const setPendingMarkKind = useAnnotationStore((s) => s.setPendingMarkKind)
  const imageActive = useAnnotationStore((s) => s.tool === 'image')
  const setPendingImage = useAnnotationStore((s) => s.setPendingImage)
  const attachedActive = useAnnotationStore((s) => s.tool === 'attached-image')
  const setPendingAttachment = useAnnotationStore((s) => s.setPendingAttachment)
  const linkActive = useAnnotationStore((s) => s.tool === 'link')
  const editContentActive = useAnnotationStore((s) => s.tool === 'edit-content')
  const formPreview = useAnnotationStore((s) => s.formPreview)
  const setFormPreview = useAnnotationStore((s) => s.setFormPreview)
  const cropActive = useAnnotationStore((s) => s.tool === 'crop')
  const currentPage = useDocumentStore((s) => s.currentPage)
  const pdfDoc = useDocumentStore((s) => s.pdf)
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage)

  // Tools-tab transient UI state — kept here because nothing else needs it.
  const [reading, setReading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ocrOpen, setOcrOpen] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<string>('')
  const [ocrText, setOcrText] = useState<string>('')
  const [ocrRunning, setOcrRunning] = useState(false)

  // Protect-tab transient UI state.
  const redactActive = useAnnotationStore((s) => s.tool === 'redact')
  const [encryptOpen, setEncryptOpen] = useState(false)
  const [encUserPw, setEncUserPw] = useState('')
  const [encOwnerPw, setEncOwnerPw] = useState('')
  const [encKeyBits, setEncKeyBits] = useState<40 | 128 | 256>(256)
  const [encAllowPrint, setEncAllowPrint] = useState(true)
  const [encAllowModify, setEncAllowModify] = useState(false)
  const [encAllowExtract, setEncAllowExtract] = useState(false)
  const [encAllowAnnotate, setEncAllowAnnotate] = useState(true)
  const encryptRef = useRef<HTMLDivElement>(null)
  const pagesSelection = usePagesStore((s) => s.selection)
  const pagesSelectionSize = pagesSelection.size
  const pagesSelectAll = usePagesStore((s) => s.selectAll)
  const pagesClear = usePagesStore((s) => s.clear)
  const pagesSetSelection = usePagesStore((s) => s.setSelection)
  const pagesZoomIn = usePagesStore((s) => s.zoomIn)
  const pagesZoomOut = usePagesStore((s) => s.zoomOut)
  const pagesSetBusy = usePagesStore((s) => s.setBusy)
  const filePath = useDocumentStore((s) => s.filePath)
  const loadBytes = useDocumentStore((s) => s.loadBytes)
  const editedRegionsCount = useAnnotationStore(
    (s) => Object.keys(s.editedRegions).length
  )
  const save = useDocumentStore((s) => s.save)
  const dirty = useDocumentStore((s) => s.dirty)
  const saving = useDocumentStore((s) => s.saving)
  const watermark = useAnnotationStore((s) => s.watermark)
  const headerFooter = useAnnotationStore((s) => s.headerFooter)
  const pageNumbering = useAnnotationStore((s) => s.pageNumbering)
  const setWatermark = useAnnotationStore((s) => s.setWatermark)
  const setHeaderFooter = useAnnotationStore((s) => s.setHeaderFooter)
  const setPageNumbering = useAnnotationStore((s) => s.setPageNumbering)

  const signatures = useSignatureStore((s) => s.signatures)
  const activeSignatureId = useSignatureStore((s) => s.activeId)
  const setActiveSignature = useSignatureStore((s) => s.setActive)
  const removeSignature = useSignatureStore((s) => s.remove)

  useEffect(() => {
    if (!shapesOpen) return
    const onDown = (e: MouseEvent) => {
      if (!shapesRef.current?.contains(e.target as Node)) setShapesOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [shapesOpen])

  useEffect(() => {
    if (!convertOpen) return
    const onDown = (e: MouseEvent) => {
      if (!convertRef.current?.contains(e.target as Node)) setConvertOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [convertOpen])

  useEffect(() => {
    if (!signatureOpen) return
    const onDown = (e: MouseEvent) => {
      if (!signatureRef.current?.contains(e.target as Node)) setSignatureOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [signatureOpen])

  useEffect(() => {
    if (!stampOpen) return
    const onDown = (e: MouseEvent) => {
      if (!stampRef.current?.contains(e.target as Node)) {
        setStampOpen(false)
        setPresetsOpen(false)
        setCustomStampOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [stampOpen])

  useEffect(() => {
    if (!watermarkOpen) return
    const onDown = (e: MouseEvent) => {
      if (!watermarkRef.current?.contains(e.target as Node)) setWatermarkOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [watermarkOpen])

  useEffect(() => {
    if (!hfOpen) return
    const onDown = (e: MouseEvent) => {
      if (!hfRef.current?.contains(e.target as Node)) setHfOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [hfOpen])

  useEffect(() => {
    if (!pageNumOpen) return
    const onDown = (e: MouseEvent) => {
      if (!pageNumRef.current?.contains(e.target as Node)) setPageNumOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pageNumOpen])

  useEffect(() => {
    if (!encryptOpen) return
    const onDown = (e: MouseEvent) => {
      if (!encryptRef.current?.contains(e.target as Node)) setEncryptOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [encryptOpen])

  // Slideshow autoplay — when Play is toggled on, advance every 4 seconds.
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const doc = useDocumentStore.getState()
      const next = doc.currentPage + 1
      if (next > doc.numPages) {
        setPlaying(false)
        return
      }
      setCurrentPage(next)
    }, 4000)
    return () => window.clearInterval(id)
  }, [playing, setCurrentPage])

  // Read Aloud — extract current page's text and stream it to the browser's
  // SpeechSynthesis engine. Stop when the button is pressed again or the page
  // changes.
  useEffect(() => {
    if (!reading) {
      window.speechSynthesis?.cancel()
      return
    }
    let cancelled = false
    const synth = window.speechSynthesis
    if (!synth) {
      setReading(false)
      return
    }
    async function go(): Promise<void> {
      if (!pdfDoc) { setReading(false); return }
      const m = await import('../lib/convert/shared')
      const texts = await m.extractPagesText(pdfDoc)
      if (cancelled) return
      const text = texts[currentPage - 1]
      if (!text || text.trim().length === 0) {
        setReading(false)
        return
      }
      const u = new SpeechSynthesisUtterance(text)
      u.onend = () => { if (!cancelled) setReading(false) }
      u.onerror = () => { if (!cancelled) setReading(false) }
      synth.cancel()
      synth.speak(u)
    }
    void go()
    return () => {
      cancelled = true
      synth.cancel()
    }
  }, [reading, pdfDoc, currentPage])

  const pickStampPreset = (text: string, color: string): void => {
    setPendingStamp({ text, color, withDateTime: false })
    setTool('stamp')
    setStampOpen(false)
    setPresetsOpen(false)
    setCustomStampOpen(false)
  }

  const applyCustomStamp = (): void => {
    const text = customStampText.trim()
    if (!text) return
    setPendingStamp({ text, color: customStampColor, withDateTime: false })
    setTool('stamp')
    setStampOpen(false)
    setPresetsOpen(false)
    setCustomStampOpen(false)
  }

  /** Arm the Mark tool with the picked glyph. Clicking on the page drops one. */
  const pickMark = (kind: MarkKind): void => {
    if (markActive && pendingMarkKind === kind) {
      // Toggle off — exit Mark mode if user reclicks the active glyph.
      setTool('select')
      setPendingMarkKind(null)
      return
    }
    setPendingMarkKind(kind)
    setTool('mark')
  }

  /** Pick an image file (PNG/JPEG) and arm the Image tool. */
  const pickImageFile = async (): Promise<void> => {
    const paths = await window.api.showOpenFilesDialog({
      title: 'Choose image to insert',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
      multi: false
    })
    if (!paths || paths.length === 0) return
    const file = await window.api.readFile(paths[0])
    const ext = paths[0].toLowerCase().split('.').pop()
    const format: 'png' | 'jpeg' = ext === 'png' ? 'png' : 'jpeg'
    const dataUrl = bytesToDataUrl(file.bytes, format === 'png' ? 'image/png' : 'image/jpeg')
    const dims = await loadImageDims(dataUrl)
    setPendingImage({ dataUrl, format, pxWidth: dims.width, pxHeight: dims.height })
    setTool('image')
  }

  /** Pick a file (any type) for the Attached-image tool. */
  const pickAttachmentFile = async (): Promise<void> => {
    const paths = await window.api.showOpenFilesDialog({
      title: 'Choose file to attach',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      multi: false
    })
    if (!paths || paths.length === 0) return
    const file = await window.api.readFile(paths[0])
    const ext = (paths[0].toLowerCase().split('.').pop() ?? '').toLowerCase()
    const mimeType =
      ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
      ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const dataUrl = bytesToDataUrl(file.bytes, mimeType)
    setPendingAttachment({ fileName: file.name, mimeType, dataUrl })
    setTool('attached-image')
  }

  const runConvert = async (id: ConvertId): Promise<void> => {
    const label =
      CONVERT_GROUPS.flatMap((g) => g.items).find((i) => i.id === id)?.label ?? id
    setError(null)
    setConverting(label)
    try {
      if (id === 'image-to-pdf') {
        const { imageToPdf } = await import('../lib/convert/pdfImport')
        await imageToPdf()
      } else if (id === 'txt-to-pdf') {
        const { txtToPdf } = await import('../lib/convert/pdfImport')
        await txtToPdf()
      } else if (id === 'rtf-to-pdf') {
        const { rtfToPdf } = await import('../lib/convert/pdfImport')
        await rtfToPdf()
      } else {
        // All other items require a loaded document.
        if (!pdf || !originalBytes || !fileName) {
          setError('Open a PDF first')
          return
        }
        const ctx = { pdf, fileName }
        const toolCtx = { originalBytes, fileName }
        switch (id) {
          case 'pdf-to-png': {
            const m = await import('../lib/convert/pdfExport')
            await m.pdfToImages(ctx, 'image/png'); break
          }
          case 'pdf-to-jpeg': {
            const m = await import('../lib/convert/pdfExport')
            await m.pdfToImages(ctx, 'image/jpeg'); break
          }
          case 'pdf-to-txt': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToTxt(ctx); break
          }
          case 'pdf-to-html': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToHtml(ctx); break
          }
          case 'pdf-to-xml': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToXml(ctx); break
          }
          case 'pdf-to-rtf': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToRtf(ctx); break
          }
          case 'pdf-to-word': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToWord(ctx); break
          }
          case 'pdf-to-excel': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToExcel(ctx); break
          }
          case 'pdf-to-ppt': {
            const m = await import('../lib/convert/pdfExport'); await m.pdfToPpt(ctx); break
          }
          case 'merge-pdf': {
            const m = await import('../lib/convert/pdfTools'); await m.mergePdf(toolCtx); break
          }
          case 'split-pdf': {
            const m = await import('../lib/convert/pdfTools'); await m.splitPdf(toolCtx); break
          }
          case 'compress-pdf': {
            const m = await import('../lib/convert/pdfTools'); await m.compressPdf(toolCtx); break
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(null)
    }
  }

  const handleRealTool = (id: Tool): void => {
    setTool(id)
    setShapesOpen(false)
  }

  const handleShape = (id: ShapeKind): void => {
    setShapeKind(id)
    setTool('shape')
    setShapesOpen(false)
  }

  /** Reload the document with mutated bytes. Annotations and region edits are
   *  intentionally NOT carried forward — page-number-keyed data would be wrong
   *  after a reorder/delete. We warn before destructive ops. */
  const reloadWithBytes = async (newBytes: Uint8Array): Promise<void> => {
    pagesSetBusy(true)
    try {
      await loadBytes(newBytes, fileName ?? 'document.pdf', filePath)
    } finally {
      pagesSetBusy(false)
    }
  }

  const annotationsWillBeLostWarning = (): boolean => {
    const ann = useAnnotationStore.getState()
    const hasAnnotations =
      Object.values(ann.byPage).some((arr) => arr.length > 0) ||
      Object.keys(ann.editedRegions).length > 0
    if (!hasAnnotations) return true
    return window.confirm(
      'This will discard any unsaved annotations and text edits on the document. Continue?'
    )
  }

  const runPagesOp = async (
    label: string,
    body: () => Promise<void>
  ): Promise<void> => {
    if (!originalBytes) return
    setError(null)
    setConverting(label)
    try {
      await body()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(null)
    }
  }

  const onPagesNew = async (): Promise<void> => {
    if (!originalBytes) return
    if (!annotationsWillBeLostWarning()) return
    const after = pagesSelectionSize > 0
      ? Math.max(...Array.from(pagesSelection))
      : numPages
    await runPagesOp('Adding page', async () => {
      const ops = await import('../lib/pages/operations')
      const { bytes, insertedAt } = await ops.insertBlankPage(originalBytes, after)
      await reloadWithBytes(bytes)
      pagesSetSelection([insertedAt])
    })
  }

  const onPagesDelete = async (): Promise<void> => {
    if (!originalBytes || pagesSelectionSize === 0) return
    if (pagesSelectionSize >= numPages) {
      window.alert('Cannot delete every page in the document.')
      return
    }
    if (!annotationsWillBeLostWarning()) return
    await runPagesOp('Deleting pages', async () => {
      const ops = await import('../lib/pages/operations')
      const newBytes = await ops.deletePages(originalBytes, pagesSelection)
      await reloadWithBytes(newBytes)
      pagesClear()
    })
  }

  const onPagesRotate = async (direction: 'left' | 'right'): Promise<void> => {
    if (!originalBytes) return
    const target = pagesSelectionSize > 0
      ? pagesSelection
      : new Set<number>(Array.from({ length: numPages }, (_, i) => i + 1))
    await runPagesOp(`Rotating ${direction}`, async () => {
      const ops = await import('../lib/pages/operations')
      const newBytes = await ops.rotatePages(originalBytes, target, direction)
      await reloadWithBytes(newBytes)
    })
  }

  const onPagesExtract = async (): Promise<void> => {
    if (!originalBytes || pagesSelectionSize === 0) return
    const path = await window.api.showSaveFileDialog({
      title: 'Save extracted pages',
      defaultName: (fileName ? fileName.replace(/\.pdf$/i, '') : 'document') + '-extract.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (!path) return
    await runPagesOp('Extracting pages', async () => {
      const ops = await import('../lib/pages/operations')
      const newBytes = await ops.extractPages(originalBytes, pagesSelection)
      await window.api.writeFile(path, newBytes)
    })
  }

  const onPagesAppend = async (): Promise<void> => {
    if (!originalBytes) return
    const paths = await window.api.showOpenFilesDialog({
      title: 'Append PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      multi: false
    })
    if (!paths || paths.length === 0) return
    if (!annotationsWillBeLostWarning()) return
    await runPagesOp('Appending file', async () => {
      const ops = await import('../lib/pages/operations')
      const extra = await window.api.readFile(paths[0])
      const newBytes = await ops.appendDocument(originalBytes, extra.bytes)
      await reloadWithBytes(newBytes)
    })
  }

  const onPagesSplit = async (): Promise<void> => {
    if (!originalBytes) return
    let splitAfter: number
    if (pagesSelectionSize === 1) {
      splitAfter = Math.min(...Array.from(pagesSelection))
    } else {
      const v = window.prompt(
        `Split after which page number? (1 - ${numPages - 1})`,
        String(Math.floor(numPages / 2))
      )
      if (!v) return
      const n = parseInt(v, 10)
      if (!Number.isFinite(n) || n < 1 || n >= numPages) {
        window.alert(`Please enter a number between 1 and ${numPages - 1}.`)
        return
      }
      splitAfter = n
    }
    const dir = await window.api.showOpenDirectoryDialog('Choose output folder')
    if (!dir) return
    await runPagesOp('Splitting document', async () => {
      const ops = await import('../lib/pages/operations')
      await ops.splitAt(
        originalBytes,
        fileName ?? 'document.pdf',
        splitAfter,
        dir,
        async (p, b) => { await window.api.writeFile(p, b) }
      )
    })
  }

  /** Protect — encrypt the current document with QPDF-wasm and save. */
  const runEncrypt = async (): Promise<void> => {
    if (!originalBytes || !encOwnerPw.trim()) {
      window.alert('Set at least the owner password before encrypting.')
      return
    }
    const path = await window.api.showSaveFileDialog({
      title: 'Save encrypted PDF',
      defaultName: (fileName ? fileName.replace(/\.pdf$/i, '') : 'document') + '-protected.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (!path) return
    setError(null)
    setConverting('Encrypting')
    try {
      const { encryptPdf } = await import('../lib/protect/qpdf')
      const out = await encryptPdf(originalBytes, {
        userPassword: encUserPw,
        ownerPassword: encOwnerPw,
        keyBits: encKeyBits,
        allowPrint: encAllowPrint,
        allowModify: encAllowModify,
        allowExtract: encAllowExtract,
        allowAnnotate: encAllowAnnotate
      })
      await window.api.writeFile(path, out)
      setEncryptOpen(false)
      setEncUserPw('')
      setEncOwnerPw('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(null)
    }
  }

  /** Protect — strip encryption from a password-protected PDF. */
  const runDecrypt = async (): Promise<void> => {
    if (!originalBytes) return
    const password = window.prompt('Enter the current password to remove protection:', '')
    if (password === null) return
    const path = await window.api.showSaveFileDialog({
      title: 'Save decrypted PDF',
      defaultName: (fileName ? fileName.replace(/\.pdf$/i, '') : 'document') + '-unlocked.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (!path) return
    setError(null)
    setConverting('Removing password')
    try {
      const { decryptPdf } = await import('../lib/protect/qpdf')
      const out = await decryptPdf(originalBytes, password)
      await window.api.writeFile(path, out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(null)
    }
  }

  /** Protect — flatten form fields so the document can't be re-filled. */
  const runFlatten = async (): Promise<void> => {
    if (!originalBytes) return
    const path = await window.api.showSaveFileDialog({
      title: 'Save flattened PDF',
      defaultName: (fileName ? fileName.replace(/\.pdf$/i, '') : 'document') + '-flat.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (!path) return
    setError(null)
    setConverting('Flattening')
    try {
      // Re-use the normal save pipeline first (bakes annotations/regions/decor),
      // then flatten the resulting bytes so AcroForm fields lose interactivity.
      const { applyAnnotationsToPdf } = await import('../lib/savePdf')
      const ann = useAnnotationStore.getState()
      const baked = await applyAnnotationsToPdf(
        originalBytes,
        ann.byPage,
        null,
        {
          watermark: ann.watermark,
          headerFooter: ann.headerFooter,
          pageNumbering: ann.pageNumbering
        },
        { editableRegions: ann.editableRegions, editedRegions: ann.editedRegions },
        ann.cropByPage
      )
      const { flattenPdf } = await import('../lib/protect/flatten')
      const out = await flattenPdf(baked)
      await window.api.writeFile(path, out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(null)
    }
  }

  /** Tools-tab quick actions that wrap existing Convert ops. */
  const runCompress = (): Promise<void> => runConvert('compress-pdf')
  const runMerge = (): Promise<void> => runConvert('merge-pdf')
  const runSplit = (): Promise<void> => runConvert('split-pdf')

  /** Run Tesseract on the current page and open a result modal. */
  const runOcr = async (): Promise<void> => {
    if (!pdfDoc) return
    setOcrOpen(true)
    setOcrRunning(true)
    setOcrText('')
    setOcrStatus('Loading OCR…')
    try {
      const { ocrPage } = await import('../lib/tools/ocr')
      const text = await ocrPage(pdfDoc, currentPage, (status, progress) => {
        setOcrStatus(`${status}${progress ? ` — ${Math.round(progress * 100)}%` : ''}`)
      })
      setOcrText(text)
      setOcrStatus('Done')
    } catch (err) {
      setOcrStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setOcrRunning(false)
    }
  }

  /** Open the current page's text in Google Translate. We don't ship a
   *  translation backend; this just hands the text off to the browser. */
  const runTranslate = async (): Promise<void> => {
    if (!pdfDoc) return
    const m = await import('../lib/convert/shared')
    const texts = await m.extractPagesText(pdfDoc)
    const text = texts[currentPage - 1] ?? ''
    const trimmed = text.trim().slice(0, 4500) // URL length-ish cap
    if (!trimmed) {
      window.alert('No extractable text on this page.')
      return
    }
    const url = `https://translate.google.com/?sl=auto&tl=en&op=translate&text=${encodeURIComponent(trimmed)}`
    // Electron's webContents intercepts target=_blank → shell.openExternal, so
    // this opens the user's default browser instead of a new Electron window.
    window.open(url, '_blank')
  }

  const handleText = (): void => {
    if (tool === 'freetext') setTool('select')
    else setTool('freetext')
  }

  const shapesActive = tool === 'shape'
  const textActive = tool === 'freetext'
  const signatureActive = tool === 'signature'
  const inkActive = tool === 'ink'
  const markerActive = tool === 'marker'
  const colorTool = tool !== 'select' && tool !== 'signature'
  /** True for tools that draw freehand/shape strokes — drives the stroke-width slider. */
  const strokeTool = tool === 'shape' || tool === 'ink' || tool === 'marker'
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const isAnnotationContext = activeTab === 'home' || activeTab === 'annotations'
  const showTextFormatBar = isAnnotationContext && (tool === 'freetext' || selectedFreeText !== null)
  const showColorBar = isAnnotationContext && colorTool && !showTextFormatBar

  if (numPages === 0) return null

  return (
    <div className="relative z-20 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-900/70 backdrop-blur select-none">
      {/* Row 1 — undo/redo + tab labels */}
      <div className="h-9 flex items-center px-2 gap-2">
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            aria-label="Undo"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition"
          >
            <Svg className="w-4 h-4">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </Svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition"
          >
            <Svg className="w-4 h-4">
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H10a6 6 0 0 0 0 12h3" />
            </Svg>
          </button>
        </div>

        <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700" />

        <div className="flex items-center gap-0.5 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`relative h-9 px-3 text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'text-neutral-900 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                {t.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-blue-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Row 2 — active tab content */}
      <div className="h-11 flex items-center px-3 gap-0.5 border-t border-neutral-200/70 dark:border-neutral-800/70">
        {isAnnotationContext || activeTab === 'fill-sign' || activeTab === 'edit' || activeTab === 'pages' || activeTab === 'form' || activeTab === 'tools' || activeTab === 'protect' ? (
          <>
            {isAnnotationContext && (
              <>
            {TOOLS.map((t, i) => {
              const active = tool === t.id
              return (
                <Fragment key={t.id}>
                  <button
                    onClick={() => handleRealTool(t.id)}
                    title={t.title}
                    className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                      active
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                  {/* Divider immediately after Select */}
                  {i === 0 && (
                    <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />
                  )}
                </Fragment>
              )
            })}

            {/* Shapes — dropdown */}
            <div className="relative" ref={shapesRef}>
              <button
                onClick={() => setShapesOpen((v) => !v)}
                title="Shapes"
                aria-haspopup="menu"
                aria-expanded={shapesOpen}
                className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                  shapesActive || shapesOpen
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  {ShapesIcon}
                  <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 3 4 5.5 6.5 3" />
                  </svg>
                </span>
                <span>Shapes</span>
              </button>
              {shapesOpen && (
                <div
                  role="menu"
                  className="absolute top-full left-0 mt-1 w-40 p-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40"
                >
                  {SHAPES.map((s) => {
                    const active = tool === 'shape' && shapeKind === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleShape(s.id)}
                        role="menuitemradio"
                        aria-checked={active}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition ${
                          active
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700/70'
                        }`}
                      >
                        <span className="inline-flex items-center justify-center h-5 w-5 shrink-0">
                          {s.icon}
                        </span>
                        <span>{s.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Text — toggle */}
            <button
              onClick={handleText}
              title="Text"
              aria-pressed={textActive}
              className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                textActive
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
              }`}
            >
              {TextIcon}
              <span>Text</span>
            </button>

            {/* Marker — freehand highlighter (semi-transparent, thick) */}
            <button
              onClick={() => handleRealTool(markerActive ? 'select' : 'marker')}
              title="Marker — drag to highlight freehand"
              aria-pressed={markerActive}
              className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                markerActive
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
              }`}
            >
              {MarkerIcon}
              <span>Marker</span>
            </button>

            {/* Ink — freehand pen */}
            <button
              onClick={() => handleRealTool(inkActive ? 'select' : 'ink')}
              title="Ink — drag to draw freehand"
              aria-pressed={inkActive}
              className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                inkActive
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
              }`}
            >
              {InkIcon}
              <span>Ink</span>
            </button>

            {activeTab === 'home' && (
              <>
                {/* Divider before Convert */}
                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Convert — dropdown */}
                <div className="relative" ref={convertRef}>
              <button
                onClick={() => setConvertOpen((v) => !v)}
                title="Convert"
                aria-haspopup="menu"
                aria-expanded={convertOpen}
                className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                  convertOpen
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  {ConvertIcon}
                  <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 3 4 5.5 6.5 3" />
                  </svg>
                </span>
                <span>Convert</span>
              </button>
              {convertOpen && (
                <div
                  role="menu"
                  className="absolute top-full left-0 mt-1 w-64 py-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40 max-h-[70vh] overflow-y-auto"
                >
                  {CONVERT_GROUPS.map((group, gi) => (
                    <div key={group.title}>
                      {gi > 0 && <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />}
                      <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        {group.title}
                      </div>
                      {group.items.map((item) => {
                        const disabled = item.needsDoc && numPages === 0
                        return (
                          <button
                            key={item.id}
                            role="menuitem"
                            disabled={disabled}
                            onClick={() => {
                              setConvertOpen(false)
                              void runConvert(item.id)
                            }}
                            title={disabled ? `${item.label} — open a PDF first` : item.label}
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                              disabled
                                ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                                : 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700/70'
                            }`}
                          >
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded text-[9px] font-bold text-white"
                              style={{ background: item.tint, opacity: disabled ? 0.4 : 1 }}
                            >
                              {item.badge}
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
              </>
            )}
              </>
            )}

            {activeTab === 'fill-sign' && (
              <>
                {/* Select — first action on Fill & Sign too, for parity with Home. */}
                <button
                  onClick={() => handleRealTool('select')}
                  title={TOOLS[0].title}
                  aria-pressed={tool === 'select'}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    tool === 'select'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  {TOOLS[0].icon}
                  <span>{TOOLS[0].label}</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Quick-fill marks — six tiny glyph buttons in a row. */}
                <div className="flex items-center gap-0.5">
                  {(['check', 'cross', 'dot', 'dash', 'square', 'circle'] as MarkKind[]).map((k) => {
                    const active = markActive && pendingMarkKind === k
                    return (
                      <button
                        key={k}
                        onClick={() => pickMark(k)}
                        title={`Place ${k}`}
                        aria-pressed={active}
                        className={`h-9 w-9 flex items-center justify-center rounded-md transition ${
                          active
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                        }`}
                      >
                        <MarkGlyph kind={k} color="currentColor" strokeCss={1.4} sizeCss={18} />
                      </button>
                    )
                  })}
                </div>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Text (reuses the existing FreeText tool) */}
                <button
                  onClick={handleText}
                  title="Text — click on the page to add a text box"
                  aria-pressed={textActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    textActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  {TextIcon}
                  <span>Text</span>
                </button>

                {/* Image — drops a visible image onto the page. */}
                <button
                  onClick={() => { void pickImageFile() }}
                  title="Image — pick a file, then click on the page to place"
                  aria-pressed={imageActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    imageActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.5" />
                    <path d="m21 17-5-5-4 4-3-2-6 6" />
                  </Svg>
                  <span>Image</span>
                </button>

                {/* Attached image — embeds the file in the PDF, drops a paperclip icon. */}
                <button
                  onClick={() => { void pickAttachmentFile() }}
                  title="Attached image — embeds the file in the PDF as a paperclip"
                  aria-pressed={attachedActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    attachedActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5" />
                  </Svg>
                  <span>Attach</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />
              </>
            )}

            {(activeTab === 'home' || activeTab === 'fill-sign') && (
              <>
            {/* Signature — dropdown */}
            <div className="relative" ref={signatureRef}>
              <button
                onClick={() => setSignatureOpen((v) => !v)}
                title="Signature"
                aria-haspopup="menu"
                aria-expanded={signatureOpen}
                className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                  signatureActive || signatureOpen
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  {SignatureIcon}
                  <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 3 4 5.5 6.5 3" />
                  </svg>
                </span>
                <span>Signature</span>
              </button>
              {signatureOpen && (
                <div
                  role="menu"
                  className="absolute top-full left-0 mt-1 w-64 p-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40"
                >
                  {signatures.length > 0 && (
                    <>
                      <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Saved signatures
                      </div>
                      {signatures.map((s) => {
                        const active = s.id === activeSignatureId && signatureActive
                        return (
                          <div
                            key={s.id}
                            className={`group flex items-center gap-2 px-2 py-1 rounded transition ${
                              active
                                ? 'bg-blue-500/10'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-700/70'
                            }`}
                          >
                            <button
                              role="menuitem"
                              onClick={() => {
                                setActiveSignature(s.id)
                                setTool('signature')
                                setSignatureOpen(false)
                              }}
                              className="flex-1 flex items-center gap-2 text-left"
                              title="Use this signature — click on the page to place"
                            >
                              <img
                                src={s.dataUrl}
                                alt="Saved signature"
                                className="h-8 w-20 object-contain bg-white rounded border border-neutral-200 dark:border-neutral-600"
                              />
                              <span
                                className={`text-xs ${
                                  active
                                    ? 'text-blue-600 dark:text-blue-400 font-medium'
                                    : 'text-neutral-700 dark:text-neutral-200'
                                }`}
                              >
                                Place
                              </span>
                            </button>
                            <button
                              onClick={() => removeSignature(s.id)}
                              title="Delete signature"
                              aria-label="Delete signature"
                              className="h-6 w-6 inline-flex items-center justify-center rounded text-neutral-400 hover:text-red-500 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition opacity-0 group-hover:opacity-100"
                            >
                              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                      <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
                    </>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setSignatureOpen(false)
                      setSignatureModalOpen(true)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700/70 transition"
                  >
                    <span className="inline-flex items-center justify-center h-5 w-5 shrink-0 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M8 3v10M3 8h10" />
                      </svg>
                    </span>
                    <span>Create signature</span>
                  </button>
                </div>
              )}
            </div>

            {/* Stamp — dropdown */}
            <div className="relative" ref={stampRef}>
              <button
                onClick={() => {
                  setStampOpen((v) => !v)
                  setPresetsOpen(false)
                  setCustomStampOpen(false)
                }}
                title="Stamp"
                aria-haspopup="menu"
                aria-expanded={stampOpen}
                className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                  stampActive || stampOpen
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  {StampIcon}
                  <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 3 4 5.5 6.5 3" />
                  </svg>
                </span>
                <span>Stamp</span>
              </button>
              {stampOpen && (
                <div
                  role="menu"
                  className="absolute top-full left-0 mt-1 w-56 p-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40"
                >
                  {/* Presets row with hover-out submenu */}
                  <div
                    className="relative"
                    onMouseEnter={() => setPresetsOpen(true)}
                    onMouseLeave={() => setPresetsOpen(false)}
                  >
                    <button
                      role="menuitem"
                      onClick={() => setPresetsOpen((v) => !v)}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-xs transition ${
                        presetsOpen
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700/70'
                      }`}
                    >
                      <span>Presets</span>
                      <svg viewBox="0 0 8 8" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 1.5 5.5 4 3 6.5" />
                      </svg>
                    </button>
                    {presetsOpen && (
                      <div
                        role="menu"
                        className="absolute left-full top-0 ml-1 w-56 p-2 rounded-md bg-neutral-900/95 shadow-xl border border-neutral-700 z-50 flex flex-col gap-2"
                      >
                        {[...STAMP_PRESETS.greens, ...STAMP_PRESETS.reds].map((p, i) => (
                          <button
                            key={`${p.id}-${i}`}
                            role="menuitem"
                            onClick={() => pickStampPreset(p.label, p.color)}
                            className="px-3 py-1.5 rounded-md text-center text-[13px] italic font-bold tracking-wide transition hover:scale-[1.02]"
                            style={{
                              border: `2px solid ${p.color}`,
                              color: p.color,
                              background: 'transparent',
                              fontFamily: 'Helvetica, Arial, sans-serif'
                            }}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Customize */}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setCustomStampOpen((v) => !v)
                      setPresetsOpen(false)
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-xs transition ${
                      customStampOpen
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700/70'
                    }`}
                  >
                    <span>Customize</span>
                  </button>
                  {customStampOpen && (
                    <div className="px-2 py-2 mt-1 mb-1 rounded bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 flex flex-col gap-2">
                      <input
                        type="text"
                        value={customStampText}
                        onChange={(e) => setCustomStampText(e.target.value)}
                        placeholder="Stamp text"
                        spellCheck={false}
                        className="h-7 px-2 text-xs rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Color
                        </label>
                        <input
                          type="color"
                          value={customStampColor}
                          onChange={(e) => setCustomStampColor(e.target.value)}
                          className="h-6 w-10 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer"
                          aria-label="Stamp color"
                        />
                        <button
                          onClick={applyCustomStamp}
                          className="ml-auto h-7 px-3 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition"
                        >
                          Use stamp
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stamp with date and time — sticky toggle */}
                  <button
                    role="menuitemcheckbox"
                    aria-checked={stampWithDateTime}
                    onClick={() => setStampWithDateTime(!stampWithDateTime)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700/70 transition"
                  >
                    <span
                      className={`inline-flex items-center justify-center h-4 w-4 rounded border ${
                        stampWithDateTime
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'border-neutral-400 dark:border-neutral-500 bg-transparent'
                      }`}
                    >
                      {stampWithDateTime && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6.5 5 9.5 10 3" />
                        </svg>
                      )}
                    </span>
                    <span>Stamp with date and time</span>
                  </button>
                </div>
              )}
            </div>
              </>
            )}

            {activeTab === 'edit' && editContentActive && (
              <>
                {/* Simplified toolbar shown while content-edit mode is active —
                    mirrors the reference UX (Add Text · Add Image · Exit). */}
                <button
                  onClick={handleText}
                  title="Add Text — drop a text box on the page"
                  aria-pressed={textActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    textActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  {TextIcon}
                  <span>Add Text</span>
                </button>
                <button
                  onClick={() => { void pickImageFile() }}
                  title="Add Image — pick a file, then click on the page to place"
                  aria-pressed={imageActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    imageActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.5" />
                    <path d="m21 17-5-5-4 4-3-2-6 6" />
                  </Svg>
                  <span>Add Image</span>
                </button>
                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-2 shrink-0" />

                {/* Save — bake region edits + annotations into the file (Cmd+S). */}
                <button
                  onClick={() => { void save() }}
                  disabled={saving || !dirty}
                  title="Save (⌘S)"
                  className={`h-9 px-3 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    saving || !dirty
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  <Svg>
                    <path d="M5 4h12l3 3v13H5z" />
                    <path d="M7 4v6h10V4" />
                    <path d="M7 14h10v6H7z" />
                  </Svg>
                  <span>{saving ? 'Saving…' : 'Save'}</span>
                </button>

                {/* Quick status — shows how many regions have pending edits. */}
                {editedRegionsCount > 0 && (
                  <span
                    className="ml-1 inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    title="Unsaved edits"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {editedRegionsCount} edit{editedRegionsCount === 1 ? '' : 's'}
                  </span>
                )}

                <button
                  onClick={() => setTool('select')}
                  title="Exit edit mode"
                  className="ml-auto h-9 px-3 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-red-600 dark:text-red-400 hover:bg-red-500/10 transition"
                >
                  <Svg>
                    <path d="M5 5l14 14M19 5 5 19" />
                  </Svg>
                  <span>Exit Editing</span>
                </button>
              </>
            )}

            {activeTab === 'edit' && !editContentActive && (
              <>
                {/* Edit Text & Image — region-aware overlay editor. */}
                <button
                  onClick={() => setTool('edit-content')}
                  title="Edit Text & Image — detect editable regions on each page"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <path d="M12 4h6v6" />
                    <path d="M18 4 9 13" />
                    <path d="M14 14v4H4V8h4" />
                  </Svg>
                  <span>Edit Text & Image</span>
                </button>

                {/* Add Text → reuse the FreeText tool. */}
                <button
                  onClick={handleText}
                  title="Add Text — drop a text box on the page"
                  aria-pressed={textActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    textActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  {TextIcon}
                  <span>Add Text</span>
                </button>

                {/* Add Image → reuse the image-insertion flow from Fill & Sign. */}
                <button
                  onClick={() => { void pickImageFile() }}
                  title="Add Image — pick a file, then click on the page to place"
                  aria-pressed={imageActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    imageActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.5" />
                    <path d="m21 17-5-5-4 4-3-2-6 6" />
                  </Svg>
                  <span>Add Image</span>
                </button>

                {/* Link — drag a rectangle on the page, then enter a URL. */}
                <button
                  onClick={() => handleRealTool(linkActive ? 'select' : 'link')}
                  title="Link — drag a rectangle, then enter a URL"
                  aria-pressed={linkActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    linkActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M9 14a4 4 0 0 1 0-5.7l2.1-2.1a4 4 0 0 1 5.7 5.7l-1.4 1.4" />
                    <path d="M15 10a4 4 0 0 1 0 5.7l-2.1 2.1a4 4 0 0 1-5.7-5.7l1.4-1.4" />
                  </Svg>
                  <span>Link</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Watermark dropdown */}
                <div className="relative" ref={watermarkRef}>
                  <button
                    onClick={() => { setWatermarkOpen((v) => !v); setHfOpen(false); setPageNumOpen(false) }}
                    title="Watermark — text drawn across every page at save time"
                    aria-haspopup="menu"
                    aria-expanded={watermarkOpen}
                    className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                      watermarkOpen || watermark.enabled
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <Svg>
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="m6 18 12-12" opacity={0.5} />
                      </Svg>
                      <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 3 4 5.5 6.5 3" />
                      </svg>
                    </span>
                    <span>Watermark</span>
                  </button>
                  {watermarkOpen && (
                    <div role="menu" className="absolute top-full left-0 mt-1 w-72 p-3 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40 flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-neutral-800 dark:text-neutral-100">
                        <input
                          type="checkbox"
                          checked={watermark.enabled}
                          onChange={(e) => setWatermark({ enabled: e.target.checked })}
                          className="accent-blue-500"
                        />
                        Apply watermark on save
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Text</label>
                      <input
                        type="text"
                        value={watermark.text}
                        onChange={(e) => setWatermark({ text: e.target.value })}
                        spellCheck={false}
                        className="h-7 px-2 text-xs rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Color</label>
                        <input
                          type="color"
                          value={watermark.color}
                          onChange={(e) => setWatermark({ color: e.target.value })}
                          className="h-6 w-10 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer"
                          aria-label="Watermark color"
                        />
                        <label className="ml-auto text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Font</label>
                        <input
                          type="number"
                          min={12}
                          max={200}
                          value={watermark.fontSize}
                          onChange={(e) => setWatermark({ fontSize: parseFloat(e.target.value) || 72 })}
                          className="h-6 w-14 px-1.5 text-center text-xs tabular-nums rounded bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 whitespace-nowrap">Opacity</label>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={watermark.opacity}
                          onChange={(e) => setWatermark({ opacity: parseFloat(e.target.value) })}
                          className="flex-1 accent-blue-500"
                          aria-label="Watermark opacity"
                        />
                        <span className="text-[11px] tabular-nums text-neutral-500 w-8 text-right">{Math.round(watermark.opacity * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 whitespace-nowrap">Rotation</label>
                        <input
                          type="range"
                          min={-90}
                          max={90}
                          step={5}
                          value={watermark.rotation}
                          onChange={(e) => setWatermark({ rotation: parseFloat(e.target.value) })}
                          className="flex-1 accent-blue-500"
                          aria-label="Watermark rotation"
                        />
                        <span className="text-[11px] tabular-nums text-neutral-500 w-8 text-right">{watermark.rotation}°</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Header & Footer dropdown */}
                <div className="relative" ref={hfRef}>
                  <button
                    onClick={() => { setHfOpen((v) => !v); setWatermarkOpen(false); setPageNumOpen(false) }}
                    title="Header & Footer — text drawn on each page at save time"
                    aria-haspopup="menu"
                    aria-expanded={hfOpen}
                    className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                      hfOpen || headerFooter.enabled
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <Svg>
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M3 8h18" />
                        <path d="M3 16h18" />
                      </Svg>
                      <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 3 4 5.5 6.5 3" />
                      </svg>
                    </span>
                    <span>Header & Footer</span>
                  </button>
                  {hfOpen && (
                    <div role="menu" className="absolute top-full left-0 mt-1 w-80 p-3 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40 flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-neutral-800 dark:text-neutral-100">
                        <input
                          type="checkbox"
                          checked={headerFooter.enabled}
                          onChange={(e) => setHeaderFooter({ enabled: e.target.checked })}
                          className="accent-blue-500"
                        />
                        Apply header &amp; footer on save
                      </label>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Header</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['headerLeft', 'headerCenter', 'headerRight'] as const).map((k) => (
                          <input
                            key={k}
                            type="text"
                            value={headerFooter[k]}
                            onChange={(e) => setHeaderFooter({ [k]: e.target.value })}
                            placeholder={k.replace('header', '')}
                            spellCheck={false}
                            className="h-7 px-1.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
                          />
                        ))}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Footer</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['footerLeft', 'footerCenter', 'footerRight'] as const).map((k) => (
                          <input
                            key={k}
                            type="text"
                            value={headerFooter[k]}
                            onChange={(e) => setHeaderFooter({ [k]: e.target.value })}
                            placeholder={k.replace('footer', '')}
                            spellCheck={false}
                            className="h-7 px-1.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Color</label>
                        <input
                          type="color"
                          value={headerFooter.color}
                          onChange={(e) => setHeaderFooter({ color: e.target.value })}
                          className="h-6 w-10 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer"
                          aria-label="Header/footer color"
                        />
                        <label className="ml-auto text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Font</label>
                        <input
                          type="number"
                          min={6}
                          max={24}
                          value={headerFooter.fontSize}
                          onChange={(e) => setHeaderFooter({ fontSize: parseFloat(e.target.value) || 9 })}
                          className="h-6 w-14 px-1.5 text-center text-xs tabular-nums rounded bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
                        />
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-snug">
                        Tip: use <code>{'{n}'}</code> for the page number and <code>{'{N}'}</code> for the total.
                      </p>
                    </div>
                  )}
                </div>

                {/* Page Number dropdown */}
                <div className="relative" ref={pageNumRef}>
                  <button
                    onClick={() => { setPageNumOpen((v) => !v); setWatermarkOpen(false); setHfOpen(false) }}
                    title="Page Number — number every page at save time"
                    aria-haspopup="menu"
                    aria-expanded={pageNumOpen}
                    className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                      pageNumOpen || pageNumbering.enabled
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <Svg>
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <text x="12" y="16" fontSize="9" textAnchor="middle" fill="currentColor" stroke="none">12</text>
                      </Svg>
                      <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 3 4 5.5 6.5 3" />
                      </svg>
                    </span>
                    <span>Page Number</span>
                  </button>
                  {pageNumOpen && (
                    <div role="menu" className="absolute top-full left-0 mt-1 w-72 p-3 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40 flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-neutral-800 dark:text-neutral-100">
                        <input
                          type="checkbox"
                          checked={pageNumbering.enabled}
                          onChange={(e) => setPageNumbering({ enabled: e.target.checked })}
                          className="accent-blue-500"
                        />
                        Apply page numbers on save
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Position</label>
                      <select
                        value={pageNumbering.position}
                        onChange={(e) => setPageNumbering({ position: e.target.value as PageNumberPosition })}
                        className="h-7 px-2 text-xs rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100"
                      >
                        <option value="top-left">Top — left</option>
                        <option value="top-center">Top — center</option>
                        <option value="top-right">Top — right</option>
                        <option value="bottom-left">Bottom — left</option>
                        <option value="bottom-center">Bottom — center</option>
                        <option value="bottom-right">Bottom — right</option>
                      </select>
                      <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Format</label>
                      <select
                        value={pageNumbering.format}
                        onChange={(e) => setPageNumbering({ format: e.target.value as PageNumberFormat })}
                        className="h-7 px-2 text-xs rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100"
                      >
                        <option value="{n}">{`1`}</option>
                        <option value="{n} / {N}">{`1 / N`}</option>
                        <option value="Page {n}">Page 1</option>
                        <option value="Page {n} of {N}">Page 1 of N</option>
                      </select>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Start from</label>
                        <input
                          type="number"
                          min={1}
                          value={pageNumbering.startFrom}
                          onChange={(e) => setPageNumbering({ startFrom: parseInt(e.target.value, 10) || 1 })}
                          className="h-6 w-16 px-1.5 text-center text-xs tabular-nums rounded bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
                        />
                        <label className="ml-auto text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Font</label>
                        <input
                          type="number"
                          min={6}
                          max={24}
                          value={pageNumbering.fontSize}
                          onChange={(e) => setPageNumbering({ fontSize: parseFloat(e.target.value) || 9 })}
                          className="h-6 w-14 px-1.5 text-center text-xs tabular-nums rounded bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700"
                        />
                        <input
                          type="color"
                          value={pageNumbering.color}
                          onChange={(e) => setPageNumbering({ color: e.target.value })}
                          className="h-6 w-10 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer"
                          aria-label="Page-number color"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'pages' && (
              <>
                {/* Zoom out / Zoom in — control thumbnail size in the grid. */}
                <button
                  onClick={pagesZoomOut}
                  title="Smaller thumbnails"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <circle cx="10" cy="10" r="6" />
                    <path d="m15 15 5 5" />
                    <path d="M7 10h6" />
                  </Svg>
                  <span>Zoom out</span>
                </button>
                <button
                  onClick={pagesZoomIn}
                  title="Larger thumbnails"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <circle cx="10" cy="10" r="6" />
                    <path d="m15 15 5 5" />
                    <path d="M7 10h6M10 7v6" />
                  </Svg>
                  <span>Zoom in</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* New — insert a blank page after the last selected (or end). */}
                <button
                  onClick={() => { void onPagesNew() }}
                  title="Insert a blank page after the selected page"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <rect x="5" y="3" width="14" height="18" rx="2" />
                    <path d="M12 9v6M9 12h6" />
                  </Svg>
                  <span>New</span>
                </button>

                <button
                  onClick={() => { void onPagesSplit() }}
                  title="Split into two PDFs at a page boundary"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <rect x="4" y="3" width="7" height="18" rx="1.5" />
                    <rect x="13" y="3" width="7" height="18" rx="1.5" />
                    <path d="M12 5v14" strokeDasharray="2 2" />
                  </Svg>
                  <span>Split</span>
                </button>

                <button
                  onClick={() => { void onPagesExtract() }}
                  disabled={pagesSelectionSize === 0}
                  title="Save selected pages as a new PDF"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    pagesSelectionSize === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="4" y="3" width="14" height="18" rx="2" />
                    <path d="M15 14l5 5M20 14v5h-5" />
                  </Svg>
                  <span>Extract</span>
                </button>

                <button
                  onClick={() => { void onPagesAppend() }}
                  title="Append another PDF to the end of this one"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <rect x="4" y="3" width="14" height="18" rx="2" />
                    <path d="M11 14v-4M9 12h4" />
                    <path d="m18 8 3 3-3 3" />
                  </Svg>
                  <span>Append File</span>
                </button>

                <button
                  onClick={() => { void onPagesDelete() }}
                  disabled={pagesSelectionSize === 0}
                  title="Delete selected pages"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    pagesSelectionSize === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-red-600 dark:text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  <Svg>
                    <path d="M4 7h16" />
                    <path d="M9 7V4h6v3" />
                    <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
                  </Svg>
                  <span>Delete</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                <button
                  onClick={() => { void onPagesRotate('left') }}
                  title={pagesSelectionSize > 0 ? 'Rotate selected pages 90° left' : 'Rotate all pages 90° left'}
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <path d="M3 8c0-2.5 2-4.5 4.5-4.5H13" />
                    <path d="M6 11 3 8l3-3" />
                    <rect x="9" y="11" width="11" height="10" rx="1.5" />
                  </Svg>
                  <span>Rotate Left</span>
                </button>
                <button
                  onClick={() => { void onPagesRotate('right') }}
                  title={pagesSelectionSize > 0 ? 'Rotate selected pages 90° right' : 'Rotate all pages 90° right'}
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <path d="M21 8c0-2.5-2-4.5-4.5-4.5H11" />
                    <path d="M18 11l3-3-3-3" />
                    <rect x="4" y="11" width="11" height="10" rx="1.5" />
                  </Svg>
                  <span>Rotate Right</span>
                </button>

                {/* Selection summary */}
                <div className="ml-auto flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {pagesSelectionSize > 0 ? (
                    <>
                      <span className="tabular-nums">{pagesSelectionSize} / {numPages} selected</span>
                      <button
                        onClick={pagesClear}
                        className="h-6 px-2 text-[11px] rounded hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => pagesSelectAll(numPages)}
                      className="h-6 px-2 text-[11px] rounded hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                    >
                      Select all (⌘A)
                    </button>
                  )}
                </div>
              </>
            )}

            {activeTab === 'protect' && (
              <>
                <button
                  onClick={() => setTool('select')}
                  title="Select / pan"
                  aria-pressed={tool === 'select'}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    tool === 'select'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg><path d="M5 3l6 16 2-7 7-2L5 3Z" /></Svg>
                  <span>Select</span>
                </button>
                <button
                  onClick={() => setTool('select')}
                  title="Hand — pan the page"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6" />
                    <path d="M12 11V4a1.5 1.5 0 0 1 3 0v8" />
                    <path d="M15 12V6a1.5 1.5 0 0 1 3 0v10a5 5 0 0 1-5 5h-2a5 5 0 0 1-4-2l-3-5a1.7 1.7 0 0 1 .5-2.3 1.7 1.7 0 0 1 2.3.5L9 16" />
                  </Svg>
                  <span>Hand</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Redact — drag a box; saved as a solid black rectangle. */}
                <button
                  onClick={() => setTool(redactActive ? 'select' : 'redact')}
                  title="Redact — drag a rectangle to black out content"
                  aria-pressed={redactActive}
                  disabled={numPages === 0}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    redactActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : numPages === 0
                        ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="3" y="6" width="18" height="12" rx="1" fill="currentColor" stroke="none" />
                    <path d="M4 4l16 16" stroke="white" strokeOpacity={0.4} />
                  </Svg>
                  <span>Redact</span>
                </button>

                {/* Encrypt — inline panel with passwords + permissions. */}
                <div className="relative" ref={encryptRef}>
                  <button
                    onClick={() => setEncryptOpen((v) => !v)}
                    title="Encrypt with passwords + permissions"
                    aria-haspopup="menu"
                    aria-expanded={encryptOpen}
                    disabled={numPages === 0}
                    className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                      encryptOpen
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : numPages === 0
                          ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <Svg>
                        <rect x="5" y="11" width="14" height="9" rx="1.5" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </Svg>
                      <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 3 4 5.5 6.5 3" />
                      </svg>
                    </span>
                    <span>Encrypt</span>
                  </button>
                  {encryptOpen && (
                    <div role="menu" className="absolute top-full left-0 mt-1 w-80 p-3 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40 flex flex-col gap-2">
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Passwords</div>
                      <input
                        type="password"
                        value={encOwnerPw}
                        onChange={(e) => setEncOwnerPw(e.target.value)}
                        placeholder="Owner password (required)"
                        className="h-7 px-2 text-xs rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                      />
                      <input
                        type="password"
                        value={encUserPw}
                        onChange={(e) => setEncUserPw(e.target.value)}
                        placeholder="User password (optional — leave blank to allow viewing without)"
                        className="h-7 px-2 text-xs rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Strength</span>
                        <select
                          value={encKeyBits}
                          onChange={(e) => setEncKeyBits(Number(e.target.value) as 40 | 128 | 256)}
                          className="h-7 px-2 text-xs rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100"
                        >
                          <option value={256}>AES 256-bit</option>
                          <option value={128}>AES 128-bit</option>
                          <option value={40}>RC4 40-bit (legacy)</option>
                        </select>
                      </div>
                      <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">User permissions</div>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={encAllowPrint} onChange={(e) => setEncAllowPrint(e.target.checked)} />
                          Print
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={encAllowModify} onChange={(e) => setEncAllowModify(e.target.checked)} />
                          Modify
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={encAllowExtract} onChange={(e) => setEncAllowExtract(e.target.checked)} />
                          Copy / extract
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={encAllowAnnotate} onChange={(e) => setEncAllowAnnotate(e.target.checked)} />
                          Annotate
                        </label>
                      </div>
                      <button
                        onClick={() => { void runEncrypt() }}
                        disabled={!encOwnerPw.trim()}
                        className={`mt-2 h-7 px-3 text-xs rounded text-white transition ${
                          encOwnerPw.trim() ? 'bg-blue-500 hover:bg-blue-600' : 'bg-neutral-400 dark:bg-neutral-600 cursor-not-allowed'
                        }`}
                      >
                        Encrypt &amp; save…
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => { void runDecrypt() }}
                  title="Remove the document password"
                  disabled={numPages === 0}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="5" y="11" width="14" height="9" rx="1.5" />
                    <path d="M8 11V7a4 4 0 0 1 4-4" />
                    <path d="M12 14v3" />
                  </Svg>
                  <span>Remove Password</span>
                </button>

                <button
                  onClick={() => { void runFlatten() }}
                  title="Flatten — bake annotations + form fields so they can't be edited"
                  disabled={numPages === 0}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M4 11h16" />
                    <path d="M9 17l3-3 3 3" />
                  </Svg>
                  <span>Flatten</span>
                </button>
              </>
            )}

            {activeTab === 'tools' && (
              <>
                {/* Select + Hand pair */}
                <button
                  onClick={() => setTool('select')}
                  title="Select / pan"
                  aria-pressed={tool === 'select'}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    tool === 'select'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg><path d="M5 3l6 16 2-7 7-2L5 3Z" /></Svg>
                  <span>Select</span>
                </button>
                <button
                  onClick={() => setTool('select')}
                  title="Hand — pan the page"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6" />
                    <path d="M12 11V4a1.5 1.5 0 0 1 3 0v8" />
                    <path d="M15 12V6a1.5 1.5 0 0 1 3 0v10a5 5 0 0 1-5 5h-2a5 5 0 0 1-4-2l-3-5a1.7 1.7 0 0 1 .5-2.3 1.7 1.7 0 0 1 2.3.5L9 16" />
                  </Svg>
                  <span>Hand</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Convert — reuses the same dropdown as Home for parity. */}
                <div className="relative" ref={convertRef}>
                  <button
                    onClick={() => setConvertOpen((v) => !v)}
                    title="Convert"
                    aria-haspopup="menu"
                    aria-expanded={convertOpen}
                    className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                      convertOpen
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {ConvertIcon}
                      <svg viewBox="0 0 8 8" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 3 4 5.5 6.5 3" />
                      </svg>
                    </span>
                    <span>Convert</span>
                  </button>
                  {convertOpen && (
                    <div
                      role="menu"
                      className="absolute top-full left-0 mt-1 w-64 py-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40 max-h-[70vh] overflow-y-auto"
                    >
                      {CONVERT_GROUPS.map((group, gi) => (
                        <div key={group.title}>
                          {gi > 0 && <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />}
                          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            {group.title}
                          </div>
                          {group.items.map((item) => {
                            const disabled = item.needsDoc && numPages === 0
                            return (
                              <button
                                key={item.id}
                                role="menuitem"
                                disabled={disabled}
                                onClick={() => {
                                  setConvertOpen(false)
                                  void runConvert(item.id)
                                }}
                                title={disabled ? `${item.label} — open a PDF first` : item.label}
                                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                                  disabled
                                    ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                                    : 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700/70'
                                }`}
                              >
                                <span
                                  className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded text-[9px] font-bold text-white"
                                  style={{ background: item.tint, opacity: disabled ? 0.4 : 1 }}
                                >
                                  {item.badge}
                                </span>
                                <span className="flex-1 truncate">{item.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Common PDF ops — straight buttons that delegate to the
                    existing Convert pipeline so save dialogs feel consistent. */}
                <button
                  onClick={() => { void runCompress() }}
                  disabled={numPages === 0}
                  title="Compress PDF"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M9 9l6 6M15 9l-6 6" />
                  </Svg>
                  <span>Compress PDF</span>
                </button>
                <button
                  onClick={() => { void runMerge() }}
                  disabled={numPages === 0}
                  title="Merge PDF"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M6 3h8l4 4v14H6z" />
                    <path d="M14 3v4h4" />
                    <path d="M10 12h4M10 16h4" />
                  </Svg>
                  <span>Merge PDF</span>
                </button>
                <button
                  onClick={() => { void runSplit() }}
                  disabled={numPages === 0}
                  title="Split PDF"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <rect x="4" y="3" width="7" height="18" rx="1.5" />
                    <rect x="13" y="3" width="7" height="18" rx="1.5" />
                    <path d="M12 5v14" strokeDasharray="2 2" />
                  </Svg>
                  <span>Split PDF</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* OCR — lazy-loads Tesseract.js on first use. */}
                <button
                  onClick={() => { void runOcr() }}
                  disabled={numPages === 0 || ocrRunning}
                  title="Detect text on current page (OCR)"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0 || ocrRunning
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M3 8V5a2 2 0 0 1 2-2h3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                    <path d="M8 12h8" />
                  </Svg>
                  <span>OCR</span>
                </button>

                <button
                  onClick={() => { void runTranslate() }}
                  disabled={numPages === 0}
                  title="Translate current page in your browser"
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    numPages === 0
                      ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M3 6h8" />
                    <path d="M7 4v2" />
                    <path d="M3 10c2 4 6 4 8 0" />
                    <path d="M11 18h10" />
                    <path d="M16 12l-5 9M16 12l5 9" />
                  </Svg>
                  <span>Translate</span>
                </button>

                <button
                  onClick={() => setReading((v) => !v)}
                  disabled={numPages === 0}
                  title={reading ? 'Stop reading' : 'Read this page aloud'}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    reading
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : numPages === 0
                        ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M4 9h3l5-4v14l-5-4H4z" />
                    <path d="M17 8a4 4 0 0 1 0 8" />
                    <path d="M20 5a8 8 0 0 1 0 14" opacity={reading ? 0.7 : 0.35} />
                  </Svg>
                  <span>{reading ? 'Stop' : 'Read Aloud'}</span>
                </button>

                <button
                  onClick={() => setTool(cropActive ? 'select' : 'crop')}
                  disabled={numPages === 0}
                  title="Crop — drag a rectangle on the page; saved PDF uses it as the crop box"
                  aria-pressed={cropActive}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    cropActive
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : numPages === 0
                        ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg>
                    <path d="M6 2v13a1 1 0 0 0 1 1h13" />
                    <path d="M2 6h13a1 1 0 0 1 1 1v13" />
                  </Svg>
                  <span>Crop</span>
                </button>

                <button
                  onClick={() => setPlaying((v) => !v)}
                  disabled={numPages === 0}
                  title={playing ? 'Stop slideshow' : 'Play as slideshow (4s/page)'}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    playing
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : numPages === 0
                        ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  {playing ? (
                    <Svg>
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </Svg>
                  ) : (
                    <Svg>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M10 8l6 4-6 4z" />
                    </Svg>
                  )}
                  <span>{playing ? 'Pause' : 'Play'}</span>
                </button>
              </>
            )}

            {activeTab === 'form' && (
              <>
                {/* Select — exits any active form-tool. */}
                <button
                  onClick={() => setTool('select')}
                  title="Select / pan"
                  aria-pressed={tool === 'select'}
                  className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
                    tool === 'select'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <Svg><path d="M5 3l6 16 2-7 7-2L5 3Z" /></Svg>
                  <span>Select</span>
                </button>

                {/* Hand — alias for Select; matches the reference layout. */}
                <button
                  onClick={() => setTool('select')}
                  title="Hand — pan the page"
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70 transition"
                >
                  <Svg>
                    <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6" />
                    <path d="M12 11V4a1.5 1.5 0 0 1 3 0v8" />
                    <path d="M15 12V6a1.5 1.5 0 0 1 3 0v10a5 5 0 0 1-5 5h-2a5 5 0 0 1-4-2l-3-5a1.7 1.7 0 0 1 .5-2.3 1.7 1.7 0 0 1 2.3.5L9 16" />
                  </Svg>
                  <span>Hand</span>
                </button>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                <FormToolButton
                  active={tool === 'form-text'}
                  onClick={() => setTool(tool === 'form-text' ? 'select' : 'form-text')}
                  title="Text field"
                  label="Text Field"
                >
                  <Svg>
                    <rect x="3" y="7" width="18" height="10" rx="1.5" />
                    <path d="M7 10v4" />
                    <path d="M5 10h4M5 14h4" />
                  </Svg>
                </FormToolButton>

                <FormToolButton
                  active={tool === 'form-checkbox'}
                  onClick={() => setTool(tool === 'form-checkbox' ? 'select' : 'form-checkbox')}
                  title="Check box"
                  label="Check Box"
                >
                  <Svg>
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="m8 12 3 3 6-7" />
                  </Svg>
                </FormToolButton>

                <FormToolButton
                  active={tool === 'form-radio'}
                  onClick={() => setTool(tool === 'form-radio' ? 'select' : 'form-radio')}
                  title="Radio button"
                  label="Radio Button"
                >
                  <Svg>
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
                  </Svg>
                </FormToolButton>

                <FormToolButton
                  active={tool === 'form-dropdown'}
                  onClick={() => setTool(tool === 'form-dropdown' ? 'select' : 'form-dropdown')}
                  title="Dropdown"
                  label="Dropdown"
                >
                  <Svg>
                    <rect x="3" y="7" width="18" height="10" rx="1.5" />
                    <path d="m14 11 2 2 2-2" />
                  </Svg>
                </FormToolButton>

                <FormToolButton
                  active={tool === 'form-listbox'}
                  onClick={() => setTool(tool === 'form-listbox' ? 'select' : 'form-listbox')}
                  title="List box"
                  label="List Box"
                >
                  <Svg>
                    <rect x="3" y="4" width="18" height="16" rx="1.5" />
                    <path d="M6 8h12M6 12h12M6 16h7" />
                  </Svg>
                </FormToolButton>

                <div className="w-px h-6 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />

                {/* Preview toggle — switches fields between design rectangles and live widgets. */}
                <button
                  onClick={() => {
                    setFormPreview(!formPreview)
                    if (!formPreview) setTool('select')
                  }}
                  title={formPreview ? 'Preview is on — switch back to design' : 'Preview the form (fields become live inputs)'}
                  aria-pressed={formPreview}
                  className="h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-1 rounded-md text-[10.5px] font-medium leading-tight transition text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70"
                >
                  <span
                    className={`relative inline-block w-9 h-5 rounded-full transition ${
                      formPreview ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-600'
                    }`}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow"
                      style={{
                        transform: formPreview ? 'translateX(16px)' : 'translateX(0)',
                        transition: 'transform 120ms'
                      }}
                    />
                  </span>
                  <span>Preview</span>
                </button>
              </>
            )}

          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs italic text-neutral-500 dark:text-neutral-400">
            {TABS.find((t) => t.id === activeTab)?.label} — coming soon
          </div>
        )}
      </div>

      {/* Row 3 — text formatting bar (when freetext tool active or freetext selected) */}
      {showTextFormatBar && (
        <FreeTextFormatBar
          selected={selectedFreeText}
          onClose={() => {
            if (tool === 'freetext') setTool('select')
            if (selectedFreeText) useAnnotationStore.getState().select(null)
          }}
        />
      )}

      {/* Row 3 — contextual color bar (other tools that take a color) */}
      {showColorBar && (
        <div className="h-9 flex items-center px-3 gap-1 border-t border-neutral-200/70 dark:border-neutral-800/70">
          <span className="inline-flex items-center justify-center h-6 w-6 text-neutral-500 dark:text-neutral-400 shrink-0">
            {tool === 'shape'
              ? ShapesIcon
              : tool === 'freetext'
                ? TextIcon
                : tool === 'ink'
                  ? InkIcon
                  : tool === 'marker'
                    ? MarkerIcon
                    : TOOLS.find((t) => t.id === tool)?.icon}
          </span>
          <div className="w-px h-5 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1" />
          <div className="flex items-center gap-0.5">
            {ANNOTATION_COLORS.map((c) => {
              const active = color.toLowerCase() === c.hex.toLowerCase()
              return (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={active}
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition ${
                    active
                      ? 'bg-neutral-200 dark:bg-neutral-700/80 ring-1 ring-neutral-400/70 dark:ring-neutral-500/70'
                      : 'hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full ring-1 ring-black/10"
                    style={{ background: c.hex }}
                  />
                </button>
              )
            })}
          </div>

          {strokeTool && (
            <>
              <div className="w-px h-5 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1" />
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                Stroke
              </span>
              <input
                type="range"
                // Markers need a much wider band than ink/shapes — keep the
                // slider responsive instead of cramming both into one scale.
                min={tool === 'marker' ? 4 : 0.5}
                max={tool === 'marker' ? 30 : 12}
                step={0.5}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                className="w-24 accent-blue-500"
                aria-label="Stroke width"
              />
              <input
                type="number"
                min={0.25}
                max={60}
                step={0.5}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value) || 1)}
                className="w-14 h-6 px-1.5 text-center text-xs tabular-nums rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                aria-label="Stroke width (pt)"
              />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">pt</span>
            </>
          )}

          <button
            onClick={() => setTool('select')}
            title="Close"
            aria-label="Close color picker"
            className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition"
          >
            <Svg className="w-3.5 h-3.5">
              <path d="M5 5l10 10M15 5l-10 10" />
            </Svg>
          </button>
        </div>
      )}

      {signatureModalOpen && (
        <CreateSignatureModal
          onClose={() => setSignatureModalOpen(false)}
          onSaved={() => setTool('signature')}
        />
      )}

      {ocrOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => { if (!ocrRunning) setOcrOpen(false) }}
        >
          <div
            className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-[40rem] max-w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-700">
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                OCR — Page {currentPage}
              </span>
              <button
                onClick={() => setOcrOpen(false)}
                disabled={ocrRunning}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40"
                aria-label="Close"
              >×</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {ocrRunning ? (
                <div className="flex flex-col items-center justify-center py-12 text-sm text-neutral-500 gap-2">
                  <div className="animate-pulse">{ocrStatus || 'Processing…'}</div>
                  <div className="text-[11px]">First run downloads the recognition model (~13 MB)</div>
                </div>
              ) : ocrText ? (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-800 dark:text-neutral-100">
                  {ocrText}
                </pre>
              ) : (
                <div className="text-sm text-red-600">{ocrStatus || 'No text recognized.'}</div>
              )}
            </div>
            {!ocrRunning && ocrText && (
              <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-neutral-200 dark:border-neutral-700">
                <button
                  onClick={() => { void navigator.clipboard.writeText(ocrText) }}
                  className="h-7 px-3 text-xs rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
                >
                  Copy
                </button>
                <button
                  onClick={() => setOcrOpen(false)}
                  className="h-7 px-3 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact toolbar button used by every Form field-tool entry. */
function FormToolButton({
  active,
  onClick,
  title,
  label,
  children
}: {
  active: boolean
  onClick: () => void
  title: string
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`h-9 min-w-[3rem] px-2 flex flex-col items-center justify-center gap-0 rounded-md text-[10.5px] font-medium leading-tight transition ${
        active
          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

/** Convert a Uint8Array to a base64 data URL. Used to ferry file bytes
 *  into store-held pending image/attachment templates without round-tripping
 *  through the filesystem. */
function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mimeType};base64,${btoa(binary)}`
}

/** Resolve pixel dimensions of an image data URL — needed to size the inserted
 *  image with the correct aspect ratio at placement time. */
function loadImageDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('failed to decode image'))
    img.src = dataUrl
  })
}


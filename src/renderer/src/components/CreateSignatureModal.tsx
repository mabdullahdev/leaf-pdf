import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSignatureStore } from '../store/signatureStore'

type Props = {
  onClose: () => void
  /** Fired after a signature is saved. Receives the new signature id. */
  onSaved?: (id: string) => void
}

type Mode = 'draw' | 'type'

const CANVAS_W = 560
const CANVAS_H = 160
const PEN_COLORS: { label: string; hex: string }[] = [
  { label: 'Black', hex: '#111111' },
  { label: 'Blue', hex: '#1d4ed8' },
  { label: 'Red', hex: '#b91c1c' }
]

const SCRIPT_FONTS: { label: string; css: string }[] = [
  { label: 'Cursive', css: '"Snell Roundhand", "Apple Chancery", "Lucida Handwriting", cursive' },
  { label: 'Brush', css: '"Bradley Hand", "Comic Sans MS", cursive' },
  { label: 'Italic', css: '"Times New Roman", Times, serif' }
]

export default function CreateSignatureModal({ onClose, onSaved }: Props) {
  const add = useSignatureStore((s) => s.add)
  const [mode, setMode] = useState<Mode>('draw')
  const [penColor, setPenColor] = useState(PEN_COLORS[0].hex)

  // Draw mode
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Type mode
  const [typed, setTyped] = useState('')
  const [fontIdx, setFontIdx] = useState(0)

  const clearCanvas = useCallback((): void => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }, [])

  // Reset canvas to a clean transparent state on mount and when switching to draw.
  useEffect(() => {
    if (mode !== 'draw') return
    const c = canvasRef.current
    if (!c) return
    c.width = CANVAS_W * window.devicePixelRatio
    c.height = CANVAS_H * window.devicePixelRatio
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = penColor
    ctx.lineWidth = 2.2
  }, [mode, penColor])

  // Keep stroke color in sync if user changes color mid-session.
  useEffect(() => {
    if (mode !== 'draw') return
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) ctx.strokeStyle = penColor
  }, [penColor, mode])

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H
    }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const pt = canvasPoint(e)
    lastPtRef.current = pt
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y)
    ctx.lineTo(pt.x + 0.01, pt.y + 0.01)
    ctx.stroke()
    setHasInk(true)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const last = lastPtRef.current
    const pt = canvasPoint(e)
    ctx.beginPath()
    if (last) ctx.moveTo(last.x, last.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPtRef.current = pt
  }
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    drawingRef.current = false
    lastPtRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  // Render typed signature into a hidden canvas + cropped tight, then return a PNG dataURL.
  const buildTypedDataUrl = useCallback((): { dataUrl: string; w: number; h: number } | null => {
    const text = typed.trim()
    if (!text) return null
    const off = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    const W = CANVAS_W
    const H = CANVAS_H
    off.width = W * dpr
    off.height = H * dpr
    const ctx = off.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    ctx.fillStyle = penColor
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    // Pick a font size that fits the canvas width.
    const family = SCRIPT_FONTS[fontIdx].css
    let size = 96
    while (size > 12) {
      ctx.font = `italic ${size}px ${family}`
      const m = ctx.measureText(text)
      if (m.width <= W * 0.9) break
      size -= 4
    }
    ctx.fillText(text, W / 2, H / 2)
    return cropTransparent(off)
  }, [typed, fontIdx, penColor])

  const buildDrawnDataUrl = useCallback((): { dataUrl: string; w: number; h: number } | null => {
    if (!hasInk) return null
    const c = canvasRef.current
    if (!c) return null
    return cropTransparent(c)
  }, [hasInk])

  const canSave = useMemo(() => {
    if (mode === 'draw') return hasInk
    return typed.trim().length > 0
  }, [mode, hasInk, typed])

  const onSave = (): void => {
    const result = mode === 'draw' ? buildDrawnDataUrl() : buildTypedDataUrl()
    if (!result) return
    const id = add({ dataUrl: result.dataUrl, pxWidth: result.w, pxHeight: result.h })
    onSaved?.(id)
    onClose()
  }

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create signature"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[640px] max-w-[95vw] max-h-[90vh] flex flex-col rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Create signature
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-4 pt-3 gap-2 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          {(['draw', 'type'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`relative h-9 px-3 text-sm font-medium transition ${
                mode === m
                  ? 'text-neutral-900 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {m === 'draw' ? 'Draw' : 'Type'}
              {mode === m && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-blue-500" />
              )}
            </button>
          ))}
        </div>

        {/* Pen color */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Color</span>
          <div className="flex items-center gap-1">
            {PEN_COLORS.map((c) => {
              const active = c.hex === penColor
              return (
                <button
                  key={c.hex}
                  onClick={() => setPenColor(c.hex)}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={active}
                  className={`h-6 w-6 inline-flex items-center justify-center rounded transition ${
                    active ? 'ring-1 ring-blue-500' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full ring-1 ring-black/15"
                    style={{ background: c.hex }}
                  />
                </button>
              )
            })}
          </div>
          {mode === 'type' && (
            <>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-3">Style</span>
              <div className="flex items-center gap-1">
                {SCRIPT_FONTS.map((f, i) => {
                  const active = i === fontIdx
                  return (
                    <button
                      key={f.label}
                      onClick={() => setFontIdx(i)}
                      aria-pressed={active}
                      className={`h-7 px-2 text-xs rounded transition ${
                        active
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                      style={{ fontFamily: f.css, fontStyle: 'italic' }}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {mode === 'draw' ? (
            <div className="relative">
              <canvas
                ref={canvasRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="block w-full bg-white rounded border border-dashed border-neutral-300 dark:border-neutral-700 touch-none"
                style={{ height: CANVAS_H, cursor: 'crosshair' }}
              />
              {!hasInk && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-sm italic text-neutral-400">Sign here</span>
                </div>
              )}
              <div className="absolute bottom-2 right-2 text-[10px] text-neutral-400 pointer-events-none">
                {CANVAS_W} × {CANVAS_H}
              </div>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your name"
                spellCheck={false}
                autoFocus
                className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <div
                className="mt-3 h-[140px] rounded border border-dashed border-neutral-300 dark:border-neutral-700 bg-white flex items-center justify-center overflow-hidden"
                style={{
                  fontFamily: SCRIPT_FONTS[fontIdx].css,
                  fontStyle: 'italic',
                  fontSize: 56,
                  color: penColor
                }}
              >
                {typed.trim() ? typed : <span className="text-neutral-300 text-sm not-italic">Preview</span>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 shrink-0">
          <button
            onClick={mode === 'draw' ? clearCanvas : () => setTyped('')}
            className="h-8 px-3 text-sm text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-3 text-sm text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={!canSave}
              className="h-8 px-3 text-sm font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition"
            >
              Save signature
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Crop a canvas to its non-transparent bounding box and return a PNG data URL.
 * Returns the source as-is if it's entirely transparent (the caller should guard against that).
 */
function cropTransparent(src: HTMLCanvasElement): { dataUrl: string; w: number; h: number } {
  const ctx = src.getContext('2d')
  if (!ctx) return { dataUrl: src.toDataURL('image/png'), w: src.width, h: src.height }
  const { width, height } = src
  const img = ctx.getImageData(0, 0, width, height)
  const data = img.data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]
      if (a > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    return { dataUrl: src.toDataURL('image/png'), w: width, h: height }
  }
  // Small padding so the strokes don't sit flush against the edge.
  const pad = 4
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')
  if (!octx) return { dataUrl: src.toDataURL('image/png'), w: width, h: height }
  octx.drawImage(src, minX, minY, w, h, 0, 0, w, h)
  return { dataUrl: out.toDataURL('image/png'), w, h }
}

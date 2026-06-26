import { useRef, useState } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import {
  pointCssToPdf,
  pointPdfToCss,
  type FormFieldAnnotation,
  type FormFieldKind
} from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  field: FormFieldAnnotation
  viewport: PageViewport
  containerRef: React.RefObject<HTMLDivElement>
}

type Handle = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_SIZE = 10
const MIN_CSS = 18

const KIND_LABEL: Record<FormFieldKind, string> = {
  text: 'Text',
  checkbox: 'Checkbox',
  radio: 'Radio',
  dropdown: 'Dropdown',
  listbox: 'List box'
}

export default function FormFieldBox({ field, viewport, containerRef }: Props) {
  const preview = useAnnotationStore((s) => s.formPreview)
  const selectedId = useAnnotationStore((s) => s.selectedId)
  const select = useAnnotationStore((s) => s.select)
  const moveFormField = useAnnotationStore((s) => s.moveFormField)
  const resizeFormField = useAnnotationStore((s) => s.resizeFormField)
  const updateFormField = useAnnotationStore((s) => s.updateFormField)
  const beginInteraction = useAnnotationStore((s) => s.beginInteraction)
  const remove = useAnnotationStore((s) => s.remove)

  const isSelected = selectedId === field.id
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [propsOpen, setPropsOpen] = useState(false)

  const { left, top } = pointPdfToCss(viewport, field.x, field.y)
  const widthCss = field.width * viewport.scale
  const heightCss = field.height * viewport.scale

  const toPagePoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onWrapperPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (preview) return
    if (e.target !== wrapperRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startField = { x: field.x, y: field.y }
    const startPdf = pointCssToPdf(viewport, start.x, start.y)
    const id = field.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const curPdf = pointCssToPdf(viewport, cur.x, cur.y)
      if (!snapshotted) { beginInteraction(); snapshotted = true }
      moveFormField(
        id,
        startField.x + (curPdf.x - startPdf.x),
        startField.y + (curPdf.y - startPdf.y),
        { commitHistory: false }
      )
    }
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    if (!isSelected) select(field.id)
  }

  const startResize = (e: React.PointerEvent<HTMLDivElement>, handle: Handle): void => {
    e.stopPropagation()
    e.preventDefault()
    const start = toPagePoint(e.clientX, e.clientY)
    if (!start) return
    const startCssLeft = left
    const startCssTop = top
    const startCssW = widthCss
    const startCssH = heightCss
    const id = field.id
    e.currentTarget.setPointerCapture(e.pointerId)
    let snapshotted = false

    const onMove = (ev: PointerEvent): void => {
      const cur = toPagePoint(ev.clientX, ev.clientY)
      if (!cur) return
      const dx = cur.x - start.x
      const dy = cur.y - start.y
      let newLeft = startCssLeft, newTop = startCssTop, newW = startCssW, newH = startCssH
      if (handle === 'se') {
        newW = Math.max(MIN_CSS, startCssW + dx); newH = Math.max(MIN_CSS, startCssH + dy)
      } else if (handle === 'sw') {
        newW = Math.max(MIN_CSS, startCssW - dx); newLeft = startCssLeft + (startCssW - newW)
        newH = Math.max(MIN_CSS, startCssH + dy)
      } else if (handle === 'ne') {
        newW = Math.max(MIN_CSS, startCssW + dx); newH = Math.max(MIN_CSS, startCssH - dy)
        newTop = startCssTop + (startCssH - newH)
      } else {
        newW = Math.max(MIN_CSS, startCssW - dx); newLeft = startCssLeft + (startCssW - newW)
        newH = Math.max(MIN_CSS, startCssH - dy); newTop = startCssTop + (startCssH - newH)
      }
      const pdfTL = pointCssToPdf(viewport, newLeft, newTop)
      if (!snapshotted) { beginInteraction(); snapshotted = true }
      resizeFormField(
        id,
        { x: pdfTL.x, y: pdfTL.y, width: newW / viewport.scale, height: newH / viewport.scale },
        { commitHistory: false }
      )
    }
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    if (!isSelected) select(field.id)
  }

  const fontSize = Math.max(10, Math.min(heightCss * 0.6, 14))

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: '#3b82f6',
    border: '1px solid white',
    borderRadius: 2,
    zIndex: 2
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute pointer-events-auto"
      style={{
        left,
        top,
        width: widthCss,
        height: heightCss,
        cursor: preview ? 'default' : 'move',
        // Design mode shows a labeled bordered rectangle; preview shows nothing
        // around the inner widget so users only see the form input.
        border: preview ? 'none' : `1.5px ${isSelected ? 'solid' : 'dashed'} #3b82f6`,
        background: preview ? 'transparent' : 'rgba(59, 130, 246, 0.06)',
        boxShadow: isSelected && !preview ? '0 0 0 2px rgba(59,130,246,0.6)' : undefined
      }}
      onPointerDown={onWrapperPointerDown}
      onClick={(e) => {
        if (preview) return
        e.stopPropagation()
        if (!isSelected) select(field.id)
      }}
    >
      {preview ? (
        <FormWidget field={field} fontSize={fontSize} onChange={(v) => updateFormField(field.id, { value: v })} />
      ) : (
        <DesignLabel field={field} fontSize={fontSize} />
      )}

      {isSelected && !preview && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setPropsOpen((v) => !v) }}
            title="Field properties"
            style={{
              position: 'absolute',
              top: -28,
              right: -10,
              height: 22,
              padding: '0 8px',
              borderRadius: 6,
              background: '#3b82f6',
              color: 'white',
              border: '1px solid white',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              zIndex: 4
            }}
          >
            ⚙ {KIND_LABEL[field.fieldType]}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); remove(field.id) }}
            title="Delete field"
            style={{
              position: 'absolute',
              top: -28,
              right: -90,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#ef4444',
              color: 'white',
              border: '1px solid white',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              zIndex: 4
            }}
          >
            ×
          </button>

          <div style={{ ...handleStyle, top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }} onPointerDown={(e) => startResize(e, 'nw')} />
          <div style={{ ...handleStyle, top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }} onPointerDown={(e) => startResize(e, 'ne')} />
          <div style={{ ...handleStyle, bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }} onPointerDown={(e) => startResize(e, 'sw')} />
          <div style={{ ...handleStyle, bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }} onPointerDown={(e) => startResize(e, 'se')} />

          {propsOpen && (
            <PropertiesPanel
              field={field}
              onClose={() => setPropsOpen(false)}
              onChange={(patch) => updateFormField(field.id, patch)}
            />
          )}
        </>
      )}
    </div>
  )
}

function DesignLabel({ field, fontSize }: { field: FormFieldAnnotation; fontSize: number }): JSX.Element {
  return (
    <span
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: field.fieldType === 'checkbox' || field.fieldType === 'radio' ? 'center' : 'flex-start',
        padding: '0 6px',
        fontSize: fontSize * 0.85,
        color: '#1e40af',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden'
      }}
    >
      {field.fieldType === 'checkbox' && '☐ '}
      {field.fieldType === 'radio' && '◯ '}
      {field.name || `(unnamed ${field.fieldType})`}
    </span>
  )
}

function FormWidget({
  field,
  fontSize,
  onChange
}: {
  field: FormFieldAnnotation
  fontSize: number
  onChange: (value: string) => void
}): JSX.Element {
  const common: React.CSSProperties = {
    width: '100%',
    height: '100%',
    fontSize: fontSize * 0.9,
    border: '1px solid #94a3b8',
    background: 'white',
    color: '#0f172a',
    boxSizing: 'border-box',
    padding: '0 6px'
  }
  if (field.fieldType === 'text') {
    return (
      <input
        type="text"
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        disabled={field.readonly}
        style={common}
        onPointerDown={(e) => e.stopPropagation()}
      />
    )
  }
  if (field.fieldType === 'checkbox') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <input
          type="checkbox"
          checked={field.value === 'on'}
          onChange={(e) => onChange(e.target.checked ? 'on' : '')}
          disabled={field.readonly}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </span>
    )
  }
  if (field.fieldType === 'radio') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <input
          type="radio"
          name={field.name}
          checked={field.optionValue !== undefined ? field.value === field.optionValue : field.value === 'on'}
          onChange={() => onChange(field.optionValue ?? 'on')}
          disabled={field.readonly}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </span>
    )
  }
  if (field.fieldType === 'dropdown') {
    return (
      <select
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        disabled={field.readonly}
        style={common}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <option value="" />
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }
  // listbox
  return (
    <select
      multiple
      size={Math.max(2, Math.floor((field.height) / 20))}
      value={field.value ? [field.value] : []}
      onChange={(e) => onChange(e.target.value)}
      disabled={field.readonly}
      style={{ ...common, height: '100%' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {(field.options ?? []).map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

function PropertiesPanel({
  field,
  onClose,
  onChange
}: {
  field: FormFieldAnnotation
  onClose: () => void
  onChange: (patch: Partial<FormFieldAnnotation>) => void
}): JSX.Element {
  const [optionsDraft, setOptionsDraft] = useState((field.options ?? []).join('\n'))
  const supportsOptions = field.fieldType === 'dropdown' || field.fieldType === 'listbox'
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 'calc(100% + 12px)',
        left: 0,
        width: 280,
        padding: 12,
        borderRadius: 8,
        background: 'white',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        border: '1px solid rgba(0,0,0,0.1)',
        color: '#0f172a',
        zIndex: 10
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Field properties</span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 20, height: 20, borderRadius: 4, background: 'transparent',
            border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer'
          }}
        >×</button>
      </div>

      <label style={{ display: 'block', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Name</label>
      <input
        type="text"
        value={field.name}
        onChange={(e) => onChange({ name: e.target.value })}
        style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4, marginBottom: 8 }}
      />

      <label style={{ display: 'block', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {field.fieldType === 'checkbox' ? 'Initial state' : field.fieldType === 'radio' ? 'Group value (sets selected)' : 'Default value'}
      </label>
      <input
        type="text"
        value={field.value}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder={field.fieldType === 'checkbox' ? "'on' for checked" : ''}
        style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4, marginBottom: 8 }}
      />

      {field.fieldType === 'radio' && (
        <>
          <label style={{ display: 'block', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            This widget's option value
          </label>
          <input
            type="text"
            value={field.optionValue ?? ''}
            onChange={(e) => onChange({ optionValue: e.target.value })}
            placeholder="e.g. yes"
            style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4, marginBottom: 8 }}
          />
        </>
      )}

      {supportsOptions && (
        <>
          <label style={{ display: 'block', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Options (one per line)
          </label>
          <textarea
            value={optionsDraft}
            onChange={(e) => setOptionsDraft(e.target.value)}
            onBlur={() => onChange({ options: optionsDraft.split('\n').map((s) => s.trim()).filter(Boolean) })}
            rows={4}
            style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4, marginBottom: 8, resize: 'vertical' }}
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={field.readonly}
            onChange={(e) => onChange({ readonly: e.target.checked })}
          />
          Read-only
        </label>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useAnnotationStore, type FreeTextDefaults } from '../store/annotationStore'
import {
  FONT_FAMILIES,
  FONT_SIZES,
  TEXT_COLORS,
  type FontFamily,
  type FreeTextAnnotation
} from '../lib/annotations'

function Svg({ children, className = 'w-3.5 h-3.5' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

const TextIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M5 6h14" />
    <path d="M12 6v13" />
  </svg>
)

type Props = {
  /** The selected freetext annotation, or null if just creating new ones. */
  selected: FreeTextAnnotation | null
  /** Close the bar (typically by switching back to Select tool). */
  onClose: () => void
}

export default function FreeTextFormatBar({ selected, onClose }: Props) {
  const defaults = useAnnotationStore((s) => s.freeTextDefaults)
  const setDefaults = useAnnotationStore((s) => s.setFreeTextDefaults)
  const updateFreeText = useAnnotationStore((s) => s.updateFreeText)

  // The source of truth for the bar's current values: the selected annotation if any,
  // otherwise the defaults (which will be applied to the next new box).
  const src: FreeTextDefaults = selected
    ? {
        fontSize: selected.fontSize,
        fontFamily: selected.fontFamily,
        bold: selected.bold,
        italic: selected.italic,
        underline: selected.underline,
        align: selected.align,
        color: selected.color,
        backgroundColor: selected.backgroundColor,
        borderColor: selected.borderColor,
        strokeWidth: selected.strokeWidth
      }
    : defaults

  // Apply a change: always update defaults, and update the selection if present.
  const apply = (patch: Partial<FreeTextDefaults>): void => {
    setDefaults(patch)
    if (selected) updateFreeText(selected.id, patch)
  }

  return (
    <div className="h-10 flex items-center px-3 gap-1 border-t border-neutral-200/70 dark:border-neutral-800/70">
      <span className="inline-flex items-center justify-center h-6 w-6 text-neutral-500 dark:text-neutral-400 shrink-0">
        {TextIcon}
      </span>
      <Divider />

      <DropdownPicker
        value={String(src.fontSize)}
        suffix=" pt"
        items={FONT_SIZES.map((s) => ({ id: String(s), label: `${s} pt` }))}
        onSelect={(id) => apply({ fontSize: Number(id) })}
        widthClass="w-[4.5rem]"
      />

      <DropdownPicker
        value={src.fontFamily}
        items={FONT_FAMILIES.map((f) => ({ id: f.id, label: f.label }))}
        onSelect={(id) => apply({ fontFamily: id as FontFamily })}
        widthClass="w-[7rem]"
      />

      <Divider />

      <ToggleBtn
        active={src.bold}
        onClick={() => apply({ bold: !src.bold })}
        title="Bold (⌘B)"
      >
        <span className="font-bold text-sm leading-none">B</span>
      </ToggleBtn>
      <ToggleBtn
        active={src.underline}
        onClick={() => apply({ underline: !src.underline })}
        title="Underline (⌘U)"
      >
        <span className="underline text-sm leading-none">U</span>
      </ToggleBtn>
      <ToggleBtn
        active={src.italic}
        onClick={() => apply({ italic: !src.italic })}
        title="Italic (⌘I)"
      >
        <span className="italic text-sm leading-none">I</span>
      </ToggleBtn>

      <Divider />

      <AlignBtn
        active={src.align === 'left'}
        onClick={() => apply({ align: 'left' })}
        title="Align left"
        d="M2 4h12M2 8h8M2 12h12M2 16h8"
      />
      <AlignBtn
        active={src.align === 'center'}
        onClick={() => apply({ align: 'center' })}
        title="Align center"
        d="M2 4h12M4 8h8M2 12h12M4 16h8"
      />
      <AlignBtn
        active={src.align === 'right'}
        onClick={() => apply({ align: 'right' })}
        title="Align right"
        d="M2 4h12M6 8h8M2 12h12M6 16h8"
      />

      <Divider />

      <ColorPopover
        value={src.color}
        onChange={(c) => {
          if (c !== null) apply({ color: c })
        }}
        allowNone={false}
        title="Font color"
      >
        <span className="inline-flex flex-col items-center justify-center leading-none">
          <span className="text-[10px] font-semibold">A</span>
          <span className="block h-[2px] w-3 rounded-sm" style={{ background: src.color }} />
        </span>
      </ColorPopover>

      <Divider />

      <StrokeWidthControl
        value={src.strokeWidth}
        onChange={(w) => apply({ strokeWidth: w })}
      />

      <ColorPopover
        value={src.borderColor}
        onChange={(c) => apply({ borderColor: c })}
        allowNone
        title="Border color"
      >
        <BorderIcon color={src.borderColor} />
      </ColorPopover>

      <ColorPopover
        value={src.backgroundColor}
        onChange={(c) => apply({ backgroundColor: c })}
        allowNone
        title="Background color"
      >
        <FillIcon color={src.backgroundColor} />
      </ColorPopover>

      <button
        onClick={onClose}
        title="Close"
        aria-label="Close formatting bar"
        className="ml-1 h-6 w-6 inline-flex items-center justify-center rounded text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shrink-0"
      >
        <Svg className="w-3.5 h-3.5">
          <path d="M5 5l10 10M15 5l-10 10" />
        </Svg>
      </button>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-neutral-300/70 dark:bg-neutral-700/70 mx-1 shrink-0" />
}

function ToggleBtn({
  active,
  onClick,
  title,
  children
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`h-7 w-7 inline-flex items-center justify-center rounded transition shrink-0 ${
        active
          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
      }`}
    >
      {children}
    </button>
  )
}

function AlignBtn({
  active,
  onClick,
  title,
  d
}: {
  active: boolean
  onClick: () => void
  title: string
  d: string
}) {
  return (
    <ToggleBtn active={active} onClick={onClick} title={title}>
      <Svg>
        <path d={d} />
      </Svg>
    </ToggleBtn>
  )
}

function DropdownPicker({
  value,
  items,
  onSelect,
  widthClass,
  suffix = ''
}: {
  value: string
  items: { id: string; label: string }[]
  onSelect: (id: string) => void
  widthClass: string
  suffix?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = items.find((i) => i.id === value)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${widthClass} h-7 px-2 inline-flex items-center justify-between rounded bg-white/70 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-100 hover:bg-white dark:hover:bg-neutral-800 transition`}
      >
        <span className="truncate">{current ? current.label : value + suffix}</span>
        <Svg className="w-3 h-3 text-neutral-500 shrink-0">
          <path d="M4 6l4 4 4-4" />
        </Svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[7rem] max-h-64 overflow-y-auto p-1 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40">
          {items.map((it) => {
            const active = it.id === value
            return (
              <button
                key={it.id}
                onClick={() => {
                  onSelect(it.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-2 py-1 rounded text-xs transition ${
                  active
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700/70'
                }`}
              >
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ColorPopover({
  value,
  onChange,
  allowNone,
  title,
  children
}: {
  value: string | null
  onChange: (hex: string | null) => void
  allowNone: boolean
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={`h-7 inline-flex items-center gap-0.5 px-1.5 rounded transition ${
          open
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'
        }`}
      >
        {children}
        <Svg className="w-3 h-3 text-neutral-500">
          <path d="M4 6l4 4 4-4" />
        </Svg>
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 p-2 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 z-40"
          // Lock the popover to its natural content width so a flex/min-w-0 ancestor
          // can't collapse the grid columns and stack swatches into one column.
          style={{ width: 'max-content' }}
        >
          <div
            className="grid gap-1"
            // Explicit 24px tracks — robust against any 1fr column collapse.
            style={{ gridTemplateColumns: 'repeat(6, 1.5rem)' }}
          >
            {TEXT_COLORS.map((c) => {
              const active = value?.toLowerCase() === c.hex.toLowerCase()
              return (
                <button
                  key={c.hex}
                  onClick={() => {
                    onChange(c.hex)
                    setOpen(false)
                  }}
                  title={c.name}
                  className={`h-6 w-6 rounded-full ring-1 ring-black/15 transition ${
                    active ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ background: c.hex }}
                />
              )
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 flex items-center gap-1.5">
            <CustomColorButton
              value={value}
              onChange={(hex) => {
                onChange(hex)
                // Keep the popover open so the user can preview & adjust.
              }}
            />
            <input
              type="text"
              value={value ?? ''}
              placeholder="#rrggbb"
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.trim()
                if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                  onChange(v.startsWith('#') ? v : `#${v}`)
                }
              }}
              className="flex-1 h-6 px-1.5 text-[11px] tabular-nums rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              aria-label="Hex color"
            />
            {allowNone && (
              <button
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                title="None"
                className={`h-6 w-6 rounded-full ring-1 ring-black/15 bg-white relative overflow-hidden transition shrink-0 ${
                  value === null ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-110'
                }`}
              >
                <span
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top right, transparent calc(50% - 1px), #ef4444, transparent calc(50% + 1px))'
                  }}
                />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CustomColorButton({
  value,
  onChange
}: {
  value: string | null
  onChange: (hex: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Native color input requires a 6-digit hex; fall back to black if none/invalid.
  const safe = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      title="Custom color"
      className="relative h-6 w-6 rounded-full ring-1 ring-black/15 overflow-hidden hover:scale-110 transition shrink-0"
      style={{
        background:
          'conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)'
      }}
    >
      <input
        ref={inputRef}
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-label="Pick custom color"
      />
    </button>
  )
}

function StrokeWidthControl({
  value,
  onChange
}: {
  value: number
  onChange: (w: number) => void
}) {
  return (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        Stroke Width
      </span>
      <input
        type="range"
        min={0}
        max={10}
        step={0.25}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20 accent-blue-500"
        aria-label="Stroke width"
      />
      <input
        type="number"
        min={0}
        max={10}
        step={0.25}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-14 h-6 px-1.5 text-center text-xs tabular-nums rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
      />
      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">pt</span>
    </div>
  )
}

function BorderIcon({ color }: { color: string | null }) {
  if (color === null) {
    return (
      <span className="relative h-4 w-4 inline-block">
        <span className="absolute inset-0 rounded-sm border border-neutral-400 dark:border-neutral-500" />
        <span
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top right, transparent calc(50% - 1px), #ef4444, transparent calc(50% + 1px))'
          }}
        />
      </span>
    )
  }
  return (
    <span className="relative h-4 w-4 inline-block">
      <span className="absolute inset-0 rounded-sm border-2" style={{ borderColor: color }} />
    </span>
  )
}

function FillIcon({ color }: { color: string | null }) {
  if (color === null) {
    return (
      <span className="relative h-4 w-4 inline-block">
        <span className="absolute inset-0 rounded-sm border border-neutral-400 dark:border-neutral-500" />
        <span
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top right, transparent calc(50% - 1px), #ef4444, transparent calc(50% + 1px))'
          }}
        />
      </span>
    )
  }
  return (
    <span className="relative h-4 w-4 inline-block rounded-sm" style={{ background: color, border: '1px solid rgba(0,0,0,.15)' }} />
  )
}


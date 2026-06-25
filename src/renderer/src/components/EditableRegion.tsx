import { useEffect, useRef, useState } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { pointPdfToCss, type EditableTextRegion } from '../lib/annotations'
import { useAnnotationStore } from '../store/annotationStore'

type Props = {
  region: EditableTextRegion
  viewport: PageViewport
}

/** A single region overlay shown in Edit Text & Image mode.
 *
 * Two visual states:
 *  - **Inactive**: a translucent dashed border lays over the original PDF text;
 *    the underlying canvas remains visible.
 *  - **Active** (clicked) **or edited**: opaque white fill replaces the original
 *    text, and our own text — in a best-match font/size/color — is shown.
 */
export default function EditableRegion({ region, viewport }: Props) {
  const edited = useAnnotationStore((s) => s.editedRegions[region.id])
  const setRegionEdit = useAnnotationStore((s) => s.setRegionEdit)

  const isEdited = edited !== undefined && edited !== region.originalText
  const [active, setActive] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // PDF y is the *top* of the region in our coord system; pointPdfToCss
  // converts to CSS where y grows down.
  const { left, top } = pointPdfToCss(viewport, region.x, region.y)
  const widthCss = region.width * viewport.scale
  const heightCss = region.height * viewport.scale
  const fontSizeCss = region.fontSize * viewport.scale
  const lineHeightCss = region.lineHeight * viewport.scale

  useEffect(() => {
    if (active && taRef.current) {
      taRef.current.focus()
      taRef.current.select()
    }
  }, [active])

  const opaque = active || isEdited
  const currentText = edited ?? region.originalText

  const onTextChange = (value: string): void => {
    if (value === region.originalText) {
      setRegionEdit(region.id, null)
    } else {
      setRegionEdit(region.id, value)
    }
  }

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left,
        top,
        width: widthCss,
        height: heightCss,
        // Slight buffer so descenders don't get clipped — purely cosmetic.
        padding: 0,
        boxSizing: 'border-box',
        border: opaque
          ? `1.5px solid ${isEdited ? '#3b82f6' : '#737373'}`
          : '1px dashed rgba(115, 115, 115, 0.7)',
        background: opaque ? '#ffffff' : 'transparent',
        cursor: active ? 'text' : 'pointer',
        zIndex: 5
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!active) setActive(true)
      }}
    >
      {opaque ? (
        <textarea
          ref={taRef}
          value={currentText}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={() => setActive(false)}
          spellCheck={false}
          className="block w-full h-full resize-none outline-none bg-transparent"
          style={{
            color: region.color,
            fontFamily: region.fontFamily,
            fontSize: fontSizeCss,
            lineHeight: `${lineHeightCss}px`,
            fontWeight: region.bold ? 700 : 400,
            fontStyle: region.italic ? 'italic' : 'normal',
            padding: 0,
            border: 'none',
            // Whitespace preservation — the textarea behavior already keeps
            // newlines, but matching the canvas's word-wrap means no surprise
            // overflow until the user resizes the region (which v1 doesn't).
            whiteSpace: 'pre-wrap',
            overflow: 'hidden'
          }}
        />
      ) : (
        // Inactive: empty box so the underlying canvas text remains visible.
        // The dashed border alone communicates "editable".
        <span aria-hidden style={{ pointerEvents: 'none' }} />
      )}

      {isEdited && !active && (
        <button
          type="button"
          title="Revert to original"
          onClick={(e) => {
            e.stopPropagation()
            setRegionEdit(region.id, null)
          }}
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#3b82f6',
            color: 'white',
            fontSize: 11,
            lineHeight: '16px',
            fontWeight: 700,
            border: '1px solid white',
            cursor: 'pointer',
            zIndex: 6
          }}
        >
          ↺
        </button>
      )}
    </div>
  )
}

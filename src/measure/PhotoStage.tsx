/**
 * Photo with an SVG overlay in image-pixel coordinates: tap to add points, drag
 * handles to adjust, magnifier loupe above the finger for precise placement on touch.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { Vec2 } from './types'

export interface StageLayer {
  id: string
  points: Vec2[]
  color: string
  closed?: boolean
  /** Text per edge (edge i joins point i and i+1). */
  edgeLabels?: (string | null)[]
  numbered?: boolean
  /** Whether handles are drawn (and draggable when the layer is active). */
  handles?: boolean
  dashed?: boolean
}

export interface PhotoStageProps {
  src: string
  width: number
  height: number
  alt: string
  layers: StageLayer[]
  /** Layer whose points can be dragged. */
  activeLayer?: string | null
  /** Called on a tap away from existing handles. Return the new point's index to start dragging it, or null. */
  onAdd?(p: Vec2): number | null
  onMove?(layerId: string, index: number, p: Vec2): void
  onDragEnd?(): void
  /** Extra SVG content in image coordinates, drawn under the layers. Receives px-per-screen-px. */
  underlay?: (unit: number) => ReactNode
}

const LOUPE = 128
const ZOOM = 3

export function PhotoStage({ src, width, height, alt, layers, activeLayer, onAdd, onMove, onDragEnd, underlay }: PhotoStageProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [unit, setUnit] = useState(1) // image px per screen px
  const [displaySize, setDisplaySize] = useState({ w: 1, h: 1 })
  const drag = useRef<{ layer: string; index: number; pointerId: number } | null>(null)
  const [loupe, setLoupe] = useState<{ cx: number; cy: number; p: Vec2 } | null>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0) {
        setUnit(width / r.width)
        setDisplaySize({ w: r.width, h: r.height })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  const toImage = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.min(width, Math.max(0, ((e.clientX - r.left) / r.width) * width)),
      y: Math.min(height, Math.max(0, ((e.clientY - r.top) / r.height) * height)),
    }
  }

  const hitR = 24 * unit
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toImage(e)
    const layer = layers.find((l) => l.id === activeLayer)
    let index = -1
    if (layer) {
      let best = hitR
      layer.points.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < best) {
          best = d
          index = i
        }
      })
    }
    if (index < 0 && onAdd) {
      const added = onAdd(p)
      if (added === null) return
      index = added
    }
    if (index < 0 || !activeLayer) return
    e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    drag.current = { layer: activeLayer, index, pointerId: e.pointerId }
    setLoupe({ cx: e.clientX, cy: e.clientY, p: layer?.points[index] ?? p })
  }
  const onMoveEvt = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const p = toImage(e)
    onMove?.(d.layer, d.index, p)
    setLoupe({ cx: e.clientX, cy: e.clientY, p })
  }
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return
    drag.current = null
    setLoupe(null)
    onDragEnd?.()
  }

  const stroke = 2 * unit
  const font = 13 * unit

  // Loupe placement: above the finger, or below when too close to the top.
  let loupeStyle: CSSProperties | undefined
  if (loupe) {
    const k = displaySize.w / width
    const top = loupe.cy - LOUPE - 48 < 8 ? loupe.cy + 48 : loupe.cy - LOUPE - 48
    const left = Math.min(Math.max(8, loupe.cx - LOUPE / 2), (typeof window !== 'undefined' ? window.innerWidth : 400) - LOUPE - 8)
    loupeStyle = {
      left,
      top,
      width: LOUPE,
      height: LOUPE,
      backgroundImage: `url("${src}")`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${displaySize.w * ZOOM}px ${displaySize.h * ZOOM}px`,
      backgroundPosition: `${LOUPE / 2 - loupe.p.x * k * ZOOM}px ${LOUPE / 2 - loupe.p.y * k * ZOOM}px`,
    }
  }

  return (
    <div className="relative mx-auto w-fit max-w-full select-none">
      <img src={src} alt={alt} className="block max-h-[65vh] max-w-full rounded-xl" draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onDown}
        onPointerMove={onMoveEvt}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="application"
        aria-label={`${alt}. Tap to place points; drag a point to adjust it.`}
      >
        {underlay?.(unit)}
        {layers.map((l) => {
          const n = l.points.length
          const segs: [Vec2, Vec2, number][] = []
          for (let i = 0; i + 1 < n; i++) segs.push([l.points[i], l.points[i + 1], i])
          if (l.closed && n >= 3) segs.push([l.points[n - 1], l.points[0], n - 1])
          return (
            <g key={l.id}>
              {segs.map(([a, b, i]) => (
                <line
                  key={`s${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={l.color}
                  strokeWidth={stroke * 1.5}
                  strokeDasharray={l.dashed ? `${8 * unit} ${5 * unit}` : undefined}
                />
              ))}
              {segs.map(([a, b, i]) => {
                const t = l.edgeLabels?.[i]
                if (!t) return null
                return (
                  <text
                    key={`t${i}`}
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 8 * unit}
                    fontSize={font}
                    fontWeight={700}
                    textAnchor="middle"
                    fill="#0f172a"
                    stroke="white"
                    strokeWidth={4 * unit}
                    paintOrder="stroke"
                    fontFamily="system-ui, sans-serif"
                  >
                    {t}
                  </text>
                )
              })}
              {l.handles !== false &&
                l.points.map((p, i) => (
                  <g key={`p${i}`}>
                    <circle cx={p.x} cy={p.y} r={14 * unit} fill={l.color} fillOpacity={l.id === activeLayer ? 0.25 : 0.12} />
                    <circle cx={p.x} cy={p.y} r={3 * unit} fill={l.color} stroke="white" strokeWidth={unit} />
                    {l.numbered && (
                      <text
                        x={p.x + 14 * unit}
                        y={p.y - 14 * unit}
                        fontSize={font}
                        fontWeight={700}
                        fill={l.color}
                        stroke="white"
                        strokeWidth={3 * unit}
                        paintOrder="stroke"
                        fontFamily="system-ui, sans-serif"
                      >
                        {i + 1}
                      </text>
                    )}
                  </g>
                ))}
            </g>
          )
        })}
      </svg>
      {loupe && loupeStyle && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow-xl ring-1 ring-slate-900/20"
          style={loupeStyle}
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-orange-500/80" />
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-orange-500/80" />
        </div>
      )}
    </div>
  )
}

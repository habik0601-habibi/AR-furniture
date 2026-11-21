import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Placed, Room, Rotation, Violation } from '../../engine/types'
import { footprint } from '../../engine/geometry'
import { Icon } from '../../components/Icon'

const LABEL: Record<string, string> = {
  sofa: 'Sofa', armchair: 'Armchair', bed: 'Bed', wardrobe: 'Wardrobe', dining_table: 'Dining table',
  dining_chair: 'Chair', coffee_table: 'Coffee table', tv_unit: 'TV unit', side_table: 'Side table',
  bookshelf: 'Bookshelf', desk: 'Desk', dresser: 'Dresser',
}

/**
 * Interactive floor plan. Items can be dragged (5 cm snap), rotated and
 * pinned. The parent re-scores the layout on every change, so the fit score
 * and warnings update live while the shopper moves things.
 */
export function PlanEditor({
  room,
  items,
  highlightId,
  violations,
  onChange,
}: {
  room: Room
  items: Placed[]
  highlightId?: string
  violations: Violation[]
  onChange(items: Placed[], movedId: string): void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(highlightId ?? null)
  const pad = Math.max(room.width, room.depth) * 0.06
  const flagged = new Set(violations.flatMap((v) => v.itemIds))

  function toPlan(e: RPointerEvent) {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }

  function clampItem(p: Placed, x: number, y: number): Placed {
    const r = footprint({ ...p, x: 0, y: 0 })
    const hw = (r.x1 - r.x0) / 2
    const hd = (r.y1 - r.y0) / 2
    const snap = (v: number) => Math.round(v / 5) * 5
    return {
      ...p,
      x: Math.min(room.width - hw, Math.max(hw, snap(x))),
      y: Math.min(room.depth - hd, Math.max(hd, snap(y))),
    }
  }

  function down(e: RPointerEvent, p: Placed) {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const pt = toPlan(e)
    drag.current = { id: p.id, dx: pt.x - p.x, dy: pt.y - p.y }
    setSelected(p.id)
  }
  function move(e: RPointerEvent) {
    const d = drag.current
    if (!d) return
    const pt = toPlan(e)
    const next = items.map((it) => (it.id === d.id ? { ...clampItem(it, pt.x - d.dx, pt.y - d.dy), locked: true } : it))
    onChange(next, d.id)
  }
  function up() {
    drag.current = null
  }

  const sel = items.find((i) => i.id === selected)

  function rotateSel() {
    if (!sel) return
    const rot = (((sel.rotation + 90) % 360) as Rotation)
    onChange(items.map((it) => (it.id === sel.id ? { ...clampItem({ ...it, rotation: rot }, it.x, it.y), locked: true } : it)), sel.id)
  }
  function toggleLock() {
    if (!sel) return
    onChange(items.map((it) => (it.id === sel.id ? { ...it, locked: !it.locked } : it)), sel.id)
  }
  function nudge(dx: number, dy: number) {
    if (!sel) return
    onChange(items.map((it) => (it.id === sel.id ? { ...clampItem(it, it.x + dx, it.y + dy), locked: true } : it)), sel.id)
  }

  return (
    <div>
      <div className="grid-paper overflow-hidden rounded-2xl border border-line bg-card">
        <svg
          ref={svgRef}
          viewBox={`${-pad} ${-pad} ${room.width + pad * 2} ${room.depth + pad * 2}`}
          className="block w-full touch-none select-none"
          style={{ maxHeight: 420 }}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="application"
          aria-label={`Floor plan ${room.width} by ${room.depth} cm. Select an item, then use the buttons below to move or rotate it.`}
        >
          <rect x={0} y={0} width={room.width} height={room.depth} fill="#fbf8f3" stroke="#1d2a26" strokeWidth={Math.max(4, room.width / 90)} />
          {room.openings.map((o) => (
            <OpeningShape key={o.id} room={room} o={o} />
          ))}
          {items.map((p) => {
            const r = footprint(p)
            const isNew = p.id === highlightId
            const bad = flagged.has(p.id)
            const isSel = p.id === selected
            const w = r.x1 - r.x0
            const h = r.y1 - r.y0
            const fs = Math.max(9, Math.min(w, h) / 5.5, room.width / 48)
            // front marker: a short bar on the item's front edge
            const front =
              p.rotation === 0 ? [r.x0 + w * 0.2, r.y1 - 3, w * 0.6, 3] :
              p.rotation === 180 ? [r.x0 + w * 0.2, r.y0, w * 0.6, 3] :
              p.rotation === 90 ? [r.x0, r.y0 + h * 0.2, 3, h * 0.6] :
              [r.x1 - 3, r.y0 + h * 0.2, 3, h * 0.6]
            return (
              <g key={p.id} onPointerDown={(e) => down(e, p)} style={{ cursor: 'grab' }}>
                <rect
                  x={r.x0}
                  y={r.y0}
                  width={w}
                  height={h}
                  rx={Math.min(w, h) * 0.12}
                  fill={isNew ? '#f6dccd' : '#ebe4d8'}
                  stroke={bad ? '#b4433a' : isNew ? '#c8653a' : '#44514c'}
                  strokeWidth={isSel ? 4 : 2}
                  strokeDasharray={p.locked && !isNew ? undefined : undefined}
                />
                <rect x={front[0]} y={front[1]} width={front[2]} height={front[3]} fill={isNew ? '#c8653a' : '#7a837f'} />
                <text x={r.x0 + w / 2} y={r.y0 + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={isNew ? 700 : 500} fill={isNew ? '#a94f28' : '#44514c'} fontFamily="Manrope" pointerEvents="none">
                  {isNew ? 'New' : LABEL[p.category] ?? p.category}
                </text>
                {p.locked && !isNew && (
                  <circle cx={r.x1 - fs * 0.8} cy={r.y0 + fs * 0.8} r={fs * 0.35} fill="#44514c" pointerEvents="none" />
                )}
              </g>
            )
          })}
          {/* scale bar: 1 m */}
          <g transform={`translate(${room.width - 100} ${room.depth + pad * 0.55})`}>
            <line x1={0} y1={0} x2={100} y2={0} stroke="#1d2a26" strokeWidth={2} />
            <line x1={0} y1={-5} x2={0} y2={5} stroke="#1d2a26" strokeWidth={2} />
            <line x1={100} y1={-5} x2={100} y2={5} stroke="#1d2a26" strokeWidth={2} />
            <text x={50} y={-8} textAnchor="middle" fontSize={Math.max(10, room.width / 50)} fill="#1d2a26" fontFamily="Manrope">1 m</text>
          </g>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-ink-2">{sel ? (sel.id === highlightId ? 'New item' : LABEL[sel.category]) : 'Tap an item to move it'}</span>
        <PlanBtn label="Move left" disabled={!sel} onClick={() => nudge(-10, 0)}><Icon name="arrowLeft" size={16} /></PlanBtn>
        <PlanBtn label="Move up" disabled={!sel} onClick={() => nudge(0, -10)}><Icon name="arrowLeft" size={16} className="rotate-90" /></PlanBtn>
        <PlanBtn label="Move down" disabled={!sel} onClick={() => nudge(0, 10)}><Icon name="arrowLeft" size={16} className="-rotate-90" /></PlanBtn>
        <PlanBtn label="Move right" disabled={!sel} onClick={() => nudge(10, 0)}><Icon name="arrowRight" size={16} /></PlanBtn>
        <PlanBtn label="Rotate 90 degrees" disabled={!sel} onClick={rotateSel}><Icon name="rotate" size={16} /></PlanBtn>
        <PlanBtn label={sel?.locked ? 'Unpin (let auto-arrange move it)' : 'Pin in place'} disabled={!sel} onClick={toggleLock}>
          <Icon name={sel?.locked ? 'lock' : 'unlock'} size={16} />
        </PlanBtn>
      </div>
    </div>
  )
}

function PlanBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-card text-ink hover:border-ink-2 disabled:opacity-35">
      {children}
    </button>
  )
}

function OpeningShape({ room, o }: { room: Room; o: Room['openings'][number] }) {
  const t = Math.max(6, room.width / 70)
  const along = o.offset
  let x = 0, y = 0, w = 0, h = 0
  if (o.wall === 'N') { x = along; y = -t / 2; w = o.width; h = t }
  if (o.wall === 'S') { x = along; y = room.depth - t / 2; w = o.width; h = t }
  if (o.wall === 'W') { x = -t / 2; y = along; w = t; h = o.width }
  if (o.wall === 'E') { x = room.width - t / 2; y = along; w = t; h = o.width }
  if (o.kind === 'window') return <rect x={x} y={y} width={w} height={h} fill="#dfeae6" stroke="#1d2a26" strokeWidth={1.5} />
  // door: gap in the wall + swing arc
  const r = o.width
  let arc = ''
  if (o.swingIn !== false) {
    if (o.wall === 'N') arc = `M${along} 0 L${along} ${r} A${r} ${r} 0 0 0 ${along + r} 0`
    if (o.wall === 'S') arc = `M${along} ${room.depth} L${along} ${room.depth - r} A${r} ${r} 0 0 1 ${along + r} ${room.depth}`
    if (o.wall === 'W') arc = `M0 ${along} L${r} ${along} A${r} ${r} 0 0 1 0 ${along + r}`
    if (o.wall === 'E') arc = `M${room.width} ${along} L${room.width - r} ${along} A${r} ${r} 0 0 0 ${room.width} ${along + r}`
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fbf8f3" />
      {arc && <path d={arc} fill="none" stroke="#7a837f" strokeWidth={1.5} strokeDasharray="5 5" />}
    </g>
  )
}

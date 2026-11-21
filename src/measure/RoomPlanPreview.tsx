import type { Opening, Room, Wall } from '../engine/types'
import type { Vec2 } from './types'
import { formatFeet } from './units'

export interface RoomPlanPreviewProps {
  room: Room
  /** Optional raw measured polygon (room-plan cm) drawn as a dashed outline. */
  polygon?: Vec2[]
  /** Hide the cm / ft dimension labels. */
  hideDimensions?: boolean
  /** Highlight one wall (e.g. while editing an opening on it). */
  highlightWall?: Wall
  className?: string
  /** Accessible title; defaults to a description of the room size. */
  title?: string
}

interface WallFrame {
  s: Vec2
  t: Vec2
  n: Vec2
}

function wallFrame(wall: Wall, W: number, D: number): WallFrame {
  switch (wall) {
    case 'N':
      return { s: { x: 0, y: 0 }, t: { x: 1, y: 0 }, n: { x: 0, y: 1 } }
    case 'E':
      return { s: { x: W, y: 0 }, t: { x: 0, y: 1 }, n: { x: -1, y: 0 } }
    case 'S':
      return { s: { x: 0, y: D }, t: { x: 1, y: 0 }, n: { x: 0, y: -1 } }
    case 'W':
      return { s: { x: 0, y: 0 }, t: { x: 0, y: 1 }, n: { x: 1, y: 0 } }
  }
}

const at = (f: WallFrame, along: number, inward = 0): Vec2 => ({
  x: f.s.x + f.t.x * along + f.n.x * inward,
  y: f.s.y + f.t.y * along + f.n.y * inward,
})

function OpeningShape({ o, room, wallT }: { o: Opening; room: Room; wallT: number }) {
  const f = wallFrame(o.wall, room.width, room.depth)
  const p0 = at(f, o.offset)
  const p1 = at(f, o.offset + o.width)
  if (o.kind === 'window') {
    const a0 = at(f, o.offset, -wallT / 2)
    const a1 = at(f, o.offset + o.width, -wallT / 2)
    const b0 = at(f, o.offset, wallT / 2)
    const b1 = at(f, o.offset + o.width, wallT / 2)
    return (
      <g>
        <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="white" strokeWidth={wallT} />
        <line x1={a0.x} y1={a0.y} x2={a1.x} y2={a1.y} stroke="#0284c7" strokeWidth={wallT * 0.18} />
        <line x1={b0.x} y1={b0.y} x2={b1.x} y2={b1.y} stroke="#0284c7" strokeWidth={wallT * 0.18} />
        <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#0284c7" strokeWidth={wallT * 0.12} />
      </g>
    )
  }
  const inward = o.swingIn === false ? -1 : 1
  const leaf = at(f, o.offset, inward * o.width)
  // Arc from the free end of the doorway (p1) round to the open leaf.
  const cross = f.t.x * (f.n.y * inward) - f.t.y * (f.n.x * inward)
  // SVG sweep-flag 1 = increasing angle in the y-down frame, i.e. rotating t towards n.
  const sweep = cross > 0 ? 1 : 0
  return (
    <g>
      <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="white" strokeWidth={wallT * 1.05} />
      <line x1={p0.x} y1={p0.y} x2={leaf.x} y2={leaf.y} stroke="#b45309" strokeWidth={wallT * 0.25} />
      <path
        d={`M ${p1.x} ${p1.y} A ${o.width} ${o.width} 0 0 ${sweep} ${leaf.x} ${leaf.y}`}
        fill="#f59e0b22"
        stroke="#b45309"
        strokeWidth={wallT * 0.12}
        strokeDasharray={`${wallT * 0.5} ${wallT * 0.35}`}
      />
    </g>
  )
}

/** SVG floor plan of a Room: walls, doors with swing arcs, windows, dimensions in cm and ft. */
export function RoomPlanPreview({ room, polygon, hideDimensions, highlightWall, className, title }: RoomPlanPreviewProps) {
  const W = Math.max(1, room.width)
  const D = Math.max(1, room.depth)
  const big = Math.max(W, D)
  const wallT = big * 0.02
  const font = big * 0.045
  const pad = hideDimensions ? wallT * 2 : font * 3.2
  const doorReach = Math.max(0, ...room.openings.filter((o) => o.kind === 'door' && o.swingIn === false).map((o) => o.width))
  const outer = pad + doorReach
  const label = title ?? `Floor plan, ${Math.round(W)} by ${Math.round(D)} centimetres`
  const highlight = highlightWall ? wallFrame(highlightWall, W, D) : null
  const hlLen = highlightWall === 'N' || highlightWall === 'S' ? W : D

  return (
    <svg
      viewBox={`${-outer} ${-outer} ${W + 2 * outer} ${D + 2 * outer}`}
      className={className ?? 'h-auto w-full'}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <rect x={0} y={0} width={W} height={D} fill="#f8fafc" />
      {polygon && polygon.length >= 3 && (
        <polygon
          points={polygon.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={wallT * 0.25}
          strokeDasharray={`${wallT} ${wallT * 0.6}`}
        />
      )}
      <rect x={0} y={0} width={W} height={D} fill="none" stroke="#0f172a" strokeWidth={wallT} />
      {highlight && (
        <line
          x1={highlight.s.x}
          y1={highlight.s.y}
          x2={highlight.s.x + highlight.t.x * hlLen}
          y2={highlight.s.y + highlight.t.y * hlLen}
          stroke="#f97316"
          strokeWidth={wallT * 1.4}
          strokeOpacity={0.7}
        />
      )}
      {room.openings.map((o) => (
        <OpeningShape key={o.id} o={o} room={{ ...room, width: W, depth: D }} wallT={wallT} />
      ))}
      {!hideDimensions && (
        <g fill="#334155" fontSize={font} fontFamily="system-ui, sans-serif" textAnchor="middle">
          <text x={W / 2} y={-outer + font * 1.3}>
            {Math.round(W)} cm · {formatFeet(W)}
          </text>
          <text
            x={-outer + font * 1.3}
            y={D / 2}
            transform={`rotate(-90 ${-outer + font * 1.3} ${D / 2})`}
          >
            {Math.round(D)} cm · {formatFeet(D)}
          </text>
          <g fontSize={font * 0.8} fill="#64748b">
            <text x={W / 2} y={wallT + font * 1.1}>N</text>
            <text x={W / 2} y={D - wallT - font * 0.4}>S</text>
            <text x={W - wallT - font * 0.6} y={D / 2 + font * 0.3}>E</text>
            <text x={wallT + font * 0.6} y={D / 2 + font * 0.3}>W</text>
          </g>
        </g>
      )}
    </svg>
  )
}

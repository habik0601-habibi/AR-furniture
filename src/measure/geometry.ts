/**
 * Pure floor-plan geometry shared by the AR and photo modes.
 *
 * Input polygons are in any planar, metric (cm) frame whose handedness matches
 * the plan (x right, y down when seen from above). The output is a `Room`
 * rectangle in the plan frame of `engine/types.ts`.
 */
import type { Opening, Room, Wall } from '../engine/types'
import type { RawOpening, Vec2 } from './types'

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

export function centroid(pts: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

/** Signed shoelace area (positive = clockwise when y points down). */
export function signedArea(pts: Vec2[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function polygonArea(pts: Vec2[]): number {
  return Math.abs(signedArea(pts))
}

export function perimeter(pts: Vec2[], closed = true): number {
  let s = 0
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) s += distance(pts[i], pts[(i + 1) % pts.length])
  return s
}

/** Interior angle at each vertex, degrees. */
export function cornerAngles(pts: Vec2[]): number[] {
  return pts.map((p, i) => {
    const a = sub(pts[(i - 1 + pts.length) % pts.length], p)
    const b = sub(pts[(i + 1) % pts.length], p)
    const c = dot(a, b) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1)
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
  })
}

export interface RectFit {
  /** Extent along the x axis (the first traced wall), cm. */
  width: number
  /** Extent along the y axis, cm. */
  depth: number
  /** Unit x axis of the room in the input frame. */
  ex: Vec2
  /** Unit y axis of the room in the input frame (perpendicular, same handedness). */
  ey: Vec2
  /** The room's top-left (NW) corner in the input frame. */
  origin: Vec2
  /** Rectangle corners NW, NE, SE, SW in the input frame. */
  corners: Vec2[]
  /** RMS distance (cm) between the measured corners and the fitted rectangle. */
  residual: number
  /** Largest deviation of a measured corner angle from 90 degrees. */
  maxAngleError: number
  notes: string[]
}

/** Convert a point from the input frame into room-plan coordinates. */
export function toRoomFrame(fit: RectFit, p: Vec2): Vec2 {
  const d = sub(p, fit.origin)
  return { x: dot(d, fit.ex), y: dot(d, fit.ey) }
}

/** Convert a room-plan point back to the input frame. */
export function fromRoomFrame(fit: RectFit, p: Vec2): Vec2 {
  return add(fit.origin, add(scale(fit.ex, p.x), scale(fit.ey, p.y)))
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  return distance(p, add(a, scale(ab, t)))
}

/**
 * Fit the best rectangle to a traced floor polygon (corners in order, >= 3).
 *
 * - Orientation: length-weighted mean of the edge directions modulo 90 degrees
 *   (the "4-theta" circular mean), so every wall votes for the same axis pair.
 * - The x axis is snapped to the first traced edge, which becomes the N wall.
 * - Size: for a quadrilateral, the mean of opposite edge lengths projected on
 *   the axes (robust to noise; a bounding box would overestimate). For other
 *   polygons, the extents in that frame.
 * - Three points are treated as three corners of a rectangle; the fourth is inferred.
 */
export function fitRectangle(input: Vec2[]): RectFit {
  if (input.length < 3) throw new Error('Need at least 3 corners to fit a room')
  const notes: string[] = []
  let pts = input
  if (pts.length === 3) {
    pts = [pts[0], pts[1], pts[2], add(pts[0], sub(pts[2], pts[1]))]
    notes.push('Only 3 corners were measured; the 4th corner was inferred as a rectangle.')
  }
  const n = pts.length

  // Dominant direction modulo 90 degrees.
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    const e = sub(pts[(i + 1) % n], pts[i])
    const len = Math.hypot(e.x, e.y)
    const phi = Math.atan2(e.y, e.x)
    cx += len * Math.cos(4 * phi)
    cy += len * Math.sin(4 * phi)
  }
  const theta = Math.atan2(cy, cx) / 4

  // Snap the axis family to the first traced edge.
  const first = sub(pts[1], pts[0])
  let best = theta
  let bestDot = -Infinity
  for (let k = 0; k < 4; k++) {
    const a = theta + (k * Math.PI) / 2
    const d = Math.cos(a) * first.x + Math.sin(a) * first.y
    if (d > bestDot) {
      bestDot = d
      best = a
    }
  }
  let ex: Vec2 = { x: Math.cos(best), y: Math.sin(best) }
  // Rotate +90 degrees in a y-down frame (visually clockwise): keeps handedness.
  let ey: Vec2 = { x: -ex.y, y: ex.x }
  const c = centroid(pts)
  if (dot(sub(c, pts[0]), ey) < 0) {
    // Interior lies on the other side of the first edge: turn the frame by 180
    // degrees (never mirror) so the first edge is still the N wall.
    ex = scale(ex, -1)
    ey = scale(ey, -1)
  }

  const u = pts.map((p) => dot(p, ex))
  const v = pts.map((p) => dot(p, ey))

  let width = 0
  let depth = 0
  let u0 = 0
  let v0 = 0
  let usedEdges = false
  if (n === 4) {
    const horiz: number[] = []
    const vert: number[] = []
    for (let i = 0; i < 4; i++) {
      const du = Math.abs(u[(i + 1) % 4] - u[i])
      const dv = Math.abs(v[(i + 1) % 4] - v[i])
      if (du >= dv) horiz.push(du)
      else vert.push(dv)
    }
    if (horiz.length === 2 && vert.length === 2) {
      width = (horiz[0] + horiz[1]) / 2
      depth = (vert[0] + vert[1]) / 2
      const cu = u.reduce((s, x) => s + x, 0) / 4
      const cv = v.reduce((s, x) => s + x, 0) / 4
      u0 = cu - width / 2
      v0 = cv - depth / 2
      usedEdges = true
    }
  }
  if (!usedEdges) {
    u0 = Math.min(...u)
    v0 = Math.min(...v)
    width = Math.max(...u) - u0
    depth = Math.max(...v) - v0
    notes.push(
      n === 4
        ? 'The traced shape is far from a rectangle; using its bounding rectangle.'
        : `Room traced with ${n} corners; using the bounding rectangle (non-rectangular rooms are approximated).`,
    )
  }

  const origin = add(scale(ex, u0), scale(ey, v0))
  const corners = [
    origin,
    add(origin, scale(ex, width)),
    add(add(origin, scale(ex, width)), scale(ey, depth)),
    add(origin, scale(ey, depth)),
  ]

  // Residual: corners vs nearest fitted corner (quads), else distance to the outline.
  let sq = 0
  for (const p of pts) {
    const d =
      n === 4
        ? Math.min(...corners.map((q) => distance(p, q)))
        : Math.min(...corners.map((q, i) => distToSegment(p, q, corners[(i + 1) % 4])))
    sq += d * d
  }
  const residual = Math.sqrt(sq / n)
  const maxAngleError = Math.max(...cornerAngles(pts).map((a) => Math.abs(a - 90)))
  if (input.length >= 4 && maxAngleError > 10) {
    notes.push(`A corner is ${Math.round(maxAngleError)}° away from square; check the tapped corners.`)
  }
  return { width, depth, ex, ey, origin, corners, residual, maxAngleError, notes }
}

export interface MappedOpening {
  opening: Opening
  /** How far the opening's midpoint is from the wall it was snapped to (cm). */
  distanceFromWall: number
}

let openingCounter = 0
export function newOpeningId(): string {
  openingCounter += 1
  return `op-${Date.now().toString(36)}-${openingCounter}`
}

/** Length of a wall of a width x depth room. */
export function wallLength(wall: Wall, width: number, depth: number): number {
  return wall === 'N' || wall === 'S' ? width : depth
}

/**
 * Snap an opening, given as two floor points in room-plan coordinates, onto the nearest wall.
 * Offset is measured from the wall's start corner (west for N/S, north for E/W).
 */
export function snapOpeningToWall(
  kind: 'door' | 'window',
  a: Vec2,
  b: Vec2,
  width: number,
  depth: number,
): MappedOpening {
  const m = scale(add(a, b), 0.5)
  const cands: { wall: Wall; d: number }[] = [
    { wall: 'N', d: Math.abs(m.y) },
    { wall: 'E', d: Math.abs(m.x - width) },
    { wall: 'S', d: Math.abs(m.y - depth) },
    { wall: 'W', d: Math.abs(m.x) },
  ]
  cands.sort((p, q) => p.d - q.d)
  const wall = cands[0].wall
  const along = wall === 'N' || wall === 'S' ? [a.x, b.x] : [a.y, b.y]
  const len = wallLength(wall, width, depth)
  const start = Math.max(0, Math.min(len, Math.min(...along)))
  const end = Math.max(0, Math.min(len, Math.max(...along)))
  const opening: Opening = {
    id: newOpeningId(),
    kind,
    wall,
    offset: Math.round(start),
    width: Math.round(end - start),
  }
  if (kind === 'door') opening.swingIn = true
  else opening.sillHeight = 90
  return { opening, distanceFromWall: cands[0].d }
}

export interface BuiltRoom {
  room: Room
  /** The measured polygon, re-expressed in room-plan coordinates. */
  polygon: Vec2[]
  fit: RectFit
  notes: string[]
}

/** Polygon + raw openings (both in the same metric input frame) -> Room. */
export function buildRoom(
  polygon: Vec2[],
  openings: RawOpening[],
  height: number,
  name?: string,
): BuiltRoom {
  const fit = fitRectangle(polygon)
  const notes = [...fit.notes]
  const W = Math.round(fit.width)
  const D = Math.round(fit.depth)
  const mapped: Opening[] = []
  for (const o of openings) {
    const r = snapOpeningToWall(o.kind, toRoomFrame(fit, o.a), toRoomFrame(fit, o.b), W, D)
    if (r.opening.width < 20) {
      notes.push(`A ${o.kind} was ignored: it is narrower than 20 cm after snapping to the wall.`)
      continue
    }
    if (r.distanceFromWall > 40) {
      notes.push(
        `A ${o.kind} was ${Math.round(r.distanceFromWall)} cm from the nearest wall; it was snapped to the ${r.opening.wall} wall.`,
      )
    }
    mapped.push(r.opening)
  }
  const room: Room = { width: W, depth: D, height: Math.round(height), openings: mapped }
  if (name) room.name = name
  return { room, polygon: polygon.map((p) => toRoomFrame(fit, p)), fit, notes }
}

/** Confidence from a relative error: 1% -> 0.96, 5% -> 0.8, 10% -> 0.6, floor 0.1, cap 0.97. */
export function confidenceFromRelativeError(rel: number): number {
  return Math.max(0.1, Math.min(0.97, 1 - 4 * rel))
}

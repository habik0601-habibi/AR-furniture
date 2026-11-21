/**
 * Plan-view geometry for the spatial engine.
 *
 * Everything is axis-aligned: furniture rotates in 90 degree steps, so a
 * footprint is always an axis-aligned rectangle (Rect). That keeps every
 * hard-constraint test O(1) and exact.
 *
 * Orientation convention (see types.ts): y grows downward (towards the S wall).
 * Rotation is measured clockwise as seen from above:
 *   rotation   0 -> front faces S (+y)   back against N
 *   rotation  90 -> front faces W (-x)   back against E
 *   rotation 180 -> front faces N (-y)   back against S
 *   rotation 270 -> front faces E (+x)   back against W
 */
import type { Dimensions, Opening, Placed, Room, Rotation, Wall } from './types'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Vec {
  x: number
  y: number
}

/** Numerical tolerance (cm). Touching rectangles do not overlap. */
export const EPS = 0.01

export const ROTATIONS: Rotation[] = [0, 90, 180, 270]

/** Size of a footprint in plan: w along x, d along y. 90/270 swap width and depth. */
export function planSize(dims: Dimensions, rotation: Rotation): { w: number; d: number } {
  return rotation === 90 || rotation === 270 ? { w: dims.d, d: dims.w } : { w: dims.w, d: dims.d }
}

export function footprintAt(dims: Dimensions, x: number, y: number, rotation: Rotation): Rect {
  const s = planSize(dims, rotation)
  return { x0: x - s.w / 2, y0: y - s.d / 2, x1: x + s.w / 2, y1: y + s.d / 2 }
}

export function footprint(p: Placed): Rect {
  return footprintAt(p.dims, p.x, p.y, p.rotation)
}

export function rectW(r: Rect): number {
  return r.x1 - r.x0
}
export function rectH(r: Rect): number {
  return r.y1 - r.y0
}
export function rectArea(r: Rect): number {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)
}
export function rectCenter(r: Rect): Vec {
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }
}

export function expand(r: Rect, m: number): Rect {
  return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }
}

/** Interior overlap (shared edges do not count). */
export function rectsOverlap(a: Rect, b: Rect, eps = EPS): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) }
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null
}

export function overlapArea(a: Rect, b: Rect): number {
  const i = intersection(a, b)
  return i ? rectArea(i) : 0
}

/** Euclidean distance between two rectangles (0 when they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1)
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1)
  return Math.hypot(dx, dy)
}

export function pointInRect(p: Vec, r: Rect): boolean {
  return p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1
}

export function roomRect(room: Room): Rect {
  return { x0: 0, y0: 0, x1: room.width, y1: room.depth }
}

export function insideRoom(r: Rect, room: Room, tol = 0.5): boolean {
  return r.x0 >= -tol && r.y0 >= -tol && r.x1 <= room.width + tol && r.y1 <= room.depth + tol
}

export function clipToRoom(r: Rect, room: Room): Rect | null {
  return intersection(r, roomRect(room))
}

/* ---------------------------- orientation ---------------------------- */

/** Unit vector the item's front faces. */
export function frontVector(rotation: Rotation): Vec {
  switch (rotation) {
    case 0:
      return { x: 0, y: 1 }
    case 90:
      return { x: -1, y: 0 }
    case 180:
      return { x: 0, y: -1 }
    default:
      return { x: 1, y: 0 }
  }
}

/** Rotation that puts an item's back against `wall` (front facing into the room). */
export function rotationForWall(wall: Wall): Rotation {
  return wall === 'N' ? 0 : wall === 'E' ? 90 : wall === 'S' ? 180 : 270
}

/** The wall an item's back points to. */
export function backWallOf(rotation: Rotation): Wall {
  return rotation === 0 ? 'N' : rotation === 90 ? 'E' : rotation === 180 ? 'S' : 'W'
}

export function oppositeWall(w: Wall): Wall {
  return w === 'N' ? 'S' : w === 'S' ? 'N' : w === 'E' ? 'W' : 'E'
}

export function rotate(r: Rotation, by: number): Rotation {
  return ((((r + by) % 360) + 360) % 360) as Rotation
}

export const WALL_NAMES: Record<Wall, string> = { N: 'north', E: 'east', S: 'south', W: 'west' }

export function wallLength(room: Room, wall: Wall): number {
  return wall === 'N' || wall === 'S' ? room.width : room.depth
}

/** Distance from a rectangle's nearest edge to a wall. */
export function distanceToWall(r: Rect, room: Room, wall: Wall): number {
  switch (wall) {
    case 'N':
      return r.y0
    case 'S':
      return room.depth - r.y1
    case 'W':
      return r.x0
    default:
      return room.width - r.x1
  }
}

/** Lateral coordinate of a point along a wall (x for N/S, y for E/W). */
export function alongWall(wall: Wall, p: Vec): number {
  return wall === 'N' || wall === 'S' ? p.x : p.y
}

/** Lateral extent of a rectangle along a wall. */
export function spanAlongWall(wall: Wall, r: Rect): [number, number] {
  return wall === 'N' || wall === 'S' ? [r.x0, r.x1] : [r.y0, r.y1]
}

/* ------------------------- zones around items ------------------------ */

/**
 * Zone of `depth` cm adjacent to one side of a footprint.
 * side: 'front' | 'back' | 'left' | 'right' relative to the item's own facing.
 */
export function sideZone(p: Placed, side: 'front' | 'back' | 'left' | 'right', depth: number): Rect {
  const r = footprint(p)
  const f = frontVector(p.rotation)
  // left/right as seen by someone sitting on the item looking out of its front.
  let v: Vec
  if (side === 'front') v = f
  else if (side === 'back') v = { x: -f.x, y: -f.y }
  else if (side === 'right') v = { x: -f.y, y: f.x }
  else v = { x: f.y, y: -f.x }
  return zoneOnRectSide(r, v, depth)
}

/** Rectangle of `depth` beyond the edge of r that faces direction v (an axis unit vector). */
export function zoneOnRectSide(r: Rect, v: Vec, depth: number): Rect {
  if (v.y > 0) return { x0: r.x0, x1: r.x1, y0: r.y1, y1: r.y1 + depth }
  if (v.y < 0) return { x0: r.x0, x1: r.x1, y0: r.y0 - depth, y1: r.y0 }
  if (v.x > 0) return { x0: r.x1, x1: r.x1 + depth, y0: r.y0, y1: r.y1 }
  return { x0: r.x0 - depth, x1: r.x0, y0: r.y0, y1: r.y1 }
}

/** Clearance zone in front of an item. */
export function frontZone(p: Placed, depth: number): Rect {
  return sideZone(p, 'front', depth)
}

/** Midpoint of the front edge. */
export function frontCenter(p: Placed): Vec {
  const f = frontVector(p.rotation)
  const s = planSize(p.dims, p.rotation)
  return { x: p.x + (f.x * s.w) / 2, y: p.y + (f.y * s.d) / 2 }
}

/** Signed distance of a point in front of an item's front edge (negative = behind it). */
export function frontDistance(p: Placed, pt: Vec): number {
  const f = frontVector(p.rotation)
  const c = frontCenter(p)
  return (pt.x - c.x) * f.x + (pt.y - c.y) * f.y
}

/* ------------------------------ openings ------------------------------ */

/**
 * A strip of the room adjacent to a wall between lateral coordinates a0..a1,
 * reaching `depth` into the room.
 */
export function wallStrip(room: Room, wall: Wall, a0: number, a1: number, depth: number): Rect {
  switch (wall) {
    case 'N':
      return { x0: a0, x1: a1, y0: 0, y1: depth }
    case 'S':
      return { x0: a0, x1: a1, y0: room.depth - depth, y1: room.depth }
    case 'W':
      return { x0: 0, x1: depth, y0: a0, y1: a1 }
    default:
      return { x0: room.width - depth, x1: room.width, y0: a0, y1: a1 }
  }
}

/** Depth kept clear in front of any door so people can step in and out. */
export const DOOR_APPROACH = 60

/**
 * Keep-clear zone of a door. An inward-swinging leaf sweeps a quarter circle of
 * radius = door width; we approximate it by the bounding square (conservative).
 * Every door also keeps an approach strip of DOOR_APPROACH cm.
 */
export function doorZone(room: Room, door: Opening, approach = DOOR_APPROACH): Rect {
  const depth = door.swingIn ? Math.max(door.width, approach) : approach
  return wallStrip(room, door.wall, door.offset, door.offset + door.width, depth)
}

/** Depth in front of a window that tall furniture must not occupy. */
export const WINDOW_DEPTH = 50

export function windowZone(room: Room, win: Opening, depth = WINDOW_DEPTH): Rect {
  return wallStrip(room, win.wall, win.offset, win.offset + win.width, depth)
}

/** Default sill height when a window does not specify one. */
export const DEFAULT_SILL = 90

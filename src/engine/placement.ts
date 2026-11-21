/**
 * Constraint-based furniture layout optimiser.
 *
 * Pipeline
 *  1. Candidate poses per item:
 *       - wall poses: back flush against each wall, sliding along it on a 10 cm grid
 *         (for categories that belong against a wall);
 *       - free poses: a grid over the floor in all useful rotations (others);
 *       - relation poses, generated from what is already placed: coffee table
 *         35-50 cm in front of a sofa, chairs around a dining table, side table
 *         beside a sofa/bed, TV unit on the wall the sofa faces, armchair angled
 *         at the sofa's end.
 *  2. Greedy construction in priority order (anchors first: bed, wardrobe, sofa,
 *     dining table, TV unit, ...; ties broken by larger footprint). Every
 *     feasible candidate is ranked with a cheap objective (no walkway BFS); the
 *     best few are re-ranked with the full objective.
 *  3. Simulated annealing (seeded mulberry32 RNG, geometric cooling) with moves
 *     shift / slide-along-wall, jump to another candidate, relation snap,
 *     rotate, swap two items, and insert a still-unplaced item.
 *
 * Hard constraints are never violated by proposed moves: inside the room, no
 * overlap, outside every door keep-clear zone (approach strip + inward swing
 * square), tall items out of window zones. Soft terms (0-100 each) are combined
 * into a weighted score; see WEIGHTS and docs/spatial-engine.md.
 */
import type {
  Category,
  ItemSpec,
  LayoutResult,
  Opening,
  Placed,
  PlacementOptions,
  Room,
  Rotation,
  ScoreTerm,
  Violation,
  Wall,
} from './types'
import {
  EPS,
  DEFAULT_SILL,
  WALL_NAMES,
  backWallOf,
  distanceToWall,
  doorZone,
  footprint,

  frontCenter,
  frontDistance,
  frontVector,
  insideRoom,
  oppositeWall,
  overlapArea,
  planSize,
  rectArea,
  rectCenter,
  rectGap,
  rectsOverlap,
  rotate,
  rotationForWall,
  wallLength,

  windowZone,
  type Rect,
  type Vec,
} from './geometry'
import { CATEGORY_RULES, RELATIONS, band, isTall, type Relation } from './rules'

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export const DEFAULT_WALKWAY = 75
export const DEFAULT_ITERATIONS = 2000

/** Weights of the soft terms (sum 100). */
export const WEIGHTS = {
  clearance: 25,
  walkway: 25,
  relations: 20,
  wall: 12,
  light: 8,
  balance: 10,
} as const

/** Objective points lost per item that could not be placed (annealing only). */
const UNPLACED_PENALTY = 15
/** Annealing temperatures, in objective points. */
const T_START = 5
const T_END = 0.05
/** How far beyond the walkway band a person may stand to use an item (cm). */
const REACH = 25
/** Depth in front of a window that counts for natural light. */
const LIGHT_DEPTH = 60
const WALL_STEP = 10
/** Items taller than this block the view between sofa and TV. */
const SIGHT_HEIGHT = 60

/* ------------------------------------------------------------------ */
/* Seeded RNG                                                          */
/* ------------------------------------------------------------------ */

/** mulberry32: tiny, fast 32-bit PRNG; same seed -> same layout. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/* Context: per-room precomputation                                    */
/* ------------------------------------------------------------------ */

interface WalkGrid {
  cell: number
  nx: number
  ny: number
  blocked: Uint8Array
  seen: Uint8Array
  queue: Int32Array
  wallMasks: Map<number, Uint8Array>
}

interface Ctx {
  room: Room
  walkway: number
  doors: Opening[]
  doorZones: Rect[]
  windowZones: { id: string; wall: Wall; rect: Rect; sill: number }[]
  lightZones: { id: string; wall: Wall; rect: Rect; sill: number }[]
  grid: WalkGrid
}

function makeCtx(room: Room, opts: PlacementOptions = {}): Ctx {
  const doors = room.openings.filter((o) => o.kind === 'door')
  const windows = room.openings.filter((o) => o.kind === 'window')
  // 5 cm cells, coarser only for very large rooms (cap ~20k cells).
  const cell = Math.max(5, Math.ceil(Math.sqrt((room.width * room.depth) / 20000)))
  const nx = Math.max(1, Math.ceil(room.width / cell))
  const ny = Math.max(1, Math.ceil(room.depth / cell))
  return {
    room,
    walkway: opts.walkway ?? DEFAULT_WALKWAY,
    doors,
    doorZones: doors.map((d) => doorZone(room, d)),
    windowZones: windows.map((w) => ({ id: w.id, wall: w.wall, rect: windowZone(room, w), sill: w.sillHeight ?? DEFAULT_SILL })),
    lightZones: windows.map((w) => ({ id: w.id, wall: w.wall, rect: windowZone(room, w, LIGHT_DEPTH), sill: w.sillHeight ?? DEFAULT_SILL })),
    grid: {
      cell, nx, ny,
      blocked: new Uint8Array(nx * ny),
      seen: new Uint8Array(nx * ny),
      queue: new Int32Array(nx * ny),
      wallMasks: new Map(),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const rule = (c: Category) => CATEGORY_RULES[c]

function nameOf(it: ItemSpec): string {
  return it.name ? it.name : `the ${rule(it.category).label}`
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
function toSpec(p: ItemSpec): ItemSpec {
  return { id: p.id, productId: p.productId, category: p.category, dims: p.dims, name: p.name }
}
function place(spec: ItemSpec, x: number, y: number, rotation: Rotation): Placed {
  return { ...toSpec(spec), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, rotation }
}

/** Pose with the item's back flush against `wall`, lateral centre at `along`. */
export function wallPose(room: Room, spec: ItemSpec, wall: Wall, along: number): Placed {
  const rot = rotationForWall(wall)
  const s = planSize(spec.dims, rot)
  const horiz = wall === 'N' || wall === 'S'
  const half = horiz ? s.w / 2 : s.d / 2
  const len = wallLength(room, wall)
  const a = Math.min(Math.max(along, half), len - half)
  switch (wall) {
    case 'N':
      return place(spec, a, s.d / 2, rot)
    case 'S':
      return place(spec, a, room.depth - s.d / 2, rot)
    case 'W':
      return place(spec, s.w / 2, a, rot)
    default:
      return place(spec, room.width - s.w / 2, a, rot)
  }
}

/** Is a wall-category item currently flush against the wall behind it? */
function onWall(room: Room, p: Placed): boolean {
  return distanceToWall(footprint(p), room, backWallOf(p.rotation)) < 1
}

/* ------------------------------------------------------------------ */
/* Hard constraints                                                    */
/* ------------------------------------------------------------------ */

type HardCode = 'out_of_room' | 'blocks_door' | 'blocks_window'

/** Single-item hard problems (overlap is pairwise, checked separately). */
function soloProblems(p: Placed, r: Rect, ctx: Ctx): HardCode[] {
  const out: HardCode[] = []
  if (!insideRoom(r, ctx.room)) out.push('out_of_room')
  if (ctx.doorZones.some((z) => rectsOverlap(r, z))) out.push('blocks_door')
  if (isTall(p.category, p.dims.h) && ctx.windowZones.some((z) => rectsOverlap(r, z.rect))) out.push('blocks_window')
  return out
}

function feasible(p: Placed, others: Placed[], ctx: Ctx, skip = -1, skip2 = -1): boolean {
  const r = footprint(p)
  if (!insideRoom(r, ctx.room)) return false
  for (const z of ctx.doorZones) if (rectsOverlap(r, z)) return false
  if (isTall(p.category, p.dims.h)) for (const z of ctx.windowZones) if (rectsOverlap(r, z.rect)) return false
  for (let i = 0; i < others.length; i++) {
    if (i === skip || i === skip2) continue
    if (rectsOverlap(r, footprint(others[i]))) return false
  }
  return true
}

/** Hard-constraint violations of an arbitrary layout, reported as errors. */
function hardViolations(items: Placed[], ctx: Ctx, onlyIds?: Set<string>): Violation[] {
  const v: Violation[] = []
  const rects = items.map(footprint)
  const consider = (it: Placed) => !onlyIds || onlyIds.has(it.id)
  items.forEach((it, i) => {
    if (!consider(it)) return
    for (const code of soloProblems(it, rects[i], ctx)) {
      const msg =
        code === 'out_of_room'
          ? `${cap(nameOf(it))} extends outside the room`
          : code === 'blocks_door'
            ? `${cap(nameOf(it))} blocks a door or its swing area`
            : `${cap(nameOf(it))} is tall and stands in front of a window`
      v.push({ code, severity: 'error', message: msg, itemIds: [it.id] })
    }
  })
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (!consider(items[i]) && !consider(items[j])) continue
      if (rectsOverlap(rects[i], rects[j]))
        v.push({
          code: 'overlap',
          severity: 'error',
          message: `${cap(nameOf(items[i]))} overlaps ${nameOf(items[j])}`,
          itemIds: [items[i].id, items[j].id],
        })
    }
  return v
}

/* ------------------------------------------------------------------ */
/* Clearance                                                           */
/* ------------------------------------------------------------------ */

/**
 * Clear depth beyond the edge of item `idx` facing axis direction v, up to
 * `req`: limited by the room boundary and by any other item (except allowed
 * categories) that overlaps the zone laterally. Exact, no rasterisation.
 */
function clearDepth(idx: number, v: Vec, req: number, items: Placed[], rects: Rect[], room: Room): number {
  const r = rects[idx]
  const allow = rule(items[idx].category).allowInClearance
  let clear: number
  if (v.y > 0) clear = room.depth - r.y1
  else if (v.y < 0) clear = r.y0
  else if (v.x > 0) clear = room.width - r.x1
  else clear = r.x0
  for (let j = 0; j < rects.length; j++) {
    if (j === idx || allow.includes(items[j].category)) continue
    const o = rects[j]
    let gap = Infinity
    if (v.y !== 0) {
      if (!(o.x0 < r.x1 - EPS && o.x1 > r.x0 + EPS)) continue
      gap = v.y > 0 ? (o.y1 > r.y1 + EPS ? o.y0 - r.y1 : Infinity) : o.y0 < r.y0 - EPS ? r.y0 - o.y1 : Infinity
    } else {
      if (!(o.y0 < r.y1 - EPS && o.y1 > r.y0 + EPS)) continue
      gap = v.x > 0 ? (o.x1 > r.x1 + EPS ? o.x0 - r.x1 : Infinity) : o.x0 < r.x0 - EPS ? r.x0 - o.x1 : Infinity
    }
    if (gap < clear) clear = Math.max(0, gap)
  }
  return Math.min(Math.max(0, clear), req)
}

export interface ClearanceSide {
  side: 'front' | 'back' | 'left' | 'right'
  clear: number
  required: number
}

function sideVectors(rot: Rotation): Record<'front' | 'back' | 'left' | 'right', Vec> {
  const f = frontVector(rot)
  return { front: f, back: { x: -f.x, y: -f.y }, right: { x: -f.y, y: f.x }, left: { x: f.y, y: -f.x } }
}

function clearanceSides(idx: number, items: Placed[], rects: Rect[], room: Room): { sides: ClearanceSide[]; score: number | null } {
  const it = items[idx]
  const ru = rule(it.category)
  const vec = sideVectors(it.rotation)
  const sides: ClearanceSide[] = []
  const parts: number[] = []
  if (ru.front > 0) {
    const c = clearDepth(idx, vec.front, ru.front, items, rects, room)
    sides.push({ side: 'front', clear: c, required: ru.front })
    parts.push(c / ru.front)
  }
  if (ru.side > 0) {
    const need = ru.sidesRequired === 'auto' ? (it.dims.w >= 120 ? 2 : 1) : ru.sidesRequired
    const l = clearDepth(idx, vec.left, ru.side, items, rects, room)
    const r = clearDepth(idx, vec.right, ru.side, items, rects, room)
    sides.push({ side: 'left', clear: l, required: ru.side }, { side: 'right', clear: r, required: ru.side })
    parts.push(need === 2 ? (l + r) / (2 * ru.side) : Math.max(l, r) / ru.side)
  }
  if (ru.back > 0) {
    const c = clearDepth(idx, vec.back, ru.back, items, rects, room)
    sides.push({ side: 'back', clear: c, required: ru.back })
    parts.push(c / ru.back)
  }
  return { sides, score: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null }
}

/** Clearance around one item of a layout (used by the fit checker). */
export function clearanceOf(room: Room, layout: Placed[], id: string): { sides: ClearanceSide[]; score: number | null } {
  const idx = layout.findIndex((p) => p.id === id)
  if (idx < 0) return { sides: [], score: null }
  return clearanceSides(idx, layout, layout.map(footprint), room)
}

/* ------------------------------------------------------------------ */
/* Walkway: rasterise + BFS                                            */
/* ------------------------------------------------------------------ */

/**
 * Cells whose centre is closer than r to a wall are blocked, except along door
 * spans (a person enters there). Cached per radius.
 */
function wallMask(ctx: Ctx, r: number): Uint8Array {
  const g = ctx.grid
  const hit = g.wallMasks.get(r)
  if (hit) return hit
  const m = new Uint8Array(g.nx * g.ny)
  const inDoor = (wall: Wall, a: number) =>
    ctx.doors.some((d) => d.wall === wall && a > d.offset && a < d.offset + d.width)
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const cx = (i + 0.5) * g.cell
      const cy = (j + 0.5) * g.cell
      if (
        (cy < r && !inDoor('N', cx)) ||
        (ctx.room.depth - cy < r && !inDoor('S', cx)) ||
        (cx < r && !inDoor('W', cy)) ||
        (ctx.room.width - cx < r && !inDoor('E', cy)) ||
        cx > ctx.room.width ||
        cy > ctx.room.depth
      )
        m[j * g.nx + i] = 1
    }
  g.wallMasks.set(r, m)
  return m
}

/** Fill grid.seen with cells reachable from any door by a person of width 2r. */
function floodFromDoors(rects: Rect[], ctx: Ctx, r: number): void {
  const g = ctx.grid
  const { cell, nx, ny, blocked, seen, queue } = g
  blocked.set(wallMask(ctx, r))
  seen.fill(0)
  for (const rc of rects) {
    // cells whose centre lies strictly inside rc inflated by r
    const i0 = Math.max(0, Math.floor((rc.x0 - r) / cell - 0.5) + 1)
    const i1 = Math.min(nx - 1, Math.ceil((rc.x1 + r) / cell - 0.5) - 1)
    const j0 = Math.max(0, Math.floor((rc.y0 - r) / cell - 0.5) + 1)
    const j1 = Math.min(ny - 1, Math.ceil((rc.y1 + r) / cell - 0.5) - 1)
    for (let j = j0; j <= j1; j++) blocked.fill(1, j * nx + i0, j * nx + i1 + 1)
  }
  let head = 0
  let tail = 0
  const push = (idx: number) => {
    if (!blocked[idx] && !seen[idx]) {
      seen[idx] = 1
      queue[tail++] = idx
    }
  }
  for (const d of ctx.doors) {
    const horiz = d.wall === 'N' || d.wall === 'S'
    const n = horiz ? nx : ny
    for (let k = 0; k < n; k++) {
      const c = (k + 0.5) * cell
      if (c <= d.offset || c >= d.offset + d.width) continue
      if (d.wall === 'N') push(k)
      else if (d.wall === 'S') push((ny - 1) * nx + k)
      else if (d.wall === 'W') push(k * nx)
      else push(k * nx + nx - 1)
    }
  }
  while (head < tail) {
    const idx = queue[head++]
    const i = idx % nx
    if (i > 0) push(idx - 1)
    if (i < nx - 1) push(idx + 1)
    if (idx >= nx) push(idx - nx)
    if (idx < nx * (ny - 1)) push(idx + nx)
  }
}

/** Can a person standing in a reached cell use item k? */
function reaches(k: number, items: Placed[], rects: Rect[], ctx: Ctx, r: number): boolean {
  const g = ctx.grid
  const rc = rects[k]
  const m = r + REACH
  const i0 = Math.max(0, Math.floor((rc.x0 - m) / g.cell))
  const i1 = Math.min(g.nx - 1, Math.floor((rc.x1 + m) / g.cell))
  const j0 = Math.max(0, Math.floor((rc.y0 - m) / g.cell))
  const j1 = Math.min(g.ny - 1, Math.floor((rc.y1 + m) / g.cell))
  const front = rule(items[k].category).access === 'front'
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (!g.seen[j * g.nx + i]) continue
      if (front && frontDistance(items[k], { x: (i + 0.5) * g.cell, y: (j + 0.5) * g.cell }) < 0) continue
      return true
    }
  return false
}

/** Inflation radius for a walkway width: half the width, minus 1 cm for grid rounding. */
const radiusFor = (width: number) => Math.max(1, width / 2 - 1)

/** Per-item reachability from the doors for a given walkway width. */
function reachability(items: Placed[], rects: Rect[], ctx: Ctx, width: number): boolean[] {
  const r = radiusFor(width)
  floodFromDoors(rects, ctx, r)
  return items.map((_, k) => reaches(k, items, rects, ctx, r))
}

/** Public helper: is every item reachable from a door with the given walkway width? */
export function walkwayReach(room: Room, layout: Placed[], width = DEFAULT_WALKWAY): { id: string; reachable: boolean }[] {
  const ctx = makeCtx(room, { walkway: width })
  if (!ctx.doors.length) return layout.map((p) => ({ id: p.id, reachable: true }))
  const ok = reachability(layout, layout.map(footprint), ctx, width)
  return layout.map((p, i) => ({ id: p.id, reachable: ok[i] }))
}

/* ------------------------------------------------------------------ */
/* Relationships                                                       */
/* ------------------------------------------------------------------ */

interface RelEval {
  score: number
  measured: number
}

function lateralOverlapFrac(a: Rect, b: Rect, horizontal: boolean): number {
  const [a0, a1, b0, b1] = horizontal ? [a.x0, a.x1, b.x0, b.x1] : [a.y0, a.y1, b.y0, b.y1]
  const ov = Math.min(a1, b1) - Math.max(a0, b0)
  return ov <= 0 ? 0 : ov / Math.min(a1 - a0, b1 - b0)
}

function relScore(rel: Relation, i: number, j: number, items: Placed[], rects: Rect[]): RelEval {
  const a = items[i]
  const b = items[j]
  const ra = rects[i]
  const rb = rects[j]
  switch (rel.kind) {
    case 'faces': {
      const fa = frontCenter(a)
      const fb = frontCenter(b)
      const d = Math.hypot(fb.x - fa.x, fb.y - fa.y)
      if (d < 1) return { score: 0, measured: 0 }
      const dir = { x: (fb.x - fa.x) / d, y: (fb.y - fa.y) / d }
      const va = frontVector(a.rotation)
      const vb = frontVector(b.rotation)
      const ca = va.x * dir.x + va.y * dir.y
      const cb = -(vb.x * dir.x + vb.y * dir.y)
      const facing = clamp01((ca - 0.5) / 0.45) * clamp01((cb - 0.5) / 0.45)
      // line of sight: nothing taller than a coffee table between the two fronts
      const sight: Rect = {
        x0: Math.min(fa.x, fb.x) - (va.x === 0 ? 30 : 0),
        x1: Math.max(fa.x, fb.x) + (va.x === 0 ? 30 : 0),
        y0: Math.min(fa.y, fb.y) - (va.y === 0 ? 30 : 0),
        y1: Math.max(fa.y, fb.y) + (va.y === 0 ? 30 : 0),
      }
      let clearView = 1
      for (let k = 0; k < items.length; k++)
        if (k !== i && k !== j && items[k].dims.h > SIGHT_HEIGHT && rectsOverlap(sight, rects[k])) clearView = 0.3
      return { score: band(d, rel.min, rel.max, rel.falloff) * facing * clearView, measured: clearView < 1 ? -1 : d }
    }
    case 'in_front_of': {
      // subject a (e.g. coffee table) in front of partner b (e.g. sofa)
      const f = frontVector(b.rotation)
      let gap: number
      if (f.y > 0) gap = ra.y0 - rb.y1
      else if (f.y < 0) gap = rb.y0 - ra.y1
      else if (f.x > 0) gap = ra.x0 - rb.x1
      else gap = rb.x0 - ra.x1
      if (gap < -EPS) return { score: 0, measured: gap }
      const horizontal = f.y !== 0
      const lat = lateralOverlapFrac(ra, rb, horizontal)
      // centred on the seat, long side parallel to it
      const ca = rectCenter(ra)
      const cb = rectCenter(rb)
      const half = (horizontal ? rb.x1 - rb.x0 : rb.y1 - rb.y0) / 2
      const off = Math.abs(horizontal ? ca.x - cb.x : ca.y - cb.y)
      const centred = 1 - 0.5 * clamp01(off / half)
      const parallel = (horizontal ? ra.x1 - ra.x0 >= ra.y1 - ra.y0 : ra.y1 - ra.y0 >= ra.x1 - ra.x0) ? 1 : 0.75
      return { score: band(gap, rel.min, rel.max, rel.falloff) * lat * centred * parallel, measured: gap }
    }
    case 'beside': {
      const gap = rectGap(ra, rb)
      const sb = planSize(b.dims, b.rotation)
      const depth = b.rotation === 0 || b.rotation === 180 ? sb.d : sb.w
      const fd = frontDistance(b, rectCenter(ra))
      const atSide = fd <= 10 && fd >= -depth - 10 ? 1 : 0.4
      // nightstands line up with the head/back of the anchor
      const fa = frontVector(b.rotation)
      const ownDepth = fa.y !== 0 ? ra.y1 - ra.y0 : ra.x1 - ra.x0
      const ideal = -depth + ownDepth / 2
      const aligned = 1 - 0.5 * clamp01(Math.abs(fd - ideal) / depth)
      return { score: band(gap, rel.min, rel.max, rel.falloff) * atSide * aligned, measured: gap }
    }
    case 'around': {
      const gap = rectGap(ra, rb)
      const ca = rectCenter(ra)
      const cb = rectCenter(rb)
      const d = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1
      const va = frontVector(a.rotation)
      const cos = (va.x * (cb.x - ca.x) + va.y * (cb.y - ca.y)) / d
      const facing = cos > 0.7 ? 1 : 0.3 * clamp01((cos + 1) / 1.7)
      return { score: band(gap, rel.min, rel.max, rel.falloff) * facing, measured: gap }
    }
    case 'near_facing': {
      const gap = rectGap(ra, rb)
      const ca = rectCenter(ra)
      const va = frontVector(a.rotation)
      let best = 0
      items.forEach((t, k) => {
        if (k === i || !rel.faceTargets?.includes(t.category)) return
        const ct = rectCenter(rects[k])
        const d = Math.hypot(ct.x - ca.x, ct.y - ca.y) || 1
        const cos = (va.x * (ct.x - ca.x) + va.y * (ct.y - ca.y)) / d
        best = Math.max(best, clamp01((cos - 0.3) / 0.6))
      })
      return { score: band(gap, rel.min, rel.max, rel.falloff) * (0.4 + 0.6 * best), measured: gap }
    }
  }
}

function relationMessage(rel: Relation, a: Placed, b: Placed | null, ev: RelEval): string {
  const A = cap(nameOf(a))
  switch (rel.kind) {
    case 'faces':
      if (!b) return `${A} has nothing to face`
      if (ev.measured === -1) return `Something tall stands between ${nameOf(a)} and ${nameOf(b)}, blocking the view`
      if (ev.measured < rel.min || ev.measured > rel.max)
        return `${A} is ${Math.round(ev.measured)} cm from ${nameOf(b)} (${rel.min}-${rel.max} cm is comfortable for viewing)`
      return `${A} does not face ${nameOf(b)}`
    case 'in_front_of':
      return b && ev.measured >= 0
        ? `${A} is not within easy reach of ${nameOf(b)} (gap ${Math.round(ev.measured)} cm, ${rel.min}-${rel.max} cm recommended, centred in front)`
        : `${A} is not in front of a seat`
    case 'beside':
      return `${A} is not next to a sofa, bed or armchair`
    case 'around':
      return `${A} is not at the dining table`
    case 'near_facing':
      return `${A} is not grouped with the sofa`
  }
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

interface EvalResult {
  score: number
  terms: ScoreTerm[]
  violations: Violation[]
  freeFloorRatio: number
}

function scoreLayout(items: Placed[], ctx: Ctx, walk: boolean, detailed: boolean): EvalResult {
  const { room } = ctx
  const rects = items.map(footprint)
  const terms: ScoreTerm[] = []
  const violations: Violation[] = []
  const roomArea = room.width * room.depth

  // 1. Clearance satisfaction
  {
    let sum = 0
    let n = 0
    let worst = { s: 2, text: '' }
    items.forEach((it, i) => {
      const { sides, score } = clearanceSides(i, items, rects, room)
      if (score === null) return
      // weighted by footprint area: a blocked wardrobe matters more than a cramped chair
      const wgt = it.dims.w * it.dims.d
      sum += score * wgt
      n += wgt
      if (!detailed) return
      const ru = rule(it.category)
      if (score < worst.s) worst = { s: score, text: `${cap(nameOf(it))}: ${sides.map((s) => `${s.side} ${Math.round(s.clear)}/${s.required} cm`).join(', ')}` }
      const front = sides.find((s) => s.side === 'front')
      if (front && front.clear < front.required * 0.85)
        violations.push({
          code: 'clearance',
          severity: 'warning',
          message: `Only ${Math.round(front.clear)} cm clear in front of ${nameOf(it)} (${front.required} cm recommended ${ru.frontReason})`,
          itemIds: [it.id],
        })
      const lr = sides.filter((s) => s.side === 'left' || s.side === 'right')
      if (lr.length && it.category === 'bed') {
        const need = it.dims.w >= 120 ? 2 : 1
        const ok = lr.filter((s) => s.clear >= s.required * 0.85).length
        if (ok < need)
          violations.push({
            code: 'clearance',
            severity: 'warning',
            message: `${cap(nameOf(it))} needs ${ru.side} cm of access on ${need === 2 ? 'both sides' : 'one side'}; best side has ${Math.round(Math.max(...lr.map((s) => s.clear)))} cm`,
            itemIds: [it.id],
          })
      } else if (lr.length || sides.some((s) => s.side === 'back')) {
        const others = sides.filter((s) => s.side !== 'front')
        const min = others.reduce((m, s) => (s.clear < m.clear ? s : m), others[0])
        if (min && min.clear < min.required * 0.85)
          violations.push({
            code: 'clearance',
            severity: 'warning',
            message: `Only ${Math.round(min.clear)} cm at the ${min.side} of ${nameOf(it)} (${min.required} cm recommended ${it.category === 'dining_chair' ? 'to pull the chair out' : ru.frontReason})`,
            itemIds: [it.id],
          })
      }
    })
    terms.push({
      key: 'clearance',
      label: 'Clearance',
      value: n ? (100 * sum) / n : 100,
      weight: WEIGHTS.clearance,
      detail: detailed ? (n ? (worst.s >= 0.999 ? 'Every item has its recommended clearance' : `Tightest: ${worst.text}`) : 'No clearance rules apply') : undefined,
    })
  }

  // 2. Walkway connectivity (BFS from doors)
  if (walk) {
    if (!ctx.doors.length || !items.length) {
      terms.push({ key: 'walkway', label: 'Walkways', value: 100, weight: WEIGHTS.walkway, detail: detailed ? (ctx.doors.length ? 'Nothing to reach' : 'No door marked, walkway not checked') : undefined })
    } else {
      const ok = reachability(items, rects, ctx, ctx.walkway)
      const reached = ok.filter(Boolean).length
      let detail: string | undefined
      if (detailed) {
        const missing = items.filter((_, k) => !ok[k])
        if (missing.length) {
          // find the widest route that does reach each missed item
          const narrower = [60, 45].filter((w) => w < ctx.walkway).map((w) => ({ w, ok: reachability(items, rects, ctx, w) }))
          for (const it of missing) {
            const k = items.indexOf(it)
            const hit = narrower.find((n) => n.ok[k])
            violations.push({
              code: 'walkway',
              severity: 'warning',
              message: hit
                ? `Walkway to ${nameOf(it)} is only about ${hit.w} cm wide (${ctx.walkway} cm recommended)`
                : `${cap(nameOf(it))} cannot be reached from the door (route narrower than 45 cm)`,
              itemIds: [it.id],
            })
          }
          detail = `${reached} of ${items.length} items reachable with a ${ctx.walkway} cm walkway`
        } else detail = `Every item is reachable from the door with a ${ctx.walkway} cm walkway`
      }
      terms.push({ key: 'walkway', label: 'Walkways', value: (100 * reached) / items.length, weight: WEIGHTS.walkway, detail })
    }
  }

  // 3. Wall alignment
  {
    let sum = 0
    let n = 0
    const off: string[] = []
    items.forEach((it, i) => {
      if (!rule(it.category).againstWall) return
      const d = distanceToWall(rects[i], room, backWallOf(it.rotation))
      const s = band(d, 0, 5, 55)
      sum += s
      n++
      if (detailed && s < 0.5) {
        off.push(nameOf(it))
        violations.push({ code: 'wall', severity: 'warning', message: `${cap(nameOf(it))} usually belongs with its back against a wall`, itemIds: [it.id] })
      }
    })
    terms.push({
      key: 'wall',
      label: 'Wall alignment',
      value: n ? (100 * sum) / n : 100,
      weight: WEIGHTS.wall,
      detail: detailed ? (n ? (off.length ? `Away from the wall: ${off.join(', ')}` : 'Wall pieces sit against walls') : 'No wall pieces') : undefined,
    })
  }

  // 4. Relationships
  {
    let sum = 0
    let n = 0
    const good: string[] = []
    // 'beside' slots (anchor, side) already taken: a second side table on the same side counts less
    const slots = new Set<string>()
    items.forEach((it, i) => {
      for (const rel of RELATIONS) {
        if (rel.subject !== it.category) continue
        let best: RelEval = { score: -1, measured: 0 }
        let partner = -1
        let slot = ''
        items.forEach((p, j) => {
          if (j === i || !rel.partners.includes(p.category)) return
          const ev = relScore(rel, i, j, items, rects)
          let key = ''
          if (rel.kind === 'beside') {
            const f = frontVector(p.rotation)
            const ca = rectCenter(rects[i])
            key = `${j}:${(ca.x - p.x) * -f.y + (ca.y - p.y) * f.x > 0 ? 'r' : 'l'}`
            if (slots.has(key)) ev.score *= 0.4
          }
          if (ev.score > best.score) {
            best = ev
            partner = j
            slot = key
          }
        })
        if (partner < 0) continue
        if (slot) slots.add(slot)
        sum += best.score
        n++
        if (!detailed) continue
        if (best.score >= 0.7) good.push(rel.label)
        else if (best.score < 0.5)
          violations.push({ code: 'relation', severity: 'warning', message: relationMessage(rel, it, items[partner], best), itemIds: [it.id, items[partner].id] })
      }
    })
    terms.push({
      key: 'relations',
      label: 'Furniture relationships',
      value: n ? (100 * sum) / n : 100,
      weight: WEIGHTS.relations,
      detail: detailed ? (n ? (good.length ? [...new Set(good)].join('; ') : 'Related pieces are not grouped well') : 'No related pieces in this room') : undefined,
    })
  }

  // 5. Natural light: window zones not covered by furniture taller than the sill
  {
    let sum = 0
    const blocked: string[] = []
    for (const z of ctx.lightZones) {
      const za = rectArea(z.rect) || 1
      let cov = 0
      const who: Placed[] = []
      items.forEach((it, i) => {
        if (it.dims.h <= z.sill) return
        const a = overlapArea(z.rect, rects[i])
        if (a > 0) {
          cov += a
          who.push(it)
        }
      })
      const frac = Math.min(1, cov / za)
      sum += 1 - frac
      if (detailed && frac > 0.25) {
        blocked.push(WALL_NAMES[z.wall])
        violations.push({
          code: 'light',
          severity: 'warning',
          message: `${cap(who.map(nameOf).join(' and '))} ${who.length > 1 ? 'block' : 'blocks'} ${Math.round(frac * 100)}% of the window on the ${WALL_NAMES[z.wall]} wall`,
          itemIds: who.map((w) => w.id),
        })
      }
    }
    const n = ctx.lightZones.length
    terms.push({
      key: 'light',
      label: 'Natural light',
      value: n ? (100 * sum) / n : 100,
      weight: WEIGHTS.light,
      detail: detailed ? (n ? (blocked.length ? `Partly blocked window(s): ${blocked.join(', ')} wall` : 'Windows are unobstructed') : 'No windows marked') : undefined,
    })
  }

  // 6. Balance and free floor
  let used = 0
  {
    let cx = 0
    let cy = 0
    for (const r of rects) {
      const a = rectArea(r)
      used += a
      const c = rectCenter(r)
      cx += c.x * a
      cy += c.y * a
    }
    const free = 1 - used / roomArea
    let bal = 1
    if (used > 0) {
      const d = Math.hypot(cx / used - room.width / 2, cy / used - room.depth / 2)
      bal = 1 - d / (Math.hypot(room.width, room.depth) / 2)
    }
    const v = 100 * (0.6 * clamp01(bal) + 0.4 * clamp01(free / 0.6))
    terms.push({
      key: 'balance',
      label: 'Balance and open floor',
      value: v,
      weight: WEIGHTS.balance,
      detail: detailed ? `${Math.round(free * 100)}% of the floor is free; visual weight is ${bal > 0.8 ? 'well centred' : 'off to one side'}` : undefined,
    })
    if (detailed && free < 0.35)
      violations.push({ code: 'crowded', severity: 'warning', message: `Furniture covers ${Math.round((1 - free) * 100)}% of the floor; the room may feel crowded`, itemIds: [] })
  }

  let wsum = 0
  let vsum = 0
  for (const t of terms) {
    wsum += t.weight
    vsum += t.weight * t.value
  }
  return { score: wsum ? vsum / wsum : 0, terms, violations, freeFloorRatio: Math.max(0, 1 - used / roomArea) }
}

/* ------------------------------------------------------------------ */
/* Candidate generation                                                */
/* ------------------------------------------------------------------ */

function wallCandidates(room: Room, spec: ItemSpec): Placed[] {
  const out: Placed[] = []
  for (const wall of ['N', 'E', 'S', 'W'] as Wall[]) {
    const s = planSize(spec.dims, rotationForWall(wall))
    const half = wall === 'N' || wall === 'S' ? s.w / 2 : s.d / 2
    const len = wallLength(room, wall)
    if (2 * half > len) continue
    for (let a = half; a <= len - half + 1e-6; a += WALL_STEP) out.push(wallPose(room, spec, wall, a))
    out.push(wallPose(room, spec, wall, len - half)) // flush into the far corner
  }
  return out
}

function freeCandidates(room: Room, spec: ItemSpec): Placed[] {
  const out: Placed[] = []
  const rots: Rotation[] = rule(spec.category).symmetric ? [0, 90] : [0, 90, 180, 270]
  const step = Math.max(10, Math.ceil(Math.sqrt((room.width * room.depth) / 600) / 5) * 5)
  for (const rot of rots) {
    const s = planSize(spec.dims, rot)
    if (s.w > room.width || s.d > room.depth) continue
    const xs: number[] = []
    const ys: number[] = []
    for (let x = s.w / 2; x <= room.width - s.w / 2 + 1e-6; x += step) xs.push(x)
    for (let y = s.d / 2; y <= room.depth - s.d / 2 + 1e-6; y += step) ys.push(y)
    xs.push(room.width - s.w / 2)
    ys.push(room.depth - s.d / 2)
    for (const x of xs) for (const y of ys) out.push(place(spec, x, y, rot))
  }
  return out
}

function staticCandidates(room: Room, spec: ItemSpec): Placed[] {
  return rule(spec.category).againstWall ? wallCandidates(room, spec) : freeCandidates(room, spec)
}

/** Poses suggested by relationships with items already placed. */
function relationCandidates(room: Room, spec: ItemSpec, layout: Placed[]): Placed[] {
  const out: Placed[] = []
  const c = spec.category
  for (const p of layout) {
    const r = footprint(p)
    const f = frontVector(p.rotation)
    const fc = frontCenter(p)
    if (c === 'coffee_table' && (p.category === 'sofa' || p.category === 'armchair')) {
      for (const rot of [p.rotation, rotate(p.rotation, 90)] as Rotation[]) {
        const s = planSize(spec.dims, rot)
        const half = f.y !== 0 ? s.d / 2 : s.w / 2
        for (const gap of [35, 42, 50]) out.push(place(spec, fc.x + f.x * (gap + half), fc.y + f.y * (gap + half), rot))
      }
    }
    if (c === 'dining_chair' && p.category === 'dining_table') {
      // slots along each side of the table, chair facing the table
      const sides: { v: Vec; rot: Rotation }[] = [
        { v: { x: 0, y: 1 }, rot: 180 },
        { v: { x: 0, y: -1 }, rot: 0 },
        { v: { x: 1, y: 0 }, rot: 90 },
        { v: { x: -1, y: 0 }, rot: 270 },
      ]
      for (const sd of sides) {
        const s = planSize(spec.dims, sd.rot)
        const horizontal = sd.v.y !== 0
        const len = horizontal ? r.x1 - r.x0 : r.y1 - r.y0
        const cw = horizontal ? s.w : s.d
        const k = Math.max(1, Math.floor(len / (cw + 10)))
        for (let q = 0; q < k; q++) {
          const a = (horizontal ? r.x0 : r.y0) + (len * (q + 0.5)) / k
          const off = 5 + (horizontal ? s.d : s.w) / 2
          if (horizontal) out.push(place(spec, a, sd.v.y > 0 ? r.y1 + off : r.y0 - off, sd.rot))
          else out.push(place(spec, sd.v.x > 0 ? r.x1 + off : r.x0 - off, a, sd.rot))
        }
      }
    }
    if (c === 'side_table' && (p.category === 'sofa' || p.category === 'bed' || p.category === 'armchair')) {
      const s = planSize(spec.dims, p.rotation)
      const back = { x: -f.x, y: -f.y }
      const pc = { x: p.x, y: p.y }
      const ps = planSize(p.dims, p.rotation)
      // align the table's back with the anchor's back, 5 cm to either side
      for (const sgn of [-1, 1]) {
        if (f.y !== 0) {
          const x = sgn < 0 ? r.x0 - 5 - s.w / 2 : r.x1 + 5 + s.w / 2
          const y = pc.y + back.y * (ps.d / 2 - s.d / 2)
          out.push(place(spec, x, y, p.rotation))
        } else {
          const y = sgn < 0 ? r.y0 - 5 - s.d / 2 : r.y1 + 5 + s.d / 2
          const x = pc.x + back.x * (ps.w / 2 - s.w / 2)
          out.push(place(spec, x, y, p.rotation))
        }
      }
    }
    if (c === 'tv_unit' && p.category === 'sofa') {
      const w = oppositeWall(backWallOf(p.rotation))
      out.push(wallPose(room, spec, w, w === 'N' || w === 'S' ? p.x : p.y))
    }
    if (c === 'sofa' && p.category === 'tv_unit') {
      const w = oppositeWall(backWallOf(p.rotation))
      out.push(wallPose(room, spec, w, w === 'N' || w === 'S' ? p.x : p.y))
    }
    if (c === 'armchair' && p.category === 'sofa') {
      // at either end of the sofa, pushed forward, turned to face the seating area
      const ps = planSize(p.dims, p.rotation)
      for (const sgn of [-1, 1]) {
        const lat = f.y !== 0 ? { x: sgn, y: 0 } : { x: 0, y: sgn }
        // rotation whose front points opposite to lat (towards the sofa's axis)
        const rot: Rotation = lat.x > 0 ? 90 : lat.x < 0 ? 270 : lat.y > 0 ? 180 : 0
        const s = planSize(spec.dims, rot)
        const latHalf = f.y !== 0 ? ps.w / 2 : ps.d / 2
        const own = lat.x !== 0 ? s.w / 2 : s.d / 2
        const fwdOwn = f.y !== 0 ? s.d / 2 : s.w / 2
        for (const fwd of [30, 60]) {
          const along = latHalf + 20 + own
          out.push(place(spec, fc.x + lat.x * along + f.x * (fwd + fwdOwn), fc.y + lat.y * along + f.y * (fwd + fwdOwn), rot))
        }
      }
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Optimiser                                                           */
/* ------------------------------------------------------------------ */

function objective(layout: Placed[], unplacedCount: number, ctx: Ctx): number {
  return scoreLayout(layout, ctx, true, false).score - UNPLACED_PENALTY * unplacedCount
}

/** Pick the best feasible pose for `spec` in `layout` (greedy step). */
function bestPose(spec: ItemSpec, layout: Placed[], ctx: Ctx, statics: Placed[], unplacedLeft: number): Placed | null {
  const cands = relationCandidates(ctx.room, spec, layout).concat(statics)
  const scored: { p: Placed; s: number }[] = []
  for (const c of cands) {
    if (!feasible(c, layout, ctx)) continue
    layout.push(c)
    scored.push({ p: c, s: scoreLayout(layout, ctx, false, false).score })
    layout.pop()
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.s - a.s)
  let best: Placed | null = null
  let bestS = -Infinity
  for (const { p } of scored.slice(0, 5)) {
    layout.push(p)
    const s = objective(layout, unplacedLeft, ctx)
    layout.pop()
    if (s > bestS) {
      bestS = s
      best = p
    }
  }
  return best
}

/** Approximately normal(0,1) from three uniforms (deterministic, cheap). */
function gauss(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) * 2
}

/**
 * Automatically lay out `items` in `room`.
 * `fixed` are items already in the room: locked ones never move; unlocked
 * ones start where they are (if valid) and may be improved.
 */
export function optimiseLayout(room: Room, items: ItemSpec[], fixed: Placed[] = [], opts: PlacementOptions = {}): LayoutResult {
  const ctx = makeCtx(room, opts)
  const rng = mulberry32(opts.seed ?? 1)
  const N = Math.max(0, Math.floor(opts.iterations ?? DEFAULT_ITERATIONS))
  const fixedIds = new Set(fixed.map((f) => f.id))
  const lockedItems = fixed.filter((f) => f.locked).map((f) => ({ ...f }))
  const warm = fixed.filter((f) => !f.locked)
  const fresh = items.filter((i) => !fixedIds.has(i.id))

  const layout: Placed[] = [...lockedItems]
  const nLocked = layout.length
  const statics = new Map<string, Placed[]>()
  const getStatics = (s: ItemSpec) => {
    let c = statics.get(s.id)
    if (!c) statics.set(s.id, (c = staticCandidates(room, s)))
    return c
  }
  const area = (s: ItemSpec) => s.dims.w * s.dims.d
  const order: ItemSpec[] = [...warm, ...fresh].sort(
    (a, b) => rule(a.category).priority - rule(b.category).priority || area(b) - area(a) || (a.id < b.id ? -1 : 1),
  )

  // --- greedy construction
  let unplaced: ItemSpec[] = []
  order.forEach((spec, k) => {
    const w = warm.find((p) => p.id === spec.id)
    if (w && feasible(w, layout, ctx)) {
      layout.push({ ...w })
      return
    }
    const p = bestPose(toSpec(spec), layout, ctx, getStatics(spec), order.length - k - 1)
    if (p) layout.push(p)
    else unplaced.push(toSpec(spec))
  })

  // --- simulated annealing
  let cur = objective(layout, unplaced.length, ctx)
  let best = { layout: layout.map((p) => ({ ...p })), unplaced: [...unplaced], obj: cur }
  let state = layout
  let ran = 0
  for (let it = 0; it < N; it++) {
    const movable = state.length - nLocked
    if (movable <= 0 && !unplaced.length) break
    ran++
    const T = T_START * Math.pow(T_END / T_START, it / Math.max(1, N))
    let next: Placed[] | null = null
    let nextUnplaced = unplaced
    const u = rng()
    if (unplaced.length && (u < 0.15 || movable <= 0)) {
      const si = Math.floor(rng() * unplaced.length)
      const spec = unplaced[si]
      const rc = relationCandidates(room, spec, state)
      const pool = rc.length && rng() < 0.5 ? rc : getStatics(spec)
      if (!pool.length) continue
      const cand = pool[Math.floor(rng() * pool.length)]
      if (!feasible(cand, state, ctx)) continue
      next = [...state, cand]
      nextUnplaced = unplaced.filter((_, q) => q !== si)
    } else {
      const k = nLocked + Math.floor(rng() * movable)
      const p = state[k]
      const ru = rule(p.category)
      const m = rng()
      let np: Placed | null = null
      let swapWith = -1
      let swapPose: Placed | null = null
      const group: number[] = []
      const sigma = 5 + 60 * (T / T_START)
      if (m < 0.4) {
        // shift (slide along the wall for wall pieces)
        if (ru.againstWall && onWall(room, p)) {
          const w = backWallOf(p.rotation)
          const along = (w === 'N' || w === 'S' ? p.x : p.y) + gauss(rng) * sigma
          np = wallPose(room, p, w, along)
        } else np = { ...p, x: Math.round((p.x + gauss(rng) * sigma) * 10) / 10, y: Math.round((p.y + gauss(rng) * sigma) * 10) / 10 }
        // group move: dependants (chairs of a table, coffee table of a sofa...) follow their anchor
        if (rng() < 0.7) {
          const pr = footprint(p)
          for (let c = nLocked; c < state.length; c++) {
            if (c === k) continue
            const ch = state[c]
            if (RELATIONS.some((rl) => rl.subject === ch.category && rl.partners.includes(p.category)) && rectGap(footprint(ch), pr) <= 60) group.push(c)
          }
        }
      } else if (m < 0.6 || (m < 0.7 && ru.againstWall)) {
        const pool = getStatics(p)
        if (pool.length) np = { ...pool[Math.floor(rng() * pool.length)], locked: p.locked }
      } else if (m < 0.75) {
        const others = state.filter((_, q) => q !== k)
        const rc = relationCandidates(room, p, others)
        if (rc.length) np = rc[Math.floor(rng() * rc.length)]
      } else if (m < 0.85) {
        if (!ru.againstWall) np = { ...p, rotation: rotate(p.rotation, 90 * (1 + Math.floor(rng() * 3))) }
      } else if (movable >= 2) {
        // swap with another movable item, re-snapping wall pieces to the wall
        let j = nLocked + Math.floor(rng() * (movable - 1))
        if (j >= k) j++
        const q = state[j]
        const snap = (a: Placed, at: Placed): Placed =>
          rule(at.category).againstWall && onWall(room, at) && rule(a.category).againstWall
            ? wallPose(room, a, backWallOf(at.rotation), backWallOf(at.rotation) === 'N' || backWallOf(at.rotation) === 'S' ? at.x : at.y)
            : { ...a, x: at.x, y: at.y }
        np = snap(p, q)
        swapPose = snap(q, p)
        swapWith = j
      }
      if (!np) continue
      if (swapWith >= 0 && swapPose) {
        if (!feasible(np, state, ctx, k, swapWith) || !feasible(swapPose, state, ctx, k, swapWith)) continue
        if (rectsOverlap(footprint(np), footprint(swapPose))) continue
        next = state.slice()
        next[k] = np
        next[swapWith] = swapPose
      } else if (group.length) {
        const dx = np.x - p.x
        const dy = np.y - p.y
        next = state.slice()
        next[k] = np
        for (const c of group) next[c] = { ...state[c], x: Math.round((state[c].x + dx) * 10) / 10, y: Math.round((state[c].y + dy) * 10) / 10 }
        const nx = next
        if (![k, ...group].every((c) => feasible(nx[c], nx, ctx, c))) continue
      } else {
        if (!feasible(np, state, ctx, k)) continue
        next = state.slice()
        next[k] = np
      }
    }
    const obj = objective(next, nextUnplaced.length, ctx)
    if (obj >= cur || rng() < Math.exp((obj - cur) / T)) {
      state = next
      unplaced = nextUnplaced
      cur = obj
      if (cur > best.obj + 1e-9) best = { layout: state.map((p) => ({ ...p })), unplaced: [...unplaced], obj: cur }
    }
  }

  // --- final, detailed evaluation; keep input order for UI stability
  const rank = new Map<string, number>()
  ;[...fixed, ...items].forEach((it, i) => {
    if (!rank.has(it.id)) rank.set(it.id, i)
  })
  const finalItems = best.layout.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  return finish(finalItems, best.unplaced.map((u) => u.id), ctx, ran, new Set(lockedItems.map((l) => l.id)), fixed.length + fresh.length)
}

function finish(items: Placed[], unplaced: string[], ctx: Ctx, iterations: number, errorScope: Set<string> | undefined, total: number): LayoutResult {
  const ev = scoreLayout(items, ctx, true, true)
  const errors = hardViolations(items, ctx, errorScope)
  const unplacedViolations: Violation[] = unplaced.map((id) => ({
    code: 'unplaced',
    severity: 'warning',
    message: `No valid spot was found for item ${id} without blocking a door, a window or another piece`,
    itemIds: [id],
  }))
  const placedFrac = total > 0 ? (total - unplaced.length) / total : 1
  return {
    items,
    score: Math.round(ev.score * placedFrac * 10) / 10,
    terms: ev.terms.map((t) => ({ ...t, value: Math.round(t.value * 10) / 10 })),
    violations: [...errors, ...unplacedViolations, ...ev.violations],
    unplaced,
    freeFloorRatio: Math.round(ev.freeFloorRatio * 1000) / 1000,
    iterations,
  }
}

/**
 * Score a layout exactly as given (e.g. after the user dragged items).
 * Hard problems of any item are reported as errors; nothing is moved.
 */
export function evaluateLayout(room: Room, items: Placed[], opts: PlacementOptions = {}): LayoutResult {
  const ctx = makeCtx(room, opts)
  return finish(items.map((p) => ({ ...p })), [], ctx, 0, undefined, items.length)
}

/** Exposed for tests and the fit checker. */
export function isFeasiblePose(room: Room, p: Placed, others: Placed[]): boolean {
  return feasible(p, others, makeCtx(room))
}

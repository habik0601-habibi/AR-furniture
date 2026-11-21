/**
 * Turn a monocular relative depth map into floor-corner suggestions.
 *
 * Key observation (exact for a pinhole camera): for any plane in the scene,
 * inverse depth 1/Z is an affine function of the pixel coordinates,
 *   1/Z(u, v) = a·u + b·v + c.
 * Depth Anything predicts *affine-invariant* inverse depth d = s·(1/Z) + t with
 * unknown s and t. An affine map of an affine function is still affine, so the
 * floor and each wall remain planes in (u, v, d) space even though the metric
 * scale is unknown. We therefore:
 *   1. RANSAC-fit the floor plane in (u, v, d), seeded by the reference sheet
 *      (which is known to lie on the floor);
 *   2. grow the floor region (pixels close to that plane, connected to the seed);
 *   3. take the upper edge of the floor region per column as the floor/wall boundary;
 *   4. fit up to three straight lines to it (left wall, back wall, right wall);
 *   5. refine each line as the intersection of the floor plane with the wall plane
 *      fitted just above it. Where two planes meet, their true 1/Z agree, so their d
 *      agree for any s, t: the intersection line is invariant to the unknown scale;
 *   6. suggest room corners where consecutive lines meet.
 * No metric value comes from the network: distances are always measured through the
 * reference-sheet homography. The model only says *where* the floor ends.
 */
import { solveLinear } from './homography'
import type { Vec2 } from './types'

export interface DepthMap {
  width: number
  height: number
  /** Relative inverse depth (larger = nearer), row-major, width*height values. */
  data: Float32Array
}

export interface Plane {
  a: number
  b: number
  c: number
}

export interface BoundaryLine {
  /** Segment endpoints in depth-map pixels. */
  p: Vec2
  q: Vec2
  /** Columns supporting this segment. */
  x0: number
  x1: number
  /** True when refined by a floor/wall plane intersection. */
  refined: boolean
}

export interface DepthAnalysis {
  width: number
  height: number
  /** 1 where the pixel was classified as floor. */
  floorMask: Uint8Array
  floorPlane: Plane | null
  /** Floor/wall boundary row per column (null where no floor was found). */
  boundary: (number | null)[]
  lines: BoundaryLine[]
  /** Suggested floor corners (depth-map pixels), left to right. */
  corners: Vec2[]
  /** Fraction of the image classified as floor. */
  floorFraction: number
  /** Fraction of floor-candidate pixels explained by the floor plane. */
  planeInlierRatio: number
  /** 0-1 heuristic quality of the suggestion. */
  quality: number
  notes: string[]
}

export interface AnalyzeOptions {
  /** Plane tolerance in normalised depth units (0-1 range after robust normalisation). */
  tolerance?: number
  /** RNG seed for RANSAC, for reproducible results. */
  seed?: number
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function percentile(values: Float32Array, q: number): number {
  const step = Math.max(1, Math.floor(values.length / 20000))
  const sample: number[] = []
  for (let i = 0; i < values.length; i += step) sample.push(values[i])
  sample.sort((a, b) => a - b)
  return sample[Math.min(sample.length - 1, Math.max(0, Math.floor(q * (sample.length - 1))))]
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

interface Sample {
  u: number
  v: number
  d: number
}

/** Least-squares plane d = a·u + b·v + c. */
export function fitPlaneLS(pts: Sample[]): Plane | null {
  if (pts.length < 3) return null
  let suu = 0, suv = 0, su = 0, svv = 0, sv = 0, n = 0, sud = 0, svd = 0, sd = 0
  for (const p of pts) {
    suu += p.u * p.u
    suv += p.u * p.v
    su += p.u
    svv += p.v * p.v
    sv += p.v
    n += 1
    sud += p.u * p.d
    svd += p.v * p.d
    sd += p.d
  }
  try {
    const [a, b, c] = solveLinear(
      [
        [suu, suv, su],
        [suv, svv, sv],
        [su, sv, n],
      ],
      [sud, svd, sd],
    )
    return { a, b, c }
  } catch {
    return null
  }
}

function planeThrough(p: Sample, q: Sample, r: Sample): Plane | null {
  try {
    const [a, b, c] = solveLinear(
      [
        [p.u, p.v, 1],
        [q.u, q.v, 1],
        [r.u, r.v, 1],
      ],
      [p.d, q.d, r.d],
    )
    return { a, b, c }
  } catch {
    return null
  }
}

const resid = (pl: Plane, s: Sample) => s.d - (pl.a * s.u + pl.b * s.v + pl.c)

function ransacPlane(
  pts: Sample[],
  tol: number,
  iters: number,
  rand: () => number,
  accept?: (pl: Plane) => boolean,
): { plane: Plane; inliers: Sample[] } | null {
  if (pts.length < 3) return null
  let best: Plane | null = null
  let bestCount = 0
  for (let it = 0; it < iters; it++) {
    const p = pts[Math.floor(rand() * pts.length)]
    const q = pts[Math.floor(rand() * pts.length)]
    const r = pts[Math.floor(rand() * pts.length)]
    const pl = planeThrough(p, q, r)
    if (!pl || (accept && !accept(pl))) continue
    let count = 0
    for (const s of pts) if (Math.abs(resid(pl, s)) < tol) count++
    if (count > bestCount) {
      bestCount = count
      best = pl
    }
  }
  if (!best) return null
  let inliers = pts.filter((s) => Math.abs(resid(best!, s)) < tol)
  const refined = fitPlaneLS(inliers)
  if (refined && (!accept || accept(refined))) {
    best = refined
    inliers = pts.filter((s) => Math.abs(resid(best!, s)) < tol)
  }
  return { plane: best, inliers }
}

/** Total-least-squares line through points: returns a point and unit direction. */
function fitLineTLS(pts: Vec2[]): { c: Vec2; dir: Vec2 } {
  const n = pts.length
  const cx = pts.reduce((s, p) => s + p.x, 0) / n
  const cy = pts.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0, sxy = 0, syy = 0
  for (const p of pts) {
    sxx += (p.x - cx) ** 2
    sxy += (p.x - cx) * (p.y - cy)
    syy += (p.y - cy) ** 2
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { c: { x: cx, y: cy }, dir: { x: Math.cos(ang), y: Math.sin(ang) } }
}

function lineY(l: { c: Vec2; dir: Vec2 }, x: number): number {
  if (Math.abs(l.dir.x) < 1e-9) return l.c.y
  return l.c.y + ((x - l.c.x) / l.dir.x) * l.dir.y
}

function intersect(a: { c: Vec2; dir: Vec2 }, b: { c: Vec2; dir: Vec2 }): Vec2 | null {
  const den = a.dir.x * b.dir.y - a.dir.y * b.dir.x
  if (Math.abs(den) < 1e-6) return null
  const dx = b.c.x - a.c.x
  const dy = b.c.y - a.c.y
  const t = (dx * b.dir.y - dy * b.dir.x) / den
  return { x: a.c.x + t * a.dir.x, y: a.c.y + t * a.dir.y }
}

function medianFilter(arr: (number | null)[], win: number): (number | null)[] {
  const half = Math.floor(win / 2)
  return arr.map((v, i) => {
    if (v === null) return null
    const w: number[] = []
    for (let j = i - half; j <= i + half; j++) {
      const x = arr[j]
      if (x !== undefined && x !== null) w.push(x)
    }
    w.sort((a, b) => a - b)
    return w[Math.floor(w.length / 2)]
  })
}

/**
 * Analyse a depth map. `seedQuad` is the reference sheet in depth-map pixels (optional,
 * but it makes floor detection far more reliable).
 */
export function analyzeDepth(depth: DepthMap, seedQuad?: Vec2[], opts: AnalyzeOptions = {}): DepthAnalysis {
  const { width: W, height: H, data } = depth
  const tol = opts.tolerance ?? 0.02
  const rand = lcg(opts.seed ?? 12345)
  const notes: string[] = []

  // Robust normalisation to [0, 1].
  const lo = percentile(data, 0.01)
  const hi = percentile(data, 0.99)
  const range = hi - lo || 1
  const D = new Float32Array(W * H)
  for (let i = 0; i < D.length; i++) D[i] = (data[i] - lo) / range

  const U = (x: number) => x / W
  const V = (y: number) => y / H
  const sampleAt = (x: number, y: number): Sample => ({ u: U(x), v: V(y), d: D[y * W + x] })

  // 1. Candidate floor samples.
  const stride = Math.max(1, Math.round(Math.sqrt((W * H) / 6000)))
  const cands: Sample[] = []
  const seedSamples: Sample[] = []
  for (let y = 0; y < H; y += stride) {
    for (let x = 0; x < W; x += stride) {
      const inSeed = seedQuad ? pointInPolygon({ x, y }, seedQuad) : false
      if (inSeed) seedSamples.push(sampleAt(x, y))
      if (inSeed || y > H * 0.6) cands.push(sampleAt(x, y))
    }
  }
  let seedPt: Vec2 = { x: Math.floor(W / 2), y: H - 2 }
  if (seedQuad && seedQuad.length) {
    seedPt = {
      x: Math.round(seedQuad.reduce((s, p) => s + p.x, 0) / seedQuad.length),
      y: Math.round(seedQuad.reduce((s, p) => s + p.y, 0) / seedQuad.length),
    }
    seedPt.x = Math.min(W - 1, Math.max(0, seedPt.x))
    seedPt.y = Math.min(H - 1, Math.max(0, seedPt.y))
  }
  const seedS = sampleAt(seedPt.x, seedPt.y)

  // Floor planes get nearer (larger d) towards the bottom of the frame: b > 0.
  const acceptFloor = (pl: Plane) => pl.b > 0 && Math.abs(resid(pl, seedS)) < tol * 2
  const fit = ransacPlane(cands, tol, 300, rand, acceptFloor)
  const empty: DepthAnalysis = {
    width: W,
    height: H,
    floorMask: new Uint8Array(W * H),
    floorPlane: null,
    boundary: new Array<number | null>(W).fill(null),
    lines: [],
    corners: [],
    floorFraction: 0,
    planeInlierRatio: 0,
    quality: 0,
    notes,
  }
  if (!fit) {
    notes.push('Could not find a flat floor in the depth map.')
    return empty
  }
  const floor = fit.plane
  const planeInlierRatio = fit.inliers.length / cands.length

  // 2. Grow the floor region from the seed (4-connected flood fill).
  const isFloorPx = (x: number, y: number) =>
    Math.abs(D[y * W + x] - (floor.a * U(x) + floor.b * V(y) + floor.c)) < tol * 1.5
  const mask = new Uint8Array(W * H)
  if (!isFloorPx(seedPt.x, seedPt.y)) {
    // Seed may sit on a noisy pixel; search a small neighbourhood.
    let found = false
    for (let r = 1; r < 10 && !found; r++)
      for (let dy = -r; dy <= r && !found; dy++)
        for (let dx = -r; dx <= r && !found; dx++) {
          const x = seedPt.x + dx
          const y = seedPt.y + dy
          if (x >= 0 && y >= 0 && x < W && y < H && isFloorPx(x, y)) {
            seedPt = { x, y }
            found = true
          }
        }
    if (!found) {
      notes.push('The reference sheet does not sit on the detected floor plane.')
      return { ...empty, floorPlane: floor, planeInlierRatio }
    }
  }
  const stack = [seedPt.y * W + seedPt.x]
  mask[stack[0]] = 1
  let floorCount = 0
  while (stack.length) {
    const i = stack.pop()!
    floorCount++
    const x = i % W
    const y = (i - x) / W
    const nb = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (!mask[j] && isFloorPx(nx, ny)) {
        mask[j] = 1
        stack.push(j)
      }
    }
  }
  const floorFraction = floorCount / (W * H)

  // 3. Upper edge of the floor per column.
  let boundary: (number | null)[] = new Array<number | null>(W).fill(null)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (mask[y * W + x]) {
        boundary[x] = y
        break
      }
    }
  }
  boundary = medianFilter(boundary, 7)
  // Columns where the floor reaches the image top have no visible wall.
  const pts: Vec2[] = []
  for (let x = 0; x < W; x++) {
    const b = boundary[x]
    if (b !== null && b > 1) pts.push({ x, y: b })
  }

  // 4. Sequential RANSAC for up to three straight boundary segments.
  const lineTol = Math.max(1.5, H * 0.012)
  let remaining = pts
  const rawLines: { line: { c: Vec2; dir: Vec2 }; x0: number; x1: number; support: Vec2[] }[] = []
  const minSupport = Math.max(8, W * 0.05)
  for (let k = 0; k < 3 && remaining.length > minSupport; k++) {
    let bestIn: Vec2[] = []
    for (let it = 0; it < 200; it++) {
      const a = remaining[Math.floor(rand() * remaining.length)]
      const b = remaining[Math.floor(rand() * remaining.length)]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < W * 0.03) continue
      const nx = -(b.y - a.y) / len
      const ny = (b.x - a.x) / len
      const inl = remaining.filter((p) => Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny) < lineTol)
      if (inl.length > bestIn.length) bestIn = inl
    }
    if (bestIn.length < minSupport) break
    // Keep the largest contiguous run of columns (gaps up to 4% of width).
    bestIn.sort((p, q) => p.x - q.x)
    const gap = Math.max(3, W * 0.04)
    let runs: Vec2[][] = [[bestIn[0]]]
    for (let i = 1; i < bestIn.length; i++) {
      if (bestIn[i].x - bestIn[i - 1].x > gap) runs.push([])
      runs[runs.length - 1].push(bestIn[i])
    }
    runs = runs.sort((p, q) => q.length - p.length)
    const run = runs[0]
    if (run.length < minSupport) break
    const x0 = run[0].x
    const x1 = run[run.length - 1].x
    rawLines.push({ line: fitLineTLS(run), x0, x1, support: run })
    remaining = remaining.filter((p) => p.x < x0 || p.x > x1)
  }
  rawLines.sort((p, q) => p.x0 - q.x0)

  // 5. Refine with floor/wall plane intersections.
  const lines = rawLines.map((rl) => {
    let line = rl.line
    let refined = false
    const wallSamples: Sample[] = []
    const xs = Math.max(1, Math.round((rl.x1 - rl.x0) / 60))
    for (let x = rl.x0; x <= rl.x1; x += xs) {
      const yb = lineY(rl.line, x)
      for (let y = Math.round(yb - H * 0.3); y < yb - H * 0.04; y += Math.max(1, stride)) {
        if (y < 0 || y >= H) continue
        if (!mask[y * W + x]) wallSamples.push(sampleAt(x, y))
      }
    }
    const differs = (pl: Plane) => Math.abs(pl.b - floor.b) > 0.05 || Math.abs(pl.a - floor.a) > 0.05
    const wall = ransacPlane(wallSamples, tol, 150, rand, differs)
    if (wall && wall.inliers.length > wallSamples.length * 0.6) {
      // Intersection: (af-aw)·u + (bf-bw)·v + (cf-cw) = 0, in normalised coords.
      const da = floor.a - wall.plane.a
      const db = floor.b - wall.plane.b
      const dc = floor.c - wall.plane.c
      if (Math.abs(db) > 1e-6) {
        const yAt = (x: number) => (-(da * U(x) + dc) / db) * H
        const p = { x: rl.x0, y: yAt(rl.x0) }
        const q = { x: rl.x1, y: yAt(rl.x1) }
        // Accept only if close to the observed boundary (rejects ceilings, furniture fronts).
        let off = 0
        for (const s of rl.support) off += Math.abs(yAt(s.x) - s.y)
        off /= rl.support.length
        if (off < H * 0.05) {
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
          line = { c: p, dir: { x: (q.x - p.x) / len, y: (q.y - p.y) / len } }
          refined = true
        }
      }
    }
    return {
      line,
      out: {
        p: { x: rl.x0, y: lineY(line, rl.x0) },
        q: { x: rl.x1, y: lineY(line, rl.x1) },
        x0: rl.x0,
        x1: rl.x1,
        refined,
      } satisfies BoundaryLine,
    }
  })

  // 6. Corners at consecutive line intersections.
  const corners: Vec2[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    const c = intersect(lines[i].line, lines[i + 1].line)
    if (!c) continue
    const lo2 = lines[i].out.x1 - W * 0.2
    const hi2 = lines[i + 1].out.x0 + W * 0.2
    if (c.x >= lo2 && c.x <= hi2 && c.x >= -W * 0.05 && c.x <= W * 1.05 && c.y >= 0 && c.y <= H) corners.push(c)
  }

  if (lines.length === 0) notes.push('No straight floor edge was found; tap the corners by hand.')
  else if (corners.length === 0)
    notes.push('Only one wall edge is visible, so no corner could be suggested. Its ends are marked instead.')
  if (floorFraction < 0.08) notes.push('Very little floor is visible; results may be unreliable.')

  const quality = Math.max(
    0,
    Math.min(
      1,
      0.4 * Math.min(1, planeInlierRatio / 0.7) +
        0.3 * Math.min(1, lines.reduce((s, l) => s + (l.out.x1 - l.out.x0), 0) / (W * 0.8)) +
        0.3 * (lines.length ? lines.filter((l) => l.out.refined).length / lines.length : 0),
    ),
  )

  return {
    width: W,
    height: H,
    floorMask: mask,
    floorPlane: floor,
    boundary,
    lines: lines.map((l) => l.out),
    corners,
    floorFraction,
    planeInlierRatio,
    quality,
    notes,
  }
}

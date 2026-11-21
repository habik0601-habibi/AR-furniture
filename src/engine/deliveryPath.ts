/**
 * Can the item physically get from the street into the room?
 *
 * The item is modelled as a rigid box. Each step of the route is checked with
 * exact geometry:
 *  - doorway: some axis-aligned cross-section of the box must fit the opening
 *    (thin-wall model; the third dimension travels through the door);
 *  - corridor corner: the classic "moving sofa / ladder around a corner"
 *    problem. A rectangle of length L and width w carried flat turns an L-corner
 *    between corridors of widths a and b iff
 *        L <= min_{0<t<pi/2}  a/sin t + b/cos t - w/(sin t cos t)
 *    (solved numerically), or if it can simply translate through without
 *    rotating (w <= a and L <= b, or L <= a and w <= b). If carrying it flat
 *    fails we try standing it on end, which needs the long side under the ceiling;
 *  - stairs: cross-section vs. stair width x headroom, plus the landing as a corner;
 *  - lift: box in cabin, straight or leaned diagonally (Carver's
 *    rectangle-in-rectangle condition), plus the lift door as a doorway.
 */
import type { AccessRoute, DeliveryItem, DeliveryPathResult, Dimensions, PathStep } from './types'

export interface DoorwayFit {
  ok: boolean
  /** Spare cm in the tighter direction of the best orientation (negative = short by). */
  margin: number
  orientation: string
}

/**
 * Doorway W x H. Orientations are tried in order of how movers prefer to carry
 * furniture. (A "tilt through" with depth < W and diag(depth, height) < H is
 * already covered: for a rigid box the d x h cross-section then fits upright.)
 */
export function doorwayFit(d: Dimensions, W: number, H: number): DoorwayFit {
  const options: [number, number, string][] = [
    [d.d, d.h, 'carried upright'],
    [d.h, d.d, 'tilted on its back'],
    [d.d, d.w, 'stood on end'],
    [d.h, d.w, 'stood on end and turned on its back'],
    [d.w, d.h, 'carried upright, front first'],
    [d.w, d.d, 'laid flat, front first'],
  ]
  let best: DoorwayFit | null = null
  for (const [across, vertical, name] of options) {
    const margin = Math.min(W - across, H - vertical)
    if (margin >= 0) return { ok: true, margin, orientation: name }
    if (!best || margin > best.margin) best = { ok: false, margin, orientation: name }
  }
  return best!
}

/**
 * Longest rectangle of width w that can rotate round an L-corner between
 * corridors of widths a and b:  min over t of a/sin t + b/cos t - w/(sin t cos t).
 * Dense sampling (2000 points) followed by golden-section refinement. Returns 0
 * when w does not even fit down the narrower corridor.
 */
export function cornerMaxLength(a: number, b: number, w: number): number {
  if (w >= Math.min(a, b)) return 0
  const f = (t: number) => {
    const s = Math.sin(t)
    const c = Math.cos(t)
    return a / s + b / c - w / (s * c)
  }
  const n = 2000
  const lo0 = 1e-6
  const hi0 = Math.PI / 2 - 1e-6
  let bi = 0
  let bv = Infinity
  for (let i = 0; i <= n; i++) {
    const v = f(lo0 + ((hi0 - lo0) * i) / n)
    if (v < bv) {
      bv = v
      bi = i
    }
  }
  let lo = lo0 + ((hi0 - lo0) * Math.max(0, bi - 1)) / n
  let hi = lo0 + ((hi0 - lo0) * Math.min(n, bi + 1)) / n
  const g = (Math.sqrt(5) - 1) / 2
  let x1 = hi - g * (hi - lo)
  let x2 = lo + g * (hi - lo)
  let f1 = f(x1)
  let f2 = f(x2)
  for (let k = 0; k < 60; k++) {
    if (f1 < f2) {
      hi = x2
      x2 = x1
      f2 = f1
      x1 = hi - g * (hi - lo)
      f1 = f(x1)
    } else {
      lo = x1
      x1 = x2
      f1 = f2
      x2 = lo + g * (hi - lo)
      f2 = f(x2)
    }
  }
  return Math.max(0, Math.min(bv, f1, f2))
}

/** Can a flat L x w rectangle get round the corner (rotating or just translating)? */
export function canTurnCorner(L: number, w: number, a: number, b: number): { ok: boolean; maxLength: number } {
  const rotating = cornerMaxLength(a, b, w)
  const translating = Math.max(w <= a ? b : 0, w <= b ? a : 0)
  const maxLength = Math.max(rotating, translating)
  return { ok: L <= maxLength + 1e-9, maxLength }
}

interface CornerFit {
  ok: boolean
  margin: number
  orientation: string
}

/** Try carrying the box flat (two variants) and then stood on end. */
export function cornerFit(dims: Dimensions, a: number, b: number, ceiling: number): CornerFit {
  const [p, q, L] = [dims.w, dims.d, dims.h].sort((x, y) => x - y)
  const tries: { len: number; wid: number; vertical: number; name: string }[] = [
    { len: L, wid: p, vertical: q, name: 'carried flat' },
    { len: L, wid: q, vertical: p, name: 'carried flat on its side' },
    { len: q, wid: p, vertical: L, name: 'stood on end' },
  ]
  let best: CornerFit | null = null
  for (const t of tries) {
    const turn = canTurnCorner(t.len, t.wid, a, b)
    const margin = Math.min(turn.maxLength - t.len, ceiling - t.vertical)
    if (turn.ok && t.vertical <= ceiling) return { ok: true, margin, orientation: t.name }
    if (!best || margin > best.margin) best = { ok: false, margin, orientation: t.name }
  }
  return best!
}

/** Carver's condition: does a p x q rectangle fit (possibly rotated) in an A x B rectangle? */
export function rectFitsInRect(p: number, q: number, A: number, B: number): boolean {
  ;[p, q] = p >= q ? [p, q] : [q, p]
  ;[A, B] = A >= B ? [A, B] : [B, A]
  if (p <= A && q <= B) return true
  if (q > B) return false
  const s = p * p + q * q - A * A
  if (s < 0) return false
  return B >= (2 * p * q * A + (p * p - q * q) * Math.sqrt(s)) / (p * p + q * q)
}

/** Box inside the lift cabin: straight (sorted dims) or leaned diagonally. */
export function liftCabinFit(d: Dimensions, cabin: { width: number; depth: number; height: number }): { ok: boolean; margin: number; orientation: string } {
  const s = [d.w, d.d, d.h].sort((x, y) => x - y)
  const c = [cabin.width, cabin.depth, cabin.height].sort((x, y) => x - y)
  const margin = Math.min(c[0] - s[0], c[1] - s[1], c[2] - s[2])
  if (margin >= 0) return { ok: true, margin, orientation: 'stands in the cabin' }
  // Diagonal: one item dimension across one cabin axis, the other two leaned in the remaining plane.
  const axes: [number, number, number][] = [
    [cabin.width, cabin.depth, cabin.height],
    [cabin.depth, cabin.width, cabin.height],
    [cabin.height, cabin.width, cabin.depth],
  ]
  const dims = [d.w, d.d, d.h]
  for (const [across, P, Q] of axes)
    for (let i = 0; i < 3; i++) {
      if (dims[i] > across) continue
      const [x, y] = dims.filter((_, j) => j !== i)
      if (rectFitsInRect(x, y, P, Q)) return { ok: true, margin: 0, orientation: 'leaned diagonally in the cabin' }
    }
  return { ok: false, margin, orientation: 'too big for the cabin' }
}

const r1 = (n: number) => Math.round(n * 10) / 10

function runRoute(dims: Dimensions, route: AccessRoute, notes: string[]): { steps: PathStep[]; ok: boolean; liftFailedStairsOk: boolean; liftFailedNoStairs: boolean } {
  const steps: PathStep[] = []
  let ok = true
  const door = (key: string, label: string, W: number, H: number): boolean => {
    const f = doorwayFit(dims, W, H)
    steps.push({
      key, label, ok: f.ok, margin: r1(f.margin), orientation: f.orientation,
      detail: f.ok
        ? `Passes ${W}x${H} cm ${f.orientation} with ${r1(f.margin)} cm to spare`
        : `Too big for the ${W}x${H} cm opening in any orientation (short by ${r1(-f.margin)} cm)`,
    })
    return f.ok
  }
  const ceiling = Math.min(route.entranceDoor.height, route.roomDoor.height) + 30
  ok = door('entrance', 'Entrance door', route.entranceDoor.width, route.entranceDoor.height) && ok

  route.corners.forEach((c, i) => {
    const f = cornerFit(dims, c.widthIn, c.widthOut, ceiling)
    steps.push({
      key: `corner-${i + 1}`, label: `Corridor corner ${i + 1}`, ok: f.ok, margin: r1(f.margin), orientation: f.orientation,
      detail: f.ok
        ? `Turns the ${c.widthIn}/${c.widthOut} cm corner ${f.orientation} (${r1(f.margin)} cm spare)`
        : `Cannot turn the ${c.widthIn}/${c.widthOut} cm corner, even stood on end (short by ${r1(-f.margin)} cm)`,
    })
    ok = f.ok && ok
  })
  if (route.corners.length) notes.push(`Corridor ceiling assumed ${ceiling} cm (door height + 30 cm) for standing items on end`)

  const stairsCheck = (): boolean => {
    const s = route.stairs!
    let sOk = door('stairs', 'Staircase', s.width, s.headroom)
    if (s.hasLanding) {
      const depth = s.landingDepth ?? s.width
      const f = cornerFit(dims, s.width, depth, s.headroom)
      steps.push({
        key: 'landing', label: 'Stair landing turn', ok: f.ok, margin: r1(f.margin), orientation: f.orientation,
        detail: f.ok
          ? `Turns at the landing (${s.width} cm stairs, ${depth} cm landing) ${f.orientation}`
          : `Cannot turn at the landing (${s.width} cm stairs, ${depth} cm landing)`,
      })
      sOk = f.ok && sOk
      if (s.landingDepth === undefined) notes.push('Landing depth unknown; assumed equal to the stair width')
    }
    return sOk
  }

  let liftFailedStairsOk = false
  let liftFailedNoStairs = false
  if (route.floor > 0) {
    if (route.lift) {
      const l = route.lift
      const before = steps.length
      const dOk = door('lift-door', 'Lift door', l.doorWidth, l.doorHeight)
      const cab = liftCabinFit(dims, l)
      steps.push({
        key: 'lift-cabin', label: 'Lift cabin', ok: cab.ok, margin: r1(cab.margin), orientation: cab.orientation,
        detail: cab.ok
          ? cab.orientation === 'stands in the cabin'
            ? `Fits the ${l.width}x${l.depth}x${l.height} cm cabin (${r1(cab.margin)} cm spare)`
            : `Fits the cabin only leaned diagonally (approximation; check with the building)`
          : `Does not fit the ${l.width}x${l.depth}x${l.height} cm cabin`,
      })
      const liftOk = dOk && cab.ok
      if (!liftOk) {
        if (route.stairs) {
          const sOk = stairsCheck()
          // lift steps become informational: the stairs are the route
          for (let i = before; i < before + 2; i++) steps[i].detail += ' - using the stairs instead'
          if (sOk) liftFailedStairsOk = true
          ok = sOk && ok
        } else {
          liftFailedNoStairs = true
          ok = false
        }
      }
    } else if (route.stairs) {
      ok = stairsCheck() && ok
    } else {
      steps.push({ key: 'vertical', label: 'Upper floor access', ok: false, detail: `Floor ${route.floor} has no stairs or lift described` })
      ok = false
    }
  }

  ok = door('room', 'Room door', route.roomDoor.width, route.roomDoor.height) && ok
  return { steps, ok, liftFailedStairsOk, liftFailedNoStairs }
}

/**
 * Check every step of the delivery route. The boxed size is used when the
 * item ships packed; otherwise the assembled size, minus the legs if they come off.
 */
export function checkDeliveryPath(item: DeliveryItem, route: AccessRoute): DeliveryPathResult {
  const legH = item.legHeight ?? 15
  const notes: string[] = []
  let dims: Dimensions = item.packed ?? item.dims
  if (item.packed) notes.push(`Checked with the boxed size ${item.packed.w}x${item.packed.d}x${item.packed.h} cm`)
  else if (item.removableLegs) {
    dims = { ...item.dims, h: Math.max(1, item.dims.h - legH) }
    notes.push(`Legs removed for delivery: height ${dims.h} cm`)
  }
  const run = runRoute(dims, route, notes)
  const steps = run.steps
  if (notes.length) steps.push({ key: 'notes', label: 'Assumptions', ok: true, detail: notes.join('. ') })

  let advice: string | undefined
  if (run.liftFailedStairsOk) advice = 'Take the stairs instead of the lift'
  if (!run.ok) {
    const failing = steps.filter((s) => !s.ok)
    if (!item.packed && !item.removableLegs && runRoute({ ...dims, h: Math.max(1, dims.h - legH) }, route, []).ok)
      advice = 'Ask for leg removal: without its legs the item gets through'
    else if (run.liftFailedNoStairs) advice = 'The lift is too small; check whether the stairs can be used'
    else if (item.packed && runRoute(item.removableLegs ? { ...item.dims, h: Math.max(1, item.dims.h - legH) } : item.dims, route, []).ok)
      advice = 'Ask for it to be carried in unboxed'
    else
      advice = `Choose the smaller size or a knock-down version (blocked at: ${failing.map((s) => s.label.toLowerCase()).join(', ')})`
  }
  return { ok: run.ok, steps, advice }
}

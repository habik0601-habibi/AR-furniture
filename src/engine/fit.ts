/**
 * Spatial compatibility of one product with one room.
 *
 * Checks (weight in the 0-100 score):
 *   footprint   20  fits the floor in some rotation, with a margin
 *   height      10  under the ceiling
 *   placement   25  the optimiser finds a valid pose with the current layout locked
 *   clearance   15  recommended clearance at that pose
 *   walkway     10  every item still reachable from the door afterwards
 *   proportion  10  not too dominant for the floor / its wall
 *   delivery    10  can get from the street into the room (only when a route is given)
 * A passing check earns its full weight, a failing warning earns partial credit,
 * a failing error earns 0. Weights of skipped checks are redistributed.
 * Verdict: any failed error -> does_not_fit; any failed warning or a margin
 * under 10 cm -> tight; otherwise fits.
 */
import type { AccessRoute, DeliveryItem, FitCheck, FitReport, FitVerdict, ItemSpec, Placed, Room } from './types'
import { WALL_NAMES, backWallOf, distanceToWall, footprint, planSize, wallLength } from './geometry'
import { checkDeliveryPath } from './deliveryPath'
import { clearanceOf, optimiseLayout, walkwayReach } from './placement'
import { CATEGORY_RULES } from './rules'

const WEIGHT: Record<string, number> = {
  footprint: 20,
  height: 10,
  placement: 25,
  clearance: 15,
  walkway: 10,
  proportion: 10,
  delivery: 10,
}

/** Single piece above this share of the floor area is flagged. */
export const MAX_FLOOR_SHARE = 0.25
/** A sofa wider than this share of its wall looks oversized. */
export const MAX_SOFA_WALL_SHARE = 2 / 3

export interface FitOptions {
  /** Annealing iterations for the placement search (default 300). */
  iterations?: number
  seed?: number
  /** Delivery details (boxed size, removable legs) for the path check. */
  delivery?: Omit<DeliveryItem, 'dims'>
}

export function assessFit(room: Room, layout: Placed[], item: ItemSpec, route?: AccessRoute, opts: FitOptions = {}): FitReport {
  const checks: FitCheck[] = []
  const credit: Record<string, number> = {}
  const label = item.name ?? `This ${CATEGORY_RULES[item.category].label}`
  const r1 = (n: number) => Math.round(n)

  // 1. Footprint in either rotation
  const m0 = Math.min(room.width - item.dims.w, room.depth - item.dims.d)
  const m90 = Math.min(room.width - item.dims.d, room.depth - item.dims.w)
  const fm = Math.max(m0, m90)
  checks.push({
    key: 'footprint', label: 'Fits the floor', ok: fm >= 0, severity: 'error', margin: r1(fm),
    detail: fm >= 0
      ? `${item.dims.w}x${item.dims.d} cm footprint fits the ${room.width}x${room.depth} cm room with ${r1(fm)} cm to spare`
      : `${item.dims.w}x${item.dims.d} cm is larger than the ${room.width}x${room.depth} cm room in both orientations`,
  })
  credit.footprint = fm >= 0 ? 1 : 0

  // 2. Height
  const hm = room.height - item.dims.h
  checks.push({
    key: 'height', label: 'Under the ceiling', ok: hm >= 0, severity: 'error', margin: r1(hm),
    detail: hm >= 0 ? `${item.dims.h} cm tall, ${r1(hm)} cm below the ceiling` : `${item.dims.h} cm tall but the ceiling is ${room.height} cm`,
  })
  credit.height = hm >= 0 ? 1 : 0

  // 3. Placement alongside the current layout (everything else locked)
  let suggested: Placed | undefined
  let placedLayout: Placed[] = layout
  if (fm >= 0) {
    const locked = layout.map((p) => ({ ...p, locked: true }))
    const res = optimiseLayout(room, [item], locked, { iterations: opts.iterations ?? 300, seed: opts.seed ?? 1 })
    suggested = res.items.find((p) => p.id === item.id)
    if (suggested) {
      suggested = { ...suggested, locked: undefined }
      placedLayout = res.items
    }
  }
  checks.push({
    key: 'placement', label: 'Space in the current layout', ok: !!suggested, severity: 'error',
    detail: suggested
      ? `Best spot: ${describePose(room, suggested)}`
      : fm >= 0
        ? 'No free spot without overlapping furniture or blocking a door or window'
        : 'Too large for the room',
  })
  credit.placement = suggested ? 1 : 0

  if (suggested) {
    // 4. Clearance at the suggested pose
    const cl = clearanceOf(room, placedLayout, item.id)
    const front = cl.sides.find((s) => s.side === 'front')
    const worst = cl.sides.reduce<(typeof cl.sides)[number] | null>((w, s) => (!w || s.clear - s.required < w.clear - w.required ? s : w), null)
    const score = cl.score ?? 1
    const cm = worst ? worst.clear - worst.required : 0
    checks.push({
      key: 'clearance', label: 'Room to use it', ok: score >= 0.85, severity: 'warning', margin: r1(cm),
      detail: worst
        ? `${r1((front ?? worst).clear)} of ${(front ?? worst).required} cm clear at the ${(front ?? worst).side} ${CATEGORY_RULES[item.category].frontReason}`.trim()
        : 'No clearance needed',
    })
    credit.clearance = Math.min(1, score)

    // 5. Walkways still work
    const reach = walkwayReach(room, placedLayout)
    const blocked = reach.filter((r) => !r.reachable)
    checks.push({
      key: 'walkway', label: 'Walkways stay open', ok: blocked.length === 0, severity: 'warning',
      detail: blocked.length === 0
        ? 'Everything can still be reached from the door with a 75 cm walkway'
        : `${blocked.length} item(s) would need a walkway narrower than 75 cm`,
    })
    credit.walkway = reach.length ? 1 - blocked.length / reach.length : 1

    // 6. Proportion
    const share = (item.dims.w * item.dims.d) / (room.width * room.depth)
    const msgs: string[] = []
    let propOk = share <= MAX_FLOOR_SHARE
    if (!propOk) msgs.push(`takes ${Math.round(share * 100)}% of the floor (over ${MAX_FLOOR_SHARE * 100}% feels dominant)`)
    if (item.category === 'sofa') {
      const wall = backWallOf(suggested.rotation)
      const onWall = distanceToWall(footprint(suggested), room, wall) < 5
      const len = wallLength(room, wall)
      const wshare = planSize(item.dims, 0).w / len
      if (onWall && wshare > MAX_SOFA_WALL_SHARE) {
        propOk = false
        msgs.push(`is ${Math.round(wshare * 100)}% as wide as the ${WALL_NAMES[wall]} wall (about two thirds looks balanced)`)
      }
    }
    checks.push({
      key: 'proportion', label: 'In proportion', ok: propOk, severity: 'warning',
      detail: propOk ? `Uses ${Math.round(share * 100)}% of the floor area` : `${label} ${msgs.join(' and ')}`,
    })
    credit.proportion = propOk ? 1 : 0.4
  }

  // 7. Delivery path
  if (route) {
    const path = checkDeliveryPath({ dims: item.dims, ...opts.delivery }, route)
    const margins = path.steps.filter((s) => s.margin !== undefined && s.ok).map((s) => s.margin!)
    const failed = path.steps.filter((s) => !s.ok)
    checks.push({
      key: 'delivery', label: 'Delivery route', ok: path.ok, severity: 'error',
      margin: margins.length ? Math.min(...margins) : undefined,
      detail: path.ok
        ? `Gets through every door, corner${route.floor > 0 ? ' and up to the floor' : ''}${path.advice ? ` (${path.advice.toLowerCase()})` : ''}`
        : `Blocked at ${failed.map((s) => s.label.toLowerCase()).join(', ')}. ${path.advice ?? ''}`.trim(),
    })
    credit.delivery = path.ok ? 1 : 0
  }

  // Score with redistributed weights
  let wsum = 0
  let sum = 0
  for (const k of Object.keys(credit)) {
    wsum += WEIGHT[k]
    sum += WEIGHT[k] * credit[k]
  }
  // checks skipped because placement failed count as 0
  if (!suggested) wsum += WEIGHT.clearance + WEIGHT.walkway + WEIGHT.proportion
  let score = wsum ? (100 * sum) / wsum : 0

  const errorFail = checks.some((c) => c.severity === 'error' && !c.ok)
  const warnFail = checks.some((c) => c.severity === 'warning' && !c.ok)
  const smallMargin = checks.some((c) => c.ok && c.severity === 'error' && c.margin !== undefined && c.margin < 10 && c.key !== 'height')
  const verdict: FitVerdict = errorFail ? 'does_not_fit' : warnFail || smallMargin ? 'tight' : 'fits'
  if (errorFail) score = Math.min(score, 35)
  return { productId: item.productId, score: Math.round(score), verdict, checks, suggested }
}

/** "against the north wall, 120 cm from the west corner" style description. */
export function describePose(room: Room, p: Placed): string {
  const r = footprint(p)
  const wall = backWallOf(p.rotation)
  if (distanceToWall(r, room, wall) < 5) {
    const from = wall === 'N' || wall === 'S' ? `${Math.round(r.x0)} cm from the west corner` : `${Math.round(r.y0)} cm from the north corner`
    return `against the ${WALL_NAMES[wall]} wall, ${from}`
  }
  return `free-standing, centred ${Math.round(p.x)} cm from the west wall and ${Math.round(p.y)} cm from the north wall`
}

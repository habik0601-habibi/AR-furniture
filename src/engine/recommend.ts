/**
 * Room-aware product recommendations.
 *
 * Each candidate (every size, best finish) is scored on five criteria (weights):
 *   fit in the free space           35   assessFit with the current layout locked
 *   completes the room              20   wanted category, or a missing complement
 *                                        (sofa but no coffee table -> coffee tables)
 *   budget                          20   at/under budget = full; falls off linearly to 0 at +50%
 *   colour harmony with the photo   15   CIEDE2000 match / neutral / analogous / complementary hue
 *   style match                     10   overlap with preferred style tags
 * Sizes that do not fit are dropped; the best size per product is returned
 * with specific reasons, strongest first.
 */
import type { AccessRoute, Category, ItemSpec, Placed, RecCandidate, RecFinishOption, Recommendation, Room } from './types'
import { WALL_NAMES, backWallOf, distanceToWall, doorZone, footprint, planSize, spanAlongWall, wallLength, wallStrip, rectsOverlap } from './geometry'
import { assessFit } from './fit'
import { CATEGORY_RULES, COMPLEMENTS } from './rules'
import { deltaE2000, hexToLab, hueDistance, isNeutral, isWarm, labToLch, type Lab } from './color'
import { pkr } from './pricing'

export interface RecommendInput {
  room: Room
  layout: Placed[]
  candidates: RecCandidate[]
  budget?: number
  preferredStyles?: string[]
  /** Hex colours, e.g. dominantColors() of the room photo. */
  roomColors?: string[]
  wantedCategories?: Category[]
  route?: AccessRoute
  /** Max results (default 6). */
  limit?: number
  /** Annealing iterations per fit check (default 150). */
  iterations?: number
}

export const REC_WEIGHTS = { fit: 35, category: 20, budget: 20, colour: 15, style: 10 } as const

/** Categories where owning several is normal. */
const MULTI: Category[] = ['dining_chair', 'side_table', 'armchair', 'bookshelf']

function label(c: Category): string {
  return CATEGORY_RULES[c].label
}

export function categoryScore(cat: Category, layout: Placed[], wanted?: Category[]): { score: number; reason?: string } {
  const present = new Set(layout.map((p) => p.category))
  if (wanted?.includes(cat)) return { score: 1, reason: `You are looking for a ${label(cat)}` }
  if (!present.has(cat)) {
    for (const p of present) {
      if (COMPLEMENTS[p]?.includes(cat)) return { score: 1, reason: `Completes the room: there is a ${label(p)} but no ${label(cat)} yet` }
    }
    return { score: 0.5 }
  }
  return MULTI.includes(cat) ? { score: 0.5 } : { score: 0.15, reason: `You already have a ${label(cat)}` }
}

export function budgetScore(price: number, budget?: number): { score: number; reason?: string } {
  if (!budget || budget <= 0) return { score: 0.6 }
  if (price <= budget) {
    const under = budget - price
    return { score: 1, reason: under > 0 ? `${pkr(under)} under your budget` : 'Exactly on budget' }
  }
  const over = price - budget
  return { score: Math.max(0, 1 - (over / budget) * 2), reason: `${pkr(over)} over your budget` }
}

export function styleScore(styles: string[], preferred?: string[]): { score: number; reason?: string } {
  if (!preferred?.length) return { score: 0.5 }
  const hit = styles.filter((s) => preferred.includes(s))
  return hit.length ? { score: 1, reason: `Matches your ${hit.join(' / ')} style` } : { score: 0.2 }
}

/** Harmony between a finish colour and the room palette (0-1) with a reason. */
export function colourHarmony(finish: RecFinishOption, roomColors?: string[]): { score: number; reason?: string } {
  if (!roomColors?.length) return { score: 0.5 }
  const f = hexToLab(finish.color)
  const name = finish.name ?? 'This'
  const room: Lab[] = roomColors.map(hexToLab)
  const chromatic = room.filter((r) => !isNeutral(r))
  const minDE = Math.min(...room.map((r) => deltaE2000(f, r)))
  if (minDE < 12) {
    if (isWarm(f) && chromatic.some(isWarm)) return { score: 1, reason: `${name} finish matches the warm tones in your room photo` }
    return { score: 1, reason: `${name} finish closely matches a colour in your room photo (ΔE ${minDE.toFixed(1)})` }
  }
  if (isNeutral(f)) return { score: 0.85, reason: `Neutral ${name.toLowerCase()} finish goes with any palette` }
  if (!chromatic.length) return { score: 0.7, reason: `${name} finish adds an accent to your neutral room` }
  const hf = labToLch(f).h
  const dists = chromatic.map((r) => hueDistance(hf, labToLch(r).h))
  const dmin = Math.min(...dists)
  if (dmin <= 35)
    return { score: 0.85, reason: `${name} finish sits with the ${isWarm(f) ? 'warm' : 'cool'} tones in your room photo` }
  if (dists.some((d) => d >= 150)) return { score: 0.75, reason: `${name} finish complements the colours in your room photo` }
  return { score: 0.35 }
}

/** Length of the free stretch of wall the suggested item stands in. */
export function freeWallStretch(room: Room, layout: Placed[], p: Placed): { wall: string; length: number } | null {
  const r = footprint(p)
  const wall = backWallOf(p.rotation)
  if (distanceToWall(r, room, wall) >= 5) return null
  const s = planSize(p.dims, p.rotation)
  const depth = wall === 'N' || wall === 'S' ? s.d : s.w
  const strip = wallStrip(room, wall, 0, wallLength(room, wall), depth)
  const blocks: [number, number][] = []
  for (const q of layout) {
    if (q.id === p.id) continue
    const f = footprint(q)
    if (rectsOverlap(f, strip)) blocks.push(spanAlongWall(wall, f))
  }
  for (const d of room.openings) if (d.kind === 'door') {
    const z = doorZone(room, d)
    if (rectsOverlap(z, strip)) blocks.push(spanAlongWall(wall, z))
  }
  const [a0, a1] = spanAlongWall(wall, r)
  let lo = 0
  let hi = wallLength(room, wall)
  for (const [b0, b1] of blocks) {
    if (b1 <= a0 + 0.5) lo = Math.max(lo, b1)
    if (b0 >= a1 - 0.5) hi = Math.min(hi, b0)
  }
  return { wall: WALL_NAMES[wall], length: Math.round(hi - lo) }
}

export function recommend(input: RecommendInput): Recommendation[] {
  const { room, layout, candidates } = input
  const out: Recommendation[] = []
  for (const cand of candidates) {
    const cat = categoryScore(cand.category, layout, input.wantedCategories)
    const sty = styleScore(cand.styles, input.preferredStyles)
    // best finish by colour harmony (ties -> cheaper)
    let finish: RecFinishOption | undefined
    let col = { score: 0.5 } as { score: number; reason?: string }
    for (const f of cand.finishes) {
      const h = colourHarmony(f, input.roomColors)
      if (!finish || h.score > col.score || (h.score === col.score && (f.priceDelta ?? 0) < (finish.priceDelta ?? 0))) {
        finish = f
        col = h
      }
    }
    let best: Recommendation | null = null
    for (const size of cand.sizes) {
      const price = size.price + (finish?.priceDelta ?? 0)
      const spec: ItemSpec = { id: `rec-${cand.productId}-${size.sizeId}`, productId: cand.productId, category: cand.category, dims: size.dims, name: cand.name }
      const fit = assessFit(room, layout, spec, input.route, { iterations: input.iterations ?? 150 })
      if (fit.verdict === 'does_not_fit') continue
      const bud = budgetScore(price, input.budget)
      const score =
        (REC_WEIGHTS.fit * (fit.score / 100) +
          REC_WEIGHTS.category * cat.score +
          REC_WEIGHTS.budget * bud.score +
          REC_WEIGHTS.colour * col.score +
          REC_WEIGHTS.style * sty.score) /
        (REC_WEIGHTS.fit + REC_WEIGHTS.category + REC_WEIGHTS.budget + REC_WEIGHTS.colour + REC_WEIGHTS.style)

      const reasons: string[] = []
      if (fit.suggested) {
        const st = freeWallStretch(room, layout, fit.suggested)
        const w = planSize(size.dims, 0).w
        reasons.push(
          st
            ? `Fits the ${st.length} cm free stretch of the ${st.wall} wall (${w} cm wide${fit.verdict === 'tight' ? ', a little tight' : ''})`
            : `Fits free-standing in the open floor${fit.verdict === 'tight' ? ' (a little tight)' : ''}`,
        )
      }
      if (cat.reason) reasons.push(cat.reason)
      if (bud.reason) reasons.push(bud.reason)
      if (col.reason) reasons.push(col.reason)
      if (sty.reason) reasons.push(sty.reason)
      const rec: Recommendation = {
        productId: cand.productId,
        name: cand.name,
        category: cand.category,
        sizeId: size.sizeId,
        finishId: finish?.finishId,
        price,
        score: Math.round(score * 1000) / 10,
        reasons,
        verdict: fit.verdict,
        suggested: fit.suggested,
      }
      if (!best || rec.score > best.score) best = rec
    }
    if (best) out.push(best)
  }
  out.sort((a, b) => b.score - a.score || a.price - b.price)
  return out.slice(0, input.limit ?? 6)
}

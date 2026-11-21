import { describe, expect, it } from 'vitest'
import type { ItemSpec, Placed, RecCandidate, Room } from './types'
import { assessFit } from './fit'
import { recommend } from './recommend'

const room: Room = {
  width: 450, depth: 350, height: 275,
  openings: [
    { id: 'door', kind: 'door', wall: 'S', offset: 30, width: 90, swingIn: true },
    { id: 'win', kind: 'window', wall: 'N', offset: 150, width: 150, sillHeight: 90 },
  ],
}
const sofa: Placed = { id: 'sofa', productId: 'p-sofa', category: 'sofa', dims: { w: 210, d: 90, h: 85 }, x: 225, y: 45, rotation: 0 }
const item = (category: ItemSpec['category'], w: number, d: number, h: number): ItemSpec => ({ id: 'new', productId: `p-${category}`, category, dims: { w, d, h } })

describe('assessFit', () => {
  it('a coffee table fits next to the sofa and is suggested in front of it', () => {
    const r = assessFit(room, [sofa], item('coffee_table', 110, 60, 45))
    expect(r.verdict).toBe('fits')
    expect(r.score).toBeGreaterThan(85)
    expect(r.suggested).toBeDefined()
    expect(r.suggested!.y - 30).toBeGreaterThanOrEqual(90 + 35 - 0.1) // 35-50 cm gap
    expect(r.suggested!.y - 30).toBeLessThanOrEqual(90 + 50 + 0.1)
  })

  it('an item bigger than the room does not fit', () => {
    const r = assessFit(room, [], item('bed', 480, 220, 50))
    expect(r.verdict).toBe('does_not_fit')
    expect(r.checks.find((c) => c.key === 'footprint')?.ok).toBe(false)
    expect(r.suggested).toBeUndefined()
  })

  it('an item taller than the ceiling does not fit', () => {
    const r = assessFit(room, [], item('wardrobe', 120, 60, 290))
    expect(r.verdict).toBe('does_not_fit')
    expect(r.checks.find((c) => c.key === 'height')?.margin).toBe(-15)
  })

  it('an oversized sofa for its wall is tight', () => {
    const r = assessFit({ width: 400, depth: 320, height: 270, openings: [{ id: 'd', kind: 'door', wall: 'S', offset: 300, width: 90 }] }, [], item('sofa', 300, 95, 85))
    expect(r.verdict).toBe('tight')
    expect(r.checks.find((c) => c.key === 'proportion')?.ok).toBe(false)
  })

  it('a failed delivery route makes it does_not_fit', () => {
    const r = assessFit(room, [], item('sofa', 220, 100, 95), {
      floor: 0, entranceDoor: { width: 80, height: 200 }, roomDoor: { width: 80, height: 200 }, corners: [],
    })
    expect(r.checks.find((c) => c.key === 'delivery')?.ok).toBe(false)
    expect(r.verdict).toBe('does_not_fit')
  })
})

describe('recommend', () => {
  const size = (sizeId: string, w: number, d: number, h: number, price: number) => ({ sizeId, dims: { w, d, h }, price })
  const candidates: RecCandidate[] = [
    { productId: 'sofa2', name: 'Another sofa', category: 'sofa', sizes: [size('3s', 200, 90, 85, 90000)], styles: ['modern'], finishes: [{ finishId: 'grey', name: 'Grey', color: '#808080' }] },
    { productId: 'ct-cheap', name: 'Walnut coffee table', category: 'coffee_table', sizes: [size('std', 110, 60, 45, 38000)], styles: ['modern'], finishes: [{ finishId: 'walnut', name: 'Walnut', color: '#7a5230' }] },
    { productId: 'ct-lux', name: 'Marble coffee table', category: 'coffee_table', sizes: [size('std', 110, 60, 45, 160000)], styles: ['classic'], finishes: [{ finishId: 'white', name: 'White', color: '#f2f2f2' }] },
    { productId: 'giant', name: 'Giant wardrobe', category: 'wardrobe', sizes: [size('xl', 500, 70, 240, 50000)], styles: ['modern'], finishes: [] },
  ]

  it('prefers the missing category within budget and explains why', () => {
    const recs = recommend({ room, layout: [sofa], candidates, budget: 76000, preferredStyles: ['modern'], roomColors: ['#8b5a2b', '#d9cbb5', '#3a3a3a'] })
    expect(recs[0].productId).toBe('ct-cheap')
    expect(recs.findIndex((r) => r.productId === 'ct-cheap')).toBeLessThan(recs.findIndex((r) => r.productId === 'ct-lux'))
    expect(recs.findIndex((r) => r.productId === 'ct-cheap')).toBeLessThan(recs.findIndex((r) => r.productId === 'sofa2'))
    expect(recs.find((r) => r.productId === 'sofa2')!.reasons.join(' ')).toMatch(/already have a sofa/)
    expect(recs.some((r) => r.productId === 'giant')).toBe(false)
    const reasons = recs[0].reasons.join(' | ')
    expect(reasons).toMatch(/no coffee table yet/)
    expect(reasons).toMatch(/Rs 38,000 under your budget/)
    expect(reasons).toMatch(/Walnut finish matches the warm tones/)
  })
})

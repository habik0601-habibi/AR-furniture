import { describe, expect, it } from 'vitest'
import type { ItemSpec, Placed, Room } from './types'
import { doorZone, footprint, frontVector, insideRoom, isTall, rectsOverlap, windowZone } from './index'
import { evaluateLayout, mulberry32, optimiseLayout, walkwayReach } from './placement'

const spec = (id: string, category: ItemSpec['category'], w: number, d: number, h: number): ItemSpec => ({
  id, productId: `p-${id}`, category, dims: { w, d, h },
})

export const livingRoom: Room = {
  width: 500,
  depth: 400,
  height: 280,
  openings: [
    { id: 'door', kind: 'door', wall: 'S', offset: 40, width: 90, swingIn: true },
    { id: 'win', kind: 'window', wall: 'N', offset: 170, width: 160, sillHeight: 90 },
  ],
}

export const livingItems: ItemSpec[] = [
  spec('sofa', 'sofa', 210, 90, 85),
  spec('coffee', 'coffee_table', 110, 60, 45),
  spec('tv', 'tv_unit', 160, 45, 55),
  spec('arm', 'armchair', 80, 80, 90),
  spec('side1', 'side_table', 45, 45, 55),
  spec('shelf', 'bookshelf', 90, 35, 190),
  spec('desk', 'desk', 110, 55, 75),
  spec('side2', 'side_table', 45, 45, 55),
]

/** Independent re-check of every hard constraint on a result. */
function assertHard(room: Room, items: Placed[]) {
  const rects = items.map(footprint)
  rects.forEach((r, i) => {
    expect(insideRoom(r, room), `${items[i].id} inside room`).toBe(true)
    for (const o of room.openings) {
      if (o.kind === 'door') expect(rectsOverlap(r, doorZone(room, o)), `${items[i].id} clear of door`).toBe(false)
      if (o.kind === 'window' && isTall(items[i].category, items[i].dims.h))
        expect(rectsOverlap(r, windowZone(room, o)), `${items[i].id} clear of window`).toBe(false)
    }
    for (let j = i + 1; j < rects.length; j++) expect(rectsOverlap(r, rects[j]), `${items[i].id} vs ${items[j].id}`).toBe(false)
  })
}

describe('optimiseLayout', () => {
  it('is deterministic for a seed', () => {
    const a = optimiseLayout(livingRoom, livingItems, [], { seed: 3, iterations: 300 })
    const b = optimiseLayout(livingRoom, livingItems, [], { seed: 3, iterations: 300 })
    expect(a.items).toEqual(b.items)
    expect(a.score).toBe(b.score)
  })

  it('never violates hard constraints across random rooms and seeds (property test)', () => {
    const rnd = mulberry32(2024)
    const cats: [ItemSpec['category'], number, number, number][] = [
      ['bed', 160, 200, 50], ['wardrobe', 120, 60, 210], ['sofa', 200, 90, 85], ['coffee_table', 100, 55, 45],
      ['tv_unit', 150, 40, 55], ['armchair', 80, 80, 90], ['side_table', 45, 45, 55], ['bookshelf', 80, 30, 180],
      ['desk', 110, 55, 75], ['dresser', 100, 45, 80], ['dining_table', 140, 80, 76], ['dining_chair', 45, 50, 90],
    ]
    for (let t = 0; t < 30; t++) {
      const W = 280 + Math.round(rnd() * 400)
      const D = 260 + Math.round(rnd() * 300)
      const doorWall = (['N', 'E', 'S', 'W'] as const)[Math.floor(rnd() * 4)]
      const len = doorWall === 'N' || doorWall === 'S' ? W : D
      const room: Room = {
        width: W, depth: D, height: 270,
        openings: [
          { id: 'd', kind: 'door', wall: doorWall, offset: Math.round(rnd() * (len - 90)), width: 80 + Math.round(rnd() * 20), swingIn: rnd() < 0.7 },
          { id: 'w', kind: 'window', wall: doorWall === 'N' ? 'S' : 'N', offset: Math.round(rnd() * (W - 120)), width: 120, sillHeight: 90 },
        ],
      }
      const n = 3 + Math.floor(rnd() * 6)
      const items = Array.from({ length: n }, (_, i) => {
        const c = cats[Math.floor(rnd() * cats.length)]
        return spec(`i${i}`, c[0], c[1], c[2], c[3])
      })
      const res = optimiseLayout(room, items, [], { seed: t + 1, iterations: 150 })
      assertHard(room, res.items)
      expect(res.items.length + res.unplaced.length).toBe(n)
      expect(res.violations.filter((v) => v.severity === 'error')).toEqual([])
      expect(res.score).toBeGreaterThanOrEqual(0)
      expect(res.score).toBeLessThanOrEqual(100)
    }
  })

  it('puts the sofa against a wall and the coffee table 35-50 cm in front of it', () => {
    const res = optimiseLayout(livingRoom, [livingItems[0], livingItems[1], livingItems[2]], [], { seed: 1 })
    assertHard(livingRoom, res.items)
    const sofa = res.items.find((p) => p.id === 'sofa')!
    const table = res.items.find((p) => p.id === 'coffee')!
    const r = footprint(sofa)
    const backGap = Math.min(r.y0, r.x0, livingRoom.width - r.x1, livingRoom.depth - r.y1)
    expect(backGap).toBeLessThan(1)
    const f = frontVector(sofa.rotation)
    const t = footprint(table)
    const gap = f.y > 0 ? t.y0 - r.y1 : f.y < 0 ? r.y0 - t.y1 : f.x > 0 ? t.x0 - r.x1 : r.x0 - t.x1
    expect(gap).toBeGreaterThanOrEqual(34.9)
    expect(gap).toBeLessThanOrEqual(50.1)
    // and the TV unit faces the sofa from the opposite wall
    const tv = res.items.find((p) => p.id === 'tv')!
    const ft = frontVector(tv.rotation)
    expect(ft.x * f.x + ft.y * f.y).toBe(-1)
  })

  it('respects locked items and never moves them', () => {
    const locked: Placed = { ...spec('wardrobe', 'wardrobe', 150, 60, 210), x: 470, y: 230, rotation: 90, locked: true }
    for (const seed of [1, 2, 3]) {
      const res = optimiseLayout(livingRoom, livingItems.slice(0, 5), [locked], { seed, iterations: 300 })
      const w = res.items.find((p) => p.id === 'wardrobe')!
      expect([w.x, w.y, w.rotation]).toEqual([470, 230, 90])
      assertHard(livingRoom, res.items)
    }
  })

  it('reports hard problems of locked items as errors', () => {
    const blocking: Placed = { ...spec('shelf', 'bookshelf', 90, 35, 190), x: 85, y: 382.5, rotation: 180, locked: true }
    const res = optimiseLayout(livingRoom, [], [blocking], { iterations: 10 })
    expect(res.violations.some((v) => v.severity === 'error' && v.code === 'blocks_door')).toBe(true)
  })

  it('puts an item larger than the room in unplaced', () => {
    const res = optimiseLayout({ width: 250, depth: 180, height: 260, openings: [] }, [spec('bed', 'bed', 200, 220, 50), spec('st', 'side_table', 40, 40, 50)])
    expect(res.unplaced).toEqual(['bed'])
    expect(res.items.map((p) => p.id)).toEqual(['st'])
  })

  it('keeps an inward door swing clear', () => {
    const room: Room = { width: 300, depth: 300, height: 260, openings: [{ id: 'd', kind: 'door', wall: 'W', offset: 0, width: 100, swingIn: true }] }
    const res = optimiseLayout(room, [spec('wr', 'wardrobe', 200, 60, 210), spec('b', 'bed', 140, 200, 50)], [], { seed: 5 })
    for (const p of res.items) expect(rectsOverlap(footprint(p), { x0: 0, y0: 0, x1: 100, y1: 100 })).toBe(false)
  })

  it('meets the browser performance target (8 items, 5x4 m, default iterations)', () => {
    optimiseLayout(livingRoom, livingItems, [], { seed: 99, iterations: 50 }) // warm up JIT
    const times: number[] = []
    let res = optimiseLayout(livingRoom, livingItems, [], { seed: 1 })
    for (let s = 1; s <= 5; s++) {
      const t0 = performance.now()
      res = optimiseLayout(livingRoom, livingItems, [], { seed: s })
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    console.log(`[perf] optimiseLayout 8 items 5x4 m, ${res.iterations} iterations: median ${times[2].toFixed(1)} ms, min ${times[0].toFixed(1)}, max ${times[4].toFixed(1)}; score ${res.score}, unplaced ${res.unplaced.length}`)
    expect(times[2]).toBeLessThan(300)
    expect(res.unplaced).toEqual([])
  })
})

describe('walkway BFS', () => {
  const room: Room = { width: 400, depth: 300, height: 260, openings: [{ id: 'd', kind: 'door', wall: 'W', offset: 20, width: 90 }] }
  const wardrobe: Placed = { ...spec('wr', 'wardrobe', 150, 60, 210), x: 300, y: 30, rotation: 0 }

  it('reaches an item through an open room', () => {
    expect(walkwayReach(room, [wardrobe]).every((r) => r.reachable)).toBe(true)
  })

  it('detects a route blocked by a wall of furniture', () => {
    // a row of shelves from the north to the south wall cuts the room in two
    const barrier: Placed = { ...spec('bar', 'bookshelf', 300, 40, 100), x: 180, y: 150, rotation: 90 }
    const reach = walkwayReach(room, [wardrobe, barrier])
    expect(reach.find((r) => r.id === 'wr')!.reachable).toBe(false)
    const ev = evaluateLayout(room, [wardrobe, barrier])
    expect(ev.violations.some((v) => v.code === 'walkway' && v.itemIds.includes('wr'))).toBe(true)
  })

  it('reports a narrow walkway with its approximate width', () => {
    // 65 cm gap between the barrier and the south wall: passable at 60, not at 75
    const barrier: Placed = { ...spec('bar', 'bookshelf', 235, 40, 100), x: 180, y: 117.5, rotation: 90 }
    const ev = evaluateLayout(room, [wardrobe, barrier])
    const v = ev.violations.find((x) => x.code === 'walkway' && x.itemIds.includes('wr'))
    expect(v?.message).toMatch(/only about 60 cm/)
  })
})

describe('evaluateLayout', () => {
  it('scores without moving items and flags overlaps as errors', () => {
    const a: Placed = { ...spec('a', 'sofa', 200, 90, 85), x: 200, y: 45, rotation: 0 }
    const b: Placed = { ...spec('b', 'coffee_table', 100, 60, 45), x: 200, y: 80, rotation: 0 }
    const ev = evaluateLayout(livingRoom, [a, b])
    expect(ev.items.map((p) => [p.x, p.y])).toEqual([[200, 45], [200, 80]])
    expect(ev.violations.some((v) => v.code === 'overlap' && v.severity === 'error')).toBe(true)
    expect(ev.terms.map((t) => t.key)).toEqual(['clearance', 'walkway', 'wall', 'relations', 'light', 'balance'])
  })

  it('warns when the wardrobe has no room for its doors', () => {
    const w: Placed = { ...spec('w', 'wardrobe', 150, 60, 210), x: 400, y: 30, rotation: 0 }
    const bed: Placed = { ...spec('b', 'bed', 160, 200, 50), x: 400, y: 160, rotation: 0 }
    const ev = evaluateLayout(livingRoom, [w, bed])
    expect(ev.violations.find((v) => v.code === 'clearance' && v.itemIds[0] === 'w')?.message).toMatch(/Only 0 cm clear in front of the wardrobe/)
  })
})

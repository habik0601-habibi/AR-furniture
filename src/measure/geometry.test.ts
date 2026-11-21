import { describe, expect, it } from 'vitest'
import { buildRoom, fitRectangle, snapOpeningToWall, toRoomFrame } from './geometry'
import type { Vec2 } from './types'

function rotated(w: number, d: number, angleDeg: number, offset: Vec2): Vec2[] {
  const a = (angleDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ].map((p) => ({ x: offset.x + p.x * c - p.y * s, y: offset.y + p.x * s + p.y * c }))
}

function noisy(pts: Vec2[], amp: number, seed = 7): Vec2[] {
  let s = seed
  const r = () => {
    s = (s * 16807) % 2147483647
    return (s / 2147483647) * 2 - 1
  }
  return pts.map((p) => ({ x: p.x + r() * amp, y: p.y + r() * amp }))
}

describe('fitRectangle', () => {
  it('recovers an axis-aligned rectangle exactly', () => {
    const f = fitRectangle(rotated(400, 500, 0, { x: 10, y: 20 }))
    expect(f.width).toBeCloseTo(400, 6)
    expect(f.depth).toBeCloseTo(500, 6)
    expect(f.residual).toBeLessThan(1e-6)
  })

  it('recovers a rotated rectangle, x axis along the first traced edge', () => {
    for (const ang of [17, 63, -40, 135]) {
      const f = fitRectangle(rotated(420, 310, ang, { x: -50, y: 80 }))
      expect(f.width).toBeCloseTo(420, 6)
      expect(f.depth).toBeCloseTo(310, 6)
      const a = (ang * Math.PI) / 180
      expect(f.ex.x).toBeCloseTo(Math.cos(a), 6)
      expect(f.ex.y).toBeCloseTo(Math.sin(a), 6)
    }
  })

  it('works when the corners are traced counter-clockwise (no mirroring)', () => {
    const pts = rotated(400, 300, 20, { x: 0, y: 0 }).reverse()
    const f = fitRectangle(pts)
    // First edge is now the far 400 cm side, traced right-to-left: it becomes the N wall.
    expect(f.width).toBeCloseTo(400, 6)
    expect(f.depth).toBeCloseTo(300, 6)
    // Handedness: ey is ex rotated +90 degrees (y-down), never mirrored.
    expect(f.ey.x).toBeCloseTo(-f.ex.y, 9)
    expect(f.ey.y).toBeCloseTo(f.ex.x, 9)
    for (const p of pts) {
      const q = toRoomFrame(f, p)
      expect(q.x).toBeGreaterThan(-1e-6)
      expect(q.y).toBeGreaterThan(-1e-6)
    }
  })

  it('is robust to +/- 3 cm noise on the corners', () => {
    const f = fitRectangle(noisy(rotated(365, 427, 33, { x: 5, y: 5 }), 3))
    expect(Math.abs(f.width - 365)).toBeLessThan(4)
    expect(Math.abs(f.depth - 427)).toBeLessThan(4)
    expect(f.residual).toBeLessThan(6)
  })

  it('infers the 4th corner from 3', () => {
    const r = rotated(300, 200, 10, { x: 0, y: 0 })
    const f = fitRectangle(r.slice(0, 3))
    expect(f.width).toBeCloseTo(300, 6)
    expect(f.depth).toBeCloseTo(200, 6)
    expect(f.notes.join(' ')).toMatch(/inferred/)
  })

  it('falls back to the bounding rectangle for an L-shaped room', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 250, y: 200 },
      { x: 250, y: 350 },
      { x: 0, y: 350 },
    ]
    const f = fitRectangle(L)
    expect(f.width).toBeCloseTo(400, 6)
    expect(f.depth).toBeCloseTo(350, 6)
    expect(f.notes.join(' ')).toMatch(/bounding/)
  })

  it('warns about a corner that is far from square', () => {
    const f = fitRectangle([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 480, y: 300 },
      { x: 0, y: 300 },
    ])
    expect(f.maxAngleError).toBeGreaterThan(10)
    expect(f.notes.join(' ')).toMatch(/square/)
  })

  it('throws with fewer than 3 points', () => {
    expect(() => fitRectangle([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toThrow()
  })
})

describe('opening -> wall mapping', () => {
  it('snaps to each wall with offsets from the correct start corner', () => {
    const W = 400
    const D = 300
    const n = snapOpeningToWall('window', { x: 100, y: 3 }, { x: 220, y: -2 }, W, D)
    expect(n.opening).toMatchObject({ wall: 'N', offset: 100, width: 120, sillHeight: 90 })
    const e = snapOpeningToWall('door', { x: 398, y: 150 }, { x: 401, y: 60 }, W, D)
    expect(e.opening).toMatchObject({ wall: 'E', offset: 60, width: 90, swingIn: true })
    const s = snapOpeningToWall('door', { x: 320, y: 299 }, { x: 230, y: 300 }, W, D)
    expect(s.opening).toMatchObject({ wall: 'S', offset: 230, width: 90 })
    const w = snapOpeningToWall('window', { x: 4, y: 20 }, { x: 0, y: 140 }, W, D)
    expect(w.opening).toMatchObject({ wall: 'W', offset: 20, width: 120 })
  })

  it('clamps openings that overrun the wall', () => {
    const r = snapOpeningToWall('door', { x: -30, y: 0 }, { x: 60, y: 0 }, 400, 300)
    expect(r.opening.offset).toBe(0)
    expect(r.opening.width).toBe(60)
  })

  it('buildRoom maps openings measured on a rotated room', () => {
    const ang = 25
    const poly = rotated(400, 300, ang, { x: 100, y: 50 })
    const a = (ang * Math.PI) / 180
    const at = (x: number, y: number) => ({
      x: 100 + x * Math.cos(a) - y * Math.sin(a),
      y: 50 + x * Math.sin(a) + y * Math.cos(a),
    })
    const built = buildRoom(
      poly,
      [
        { kind: 'door', a: at(310, 302), b: at(220, 298) },
        { kind: 'window', a: at(0, 80), b: at(2, 200) },
        { kind: 'window', a: at(100, 0), b: at(110, 0) }, // too narrow, dropped
      ],
      275,
      'Bedroom',
    )
    expect(built.room).toMatchObject({ width: 400, depth: 300, height: 275, name: 'Bedroom' })
    expect(built.room.openings).toHaveLength(2)
    expect(built.room.openings[0]).toMatchObject({ kind: 'door', wall: 'S', offset: 220, width: 90 })
    expect(built.room.openings[1]).toMatchObject({ kind: 'window', wall: 'W', offset: 80, width: 120 })
    expect(built.notes.join(' ')).toMatch(/narrower/)
    built.polygon.forEach((p, i) => {
      const exp = [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ][i]
      expect(p.x).toBeCloseTo(exp.x, 6)
      expect(p.y).toBeCloseTo(exp.y, 6)
    })
  })
})

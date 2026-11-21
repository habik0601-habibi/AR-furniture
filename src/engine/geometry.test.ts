import { describe, expect, it } from 'vitest'
import type { Placed, Room } from './types'
import {
  backWallOf, doorZone, footprint, frontCenter, frontVector, frontZone, insideRoom, overlapArea, planSize,
  rectGap, rectsOverlap, rotationForWall, sideZone, windowZone,
} from './geometry'

const sofa = (x: number, y: number, rotation: Placed['rotation']): Placed => ({
  id: 's', productId: 'p', category: 'sofa', dims: { w: 200, d: 90, h: 85 }, x, y, rotation,
})
const room: Room = { width: 400, depth: 300, height: 260, openings: [] }

describe('geometry', () => {
  it('swaps width and depth for 90/270 rotations', () => {
    expect(planSize({ w: 200, d: 90, h: 85 }, 0)).toEqual({ w: 200, d: 90 })
    expect(planSize({ w: 200, d: 90, h: 85 }, 90)).toEqual({ w: 90, d: 200 })
    expect(planSize({ w: 200, d: 90, h: 85 }, 270)).toEqual({ w: 90, d: 200 })
    expect(footprint(sofa(100, 100, 90))).toEqual({ x0: 55, y0: 0, x1: 145, y1: 200 })
  })

  it('treats touching rectangles as non-overlapping and measures gaps', () => {
    const a = { x0: 0, y0: 0, x1: 100, y1: 100 }
    expect(rectsOverlap(a, { x0: 100, y0: 0, x1: 200, y1: 100 })).toBe(false)
    expect(rectsOverlap(a, { x0: 99, y0: 50, x1: 200, y1: 100 })).toBe(true)
    expect(overlapArea(a, { x0: 50, y0: 50, x1: 150, y1: 150 })).toBe(2500)
    expect(rectGap(a, { x0: 130, y0: 140, x1: 200, y1: 200 })).toBeCloseTo(50) // 3-4-5
  })

  it('front faces S at 0 and turns clockwise', () => {
    expect(frontVector(0)).toEqual({ x: 0, y: 1 })
    expect(frontVector(90)).toEqual({ x: -1, y: 0 })
    expect(frontVector(180)).toEqual({ x: 0, y: -1 })
    expect(frontVector(270)).toEqual({ x: 1, y: 0 })
    for (const w of ['N', 'E', 'S', 'W'] as const) expect(backWallOf(rotationForWall(w))).toBe(w)
  })

  it('builds clearance zones on the correct side', () => {
    expect(frontZone(sofa(200, 45, 0), 45)).toEqual({ x0: 100, x1: 300, y0: 90, y1: 135 })
    // back against the E wall, front faces W
    const e = sofa(355, 150, 90)
    expect(frontZone(e, 45)).toEqual({ x0: 265, x1: 310, y0: 50, y1: 250 })
    expect(frontCenter(e)).toEqual({ x: 310, y: 150 })
    // right-hand side of a sofa facing S is the west (-x) side
    expect(sideZone(sofa(200, 45, 0), 'right', 30)).toEqual({ x0: 70, x1: 100, y0: 0, y1: 90 })
    expect(insideRoom(footprint(e), room)).toBe(true)
    expect(insideRoom(footprint(sofa(390, 150, 90)), room)).toBe(false)
  })

  it('door swing zone is a square inside the room, window zone a strip', () => {
    expect(doorZone(room, { id: 'd', kind: 'door', wall: 'E', offset: 20, width: 90, swingIn: true })).toEqual({ x0: 310, x1: 400, y0: 20, y1: 110 })
    expect(doorZone(room, { id: 'd', kind: 'door', wall: 'S', offset: 20, width: 90 })).toEqual({ x0: 20, x1: 110, y0: 240, y1: 300 })
    expect(windowZone(room, { id: 'w', kind: 'window', wall: 'N', offset: 100, width: 150 })).toEqual({ x0: 100, x1: 250, y0: 0, y1: 50 })
  })
})

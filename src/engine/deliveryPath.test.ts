import { describe, expect, it } from 'vitest'
import type { AccessRoute } from './types'
import { canTurnCorner, checkDeliveryPath, cornerFit, cornerMaxLength, doorwayFit, liftCabinFit, rectFitsInRect } from './deliveryPath'

const sofa = { w: 200, d: 90, h: 85 }

describe('corner turning (moving-sofa / ladder problem)', () => {
  it('matches the closed form for a zero-width object: 2*sqrt(2) for a = b = 1', () => {
    expect(cornerMaxLength(1, 1, 0)).toBeCloseTo(2 * Math.SQRT2, 6)
    expect(cornerMaxLength(100, 100, 0)).toBeCloseTo(282.843, 2)
  })

  it('matches (a^2/3 + b^2/3)^3/2 for unequal corridors', () => {
    expect(cornerMaxLength(1, 8, 0)).toBeCloseTo(Math.pow(1 + 4, 1.5), 5)
    expect(cornerMaxLength(80, 120, 0)).toBeCloseTo(Math.pow(80 ** (2 / 3) + 120 ** (2 / 3), 1.5), 3)
  })

  it('matches 2*sqrt(2)*a - 2w for a symmetric corner with width', () => {
    expect(cornerMaxLength(90, 90, 85)).toBeCloseTo(2 * Math.SQRT2 * 90 - 170, 4)
    expect(cornerMaxLength(90, 90, 95)).toBe(0) // too wide for the corridor
  })

  it('a 200x90 sofa cannot turn a 90/90 corner flat but can stood on end', () => {
    expect(canTurnCorner(200, 85, 90, 90).ok).toBe(false)
    const f = cornerFit(sofa, 90, 90, 230)
    expect(f.ok).toBe(true)
    expect(f.orientation).toBe('stood on end')
  })

  it('standing on end fails under a low ceiling', () => {
    expect(cornerFit(sofa, 90, 90, 190).ok).toBe(false)
  })

  it('a short item can translate round without rotating', () => {
    expect(canTurnCorner(90, 80, 85, 95).ok).toBe(true)
  })
})

describe('doorways', () => {
  it('carries a sofa upright through a wide enough door', () => {
    const f = doorwayFit(sofa, 90, 210)
    expect(f).toEqual({ ok: true, margin: 0, orientation: 'carried upright' })
  })

  it('tilts a sofa on its back when its height is under the door width', () => {
    const f = doorwayFit({ w: 200, d: 95, h: 75 }, 80, 200)
    expect(f.ok).toBe(true)
    expect(f.orientation).toBe('tilted on its back')
  })

  it('stands a tall wardrobe on end under a low door head', () => {
    const f = doorwayFit({ w: 100, d: 60, h: 210 }, 80, 200)
    expect(f.ok).toBe(true)
    expect(f.orientation).toBe('stood on end')
  })

  it('reports the shortfall when nothing works', () => {
    const f = doorwayFit(sofa, 80, 200)
    expect(f.ok).toBe(false)
    expect(f.margin).toBe(-5)
  })
})

describe('lift', () => {
  it('Carver condition: thin long panel fits diagonally, square peg does not', () => {
    expect(rectFitsInRect(240, 20, 220, 140)).toBe(true)
    expect(rectFitsInRect(240, 60, 220, 140)).toBe(false)
    expect(rectFitsInRect(100, 50, 120, 60)).toBe(true)
  })

  it('a 240 cm headboard fits a 220 cm tall cabin only leaned diagonally', () => {
    const cab = { width: 110, depth: 140, height: 220 }
    const thin = liftCabinFit({ w: 240, d: 20, h: 100 }, cab)
    expect(thin.ok).toBe(true)
    expect(thin.orientation).toMatch(/diagonal/)
    expect(liftCabinFit({ w: 240, d: 60, h: 100 }, cab).ok).toBe(false)
    expect(liftCabinFit({ w: 100, d: 60, h: 200 }, cab).orientation).toBe('stands in the cabin')
  })
})

describe('checkDeliveryPath', () => {
  const base: AccessRoute = {
    floor: 0,
    entranceDoor: { width: 100, height: 210 },
    roomDoor: { width: 90, height: 205 },
    corners: [{ widthIn: 110, widthOut: 100 }],
  }

  it('ground floor: doors and corner only', () => {
    const r = checkDeliveryPath({ dims: sofa }, base)
    expect(r.ok).toBe(true)
    expect(r.steps.map((s) => s.key)).toEqual(['entrance', 'corner-1', 'room', 'notes'])
  })

  it('upper floor with neither lift nor stairs fails', () => {
    const r = checkDeliveryPath({ dims: sofa }, { ...base, floor: 2 })
    expect(r.ok).toBe(false)
    expect(r.steps.find((s) => s.key === 'vertical')?.ok).toBe(false)
  })

  it('falls back to the stairs when the lift is too small', () => {
    const r = checkDeliveryPath({ dims: sofa }, {
      ...base, floor: 4,
      lift: { width: 100, depth: 130, height: 180, doorWidth: 80, doorHeight: 200 },
      stairs: { width: 110, headroom: 210, hasLanding: true, landingDepth: 120 },
    })
    expect(r.ok).toBe(true)
    expect(r.advice).toBe('Take the stairs instead of the lift')
  })

  it('suggests leg removal when only the legs are in the way', () => {
    const route = { ...base, roomDoor: { width: 76, height: 200 } }
    const tall = { w: 200, d: 95, h: 88 }
    const r = checkDeliveryPath({ dims: tall }, route)
    expect(r.ok).toBe(false)
    expect(r.advice).toMatch(/leg removal/)
    const withLegsOff = checkDeliveryPath({ dims: tall, removableLegs: true }, route)
    expect(withLegsOff.ok).toBe(true)
  })

  it('uses the boxed size for flat-packed items', () => {
    const r = checkDeliveryPath({ dims: { w: 220, d: 100, h: 200 }, packed: { w: 200, d: 60, h: 20 } }, { ...base, roomDoor: { width: 70, height: 200 } })
    expect(r.ok).toBe(true)
  })
})

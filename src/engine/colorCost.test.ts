import { describe, expect, it } from 'vitest'
import { deltaE2000, deltaE76, dominantColors, hexToLab, hexToRgb, labToHex, rgbToHex, rgbToLab } from './color'
import { estimateDelivery, roadDistance } from './deliveryCost'
import { configuredPrice, pkr, pkrCompact } from './pricing'

describe('colour', () => {
  it('converts hex <-> rgb <-> Lab', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(rgbToHex({ r: 18, g: 52, b: 86 })).toBe('#123456')
    const white = hexToLab('#ffffff')
    expect(white.L).toBeCloseTo(100, 1)
    expect(Math.abs(white.a) + Math.abs(white.b)).toBeLessThan(0.05)
    const red = rgbToLab({ r: 255, g: 0, b: 0 })
    expect(red.L).toBeCloseTo(53.24, 1)
    expect(red.a).toBeCloseTo(80.09, 1)
    expect(red.b).toBeCloseTo(67.2, 1)
    for (const h of ['#7a5230', '#123456', '#e0e0e0']) expect(labToHex(hexToLab(h))).toBe(h)
  })

  it('CIEDE2000 matches the Sharma et al. reference pairs', () => {
    expect(deltaE2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 4)
    expect(deltaE2000({ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 })).toBeCloseTo(2.3669, 4)
    expect(deltaE2000({ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 })).toBeCloseTo(27.1492, 4)
    expect(deltaE76({ L: 50, a: 0, b: 0 }, { L: 53, a: 4, b: 0 })).toBe(5)
  })

  it('k-means finds the two obvious colours, largest first', () => {
    const n = 1000
    const px = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      const navy = i % 10 < 7 // 70% navy, 30% orange, with noise
      const jitter = (i * 37) % 9 - 4
      px.set(navy ? [20 + jitter, 30, 90 + jitter, 255] : [230 + jitter, 120, 30, 255], i * 4)
    }
    const cols = dominantColors(px, 2)
    expect(cols).toHaveLength(2)
    expect(deltaE2000(hexToLab(cols[0]), hexToLab('#141e5a'))).toBeLessThan(3)
    expect(deltaE2000(hexToLab(cols[1]), hexToLab('#e6781e'))).toBeLessThan(3)
  })
})

describe('delivery cost', () => {
  const chair = { packed: { w: 50, d: 55, h: 90 }, weightKg: 8, assemblyRequired: false }
  const wardrobe = { packed: { w: 200, d: 65, h: 30 }, weightKg: 70, assemblyRequired: true }

  it('uses a symmetric distance table', () => {
    expect(roadDistance('lahore', 'karachi')).toBe(roadDistance('karachi', 'lahore'))
    expect(roadDistance('islamabad', 'islamabad')).toBe(0)
  })

  it('picks a bigger vehicle for more volume', () => {
    const small = estimateDelivery({ fromCity: 'lahore', toCity: 'lahore', items: [chair], floor: 0, hasLift: false })
    const medium = estimateDelivery({ fromCity: 'lahore', toCity: 'lahore', items: Array(12).fill(wardrobe).concat(Array(6).fill(chair)), floor: 0, hasLift: false })
    const big = estimateDelivery({ fromCity: 'lahore', toCity: 'lahore', items: Array(25).fill(wardrobe), floor: 0, hasLift: false })
    const huge = estimateDelivery({ fromCity: 'lahore', toCity: 'lahore', items: Array(100).fill(wardrobe), floor: 0, hasLift: false })
    expect(small.vehicle.id).toBe('ravi')
    expect(medium.vehicle.id).toBe('shehzore') // 6.2 m3 <= 70% of 8.96 m3
    expect(big.vehicle.id).toBe('mazda16')
    expect(huge.vehicle.id).toBe('container20')
    expect(huge.trips).toBe(2)
    expect(small.total).toBeLessThan(medium.total)
    expect(medium.total).toBeLessThan(big.total)
  })

  it('charges stair labour only without a lift, and more for heavy items', () => {
    const noLift = estimateDelivery({ fromCity: 'karachi', toCity: 'karachi', items: [wardrobe, chair], floor: 3, hasLift: false })
    const lift = estimateDelivery({ fromCity: 'karachi', toCity: 'karachi', items: [wardrobe, chair], floor: 3, hasLift: true })
    expect(noLift.lines.find((l) => l.key === 'stairs')?.amount).toBe((600 + 300) * 3)
    expect(lift.lines.find((l) => l.key === 'stairs')).toBeUndefined()
    expect(noLift.total - lift.total).toBeGreaterThanOrEqual(2700)
  })

  it('inter-city costs more and takes longer than same-city; rules are overridable', () => {
    const local = estimateDelivery({ fromCity: 'lahore', toCity: 'lahore', items: [wardrobe], floor: 0, hasLift: false })
    const far = estimateDelivery({ fromCity: 'karachi', toCity: 'peshawar', items: [wardrobe], floor: 0, hasLift: false, goodsValue: 100000 })
    expect(far.total).toBeGreaterThan(local.total)
    expect(far.days.min).toBeGreaterThan(local.days.min)
    expect(far.lines.find((l) => l.key === 'insurance')?.amount).toBe(1000)
    const cheap = estimateDelivery({ fromCity: 'lahore', toCity: 'lahore', items: [wardrobe], floor: 0, hasLift: false, rules: { assemblyPerItem: 0 } })
    expect(cheap.lines.find((l) => l.key === 'assembly')).toBeUndefined()
    expect(local.total % 50).toBe(0)
  })
})

describe('pricing', () => {
  it('formats rupees with lakh grouping', () => {
    expect(pkr(124500)).toBe('Rs 1,24,500')
    expect(pkr(999)).toBe('Rs 999')
    expect(pkr(1000)).toBe('Rs 1,000')
    expect(pkr(12345678)).toBe('Rs 1,23,45,678')
    expect(pkr(-5000)).toBe('-Rs 5,000')
    expect(pkrCompact(125000)).toBe('Rs 1.25 lakh')
    expect(configuredPrice(85000, 4500, 2)).toBe(179000)
  })
})

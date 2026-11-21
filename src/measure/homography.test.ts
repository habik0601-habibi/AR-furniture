import { describe, expect, it } from 'vitest'
import {
  applyH,
  computeHomography,
  focalFit,
  invert3,
  isBelowHorizon,
  lengthSigma,
  mul3,
  normalizeH,
  pointSigma,
  solveReference,
  sortClockwise,
  type Mat3,
} from './homography'
import { project, type Camera } from './syntheticCamera'
import type { Vec2 } from './types'

const A4 = { w: 21, h: 29.7 }
const cam: Camera = { x: 100, y: 250, height: 150, pitchDeg: 40, f: 1500, cx: 1000, cy: 750 }
const imgW = 2000
const imgH = 1500

/** A4 sheet lying with its top-left at (90, 150) on the plan, long side along y. */
const sheetWorld: Vec2[] = [
  { x: 90, y: 150 },
  { x: 90 + A4.w, y: 150 },
  { x: 90 + A4.w, y: 150 + A4.h },
  { x: 90, y: 150 + A4.h },
]
const sheetLocal: Vec2[] = [
  { x: 0, y: 0 },
  { x: A4.w, y: 0 },
  { x: A4.w, y: A4.h },
  { x: 0, y: A4.h },
]
const sheetImg = sheetWorld.map((p) => project(cam, p))

const close = (a: Vec2, b: Vec2, tol: number) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
}

describe('computeHomography (normalised DLT)', () => {
  const Htrue: Mat3 = normalizeH([0.9, 0.2, 30, -0.1, 1.1, 40, 0.0004, 0.0009, 1])

  it('recovers a known perspective homography exactly from 4 points', () => {
    const src = [
      { x: 10, y: 20 },
      { x: 900, y: 35 },
      { x: 870, y: 640 },
      { x: 25, y: 600 },
    ]
    const H = computeHomography(src, src.map((p) => applyH(Htrue, p)))
    H.forEach((h, i) => expect(h).toBeCloseTo(Htrue[i], 8))
  })

  it('is exact with more than 4 points (least squares on consistent data)', () => {
    const src: Vec2[] = []
    for (let i = 0; i < 12; i++) src.push({ x: 50 + ((i * 137) % 800), y: 40 + ((i * 251) % 600) })
    const H = computeHomography(src, src.map((p) => applyH(Htrue, p)))
    H.forEach((h, i) => expect(h).toBeCloseTo(Htrue[i], 7))
  })

  it('round-trips through its inverse', () => {
    const Hinv = invert3(Htrue)
    const p = { x: 321, y: 123 }
    close(applyH(Hinv, applyH(Htrue, p)), p, 1e-9)
    const I = normalizeH(mul3(Htrue, Hinv))
    I.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][i], 9))
  })

  it('does not depend on the order of the correspondences', () => {
    const dst = sheetLocal
    const H1 = computeHomography(sheetImg, dst)
    const perm = [2, 0, 3, 1]
    const H2 = computeHomography(perm.map((i) => sheetImg[i]), perm.map((i) => dst[i]))
    H1.forEach((h, i) => expect(h).toBeCloseTo(H2[i], 9))
  })

  it('is invariant to rescaling/translating the image (as mapped results)', () => {
    const S: Mat3 = [0.5, 0, 17, 0, 0.5, -9, 0, 0, 1]
    const imgScaled = sheetImg.map((p) => applyH(S, p))
    const H1 = computeHomography(sheetImg, sheetLocal)
    const H2 = computeHomography(imgScaled, sheetLocal)
    const q = project(cam, { x: 250, y: 20 })
    close(applyH(H2, applyH(S, q)), applyH(H1, q), 1e-6)
  })

  it('rejects degenerate input', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]
    expect(() => computeHomography(line, sheetLocal)).toThrow()
    expect(() => computeHomography(line.slice(0, 3), sheetLocal.slice(0, 3))).toThrow()
  })
})

describe('A4 reference on a synthetic photo', () => {
  const H = computeHomography(sheetImg, sheetLocal)

  it('maps far floor points to the right cm position', () => {
    const targets = [
      { x: 0, y: 0 },
      { x: 300, y: -100 },
      { x: 200, y: 220 },
    ]
    for (const t of targets) {
      const m = applyH(H, project(cam, t))
      close(m, { x: t.x - 90, y: t.y - 150 }, 1e-6)
    }
  })

  it('measures a 3 m wall to within a millimetre with perfect taps', () => {
    const a = project(cam, { x: 0, y: 0 })
    const b = project(cam, { x: 300, y: 0 })
    const A = applyH(H, a)
    const B = applyH(H, b)
    expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeCloseTo(300, 3)
  })

  it('solveReference finds the long side and the focal length from unordered taps', () => {
    const shuffled = [sheetImg[2], sheetImg[0], sheetImg[3], sheetImg[1]]
    const sol = solveReference(shuffled, A4.w, A4.h, imgW, imgH)
    expect(sol.plausible).toBe(true)
    expect(sol.orientationConfident).toBe(true)
    expect(sol.focal!).toBeGreaterThan(1450)
    expect(sol.focal!).toBeLessThan(1550)
    const a = applyH(sol.H, project(cam, { x: 0, y: 0 }))
    const b = applyH(sol.H, project(cam, { x: 300, y: 0 }))
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(300, 2)
  })

  it('orientation comes from the geometry, not the focal prior, when the sheet is turned', () => {
    // Yawed camera and a lens far from the prior (f = 2600 on a 2000 px image).
    for (const yawDeg of [25, -35]) {
      const c2: Camera = { ...cam, yawDeg, f: 2600 }
      const img = sheetWorld.map((p) => project(c2, p))
      const sol = solveReference(img, A4.w, A4.h, imgW, imgH)
      expect(sol.focal!).toBeGreaterThan(2500)
      expect(sol.focal!).toBeLessThan(2700)
      const a = applyH(sol.H, project(c2, { x: 0, y: 0 }))
      const b = applyH(sol.H, project(c2, { x: 300, y: 0 }))
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(300, 2)
      const swapped = solveReference(img, A4.w, A4.h, imgW, imgH, true)
      const a2 = applyH(swapped.H, project(c2, { x: 0, y: 0 }))
      const b2 = applyH(swapped.H, project(c2, { x: 300, y: 0 }))
      expect(Math.abs(Math.hypot(a2.x - b2.x, a2.y - b2.y) - 300)).toBeGreaterThan(20)
    }
  })

  it('the wrong long/short assignment gives inconsistent focal constraints', () => {
    const c2: Camera = { ...cam, yawDeg: 30 }
    const img = sheetWorld.map((p) => project(c2, p))
    const right = focalFit(computeHomography(sheetLocal, img), imgW / 2, imgH / 2)
    expect(1 / Math.sqrt(right.k)).toBeCloseTo(1500, 0)
    expect(right.residual).toBeLessThan(1e-6)
    const wrongWorld = [
      { x: 0, y: 0 },
      { x: A4.h, y: 0 },
      { x: A4.h, y: A4.w },
      { x: 0, y: A4.w },
    ]
    const wrong = focalFit(computeHomography(wrongWorld, img), imgW / 2, imgH / 2)
    expect(wrong.k > 0 && wrong.residual < 0.05).toBe(false)
  })

  it('sortClockwise returns screen-clockwise order', () => {
    const s = sortClockwise([sheetImg[3], sheetImg[1], sheetImg[0], sheetImg[2]])
    // Signed area > 0 means clockwise in a y-down frame.
    let area = 0
    for (let i = 0; i < 4; i++) area += s[i].x * s[(i + 1) % 4].y - s[(i + 1) % 4].x * s[i].y
    expect(area).toBeGreaterThan(0)
  })

  it('flags points above the horizon', () => {
    const below = project(cam, { x: 100, y: -200 })
    expect(isBelowHorizon(H, below, sheetImg)).toBe(true)
    expect(isBelowHorizon(H, { x: 1000, y: -5000 }, sheetImg)).toBe(false)
  })
})

describe('error model', () => {
  it('error of a 1 m segment grows with distance from the sheet', () => {
    const near = lengthSigma(sheetImg, sheetLocal, project(cam, { x: 60, y: 120 }), project(cam, { x: 160, y: 120 }), 3)
    const mid = lengthSigma(sheetImg, sheetLocal, project(cam, { x: 60, y: 0 }), project(cam, { x: 160, y: 0 }), 3)
    const far = lengthSigma(sheetImg, sheetLocal, project(cam, { x: 60, y: -150 }), project(cam, { x: 160, y: -150 }), 3)
    expect(near).toBeLessThan(mid)
    expect(mid).toBeLessThan(far)
    expect(near).toBeGreaterThan(0)
  })

  it('position error grows with distance and with click error', () => {
    const p1 = pointSigma(sheetImg, sheetLocal, project(cam, { x: 100, y: 100 }), 0.5)
    const p2 = pointSigma(sheetImg, sheetLocal, project(cam, { x: 100, y: -100 }), 0.5)
    const p3 = pointSigma(sheetImg, sheetLocal, project(cam, { x: 100, y: -100 }), 1)
    expect(p1).toBeLessThan(p2)
    // First-order model: error scales linearly with click error (small perturbations).
    expect(p3 / p2).toBeGreaterThan(1.9)
    expect(p3 / p2).toBeLessThan(2.1)
  })

  it('a bigger reference (60 cm tile) gives a smaller error than A4', () => {
    const tileWorld = [
      { x: 70, y: 120 },
      { x: 130, y: 120 },
      { x: 130, y: 180 },
      { x: 70, y: 180 },
    ]
    const tileImg = tileWorld.map((p) => project(cam, p))
    const tileLocal = tileWorld.map((p) => ({ x: p.x - 70, y: p.y - 120 }))
    const a = project(cam, { x: 0, y: 0 })
    const b = project(cam, { x: 300, y: 0 })
    const eA4 = lengthSigma(sheetImg, sheetLocal, a, b, 3)
    const eTile = lengthSigma(tileImg, tileLocal, a, b, 3)
    expect(eTile).toBeLessThan(eA4)
  })
})

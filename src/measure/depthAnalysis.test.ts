import { describe, expect, it } from 'vitest'
import { analyzeDepth } from './depthAnalysis'
import { project, renderRoomInverseDepth, type Camera } from './syntheticCamera'

const W = 320
const H = 240
const room = { w: 400, d: 500, h: 270 }
const cam: Camera = { x: 200, y: 470, height: 150, pitchDeg: 25, f: 300, cx: W / 2, cy: H / 2 }

/** Affine-distorted, noisy inverse depth, like a relative depth network would give. */
function fakeNetworkOutput(seed = 3, noise = 0.0004) {
  const inv = renderRoomInverseDepth(cam, W, H, room)
  let s = seed
  const r = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647 - 0.5
  }
  const out = new Float32Array(inv.length)
  for (let i = 0; i < inv.length; i++) out[i] = 37 * inv[i] + 0.8 + noise * r()
  return out
}

const sheet = [
  { x: 190, y: 300 },
  { x: 211, y: 300 },
  { x: 211, y: 329.7 },
  { x: 190, y: 329.7 },
].map((p) => project(cam, p))

describe('analyzeDepth on a synthetic room', () => {
  const res = analyzeDepth({ width: W, height: H, data: fakeNetworkOutput() }, sheet)
  const backLeft = project(cam, { x: 0, y: 0 })
  const backRight = project(cam, { x: 400, y: 0 })

  it('finds the floor plane and a large floor region', () => {
    expect(res.floorPlane).not.toBeNull()
    expect(res.floorFraction).toBeGreaterThan(0.3)
    expect(res.planeInlierRatio).toBeGreaterThan(0.8)
  })

  it('finds three boundary lines (left wall, back wall, right wall)', () => {
    expect(res.lines.length).toBe(3)
    expect(res.lines.every((l) => l.refined)).toBe(true)
  })

  it('suggests both back corners within 3 px', () => {
    expect(res.corners.length).toBe(2)
    const [c0, c1] = res.corners
    expect(Math.hypot(c0.x - backLeft.x, c0.y - backLeft.y)).toBeLessThan(3)
    expect(Math.hypot(c1.x - backRight.x, c1.y - backRight.y)).toBeLessThan(3)
    expect(res.quality).toBeGreaterThan(0.7)
  })

  it('is invariant to the unknown affine scale of the depth output', () => {
    const base = fakeNetworkOutput(3, 0)
    const scaled = base.map((d) => 5 * d - 2)
    const r1 = analyzeDepth({ width: W, height: H, data: base }, sheet)
    const r2 = analyzeDepth({ width: W, height: H, data: scaled }, sheet)
    expect(r2.corners.length).toBe(r1.corners.length)
    r1.corners.forEach((c, i) => {
      expect(Math.abs(c.x - r2.corners[i].x)).toBeLessThan(0.5)
      expect(Math.abs(c.y - r2.corners[i].y)).toBeLessThan(0.5)
    })
  })

  it('fails gracefully on a depth map with no floor', () => {
    const flat = new Float32Array(W * H).fill(1)
    // Constant depth: a "floor" plane with b > 0 cannot exist.
    const r = analyzeDepth({ width: W, height: H, data: flat })
    expect(r.corners).toHaveLength(0)
    expect(r.notes.length).toBeGreaterThan(0)
  })
})

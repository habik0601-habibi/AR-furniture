import { describe, expect, it } from 'vitest'
import { measureFromPhoto } from './photoPipeline'
import { project, type Camera } from './syntheticCamera'
import type { Vec2 } from './types'

// 4000 x 3000 photo (12 MP phone), f = 3000 px (about 26 mm equivalent).
const W = 4000
const H = 3000
// Standing near the south wall of a 400 x 500 cm room, looking north, phone tilted down.
const cam: Camera = { x: 210, y: 560, height: 140, pitchDeg: 30, yawDeg: 8, f: 2900, cx: W / 2, cy: H / 2 }
const sheet = [
  { x: 190, y: 330 },
  { x: 211, y: 330 },
  { x: 211, y: 359.7 },
  { x: 190, y: 359.7 },
]
const tile = [
  { x: 170, y: 300 },
  { x: 230, y: 300 },
  { x: 230, y: 360 },
  { x: 170, y: 360 },
]

describe('photo pipeline end to end (synthetic photo)', () => {
  // The two back corners and a point on each side wall nearer the camera.
  const cornersWorld = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 380 },
    { x: 0, y: 380 },
  ]

  it('recovers the room exactly with perfect taps (3 visible corners + inferred 4th)', () => {
    const out = measureFromPhoto({
      imageWidth: W,
      imageHeight: H,
      refTaps: sheet.map((p) => project(cam, p)),
      refWidthCm: 21,
      refHeightCm: 29.7,
      corners: cornersWorld.slice(0, 3).map((p) => project(cam, p)),
      openings: [{ kind: 'window', a: project(cam, { x: 120, y: 0 }), b: project(cam, { x: 270, y: 0 }) }],
      heightCm: 275,
    })
    if ('error' in out) throw new Error(out.error)
    expect(out.result.room.width).toBe(400)
    expect(out.result.room.depth).toBe(380)
    expect(out.result.room.openings[0]).toMatchObject({ kind: 'window', wall: 'N', offset: 120, width: 150 })
    expect(out.result.method).toBe('photo')
  })

  it('linearised error model agrees with a Monte Carlo simulation of tapping noise', () => {
    // Gaussian tapping noise (sigma = 1.5 px per coordinate) on all 6 taps, 300 trials.
    const sigma = 1.5
    let s = 42
    const gauss = () => {
      s = (s * 16807) % 2147483647
      const u1 = Math.max(1e-12, s / 2147483647)
      s = (s * 16807) % 2147483647
      const u2 = s / 2147483647
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    }
    const noisy = (pts: Vec2[]) => pts.map((p) => ({ x: p.x + sigma * gauss(), y: p.y + sigma * gauss() }))
    const errs: number[] = []
    let modelSigma = 0
    for (let t = 0; t < 300; t++) {
      const out = measureFromPhoto({
        imageWidth: W,
        imageHeight: H,
        refTaps: noisy(tile.map((p) => project(cam, p))),
        refWidthCm: 60,
        refHeightCm: 60,
        corners: noisy(cornersWorld.slice(0, 2).map((p) => project(cam, p))),
        heightCm: 275,
        manualDepthCm: 500,
        sigmaPx: sigma,
      })
      if ('error' in out) throw new Error(out.error)
      errs.push(out.result.room.width - 400)
      modelSigma = out.edgeSigmas[0]
    }
    const rms = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length)
    expect(rms / modelSigma).toBeGreaterThan(0.75)
    expect(rms / modelSigma).toBeLessThan(1.3)
    // Back wall about 3 m from a 60 cm tile: a few percent.
    expect(rms).toBeLessThan(400 * 0.05)
  })

  it('reports lower confidence for an A4 sheet than for a 60 cm tile', () => {
    const base = {
      imageWidth: W,
      imageHeight: H,
      corners: cornersWorld.map((p) => project(cam, p)),
      heightCm: 275,
    }
    const a4 = measureFromPhoto({ ...base, refTaps: sheet.map((p) => project(cam, p)), refWidthCm: 21, refHeightCm: 29.7 })
    const t = measureFromPhoto({ ...base, refTaps: tile.map((p) => project(cam, p)), refWidthCm: 60, refHeightCm: 60 })
    if ('error' in a4 || 'error' in t) throw new Error('pipeline failed')
    expect(t.result.confidence).toBeGreaterThan(a4.result.confidence)
    expect(Math.max(...t.edgeSigmas)).toBeLessThan(Math.max(...a4.edgeSigmas))
  })

  it('rejects a corner above the horizon and asks for depth with one wall', () => {
    const refTaps = sheet.map((p) => project(cam, p))
    const above = measureFromPhoto({
      imageWidth: W,
      imageHeight: H,
      refTaps,
      refWidthCm: 21,
      refHeightCm: 29.7,
      corners: [project(cam, { x: 0, y: 0 }), { x: 2000, y: -4000 }],
      heightCm: 275,
    })
    expect('error' in above).toBe(true)
    const noDepth = measureFromPhoto({
      imageWidth: W,
      imageHeight: H,
      refTaps,
      refWidthCm: 21,
      refHeightCm: 29.7,
      corners: cornersWorld.slice(0, 2).map((p) => project(cam, p)),
      heightCm: 275,
    })
    expect('error' in noDepth).toBe(true)
  })

  it('marks AI-assisted results and lowers confidence when not reviewed', () => {
    const args = {
      imageWidth: W,
      imageHeight: H,
      refTaps: tile.map((p) => project(cam, p)),
      refWidthCm: 60,
      refHeightCm: 60,
      corners: cornersWorld.map((p) => project(cam, p)),
      heightCm: 275,
    }
    const reviewed = measureFromPhoto({ ...args, ai: { used: true, adjusted: true } })
    const blind = measureFromPhoto({ ...args, ai: { used: true, adjusted: false } })
    if ('error' in reviewed || 'error' in blind) throw new Error('pipeline failed')
    expect(reviewed.result.method).toBe('ai-photo')
    expect(blind.result.confidence).toBeLessThan(reviewed.result.confidence)
  })
})

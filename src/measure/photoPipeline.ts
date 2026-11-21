/**
 * Pure photo-measurement pipeline: reference taps + corner taps (image px) -> MeasuredRoom.
 * Used by PhotoMeasure and tested end to end on synthetic photos.
 */
import { add, buildRoom, confidenceFromRelativeError, distance, scale, sub } from './geometry'
import { applyH, isBelowHorizon, lengthSigma, solveReference, type ReferenceSolution } from './homography'
import type { MeasuredRoom, RawOpening, Vec2 } from './types'

export interface PhotoInputs {
  imageWidth: number
  imageHeight: number
  /** Four taps on the reference rectangle, any order. */
  refTaps: Vec2[]
  refWidthCm: number
  refHeightCm: number
  swap?: boolean
  /** Floor corners in tracing order (>= 2). */
  corners: Vec2[]
  openings?: { kind: 'door' | 'window'; a: Vec2; b: Vec2 }[]
  heightCm: number
  /** Used only when exactly two corners (one wall) were tapped. */
  manualDepthCm?: number
  /** Assumed 1-sigma tapping error per coordinate; default scales with resolution. */
  sigmaPx?: number
  ai?: { used: boolean; adjusted: boolean }
}

export interface PhotoOutput {
  result: MeasuredRoom
  solution: ReferenceSolution
  /** 1-sigma error (cm) of each traced edge. */
  edgeSigmas: number[]
  edgeLengths: number[]
}

export function defaultSigmaPx(w: number, h: number): number {
  return Math.max(1, 0.0006 * Math.max(w, h))
}

function quadArea(q: Vec2[]): number {
  let s = 0
  for (let i = 0; i < q.length; i++) s += q[i].x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * q[i].y
  return Math.abs(s) / 2
}

export function measureFromPhoto(inp: PhotoInputs): PhotoOutput | { error: string } {
  if (inp.refTaps.length !== 4) return { error: 'Tap the 4 corners of the reference.' }
  if (inp.corners.length < 2) return { error: 'Tap at least 2 floor corners.' }
  let solution: ReferenceSolution
  try {
    solution = solveReference(inp.refTaps, inp.refWidthCm, inp.refHeightCm, inp.imageWidth, inp.imageHeight, inp.swap)
  } catch {
    return { error: 'The reference corners do not form a usable shape.' }
  }
  const H = solution.H
  if (inp.corners.some((c) => !isBelowHorizon(H, c, solution.image)))
    return { error: 'A corner is above the floor horizon, so it cannot be on the floor.' }
  const sigmaPx = inp.sigmaPx ?? defaultSigmaPx(inp.imageWidth, inp.imageHeight)
  const notes: string[] = []

  let floorPoly = inp.corners.map((c) => applyH(H, c))
  if (floorPoly.length === 2) {
    const depth = inp.manualDepthCm ?? 0
    if (!(depth > 0)) return { error: 'Enter the room depth: only one wall was measured.' }
    const [p, q] = floorPoly
    const dir = sub(q, p)
    const len = Math.hypot(dir.x, dir.y) || 1
    let nrm = { x: -dir.y / len, y: dir.x / len }
    // The room extends towards the camera: the bottom-centre of the photo is on that side.
    const camSide = applyH(H, { x: inp.imageWidth / 2, y: inp.imageHeight - 1 })
    if ((camSide.x - p.x) * nrm.x + (camSide.y - p.y) * nrm.y < 0) nrm = scale(nrm, -1)
    floorPoly = [p, q, add(q, scale(nrm, depth)), add(p, scale(nrm, depth))]
    notes.push('Only one wall was measured from the photo; the room depth was typed in.')
  }
  const raw: RawOpening[] = (inp.openings ?? []).map((o) => ({ kind: o.kind, a: applyH(H, o.a), b: applyH(H, o.b) }))
  let built
  try {
    built = buildRoom(floorPoly, raw, inp.heightCm)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not build the room.' }
  }

  // Error model: propagate the tapping error into every traced edge.
  const n = inp.corners.length
  const m = n >= 3 ? n : 1
  const edgeSigmas: number[] = []
  const edgeLengths: number[] = []
  let worstRel = 0
  for (let i = 0; i < m; i++) {
    const a = inp.corners[i]
    const b = inp.corners[(i + 1) % n]
    const len = distance(applyH(H, a), applyH(H, b))
    const s = lengthSigma(solution.image, solution.world, a, b, sigmaPx)
    edgeSigmas.push(s)
    edgeLengths.push(len)
    if (len > 0) worstRel = Math.max(worstRel, s / len)
  }
  const fitRel = built.fit.residual / Math.max(1, Math.min(built.room.width, built.room.depth))
  let confidence = confidenceFromRelativeError(Math.max(worstRel, fitRel))
  if (!solution.plausible) {
    confidence *= 0.7
    notes.push('The reference corners do not look like a flat rectangle in perspective; check them.')
  }
  if (!solution.orientationConfident)
    notes.push('The photo is nearly top-down, so the long side of the reference was guessed from its shape.')
  if (quadArea(solution.image) / (inp.imageWidth * inp.imageHeight) < 0.005)
    notes.push('The reference covers less than 0.5% of the photo; move closer or use a bigger reference.')
  const refCentre = applyH(H, {
    x: solution.image.reduce((s, p) => s + p.x, 0) / 4,
    y: solution.image.reduce((s, p) => s + p.y, 0) / 4,
  })
  const farthest = Math.max(...floorPoly.map((p) => distance(p, refCentre)))
  if (farthest > 300)
    notes.push(`Some corners are ${(farthest / 100).toFixed(1)} m from the reference; accuracy is best within 2–3 m of it.`)
  if (inp.ai?.used) {
    notes.push(
      inp.ai.adjusted
        ? 'Corners were suggested by the AI depth model and adjusted by you.'
        : 'Corners were suggested by the AI depth model and accepted without changes.',
    )
    if (!inp.ai.adjusted) confidence *= 0.9
  }
  const worstSigma = Math.max(...edgeSigmas)
  notes.push(
    `Largest wall uncertainty about ±${Math.max(1, Math.round(worstSigma))} cm (1σ, assuming ±${sigmaPx.toFixed(1)} px tapping error).`,
  )
  notes.push(...built.notes)

  return {
    result: {
      room: built.room,
      polygon: built.polygon,
      method: inp.ai?.used ? 'ai-photo' : 'photo',
      confidence: Math.round(confidence * 100) / 100,
      notes,
    },
    solution,
    edgeSigmas,
    edgeLengths,
  }
}

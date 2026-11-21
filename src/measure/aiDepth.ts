/**
 * AI assist: monocular depth estimation (Depth Anything V2 Small, in the browser via
 * transformers.js) + geometric analysis that turns the depth map into floor-corner
 * suggestions. Runs in a Web Worker when possible, on the main thread otherwise.
 * The photo never leaves the device; only the model weights are downloaded (once,
 * then cached by the browser).
 */
import { analyzeDepth, type DepthAnalysis, type DepthMap } from './depthAnalysis'
import type { DepthDevice, DepthProgressEvent, DepthResultData } from './depthCore'
import type { Vec2 } from './types'

export { DEPTH_MODEL_ID } from './depthModel'
export type { DepthProgressEvent, DepthDevice } from './depthCore'

/** Long side of the image fed to the network (the model works at ~518 px anyway). */
const MAX_SIDE = 512

export interface DepthEstimate extends DepthMap {
  device: DepthDevice
  /** depth-map pixels per original image pixel. */
  scale: number
  /** Whether the Web Worker was used. */
  inWorker: boolean
}

function toRgba(image: HTMLImageElement | ImageBitmap): { rgba: Uint8ClampedArray; width: number; height: number; scale: number } {
  const iw = 'naturalWidth' in image ? image.naturalWidth : image.width
  const ih = 'naturalHeight' in image ? image.naturalHeight : image.height
  const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih))
  const width = Math.max(1, Math.round(iw * scale))
  const height = Math.max(1, Math.round(ih * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('Canvas 2D is not available')
  g.drawImage(image, 0, 0, width, height)
  return { rgba: g.getImageData(0, 0, width, height).data, width, height, scale: width / iw }
}

let worker: Worker | null = null
let workerBroken = false
let nextId = 1

function runInWorker(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  onProgress: (e: DepthProgressEvent) => void,
): Promise<DepthResultData> {
  if (!worker) worker = new Worker(new URL('./depthWorker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: 'progress'; id: number; event: DepthProgressEvent }
        | { type: 'result'; id: number; result: DepthResultData }
        | { type: 'error'; id: number; message: string }
      if (m.id !== id) return
      if (m.type === 'progress') onProgress(m.event)
      else {
        cleanup()
        if (m.type === 'result') resolve(m.result)
        else reject(new Error(m.message))
      }
    }
    const onError = (e: ErrorEvent) => {
      cleanup()
      workerBroken = true
      reject(new Error(e.message || 'Worker failed to start'))
    }
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage({ type: 'run', id, width, height, rgba }, [rgba.buffer])
  })
}

/**
 * Estimate relative inverse depth for a photo. Throws a readable Error on failure
 * (offline, out of memory, unsupported browser); callers fall back to manual tapping.
 */
export async function estimateDepth(
  image: HTMLImageElement | ImageBitmap,
  onProgress: (e: DepthProgressEvent) => void = () => {},
): Promise<DepthEstimate> {
  const { rgba, width, height, scale } = toRgba(image)
  let result: DepthResultData
  let inWorker = false
  if (typeof Worker !== 'undefined' && !workerBroken) {
    try {
      result = await runInWorker(rgba.slice(), width, height, onProgress)
      inWorker = true
    } catch (err) {
      if (!workerBroken) throw friendly(err)
      // The worker itself could not start (e.g. module workers unsupported): main thread.
      const { runDepth } = await import('./depthCore')
      result = await runDepth(rgba, width, height, onProgress).catch((e: unknown) => {
        throw friendly(e)
      })
    }
  } else {
    const { runDepth } = await import('./depthCore')
    result = await runDepth(rgba, width, height, onProgress).catch((e: unknown) => {
      throw friendly(e)
    })
  }
  return { ...result, scale: result.width / (width / scale), inWorker }
}

function friendly(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return new Error('You are offline, so the AI model could not be downloaded. Tap the corners by hand instead.')
  if (/memory|allocation|OOM/i.test(msg))
    return new Error('The phone ran out of memory running the AI model. Tap the corners by hand instead.')
  if (/fetch|network|Failed to load|404/i.test(msg))
    return new Error('The AI model could not be downloaded. Check the connection or tap the corners by hand.')
  return new Error(`Auto-detect failed (${msg}). Tap the corners by hand instead.`)
}

export interface AutoDetectResult {
  analysis: DepthAnalysis
  depth: DepthEstimate
  /** Suggested corners in original image pixels. */
  corners: Vec2[]
  /** Boundary segments in original image pixels. */
  lines: { p: Vec2; q: Vec2; refined: boolean }[]
  /** Semi-transparent floor-mask PNG (data URL) at depth-map resolution. */
  maskUrl: string
  /** Greyscale depth visualisation (data URL). */
  depthUrl: string
}

function maskToUrl(a: DepthAnalysis): string {
  const c = document.createElement('canvas')
  c.width = a.width
  c.height = a.height
  const g = c.getContext('2d')!
  const img = g.createImageData(a.width, a.height)
  for (let i = 0; i < a.floorMask.length; i++) {
    if (!a.floorMask[i]) continue
    img.data[i * 4] = 16
    img.data[i * 4 + 1] = 185
    img.data[i * 4 + 2] = 129
    img.data[i * 4 + 3] = 90
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

function depthToUrl(d: DepthMap): string {
  const c = document.createElement('canvas')
  c.width = d.width
  c.height = d.height
  const g = c.getContext('2d')!
  const img = g.createImageData(d.width, d.height)
  let lo = Infinity
  let hi = -Infinity
  for (const v of d.data) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const r = hi - lo || 1
  for (let i = 0; i < d.data.length; i++) {
    const v = Math.round(((d.data[i] - lo) / r) * 255)
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

/** Full AI step: depth network + floor/wall analysis, seeded by the reference sheet corners (image px). */
export async function autoDetectCorners(
  image: HTMLImageElement,
  referenceCorners: Vec2[] | undefined,
  onProgress?: (e: DepthProgressEvent) => void,
): Promise<AutoDetectResult> {
  const depth = await estimateDepth(image, onProgress)
  const s = depth.scale
  const seed = referenceCorners?.map((p) => ({ x: p.x * s, y: p.y * s }))
  const analysis = analyzeDepth(depth, seed)
  const back = (p: Vec2) => ({ x: p.x / s, y: p.y / s })
  return {
    analysis,
    depth,
    corners: analysis.corners.map(back),
    lines: analysis.lines.map((l) => ({ p: back(l.p), q: back(l.q), refined: l.refined })),
    maskUrl: maskToUrl(analysis),
    depthUrl: depthToUrl(depth),
  }
}

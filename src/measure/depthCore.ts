/**
 * Runs the monocular depth network with transformers.js. Shared by the Web Worker
 * (preferred) and the main-thread fallback. Only ever loaded on demand (worker
 * script, or a dynamic import on the main thread), so the library and the model
 * are fetched only when the user taps "Auto-detect". transformers.js is imported
 * statically here so the worker bundle needs no code splitting.
 */
import { env, pipeline, RawImage } from '@huggingface/transformers'
import { DEPTH_MODEL_ID } from './depthModel'

export { DEPTH_MODEL_ID }

export type DepthDevice = 'webgpu' | 'wasm'

export interface DepthProgressEvent {
  phase: 'download' | 'init' | 'inference'
  /** 0-1 across all model files, when known. */
  fraction?: number
  loadedBytes?: number
  totalBytes?: number
  device?: DepthDevice
}

export interface DepthResultData {
  width: number
  height: number
  data: Float32Array
  device: DepthDevice
}

interface DepthOutput {
  predicted_depth: { data: ArrayLike<number>; dims: number[] }
}
type DepthPipe = ((image: unknown) => Promise<DepthOutput | DepthOutput[]>) & { dispose?: () => Promise<void> }

let cached: { pipe: DepthPipe; device: DepthDevice } | null = null

interface GpuLike {
  requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null>
}

async function webgpuUsable(): Promise<boolean> {
  try {
    const gpu = (globalThis.navigator as unknown as { gpu?: GpuLike } | undefined)?.gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    // fp16 weights need the shader-f16 feature; without it, WASM is the safer path.
    return !!adapter && adapter.features.has('shader-f16')
  } catch {
    return false
  }
}

async function loadPipe(onProgress: (e: DepthProgressEvent) => void): Promise<{ pipe: DepthPipe; device: DepthDevice }> {
  if (cached) return cached
  env.allowLocalModels = false

  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (device: DepthDevice) => (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status === 'progress' && info.file) {
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      onProgress({ phase: 'download', fraction: total ? loaded / total : undefined, loadedBytes: loaded, totalBytes: total, device })
    } else if (info.status === 'ready') {
      onProgress({ phase: 'init', device })
    }
  }

  const attempts: { device: DepthDevice; dtype: 'fp16' | 'q8' }[] = []
  if (await webgpuUsable()) attempts.push({ device: 'webgpu', dtype: 'fp16' }) // ~50 MB
  attempts.push({ device: 'wasm', dtype: 'q8' }) // ~27 MB, int8 quantised

  let lastErr: unknown = null
  for (const a of attempts) {
    try {
      files.clear()
      const pipe = (await pipeline('depth-estimation', DEPTH_MODEL_ID, {
        device: a.device,
        dtype: a.dtype,
        progress_callback: progress_callback(a.device),
      })) as unknown as DepthPipe
      cached = { pipe, device: a.device }
      return cached
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not load the depth model')
}

/** Estimate relative inverse depth for an RGBA image (already downscaled by the caller). */
export async function runDepth(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  onProgress: (e: DepthProgressEvent) => void,
): Promise<DepthResultData> {
  const { pipe, device } = await loadPipe(onProgress)
  onProgress({ phase: 'inference', device })
  const image = new RawImage(rgba, width, height, 4)
  const out = await pipe(image)
  const first = Array.isArray(out) ? out[0] : out
  const pd = first.predicted_depth
  const [h, w] = pd.dims.slice(-2)
  return { width: w, height: h, data: Float32Array.from(pd.data), device }
}

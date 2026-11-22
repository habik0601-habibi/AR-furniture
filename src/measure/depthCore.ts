/**
 * Runs the monocular depth network with transformers.js. Shared by the Web Worker
 * (preferred) and the main-thread fallback. Only ever loaded on demand (worker
 * script, or a dynamic import on the main thread), so the library and the model
 * are fetched only when the user taps "Auto-detect". transformers.js is imported
 * statically here so the worker bundle needs no code splitting.
 *
 * Memory. The model's working memory grows with the square of the input size, and
 * phones have little to spare, so the input is kept small and the run steps down
 * a ladder when memory runs out (see `buildPlans`). Measured in Node with the same
 * int8 weights (scripts/depth-memory-probe.mjs):
 *
 *   input   extra memory   speed    depth map vs the 518 px default
 *   518 px  161 MB         413 ms   (reference)
 *   364 px  148 MB         353 ms   correlation 0.995
 *   266 px   68 MB         172 ms   correlation 0.986
 *   196 px   41 MB         122 ms   correlation 0.943
 *
 * and, at 266 px, switching off ONNX Runtime's memory arena cut the extra memory
 * from 68 MB to 9 MB. These are desktop numbers: the phone runs WebAssembly, so the
 * absolute figures differ. They have not been confirmed on a phone.
 */
import { env, pipeline, RawImage } from '@huggingface/transformers'
import { DEPTH_MODEL_ID } from './depthModel'
import { buildPlans, isPhoneLike, type DepthDevice, type DepthDtype, type DepthPlan } from './depthPlan'

export { DEPTH_MODEL_ID }

export type { DepthDevice }

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
  /** Long side the network actually ran at (a multiple of 14). */
  inputSize: number
}

interface DepthOutput {
  predicted_depth: { data: ArrayLike<number>; dims: number[] }
}
type DepthPipe = ((image: unknown) => Promise<DepthOutput | DepthOutput[]>) & {
  dispose?: () => Promise<void>
  processor?: { image_processor?: { size?: { width: number; height: number } } }
}

let cached: { pipe: DepthPipe; device: DepthDevice; dtype: DepthDtype } | null = null

interface GpuLike {
  requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null>
}

function nav(): { gpu?: GpuLike; userAgent?: string; maxTouchPoints?: number; deviceMemory?: number } | undefined {
  return globalThis.navigator as unknown as ReturnType<typeof nav>
}

async function webgpuUsable(): Promise<boolean> {
  try {
    const gpu = nav()?.gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    // fp16 weights need the shader-f16 feature; without it, WASM is the safer path.
    return !!adapter && adapter.features.has('shader-f16')
  } catch {
    return false
  }
}

async function disposeCached(): Promise<void> {
  const old = cached
  cached = null
  try {
    await old?.pipe.dispose?.()
  } catch {
    /* already gone */
  }
}

async function loadPipe(plan: DepthPlan, onProgress: (e: DepthProgressEvent) => void): Promise<DepthPipe> {
  if (cached && cached.device === plan.device && cached.dtype === plan.dtype) return cached.pipe
  await disposeCached()
  env.allowLocalModels = false

  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status === 'progress' && info.file) {
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      onProgress({ phase: 'download', fraction: total ? loaded / total : undefined, loadedBytes: loaded, totalBytes: total, device: plan.device })
    } else if (info.status === 'ready') {
      onProgress({ phase: 'init', device: plan.device })
    }
  }

  const pipe = (await pipeline('depth-estimation', DEPTH_MODEL_ID, {
    device: plan.device,
    dtype: plan.dtype,
    progress_callback,
    // ONNX Runtime keeps a large scratch arena by default; dropping it saved most of the
    // working memory in the desktop measurements above. CPU/WASM path only.
    ...(plan.device === 'wasm' ? { session_options: { enableMemPattern: false, enableCpuMemArena: false } } : {}),
  })) as unknown as DepthPipe
  cached = { pipe, device: plan.device, dtype: plan.dtype }
  return pipe
}

/** Estimate relative inverse depth for an RGBA image (already downscaled by the caller). */
export async function runDepth(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  onProgress: (e: DepthProgressEvent) => void,
): Promise<DepthResultData> {
  const plans = buildPlans({ phone: isPhoneLike(nav()), webgpu: await webgpuUsable() })
  let lastErr: unknown = null

  for (const plan of plans) {
    try {
      const pipe = await loadPipe(plan, onProgress)
      const ip = pipe.processor?.image_processor
      if (ip) ip.size = { width: plan.size, height: plan.size }
      onProgress({ phase: 'inference', device: plan.device })
      const out = await pipe(new RawImage(rgba, width, height, 4))
      const first = Array.isArray(out) ? out[0] : out
      const pd = first.predicted_depth
      const [h, w] = pd.dims.slice(-2)
      return { width: w, height: h, data: Float32Array.from(pd.data), device: plan.device, inputSize: plan.size }
    } catch (err) {
      lastErr = err
      // A run that failed part-way (typically out of memory) can leave the session unusable:
      // release it before trying the next, lighter rung.
      await disposeCached()
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not run the depth model')
}

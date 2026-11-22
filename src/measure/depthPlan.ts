/**
 * Which device and input size the depth model should try, and in what order.
 * Pure logic with no library imports, so it is unit-tested on its own; the model
 * itself is run by depthCore.ts. See the table in depthCore.ts for the measured
 * memory use at each size.
 */

export type DepthDevice = 'webgpu' | 'wasm'
export type DepthDtype = 'fp16' | 'q8'

/** One rung of the ladder: where to run, which weights, and at what input size. */
export interface DepthPlan {
  device: DepthDevice
  dtype: DepthDtype
  size: number
}

/** Input sizes are multiples of 14 (the network's patch size). */
export const SIZE_DESKTOP = 364
export const SIZE_PHONE = 266
export const SIZE_LOW = 196

export interface NavLike {
  gpu?: unknown
  userAgent?: string
  maxTouchPoints?: number
  deviceMemory?: number
}

/** Phones and tablets: where memory is tight and WebGPU memory is shared with everything else. */
export function isPhoneLike(n: NavLike | undefined): boolean {
  if (!n) return false
  const ua = n.userAgent ?? ''
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true
  if (/Macintosh/.test(ua) && (n.maxTouchPoints ?? 0) > 1) return true // iPadOS reports as a Mac
  return typeof n.deviceMemory === 'number' && n.deviceMemory <= 4
}

/**
 * The ladder of attempts. On a computer with WebGPU the GPU goes first; on a phone
 * it never does (its memory is shared with the page). Every other rung runs on the
 * CPU with the int8 weights at smaller and smaller inputs, so one failure steps
 * down instead of ending the feature.
 */
export function buildPlans(opts: { phone: boolean; webgpu: boolean }): DepthPlan[] {
  const plans: DepthPlan[] = []
  if (!opts.phone && opts.webgpu) plans.push({ device: 'webgpu', dtype: 'fp16', size: SIZE_DESKTOP })
  const cpuSizes = opts.phone ? [SIZE_PHONE, SIZE_LOW] : [SIZE_DESKTOP, SIZE_PHONE, SIZE_LOW]
  for (const size of cpuSizes) plans.push({ device: 'wasm', dtype: 'q8', size })
  return plans
}

// Measures the depth model's memory use and speed at different input sizes, and
// how much the depth map changes compared with the default 518 px.
//
// Runs the SAME model weights the phone downloads (Depth Anything V2 small, int8)
// through transformers.js in Node. Node uses native ONNX Runtime, the phone uses
// WebAssembly, so absolute numbers differ; the point is how memory scales with size.
//
// Usage: [LEAN=1] node scripts/depth-memory-probe.mjs <image> <size> [out.json]
//   LEAN=1 also turns off ONNX Runtime's memory arena and memory-pattern reuse.
//   size = 0 keeps the library default (518).
import { writeFileSync } from 'node:fs'
import { pipeline, RawImage, env } from '@huggingface/transformers'

const [, , imagePath, sizeArg = '0', outPath] = process.argv
const size = Number(sizeArg)
env.allowLocalModels = false

const mb = (n) => Math.round(n / 1048576)
const t0 = performance.now()
const pipe = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { device: 'cpu', dtype: 'q8', ...(process.env.LEAN === '1' ? { session_options: { enableMemPattern: false, enableCpuMemArena: false } } : {}) })
const loadMs = Math.round(performance.now() - t0)
const ip = pipe.processor.image_processor
if (size > 0) ip.size = { width: size, height: size }

const image = await RawImage.read(imagePath)
// the app downscales to at most 512 px before the model, do the same here
const scale = Math.min(1, 512 / Math.max(image.width, image.height))
const small = scale < 1 ? await image.resize(Math.round(image.width * scale), Math.round(image.height * scale)) : image

global.gc?.()
const rssBefore = process.memoryUsage().rss
let rssPeak = rssBefore
const timer = setInterval(() => {
  rssPeak = Math.max(rssPeak, process.memoryUsage().rss)
}, 10)
const t1 = performance.now()
const out = await pipe(small)
const inferMs = Math.round(performance.now() - t1)
clearInterval(timer)
rssPeak = Math.max(rssPeak, process.memoryUsage().rss)

const d = Array.isArray(out) ? out[0] : out
const grid = 48
const g = []
for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
  g.push(d.depth.data[Math.min(d.depth.height - 1, Math.floor((y + 0.5) * d.depth.height / grid)) * d.depth.width + Math.min(d.depth.width - 1, Math.floor((x + 0.5) * d.depth.width / grid))])
}
const result = {
  size: size || 518,
  imageProcessorSize: ip.size,
  loadMs,
  inferMs,
  rssBeforeMB: mb(rssBefore),
  rssPeakMB: mb(rssPeak),
  extraDuringInferenceMB: mb(rssPeak - rssBefore),
  tensorOut: d.predicted_depth?.dims,
  grid: g,
}
if (outPath) writeFileSync(outPath, JSON.stringify(result))
const { grid: _omit, ...print } = result
console.log(JSON.stringify(print))
process.exit(0)

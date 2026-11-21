/**
 * Web Worker that runs the depth network off the main thread so the UI stays
 * responsive on phones. Protocol:
 *   in:  { type: 'run', id, width, height, rgba: Uint8ClampedArray }
 *   out: { type: 'progress', id, event } | { type: 'result', id, result } | { type: 'error', id, message }
 */
import { runDepth } from './depthCore'

interface RunMsg {
  type: 'run'
  id: number
  width: number
  height: number
  rgba: Uint8ClampedArray
}

const ctx = self as unknown as {
  postMessage(msg: unknown, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<RunMsg>) => void) | null
}

ctx.onmessage = async (e) => {
  const msg = e.data
  if (msg.type !== 'run') return
  try {
    const result = await runDepth(msg.rgba, msg.width, msg.height, (event) =>
      ctx.postMessage({ type: 'progress', id: msg.id, event }),
    )
    ctx.postMessage({ type: 'result', id: msg.id, result }, [result.data.buffer])
  } catch (err) {
    ctx.postMessage({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}

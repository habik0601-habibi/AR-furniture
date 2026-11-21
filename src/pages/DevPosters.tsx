import { createElement, useEffect, useRef, useState } from 'react'
import '@google/model-viewer'
import { catalog } from '../data/catalog'

/**
 * Development tool (only routed in `npm run dev`): renders each catalogue
 * model once and saves a WebP poster through the dev server.
 */
type MV = HTMLElement & { toBlob(o: { mimeType: string; qualityArgument: number; idealAspect: boolean }): Promise<Blob>; loaded: boolean }

const only = new URLSearchParams(location.search).get('only')
const list = only ? catalog.filter((p) => p.slug === only) : catalog

export default function DevPosters() {
  const [log, setLog] = useState<string[]>([])
  const [i, setI] = useState(0)
  const ref = useRef<MV>(null)
  const product = list[i]

  useEffect(() => {
    const el = ref.current
    if (!el || !product) return
    let done = false
    const onLoad = async () => {
      if (done) return
      done = true
      await new Promise((r) => setTimeout(r, 900))
      const blob = await el.toBlob({ mimeType: 'image/webp', qualityArgument: 0.86, idealAspect: false })
      const res = await fetch(`/__dev/poster?slug=${product.slug}`, { method: 'POST', body: blob })
      setLog((l) => [...l, `${product.slug}: ${res.ok ? `${Math.round(blob.size / 1024)} KB` : 'failed'}`])
      setI((n) => n + 1)
    }
    el.addEventListener('load', onLoad)
    if (el.loaded) void onLoad()
    // the first model can finish loading before the listener is attached
    const fallback = setTimeout(() => { if (el.loaded) void onLoad() }, 4000)
    return () => { clearTimeout(fallback); el.removeEventListener('load', onLoad) }
  }, [product])

  return (
    <div className="p-6">
      <h1 className="text-2xl">Poster generator</h1>
      <p className="text-sm text-ink-2">{product ? `Rendering ${i + 1}/${list.length}: ${product.name}` : 'Done.'}</p>
      {product && (
        <div style={{ width: 800, height: 600, background: '#f3efe8' }}>
          {createElement('model-viewer', {
            key: product.slug,
            ref,
            src: product.model.glb,
            'camera-orbit': '32deg 72deg auto',
            'shadow-intensity': '1',
            'shadow-softness': '0.8',
            exposure: '1.05',
            'environment-image': 'neutral',
            style: { width: '100%', height: '100%', background: 'transparent' },
          })}
        </div>
      )}
      <pre className="mt-4 text-xs" id="poster-log">{log.join('\n')}</pre>
    </div>
  )
}

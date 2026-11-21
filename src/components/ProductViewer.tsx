/**
 * ProductViewer: a 3D / AR product view built on Google's <model-viewer>.
 *
 * - Scales the GLB per axis so it matches the selected size exactly (scale = dims / native).
 *   WebXR and the iOS Quick Look USDZ (made on the fly from the live scene) both show the true size.
 * - Tints the product's `tintMaterials` with the selected finish (sRGB hex -> linear) and eases
 *   the colour over about 220 ms.
 * - Optional dimension overlay (bounding-box lines + cm labels) and product hotspots.
 */
import '@google/model-viewer'
import type { ModelViewerElement } from '@google/model-viewer'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Dimensions } from '../engine/types'
import type { Product } from '../data/types'

export type ViewerEventName = 'viewer_loaded' | 'ar_started' | 'hotspot_opened'

export interface ProductViewerProps {
  product: Product
  sizeId: string
  finishId: string
  showDimensions: boolean
  showHotspots: boolean
  autoRotate?: boolean
  onArStatus?(status: string): void
  onEvent?(name: ViewerEventName, data?: Record<string, unknown>): void
  className?: string
}

// ---------- colour + geometry helpers ----------

type RGBA = [number, number, number, number]

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

function hexToLinear(hex: string): RGBA {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [1, 1, 1, 1]
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255), 1]
}

/** Velvet sheen: a lighter, slightly lifted version of the base colour. */
const sheenFor = (c: RGBA): [number, number, number] => [
  Math.min(1, c[0] * 1.6 + 0.08),
  Math.min(1, c[1] * 1.6 + 0.08),
  Math.min(1, c[2] * 1.6 + 0.08),
]

const fmt = (n: number) => String(Math.round(n * 10000) / 10000)

function scalePosition(position: string, s: [number, number, number]): string {
  const p = position.trim().split(/\s+/).map((v) => parseFloat(v))
  return `${fmt((p[0] ?? 0) * s[0])}m ${fmt((p[1] ?? 0) * s[1])}m ${fmt((p[2] ?? 0) * s[2])}m`
}

/** Corner points of the bounding box (metres) for the dimension overlay; origin = floor centre. */
function dimensionPoints(dims: Dimensions) {
  const x = dims.w / 200
  const z = dims.d / 200
  const y = dims.h / 100
  return {
    'dot-tl': [-x, y, z], // top front left
    'dot-tr': [x, y, z], // top front right
    'dot-br': [x, 0, z], // bottom front right
    'dot-bb': [x, 0, -z], // bottom back right
    'label-w': [0, y, z],
    'label-h': [x, y / 2, z],
    'label-d': [x, 0, 0],
  } as const
}
type DimKey = keyof ReturnType<typeof dimensionPoints>
const DIM_KEYS: DimKey[] = ['dot-tl', 'dot-tr', 'dot-br', 'dot-bb', 'label-w', 'label-h', 'label-d']
const DIM_LINES: [DimKey, DimKey][] = [
  ['dot-tl', 'dot-tr'],
  ['dot-tr', 'dot-br'],
  ['dot-br', 'dot-bb'],
]
const toPos = (p: readonly number[]) => `${fmt(p[0])}m ${fmt(p[1])}m ${fmt(p[2])}m`

// ---------- component ----------

type LoadState = 'loading' | 'ready' | 'error'

export function ProductViewer({
  product,
  sizeId,
  finishId,
  showDimensions,
  showHotspots,
  autoRotate = false,
  onArStatus,
  onEvent,
  className,
}: ProductViewerProps) {
  const mvRef = useRef<ModelViewerElement | null>(null)
  const lineRefs = useRef<(SVGLineElement | null)[]>([])
  const tweenRef = useRef<number | null>(null)
  const loadStartRef = useRef(0)
  const uid = useId().replace(/:/g, '')

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [progress, setProgress] = useState(0)
  const [canAR, setCanAR] = useState<boolean | null>(null)
  const [openHotspot, setOpenHotspot] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Keep the latest callbacks without re-binding listeners.
  const cbRef = useRef({ onArStatus, onEvent })
  cbRef.current = { onArStatus, onEvent }

  const size = product.sizes.find((s) => s.id === sizeId) ?? product.sizes[0]
  const finish = product.finishes.find((f) => f.id === finishId) ?? product.finishes[0]
  const { native } = product.model
  const scale = useMemo<[number, number, number]>(
    () => [size.dims.w / native.w, size.dims.h / native.h, size.dims.d / native.d],
    [size.dims.w, size.dims.h, size.dims.d, native.w, native.h, native.d],
  )
  const scaleAttr = `${fmt(scale[0])} ${fmt(scale[1])} ${fmt(scale[2])}`
  const slot = (name: string) => `hotspot-${uid}-${name}`

  // ----- tint -----
  const applyTint = useCallback(
    (animate: boolean) => {
      const mv = mvRef.current
      const materials = mv?.model?.materials
      if (!mv || !materials || !finish) return
      const target = hexToLinear(finish.color)
      const mats = product.model.tintMaterials
        .map((name) => materials.find((m) => m.name === name))
        .filter((m): m is NonNullable<typeof m> => m != null)
      if (!mats.length) return

      // The sheenColorFactor getter throws on materials without KHR_materials_sheen.
      const hasSheen = mats.map((m) => {
        try {
          const s = m.sheenColorFactor
          return !!s && s[0] + s[1] + s[2] > 0
        } catch {
          return false
        }
      })
      const set = (c: RGBA) =>
        mats.forEach((m, i) => {
          m.pbrMetallicRoughness.setBaseColorFactor(c)
          if (hasSheen[i]) m.setSheenColorFactor(sheenFor(c))
        })

      if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current)
      const reduceMotion =
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!animate || reduceMotion) {
        set(target)
        return
      }
      const from = [...mats[0].pbrMetallicRoughness.baseColorFactor] as RGBA
      const start = performance.now()
      const DURATION = 220
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION)
        const e = 1 - Math.pow(1 - t, 3)
        set([0, 1, 2, 3].map((i) => from[i] + (target[i] - from[i]) * e) as RGBA)
        tweenRef.current = t < 1 ? requestAnimationFrame(step) : null
      }
      tweenRef.current = requestAnimationFrame(step)
    },
    [finish, product.model.tintMaterials],
  )

  // ----- dimension lines -----
  const drawLines = useCallback(() => {
    const mv = mvRef.current
    if (!mv || !showDimensions) return
    DIM_LINES.forEach(([a, b], i) => {
      const line = lineRefs.current[i]
      const pa = mv.queryHotspot(slot(a))
      const pb = mv.queryHotspot(slot(b))
      if (!line || !pa || !pb) return
      line.setAttribute('x1', String(pa.canvasPosition.x))
      line.setAttribute('y1', String(pa.canvasPosition.y))
      line.setAttribute('x2', String(pb.canvasPosition.x))
      line.setAttribute('y2', String(pb.canvasPosition.y))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDimensions, uid])

  // Move hotspots to the scaled positions (model-viewer does not watch data-position).
  const syncHotspots = useCallback(() => {
    const mv = mvRef.current
    if (!mv || !mv.loaded) return
    const pts = dimensionPoints(size.dims)
    for (const key of DIM_KEYS) mv.updateHotspot({ name: slot(key), position: toPos(pts[key]) })
    for (const h of product.hotspots) {
      mv.updateHotspot({ name: slot(`p-${h.id}`), position: scalePosition(h.position, scale), normal: h.normal })
    }
    requestAnimationFrame(drawLines)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.dims, product.hotspots, scale, drawLines, uid])

  // ----- element events -----
  useEffect(() => {
    const mv = mvRef.current
    if (!mv) return
    setLoadState('loading')
    setProgress(0)
    setOpenHotspot(null)
    loadStartRef.current = performance.now()

    const onLoad = () => {
      setLoadState('ready')
      setCanAR(mv.canActivateAR)
      cbRef.current.onEvent?.('viewer_loaded', {
        productId: product.id,
        ms: Math.round(performance.now() - loadStartRef.current),
        ar: mv.canActivateAR,
      })
    }
    const onError = () => setLoadState('error')
    const onProgress = (e: Event) => {
      const p = (e as CustomEvent<{ totalProgress: number }>).detail?.totalProgress ?? 0
      setProgress(p)
    }
    const onAr = (e: Event) => {
      const status = (e as CustomEvent<{ status: string }>).detail?.status ?? 'unknown'
      cbRef.current.onArStatus?.(status)
      if (status === 'session-started') cbRef.current.onEvent?.('ar_started', { productId: product.id, mode: 'webxr' })
      if (status === 'failed') setCanAR(mv.canActivateAR)
    }
    mv.addEventListener('load', onLoad)
    mv.addEventListener('error', onError)
    mv.addEventListener('progress', onProgress)
    mv.addEventListener('ar-status', onAr)
    return () => {
      mv.removeEventListener('load', onLoad)
      mv.removeEventListener('error', onError)
      mv.removeEventListener('progress', onProgress)
      mv.removeEventListener('ar-status', onAr)
    }
  }, [product.id, product.model.glb, reloadKey])

  // After each load: tint, scale hotspots, frame the camera.
  useEffect(() => {
    if (loadState !== 'ready') return
    applyTint(false)
    syncHotspots()
    // only on (re)load; size/finish changes are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState])

  // Finish change -> eased tint.
  useEffect(() => {
    if (loadState === 'ready') applyTint(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish?.id, finish?.color])

  // Size change -> hotspots + re-frame (the `scale` attribute itself is applied by React).
  useEffect(() => {
    const mv = mvRef.current
    if (!mv || loadState !== 'ready') return
    syncHotspots()
    mv.updateFraming().then(() => requestAnimationFrame(drawLines)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleAttr])

  // Redraw dimension lines whenever the camera moves.
  useEffect(() => {
    const mv = mvRef.current
    if (!mv || !showDimensions) return
    const onCam = () => drawLines()
    mv.addEventListener('camera-change', onCam)
    window.addEventListener('resize', onCam)
    const raf = requestAnimationFrame(drawLines)
    return () => {
      mv.removeEventListener('camera-change', onCam)
      window.removeEventListener('resize', onCam)
      cancelAnimationFrame(raf)
    }
  }, [showDimensions, drawLines])

  // Escape closes an open hotspot card.
  useEffect(() => {
    if (!openHotspot) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenHotspot(null)
    }
    // A tap on the model (not on a hotspot, which stops propagation) closes the card.
    const mv = mvRef.current
    const onTap = () => setOpenHotspot(null)
    window.addEventListener('keydown', onKey)
    mv?.addEventListener('click', onTap)
    return () => {
      window.removeEventListener('keydown', onKey)
      mv?.removeEventListener('click', onTap)
    }
  }, [openHotspot])

  useEffect(() => () => {
    if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current)
  }, [])

  const toggleHotspot = (id: string, label: string) => {
    const next = openHotspot === id ? null : id
    setOpenHotspot(next)
    if (next) cbRef.current.onEvent?.('hotspot_opened', { productId: product.id, hotspotId: id, label })
  }

  const dimPts = dimensionPoints(size.dims)
  const cm = (n: number) => `${Math.round(n)} cm`
  const dimsVisible = showDimensions && loadState === 'ready'

  return (
    <div
      className={[
        'relative w-full overflow-hidden rounded-2xl bg-gradient-to-b from-stone-50 to-stone-200/70 ring-1 ring-stone-900/5',
        className ?? 'aspect-[4/3]',
      ].join(' ')}
    >
      <model-viewer
        key={`${product.id}-${reloadKey}`}
        ref={mvRef}
        src={product.model.glb}
        poster={product.model.poster}
        alt={`3D model of the ${product.name}`}
        loading="eager"
        reveal="auto"
        camera-controls
        touch-action="pan-y"
        interaction-prompt="auto"
        camera-orbit="25deg 75deg 108%"
        min-camera-orbit="auto 0deg auto"
        max-camera-orbit="auto 92deg auto"
        interpolation-decay="120"
        shadow-intensity="1"
        shadow-softness="0.9"
        environment-image="neutral"
        exposure="1.05"
        tone-mapping="neutral"
        auto-rotate={autoRotate || undefined}
        auto-rotate-delay="1500"
        rotation-per-second="18deg"
        scale={scaleAttr}
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="fixed"
        ar-placement="floor"
        className="block h-full w-full"
        style={{ backgroundColor: 'transparent', ['--poster-color' as string]: 'transparent' }}
      >
        {/* Loading skeleton */}
        <div slot="poster" className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="flex flex-col items-center gap-3">
            <div className="h-24 w-40 animate-pulse rounded-3xl bg-stone-300/60" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-stone-300/60" />
          </div>
        </div>

        {/* Progress bar */}
        <div slot="progress-bar" className="pointer-events-none absolute inset-x-0 top-0 h-1">
          <div
            role="progressbar"
            aria-label="Loading 3D model"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className={`h-full bg-amber-700/80 transition-[width,opacity] duration-300 ${
              progress >= 1 || loadState !== 'loading' ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>

        {/* AR button (model-viewer shows it only when AR can start) */}
        <button
          slot="ar-button"
          type="button"
          onClick={() => cbRef.current.onEvent?.('ar_started', { productId: product.id, mode: 'button' })}
          className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-stone-900/20 transition hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7L12 2.5Z" strokeLinejoin="round" />
            <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" strokeLinejoin="round" />
          </svg>
          View in your room
        </button>

        {/* Dimension overlay */}
        <svg
          className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-200 ${
            dimsVisible ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        >
          {DIM_LINES.map((_, i) => (
            <line
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              stroke="#44403c"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          ))}
        </svg>
        {DIM_KEYS.map((key) => {
          const isLabel = key.startsWith('label')
          const text = key === 'label-w' ? cm(size.dims.w) : key === 'label-h' ? cm(size.dims.h) : cm(size.dims.d)
          const axis = key === 'label-w' ? 'Width' : key === 'label-h' ? 'Height' : 'Depth'
          return (
            <div
              key={key}
              slot={slot(key)}
              data-position={toPos(dimPts[key])}
              className={`pointer-events-none transition-opacity duration-200 ${
                !dimsVisible ? 'opacity-0' : isLabel && openHotspot ? 'opacity-15' : 'opacity-100'
              }`}
              aria-hidden={!dimsVisible}
            >
              {isLabel ? (
                <span
                  className={`block rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-stone-800 tabular-nums shadow-sm ring-1 ring-stone-900/10 ${
                    key === 'label-w' ? '-translate-y-4' : key === 'label-h' ? 'translate-x-[calc(50%+10px)]' : 'translate-x-[calc(50%+10px)] translate-y-3'
                  }`}
                >
                  <span className="sr-only">{axis} </span>
                  {text}
                </span>
              ) : (
                <span className="block h-1.5 w-1.5 rounded-full bg-stone-700" />
              )}
            </div>
          )
        })}

        {/* Product hotspots */}
        {product.hotspots.map((h, i) => {
          const open = openHotspot === h.id
          const cardId = `${uid}-card-${h.id}`
          return (
            <div
              key={`${product.id}-${h.id}`}
              slot={slot(`p-${h.id}`)}
              data-position={scalePosition(h.position, scale)}
              data-normal={h.normal}
              data-visibility-attribute="visible"
              className={`group relative transition-opacity duration-200 ${
                showHotspots && loadState === 'ready' ? 'opacity-100' : 'pointer-events-none opacity-0'
              } ${open ? 'z-20' : 'z-10'}`}
            >
              <button
                type="button"
                tabIndex={showHotspots ? 0 : -1}
                aria-label={`${h.label}: show details`}
                aria-expanded={open}
                aria-controls={cardId}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleHotspot(h.id, h.label)
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold shadow-md ring-1 ring-stone-900/15 transition group-[:not([data-visible])]:opacity-50 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
                  open ? 'bg-amber-700 text-white' : 'bg-white/95 text-stone-800'
                }`}
              >
                {open ? '×' : i + 1}
              </button>
              {open && (
                <div
                  id={cardId}
                  role="region"
                  aria-label={h.label}
                  className="absolute bottom-9 left-1/2 w-56 -translate-x-1/2 rounded-xl bg-white p-3 text-left shadow-xl ring-1 ring-stone-900/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm font-semibold text-stone-900">{h.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{h.detail}</p>
                </div>
              )}
            </div>
          )
        })}
      </model-viewer>

      {/* Desktop / no-AR hint */}
      {loadState === 'ready' && canAR === false && (
        <div className="pointer-events-none absolute top-3 right-3 left-3 flex justify-start">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-xs text-stone-600 shadow-sm ring-1 ring-stone-900/5 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
              <path d="M10.5 18.5h3" strokeLinecap="round" />
            </svg>
            Open this page on your phone to place it in your room
          </p>
        </div>
      )}

      {/* Error state */}
      {loadState === 'error' && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-100/95 p-6 text-center">
          <p className="text-sm font-medium text-stone-800">We couldn't load the 3D model.</p>
          <p className="text-xs text-stone-500">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* Size / finish caption for screen readers */}
      <p className="sr-only" aria-live="polite">
        {`${product.name}, ${size.label}, ${finish?.name ?? ''}. ${size.dims.w} by ${size.dims.d} by ${size.dims.h} centimetres.`}
      </p>
    </div>
  )
}

export default ProductViewer

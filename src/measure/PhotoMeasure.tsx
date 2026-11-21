/**
 * Photo mode (any phone, including iPhone): planar homography from a reference
 * rectangle lying on the floor, optional AI auto-detection of the floor corners.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { autoDetectCorners, DEPTH_MODEL_ID, type AutoDetectResult, type DepthProgressEvent } from './aiDepth'
import { distance } from './geometry'
import { applyH, isBelowHorizon, lengthSigma, solveReference, type ReferenceSolution } from './homography'
import { PhotoStage, type StageLayer } from './PhotoStage'
import { RoomPlanPreview } from './RoomPlanPreview'
import { defaultSigmaPx, measureFromPhoto } from './photoPipeline'
import type { MeasuredRoom, Vec2 } from './types'
import { Btn, ConfidenceBar, Icon, LengthInput, Notice, Steps, UnitToggle, type LengthUnit } from './ui'
import { formatFeet } from './units'

export interface PhotoMeasureProps {
  onDone(result: MeasuredRoom): void
  onCancel?(): void
}

type RefKind = 'a4' | 'tile60' | 'tile2ft' | 'custom'
const REFS: Record<Exclude<RefKind, 'custom'>, { label: string; w: number; h: number; note: string }> = {
  a4: { label: 'A4 paper', w: 21, h: 29.7, note: '21 × 29.7 cm, any printer paper' },
  tile60: { label: 'Floor tile 60×60 cm', w: 60, h: 60, note: 'Larger reference, better accuracy' },
  tile2ft: { label: 'Floor tile 2×2 ft', w: 60.96, h: 60.96, note: '24 × 24 inch tile' },
}

const STEPS = ['Photo', 'Reference', 'Room corners', 'Doors & windows', 'Review']

interface Img {
  url: string
  width: number
  height: number
  el: HTMLImageElement
}

interface AiState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress?: DepthProgressEvent
  error?: string
  result?: AutoDetectResult
  showDepth?: boolean
}

function progressText(p?: DepthProgressEvent): string {
  if (!p) return 'Starting…'
  const dev = p.device === 'webgpu' ? 'GPU' : 'CPU'
  if (p.phase === 'download') {
    const mb = p.totalBytes ? ` of ${(p.totalBytes / 1e6).toFixed(0)} MB` : ''
    return `Downloading AI model${mb}${p.fraction !== undefined ? ` (${Math.round(p.fraction * 100)}%)` : ''}…`
  }
  if (p.phase === 'init') return `Preparing model on ${dev}…`
  return `Estimating depth on ${dev}…`
}

export function PhotoMeasure({ onDone, onCancel }: PhotoMeasureProps) {
  const [step, setStep] = useState(0)
  const [refKind, setRefKind] = useState<RefKind>('a4')
  const [custom, setCustom] = useState({ w: 50, h: 80 })
  const [img, setImg] = useState<Img | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refPts, setRefPts] = useState<Vec2[]>([])
  const [swap, setSwap] = useState(false)
  const [corners, setCorners] = useState<Vec2[]>([])
  const [openings, setOpenings] = useState<{ kind: 'door' | 'window'; a: Vec2; b: Vec2 }[]>([])
  const [pending, setPending] = useState<Vec2[]>([])
  const [openingKind, setOpeningKind] = useState<'door' | 'window'>('door')
  const [height, setHeight] = useState(275)
  const [manualDepth, setManualDepth] = useState(400)
  const [unit, setUnit] = useState<LengthUnit>('cm')
  const [ai, setAi] = useState<AiState>({ status: 'idle' })
  const [aiAdjusted, setAiAdjusted] = useState(false)
  const urlRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const refDims = refKind === 'custom' ? custom : REFS[refKind]
  const sigmaPx = img ? defaultSigmaPx(img.width, img.height) : 1.5

  const solution: ReferenceSolution | null = useMemo(() => {
    if (!img || refPts.length !== 4 || !(refDims.w > 0 && refDims.h > 0)) return null
    try {
      return solveReference(refPts, refDims.w, refDims.h, img.width, img.height, swap)
    } catch {
      return null
    }
  }, [img, refPts, refDims.w, refDims.h, swap])

  const toFloor = (p: Vec2) => (solution ? applyH(solution.H, p) : p)
  const aboveHorizon = solution ? corners.some((c) => !isBelowHorizon(solution.H, c, solution.image)) : false

  const edgeLabels = (pts: Vec2[], closed: boolean, withSigma: boolean): (string | null)[] => {
    if (!solution) return []
    const out: (string | null)[] = []
    const n = pts.length
    const m = closed && n >= 3 ? n : n - 1
    for (let i = 0; i < m; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      if (!isBelowHorizon(solution.H, a, solution.image) || !isBelowHorizon(solution.H, b, solution.image)) {
        out.push('?')
        continue
      }
      const len = distance(toFloor(a), toFloor(b))
      if (withSigma) {
        const s = lengthSigma(solution.image, solution.world, a, b, sigmaPx)
        out.push(`${Math.round(len)} ± ${Math.max(1, Math.round(s))} cm`)
      } else out.push(`${Math.round(len)} cm`)
    }
    return out
  }

  // ---- Review computation -------------------------------------------------
  const review = useMemo(() => {
    if (!img || refPts.length !== 4 || corners.length < 2) return null
    const out = measureFromPhoto({
      imageWidth: img.width,
      imageHeight: img.height,
      refTaps: refPts,
      refWidthCm: refDims.w,
      refHeightCm: refDims.h,
      swap,
      corners,
      openings,
      heightCm: height,
      manualDepthCm: manualDepth,
      sigmaPx,
      ai: { used: ai.status === 'done' && !!ai.result, adjusted: aiAdjusted },
    })
    return 'error' in out ? null : out.result
  }, [img, refPts, refDims.w, refDims.h, swap, corners, openings, height, manualDepth, sigmaPx, ai.status, ai.result, aiAdjusted])

  // ---- Handlers -------------------------------------------------------------
  const onFile = (file: File | undefined) => {
    if (!file) return
    setLoadError(null)
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      setImg({ url, width: el.naturalWidth, height: el.naturalHeight, el })
      setRefPts([])
      setCorners([])
      setOpenings([])
      setPending([])
      setAi({ status: 'idle' })
      setSwap(false)
      setStep(1)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      setLoadError('That file could not be opened as an image. Try a JPEG or PNG photo.')
    }
    el.src = url
  }

  const runAi = async () => {
    if (!img) return
    setAi({ status: 'running' })
    try {
      const result = await autoDetectCorners(img.el, solution?.image, (p) => setAi((s) => ({ ...s, progress: p })))
      let suggested = result.corners
      if (suggested.length === 0 && result.lines.length > 0) {
        const longest = [...result.lines].sort((a, b) => distance(b.p, b.q) - distance(a.p, a.q))[0]
        suggested = [longest.p, longest.q]
      }
      if (suggested.length === 0) {
        setAi({
          status: 'error',
          error: result.analysis.notes[0] ?? 'The AI could not find the floor edges in this photo. Tap the corners by hand.',
          result,
        })
        return
      }
      setCorners(suggested)
      setAiAdjusted(false)
      setAi({ status: 'done', result })
    } catch (err) {
      setAi({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ---- Rendering --------------------------------------------------------------
  const refLabels = solution
    ? solution.world.map((w, i) => {
        const nx = solution.world[(i + 1) % 4]
        return `${+distance(w, nx).toFixed(1)} cm`
      })
    : []
  const refLayer: StageLayer = {
    id: 'ref',
    points: solution ? solution.image : refPts,
    color: '#f97316',
    closed: true,
    edgeLabels: step === 1 ? refLabels : undefined,
    handles: step === 1,
  }
  const cornerLayer: StageLayer = {
    id: 'corners',
    points: corners,
    color: '#0284c7',
    closed: corners.length >= 3,
    numbered: step === 2,
    handles: step === 2,
    edgeLabels: step >= 2 ? edgeLabels(corners, corners.length >= 3, step === 4) : undefined,
  }
  const openingLayers: StageLayer[] = openings.map((o, i) => ({
    id: `op${i}`,
    points: [o.a, o.b],
    color: o.kind === 'door' ? '#b45309' : '#7c3aed',
    handles: false,
    edgeLabels: step >= 3 ? edgeLabels([o.a, o.b], false, false) : undefined,
  }))
  const pendingLayer: StageLayer = { id: 'pending', points: pending, color: openingKind === 'door' ? '#b45309' : '#7c3aed' }

  const aiUnderlay = (u: number): ReactNode => {
    if (step !== 2 || ai.status !== 'done' || !ai.result || !img) return null
    return (
      <g>
        <image
          href={ai.showDepth ? ai.result.depthUrl : ai.result.maskUrl}
          x={0}
          y={0}
          width={img.width}
          height={img.height}
          preserveAspectRatio="none"
          opacity={ai.showDepth ? 0.85 : 1}
        />
        {ai.result.lines.map((l, i) => (
          <line
            key={i}
            x1={l.p.x}
            y1={l.p.y}
            x2={l.q.x}
            y2={l.q.y}
            stroke="#059669"
            strokeWidth={2.5 * u}
            strokeDasharray={`${6 * u} ${4 * u}`}
          />
        ))}
      </g>
    )
  }

  const header = (
    <div className="mb-3 flex items-center justify-between gap-2">
      <Btn
        variant="ghost"
        onClick={() => (step === 0 ? onCancel?.() : setStep(step - 1))}
        aria-label={step === 0 ? 'Back to measurement options' : 'Previous step'}
      >
        <Icon name="back" /> Back
      </Btn>
      <span className="text-sm font-semibold text-slate-900">Measure from a photo</span>
    </div>
  )

  return (
    <div className="space-y-4">
      {header}
      <Steps steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 font-semibold text-slate-900">1. What will you put on the floor?</legend>
            <div className="grid gap-2">
              {(Object.keys(REFS) as Exclude<RefKind, 'custom'>[]).map((k) => (
                <label
                  key={k}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ${refKind === k ? 'bg-orange-50 ring-orange-400' : 'ring-slate-200'}`}
                >
                  <input type="radio" name="ref" className="h-5 w-5" checked={refKind === k} onChange={() => setRefKind(k)} />
                  <span>
                    <span className="block font-medium text-slate-900">{REFS[k].label}</span>
                    <span className="block text-xs text-slate-500">{REFS[k].note}</span>
                  </span>
                </label>
              ))}
              <label
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ${refKind === 'custom' ? 'bg-orange-50 ring-orange-400' : 'ring-slate-200'}`}
              >
                <input type="radio" name="ref" className="h-5 w-5" checked={refKind === 'custom'} onChange={() => setRefKind('custom')} />
                <span>
                  <span className="block font-medium text-slate-900">Something else rectangular</span>
                  <span className="block text-xs text-slate-500">A rug, door mat or board whose size you know</span>
                </span>
              </label>
              {refKind === 'custom' && (
                <div className="grid grid-cols-2 gap-3 pl-2">
                  <LengthInput label="Width" valueCm={custom.w} onChange={(w) => setCustom((c) => ({ ...c, w }))} unit="cm" min={5} />
                  <LengthInput label="Length" valueCm={custom.h} onChange={(h) => setCustom((c) => ({ ...c, h }))} unit="cm" min={5} />
                </div>
              )}
            </div>
          </fieldset>
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">2. Take the photo</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Lay it flat on the floor, about 1 m in front of the wall you most want to measure (error grows with distance from it).</li>
              <li>Stand in a doorway or corner, phone at chest height, tilted down a little.</li>
              <li>Make sure the corners where walls meet the floor are in the picture.</li>
              <li>Use the normal 1× camera, not the 0.5× ultra-wide (it bends straight lines).</li>
            </ul>
            <p className="text-xs text-slate-500">Accuracy is best within 2–3 m of the reference. A bigger reference gives better results.</p>
          </div>
          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-base font-semibold text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-600">
            <Icon name="camera" />
            Take or choose photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {img && (
            <Btn className="w-full" onClick={() => setStep(1)}>
              Continue with the current photo
            </Btn>
          )}
          {loadError && <Notice tone="error">{loadError}</Notice>}
        </div>
      )}

      {step >= 1 && img && (
        <PhotoStage
          src={img.url}
          width={img.width}
          height={img.height}
          alt="Room photo"
          layers={[refLayer, ...openingLayers, cornerLayer, pendingLayer]}
          activeLayer={step === 1 ? 'ref' : step === 2 ? 'corners' : step === 3 ? 'pending' : null}
          underlay={aiUnderlay}
          onAdd={(p) => {
            if (step === 1) {
              if (refPts.length >= 4) return null
              setRefPts((r) => [...r, p])
              return refPts.length
            }
            if (step === 2) {
              if (corners.length >= 8) return null
              setCorners((c) => [...c, p])
              if (ai.status === 'done') setAiAdjusted(true)
              return corners.length
            }
            if (step === 3) {
              const next = [...pending, p]
              if (next.length === 2) {
                setOpenings((o) => [...o, { kind: openingKind, a: next[0], b: next[1] }])
                setPending([])
                return null
              }
              setPending(next)
              return null
            }
            return null
          }}
          onMove={(layer, i, p) => {
            if (layer === 'ref') {
              // Handles are drawn in solved (clockwise) order once 4 points exist; keep that order.
              setRefPts((r) => {
                const base = r.length === 4 && solution ? [...solution.image] : [...r]
                if (i >= base.length) return r
                base[i] = p
                return base
              })
            } else if (layer === 'corners') {
              setCorners((c) => (i < c.length ? c.map((q, j) => (j === i ? p : q)) : c))
              if (ai.status === 'done') setAiAdjusted(true)
            }
          }}
        />
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Tap the <strong>4 corners</strong> of the {refKind === 'a4' ? 'sheet' : 'reference'} in any order. Drag a corner to fine-tune it; a
            magnifier appears above your finger.
          </p>
          {refPts.length === 4 && !solution && <Notice tone="error">Those 4 points do not form a usable shape. Undo and tap again.</Notice>}
          {solution && !solution.plausible && (
            <Notice tone="warn">These corners do not look like a flat rectangle seen in perspective. Check that each one sits exactly on a corner.</Notice>
          )}
          {solution && (
            <p className="text-xs text-slate-500">
              The labels show which side is which. If the long and short sides are swapped, tap “Swap sides”.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => setRefPts((r) => r.slice(0, -1))} disabled={!refPts.length}>
              <Icon name="undo" /> Undo
            </Btn>
            {solution && Math.abs(refDims.w - refDims.h) > 0.01 && (
              <Btn onClick={() => setSwap((s) => !s)}>
                <Icon name="swap" /> Swap sides
              </Btn>
            )}
            <Btn variant="primary" className="ml-auto" disabled={!solution} onClick={() => setStep(2)}>
              Next
            </Btn>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Tap each visible <strong>floor corner</strong> (where two walls meet the floor), going around the room in order. The first wall you trace
            becomes the top (north) wall of the plan. Two corners are enough to measure one wall.
          </p>
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <div className="flex items-start gap-3">
              <Icon name="sparkle" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div className="flex-1 text-sm text-emerald-900">
                <p className="font-semibold">Auto-detect with AI</p>
                <p className="text-xs">
                  A depth-estimation network (Depth Anything V2, ~27–50 MB, downloaded once) runs on your phone, finds the floor and suggests corners
                  for you to check. Your photo is not uploaded.
                </p>
                {ai.status === 'running' && (
                  <div className="mt-2" role="status" aria-live="polite">
                    <p className="text-xs">{progressText(ai.progress)}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-200">
                      <div
                        className={`h-full bg-emerald-600 ${ai.progress?.fraction === undefined ? 'w-1/3 animate-pulse' : ''}`}
                        style={ai.progress?.fraction !== undefined ? { width: `${Math.round((ai.progress.fraction ?? 0) * 100)}%` } : undefined}
                      />
                    </div>
                  </div>
                )}
                {ai.status === 'done' && ai.result && (
                  <p className="mt-2 text-xs">
                    Floor shaded green, detected wall edges dashed. Suggested {corners.length} point{corners.length === 1 ? '' : 's'}; drag them if
                    they are off. Ran on {ai.result.depth.device === 'webgpu' ? 'WebGPU' : 'WebAssembly (CPU)'}
                    {ai.result.depth.inWorker ? ' in a background worker' : ''}. Detection quality {Math.round(ai.result.analysis.quality * 100)}%.
                    {ai.result.analysis.notes.map((n) => ` ${n}`)}
                  </p>
                )}
                {ai.status === 'error' && <p className="mt-2 text-xs text-red-700">{ai.error}</p>}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn variant="secondary" onClick={runAi} disabled={ai.status === 'running'}>
                <Icon name="sparkle" /> {ai.status === 'done' ? 'Run again' : 'Auto-detect corners'}
              </Btn>
              {ai.status === 'done' && (
                <Btn variant="ghost" onClick={() => setAi((s) => ({ ...s, showDepth: !s.showDepth }))} aria-pressed={!!ai.showDepth}>
                  {ai.showDepth ? 'Show floor' : 'Show depth map'}
                </Btn>
              )}
            </div>
          </div>
          {aboveHorizon && <Notice tone="error">A corner is above the floor’s horizon line, so it cannot be on the floor. Move it down.</Notice>}
          {corners.length === 2 && <Notice>With two corners only one wall is measured; you will type the room depth on the review step.</Notice>}
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => setCorners((c) => c.slice(0, -1))} disabled={!corners.length}>
              <Icon name="undo" /> Undo
            </Btn>
            <Btn onClick={() => setCorners([])} disabled={!corners.length}>
              <Icon name="restart" /> Clear
            </Btn>
            <Btn variant="primary" className="ml-auto" disabled={corners.length < 2 || aboveHorizon} onClick={() => setStep(3)}>
              Next
            </Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Optional. Choose door or window, then tap its <strong>two ends</strong> along the bottom of the wall (on the floor line).
          </p>
          <div role="radiogroup" aria-label="Opening type" className="flex gap-2">
            {(['door', 'window'] as const).map((k) => (
              <Btn key={k} variant={openingKind === k ? 'primary' : 'secondary'} role="radio" aria-checked={openingKind === k} onClick={() => setOpeningKind(k)}>
                <Icon name={k} /> {k === 'door' ? 'Door' : 'Window'}
              </Btn>
            ))}
          </div>
          {pending.length === 1 && <p className="text-sm font-medium text-orange-700">Now tap the other end.</p>}
          <ul className="space-y-1">
            {openings.map((o, i) => (
              <li key={i} className="flex min-h-11 items-center justify-between rounded-xl px-3 ring-1 ring-slate-200">
                <span className="text-sm">
                  {o.kind === 'door' ? 'Door' : 'Window'} {i + 1}: {solution ? Math.round(distance(toFloor(o.a), toFloor(o.b))) : '?'} cm
                </span>
                <Btn variant="ghost" aria-label={`Remove ${o.kind} ${i + 1}`} onClick={() => setOpenings((os) => os.filter((_, j) => j !== i))}>
                  <Icon name="trash" />
                </Btn>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Btn variant="primary" className="ml-auto" onClick={() => setStep(4)}>
              {openings.length ? 'Next' : 'Skip'}
            </Btn>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Result</h3>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
          {corners.length === 2 && (
            <LengthInput label="Room depth (from the measured wall to the opposite wall)" valueCm={manualDepth} onChange={setManualDepth} unit={unit} min={100} />
          )}
          <LengthInput label="Ceiling height" valueCm={height} onChange={setHeight} unit={unit} min={180} hint="Not measurable from a floor photo. Typical: 275 cm (9 ft)." />
          {review ? (
            <>
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <RoomPlanPreview room={review.room} polygon={review.polygon} className="mx-auto h-auto max-h-80 w-full" />
                <p className="mt-2 text-center text-sm text-slate-700">
                  {review.room.width} × {review.room.depth} cm ({formatFeet(review.room.width)} × {formatFeet(review.room.depth)})
                </p>
              </div>
              <ConfidenceBar value={review.confidence} />
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                {review.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">
                AI model: {DEPTH_MODEL_ID}. Measurements come from the reference-sheet geometry, not from the AI.
              </p>
              <Btn variant="primary" className="w-full" onClick={() => onDone(review)}>
                <Icon name="check" /> Use this room
              </Btn>
            </>
          ) : (
            <Notice tone="error">Could not build a room from these points. Go back and check the reference and the corners.</Notice>
          )}
        </div>
      )}
    </div>
  )
}

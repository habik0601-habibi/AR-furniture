/**
 * AR mode (Android Chrome with ARCore): WebXR `immersive-ar` session with hit-test.
 * The user taps the room's floor corners; the polygon is fitted to a Room.
 * Written against the WebXR Device API + Hit Test + DOM Overlay specs; it can only
 * be exercised on a real device served over HTTPS.
 */
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import * as THREE from 'three'
import { buildRoom, distance } from './geometry'
import { RoomPlanPreview } from './RoomPlanPreview'
import type { MeasuredRoom, RawOpening, Vec2 } from './types'
import { Btn, ConfidenceBar, Icon, LengthInput, Notice } from './ui'
import { formatFeet } from './units'

export interface ArMeasureProps {
  onDone(result: MeasuredRoom): void
  onCancel?(): void
}

type Phase = 'intro' | 'starting' | 'corners' | 'openings' | 'review'

interface Data {
  points: THREE.Vector3[]
  closed: boolean
  openings: { kind: 'door' | 'window'; a: THREE.Vector3; b: THREE.Vector3 }[]
  pending: THREE.Vector3[]
}

/** Is WebXR immersive AR available in this browser? Resolves false on any error. */
export async function isArSupported(): Promise<boolean> {
  try {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr
    if (!xr) return false
    return await xr.isSessionSupported('immersive-ar')
  } catch {
    return false
  }
}

const SNAP_CLOSE_M = 0.2
const FLOOR_TOL_M = 0.12
const NO_FLOOR_MS = 10_000

const toPlan = (v: THREE.Vector3): Vec2 => ({ x: v.x * 100, y: v.z * 100 }) // m -> cm; x right, z towards viewer = plan y

export function ArMeasure({ onDone, onCancel }: ArMeasureProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const liveTextRef = useRef<HTMLSpanElement>(null)
  const [phase, setPhaseState] = useState<Phase>('intro')
  const phaseRef = useRef<Phase>('intro')
  const setPhase = (p: Phase) => {
    phaseRef.current = p
    setPhaseState(p)
  }
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const data = useRef<Data>({ points: [], closed: false, openings: [], pending: [] })
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [floorFound, setFloorFound] = useState(false)
  const [choosingKind, setChoosingKind] = useState(false)
  const [height, setHeight] = useState(275)
  const choosingRef = useRef(false)
  const floorFoundRef = useRef(false)

  const xr = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    session: XRSession
    hitSource: XRHitTestSource | null
    reticle: THREE.Mesh
    live: THREE.Line
    shapes: THREE.Group
    timer: number
    floorY: number | null
    hit: THREE.Vector3 | null
  } | null>(null)

  /** Rebuild markers and lines after the point list changes. */
  const redraw = useCallback(() => {
    const s = xr.current
    if (!s) return
    s.shapes.clear()
    const d = data.current
    const markerGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.01, 20)
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xf97316 })
    for (const p of d.points) {
      const m = new THREE.Mesh(markerGeo, markerMat)
      m.position.copy(p)
      s.shapes.add(m)
    }
    if (d.points.length >= 2) {
      const pts = d.closed ? [...d.points, d.points[0]] : d.points
      s.shapes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })))
    }
    for (const o of d.openings) {
      const color = o.kind === 'door' ? 0xf59e0b : 0x38bdf8
      const up = new THREE.Vector3(0, 0.02, 0)
      s.shapes.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([o.a.clone().add(up), o.b.clone().add(up)]),
          new THREE.LineBasicMaterial({ color }),
        ),
      )
    }
    for (const p of d.pending) {
      const m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }))
      m.position.copy(p)
      s.shapes.add(m)
    }
  }, [])

  const teardown = useCallback(() => {
    const s = xr.current
    if (!s) return
    window.clearTimeout(s.timer)
    s.renderer.setAnimationLoop(null)
    try {
      s.hitSource?.cancel()
    } catch {
      /* already cancelled */
    }
    s.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose?.()
    })
    s.renderer.dispose()
    s.renderer.domElement.remove()
    xr.current = null
  }, [])

  useEffect(
    () => () => {
      const s = xr.current
      if (s) {
        s.session.end().catch(() => {})
        teardown()
      }
    },
    [teardown],
  )

  const onSelect = useCallback(() => {
    const s = xr.current
    if (!s || !s.hit) return
    const d = data.current
    const p = s.hit.clone()
    if (phaseRef.current === 'corners' && !d.closed) {
      if (d.points.length >= 3 && p.distanceTo(d.points[0]) < SNAP_CLOSE_M) {
        d.closed = true
        setPhase('openings')
      } else {
        d.points.push(p)
      }
    } else if (phaseRef.current === 'openings' && !choosingRef.current) {
      d.pending.push(p)
      if (d.pending.length === 2) {
        choosingRef.current = true
        setChoosingKind(true)
      }
    }
    redraw()
    bump()
  }, [redraw])

  const start = async () => {
    setError(null)
    setHint(null)
    const nav = navigator as Navigator & { xr?: XRSystem }
    if (!nav.xr) {
      setError('WebXR is not available in this browser. Use Chrome on an ARCore-capable Android phone, or the photo method.')
      return
    }
    // The overlay root must be in the DOM and visible before the session starts.
    flushSync(() => setPhase('starting'))
    const root = overlayRef.current!
    let session: XRSession
    try {
      session = await nav.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor', 'anchors'],
        domOverlay: { root },
      })
    } catch (err) {
      setPhase('intro')
      const name = err instanceof DOMException ? err.name : ''
      setError(
        name === 'NotSupportedError'
          ? 'This phone or browser does not support AR with floor detection. Use the photo method instead.'
          : name === 'SecurityError' || name === 'NotAllowedError'
            ? 'AR was blocked. Allow camera access, and make sure the page is opened over HTTPS.'
            : `Could not start AR (${err instanceof Error ? err.message : String(err)}).`,
      )
      return
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.xr.enabled = true
    // 'local' is always granted for immersive sessions; hit-test poses are relative to it.
    renderer.xr.setReferenceSpaceType('local')
    renderer.domElement.style.display = 'none'
    document.body.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30)
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    reticle.matrixAutoUpdate = false
    reticle.visible = false
    scene.add(reticle)
    const live = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf97316 }),
    )
    live.visible = false
    live.frustumCulled = false
    scene.add(live)
    const shapes = new THREE.Group()
    scene.add(shapes)

    xr.current = {
      renderer,
      scene,
      camera,
      session,
      hitSource: null,
      reticle,
      live,
      shapes,
      timer: 0,
      floorY: null,
      hit: null,
    }

    try {
      await renderer.xr.setSession(session)
      const viewer = await session.requestReferenceSpace('viewer')
      const hs = await session.requestHitTestSource?.({ space: viewer })
      if (!hs) throw new Error('Hit testing is not available')
      xr.current.hitSource = hs
    } catch (err) {
      session.end().catch(() => {})
      teardown()
      setPhase('intro')
      setError(`AR started but floor detection failed (${err instanceof Error ? err.message : String(err)}).`)
      return
    }

    if (!session.domOverlayState) {
      setHint('This browser did not enable on-screen controls in AR. Tap to place corners; press Back to finish.')
    }

    session.addEventListener('select', onSelect)
    session.addEventListener('end', () => {
      teardown()
      const d = data.current
      if (d.closed || d.points.length >= 3) {
        d.closed = true
        setPhase('review')
      } else {
        setPhase('intro')
        setError(d.points.length ? 'The AR session ended before the room outline was complete. Start again.' : null)
      }
      bump()
    })

    xr.current.timer = window.setTimeout(() => {
      if (!xr.current?.floorY) setHint('No floor found yet. Move the phone slowly in a sweeping motion, and turn on more light.')
    }, NO_FLOOR_MS)

    setPhase(data.current.closed ? 'openings' : 'corners')

    const tmp = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const mtx = new THREE.Matrix4()
    renderer.setAnimationLoop((_t: number, frame?: XRFrame) => {
      const s = xr.current
      if (!s || !frame) return
      const ref = renderer.xr.getReferenceSpace()
      s.hit = null
      if (ref && s.hitSource) {
        const results = frame.getHitTestResults(s.hitSource)
        for (const r of results) {
          const pose = r.getPose(ref)
          if (!pose) continue
          mtx.fromArray(pose.transform.matrix)
          // The hit pose's Y axis is the surface normal: keep horizontal, upward-facing surfaces.
          const ny = mtx.elements[5]
          if (ny < 0.85) continue
          tmp.setFromMatrixPosition(mtx)
          if (s.floorY === null || tmp.y < s.floorY) s.floorY = tmp.y
          if (tmp.y > s.floorY + FLOOR_TOL_M) continue // a table or bed, not the floor
          s.hit = tmp.clone()
          s.reticle.matrix.copy(mtx)
          break
        }
      }
      s.reticle.visible = !!s.hit
      if (s.hit && !floorFoundRef.current) {
        floorFoundRef.current = true
        setFloorFound(true)
        setHint(null)
      }
      // Live segment from the last corner (or pending opening end) to the reticle.
      const d = data.current
      const from =
        phaseRef.current === 'corners' && !d.closed
          ? d.points[d.points.length - 1]
          : phaseRef.current === 'openings' && d.pending.length === 1
            ? d.pending[0]
            : undefined
      const label = labelRef.current
      if (from && s.hit) {
        const pos = s.live.geometry.getAttribute('position') as THREE.BufferAttribute
        pos.setXYZ(0, from.x, from.y, from.z)
        pos.setXYZ(1, s.hit.x, s.hit.y, s.hit.z)
        pos.needsUpdate = true
        s.live.visible = true
        const len = distance(toPlan(from), toPlan(s.hit))
        if (liveTextRef.current) liveTextRef.current.textContent = `${Math.round(len)} cm · ${formatFeet(len)}`
        if (label) {
          mid.copy(from).add(s.hit).multiplyScalar(0.5).project(renderer.xr.getCamera())
          if (mid.z < 1) {
            label.style.display = 'block'
            label.style.transform = `translate(${((mid.x + 1) / 2) * window.innerWidth}px, ${((1 - mid.y) / 2) * window.innerHeight}px) translate(-50%, -150%)`
          } else label.style.display = 'none'
        }
      } else {
        s.live.visible = false
        if (label) label.style.display = 'none'
        if (liveTextRef.current) liveTextRef.current.textContent = ''
      }
      renderer.render(s.scene, s.camera)
    })
  }

  const finish = () => xr.current?.session.end().catch(() => {})
  const undo = () => {
    const d = data.current
    if (phaseRef.current === 'openings') {
      if (d.pending.length) d.pending.pop()
      else if (d.openings.length) d.openings.pop()
      else {
        d.closed = false
        setPhase('corners')
      }
      choosingRef.current = false
      setChoosingKind(false)
    } else d.points.pop()
    redraw()
    bump()
  }
  const restart = () => {
    data.current = { points: [], closed: false, openings: [], pending: [] }
    choosingRef.current = false
    setChoosingKind(false)
    if (xr.current) setPhase('corners')
    else setPhase('intro')
    redraw()
    bump()
  }
  const chooseKind = (kind: 'door' | 'window' | null) => {
    const d = data.current
    if (kind && d.pending.length === 2) d.openings.push({ kind, a: d.pending[0], b: d.pending[1] })
    d.pending = []
    choosingRef.current = false
    setChoosingKind(false)
    redraw()
    bump()
  }

  // ---- Review -----------------------------------------------------------------
  const d = data.current
  let review: MeasuredRoom | null = null
  if (phase === 'review' && d.points.length >= 3) {
    const raw: RawOpening[] = d.openings.map((o) => ({ kind: o.kind, a: toPlan(o.a), b: toPlan(o.b) }))
    const built = buildRoom(d.points.map(toPlan), raw, height)
    const rel = built.fit.residual / Math.max(1, Math.min(built.room.width, built.room.depth))
    const confidence = Math.max(0.4, Math.min(0.95, 0.95 - 3 * rel))
    review = {
      room: built.room,
      polygon: built.polygon,
      method: 'ar',
      confidence: Math.round(confidence * 100) / 100,
      notes: [
        'Measured with phone AR (ARCore floor tracking). Expected error is a few cm per wall when tracking is good.',
        `Measured corners deviate from the fitted rectangle by ${Math.round(built.fit.residual)} cm (RMS).`,
        'Ceiling height was entered by hand.',
        ...built.notes,
      ],
    }
  }

  const inAr = phase === 'starting' || phase === 'corners' || phase === 'openings'
  const n = d.points.length

  return (
    <div>
      {/* DOM overlay root: shown on top of the camera view during the AR session. */}
      <div
        ref={overlayRef}
        className={inAr ? 'fixed inset-0 z-50 select-none text-white' : 'hidden'}
      >
        {inAr && (
          <XrSelectGuard>
            <div ref={labelRef} className="pointer-events-none absolute left-0 top-0 hidden rounded-lg bg-black/70 px-2 py-1 text-sm font-semibold">
              <span ref={liveTextRef} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4 pt-6">
              <p className="text-base font-semibold">
                {phase === 'starting'
                  ? 'Starting AR…'
                  : phase === 'corners'
                    ? !floorFound
                      ? 'Point the camera at the floor and move the phone slowly'
                      : n === 0
                        ? 'Aim the ring at a floor corner and tap'
                        : n < 3
                          ? `Corner ${n + 1}: tap the next corner, in order`
                          : 'Tap the next corner, or Close shape'
                    : choosingKind
                      ? 'Is this a door or a window?'
                      : d.pending.length === 1
                        ? 'Tap the other end of the opening'
                        : 'Optional: tap both ends of a door or window along the wall base'}
              </p>
              {hint && <p className="mt-1 text-sm text-amber-200">{hint}</p>}
            </div>
            <div data-xr-ui className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/70 to-transparent p-4 pb-8">
              {choosingKind ? (
                <div className="flex gap-2">
                  <Btn variant="secondary" className="flex-1" onClick={() => chooseKind('door')}>
                    <Icon name="door" /> Door
                  </Btn>
                  <Btn variant="secondary" className="flex-1" onClick={() => chooseKind('window')}>
                    <Icon name="window" /> Window
                  </Btn>
                  <Btn variant="ghost" className="!text-white" onClick={() => chooseKind(null)} aria-label="Discard opening">
                    <Icon name="close" />
                  </Btn>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Btn variant="secondary" onClick={undo} disabled={phase === 'corners' && n === 0} aria-label="Undo">
                    <Icon name="undo" />
                  </Btn>
                  <Btn variant="secondary" onClick={restart} aria-label="Restart">
                    <Icon name="restart" />
                  </Btn>
                  {phase === 'corners' ? (
                    <Btn
                      variant="primary"
                      className="flex-1 !bg-orange-500"
                      disabled={n < 3}
                      onClick={() => {
                        data.current.closed = true
                        setPhase('openings')
                        redraw()
                        bump()
                      }}
                    >
                      <Icon name="check" /> Close shape
                    </Btn>
                  ) : (
                    <Btn variant="primary" className="flex-1 !bg-orange-500" onClick={finish}>
                      <Icon name="check" /> Finish
                    </Btn>
                  )}
                  <Btn variant="secondary" onClick={finish} aria-label="Exit AR">
                    <Icon name="close" />
                  </Btn>
                </div>
              )}
            </div>
          </XrSelectGuard>
        )}
      </div>

      {phase === 'intro' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Btn variant="ghost" onClick={onCancel}>
              <Icon name="back" /> Back
            </Btn>
            <span className="text-sm font-semibold text-slate-900">Measure with AR</span>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Stand inside the room with good light.</li>
            <li>Point the camera at the floor until a white ring appears.</li>
            <li>Aim the ring at each floor corner, in order around the room, and tap. The first wall becomes the top (north) wall of the plan.</li>
            <li>Tap “Close shape”, then optionally mark doors and windows by tapping both ends.</li>
          </ol>
          {error && <Notice tone="error">{error}</Notice>}
          {!window.isSecureContext && <Notice tone="warn">AR needs the page to be opened over HTTPS.</Notice>}
          <Btn variant="primary" className="w-full !min-h-14 text-base" onClick={start}>
            <Icon name="cube" /> {n ? 'Resume AR' : 'Start AR'}
          </Btn>
        </div>
      )}

      {phase === 'review' && review && (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">AR result</h3>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <RoomPlanPreview room={review.room} polygon={review.polygon} className="mx-auto h-auto max-h-80 w-full" />
          </div>
          <LengthInput label="Ceiling height" valueCm={height} onChange={setHeight} unit="cm" min={180} hint="Typical: 275 cm (9 ft)" />
          <ConfidenceBar value={review.confidence} />
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
            {review.notes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Btn
              onClick={() => {
                restart()
                setPhase('intro')
              }}
            >
              <Icon name="restart" /> Measure again
            </Btn>
            <Btn variant="primary" className="flex-1" onClick={() => onDone(review!)}>
              <Icon name="check" /> Use this room
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}

/** Cancels the XR "select" for taps on elements marked data-xr-ui (DOM Overlay spec: beforexrselect). */
function XrSelectGuard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-xr-ui]')) e.preventDefault()
    }
    el.addEventListener('beforexrselect', h)
    return () => el.removeEventListener('beforexrselect', h)
  }, [])
  return (
    <div ref={ref} className="absolute inset-0">
      {children}
    </div>
  )
}

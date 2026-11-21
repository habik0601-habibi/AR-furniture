/**
 * Entry point of the room-measurement module. Detects device capabilities,
 * recommends a method, runs it and lets the user review/adjust the result.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import type { Room } from '../engine/types'
import { ManualRoom } from './ManualRoom'
import { PhotoMeasure } from './PhotoMeasure'
import { RoomPlanPreview } from './RoomPlanPreview'
import type { MeasuredRoom, MeasureMethod } from './types'
import { Btn, ConfidenceBar, Icon, Notice } from './ui'
import { formatFeet } from './units'

// three.js is only needed for AR: load that mode on demand.
const ArMeasure = lazy(() => import('./ArMeasure').then((m) => ({ default: m.ArMeasure })))

export interface MeasureRoomProps {
  onDone(result: MeasuredRoom): void
  initial?: Room
}

type Mode = 'ar' | 'photo' | 'manual'

interface Caps {
  ar: boolean | null
  ios: boolean
  mobile: boolean
  secure: boolean
}

function detectIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function useCapabilities(): Caps {
  const [caps, setCaps] = useState<Caps>(() => ({
    ar: null,
    ios: typeof navigator !== 'undefined' && detectIOS(),
    mobile: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true,
    secure: typeof window !== 'undefined' && window.isSecureContext,
  }))
  useEffect(() => {
    let alive = true
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr
    if (!xr) {
      setCaps((c) => ({ ...c, ar: false }))
      return
    }
    xr.isSessionSupported('immersive-ar')
      .then((ok) => alive && setCaps((c) => ({ ...c, ar: ok })))
      .catch(() => alive && setCaps((c) => ({ ...c, ar: false })))
    return () => {
      alive = false
    }
  }, [])
  return caps
}

const METHOD_LABEL: Record<MeasureMethod, string> = {
  ar: 'Phone AR',
  photo: 'Photo + reference',
  'ai-photo': 'Photo + AI auto-detect',
  manual: 'Typed in',
}

export function MeasureRoom({ onDone, initial }: MeasureRoomProps) {
  const caps = useCapabilities()
  const [mode, setMode] = useState<Mode | null>(null)
  const [result, setResult] = useState<MeasuredRoom | null>(null)
  const [editing, setEditing] = useState(false)

  const recommended: Mode = caps.ar ? 'ar' : caps.ios || caps.mobile ? 'photo' : 'manual'
  const arReason = caps.ar
    ? null
    : caps.ios
      ? 'iPhone Safari does not support WebXR AR. Use the photo method.'
      : !caps.secure
        ? 'Needs the page to be opened over HTTPS.'
        : caps.ar === null
          ? 'Checking…'
          : 'Needs Chrome on an ARCore-capable Android phone.'

  const cards: { mode: Mode; title: string; icon: string; body: string; accuracy: string; disabled?: boolean; reason?: string | null }[] = [
    {
      mode: 'ar',
      title: 'Walk around with AR',
      icon: 'cube',
      body: 'Your phone tracks the floor with its camera and motion sensors. Tap each corner of the room.',
      accuracy: 'Most accurate (expected within a few cm)',
      disabled: !caps.ar,
      reason: arReason,
    },
    {
      mode: 'photo',
      title: 'One photo + A4 sheet',
      icon: 'camera',
      body: 'Put an A4 sheet or a tile on the floor, take a photo, tap the corners. Optional AI auto-detect suggests the corners for you.',
      accuracy: 'Works on any phone. Good within 2–3 m of the sheet',
    },
    {
      mode: 'manual',
      title: 'Type the size',
      icon: 'ruler',
      body: 'Already know the size, or have a tape measure? Enter width and depth in feet or cm, plus doors and windows.',
      accuracy: 'As accurate as your tape measure',
    },
  ]

  const finishMode = (r: MeasuredRoom) => {
    setResult({ ...r, room: { ...r.room, ...(initial?.name && !r.room.name ? { name: initial.name } : {}) } })
    setMode(null)
  }

  // ---- Review / edit -------------------------------------------------------------
  if (result) {
    if (editing) {
      return (
        <Shell>
          <ManualRoom
            initial={result.room}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onDone={(room) => {
              setEditing(false)
              setResult((r) =>
                r && {
                  ...r,
                  room,
                  notes: r.notes.some((n) => n.startsWith('Adjusted by hand')) ? r.notes : [...r.notes, 'Adjusted by hand after measuring.'],
                },
              )
            }}
          />
        </Shell>
      )
    }
    const { room } = result
    return (
      <Shell>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{METHOD_LABEL[result.method]}</p>
            <h2 className="text-xl font-semibold text-slate-900">
              {room.width} × {room.depth} cm
            </h2>
            <p className="text-sm text-slate-600">
              {formatFeet(room.width)} × {formatFeet(room.depth)} · ceiling {room.height} cm · {room.openings.filter((o) => o.kind === 'door').length}{' '}
              door(s), {room.openings.filter((o) => o.kind === 'window').length} window(s)
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <RoomPlanPreview room={room} polygon={result.polygon} className="mx-auto h-auto max-h-96 w-full" />
          </div>
          <ConfidenceBar value={result.confidence} />
          {result.notes.length > 0 && (
            <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <summary className="min-h-8 cursor-pointer font-medium">Measurement notes ({result.notes.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => setEditing(true)}>Edit numbers</Btn>
            <Btn onClick={() => setResult(null)}>
              <Icon name="restart" /> Measure again
            </Btn>
            <Btn variant="primary" className="col-span-2 !min-h-12" onClick={() => onDone(result)}>
              <Icon name="check" /> Use this room
            </Btn>
          </div>
        </div>
      </Shell>
    )
  }

  // ---- Running a mode -------------------------------------------------------------
  if (mode === 'ar')
    return (
      <Shell>
        <Suspense fallback={<p className="p-4 text-sm text-slate-600">Loading AR…</p>}>
          <ArMeasure onDone={finishMode} onCancel={() => setMode(null)} />
        </Suspense>
      </Shell>
    )
  if (mode === 'photo')
    return (
      <Shell>
        <PhotoMeasure onDone={finishMode} onCancel={() => setMode(null)} />
      </Shell>
    )
  if (mode === 'manual')
    return (
      <Shell>
        <div className="mb-3">
          <Btn variant="ghost" onClick={() => setMode(null)}>
            <Icon name="back" /> Back
          </Btn>
        </div>
        <ManualRoom
          initial={initial}
          onDone={(room) =>
            finishMode({
              room,
              method: 'manual',
              confidence: 0.85,
              notes: ['Entered by hand; accuracy depends on how the room was measured.'],
            })
          }
        />
      </Shell>
    )

  // ---- Mode picker -----------------------------------------------------------------
  return (
    <Shell>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Measure your room</h2>
          <p className="text-sm text-slate-600">We use the room size to place furniture and check that it fits.</p>
        </div>
        {initial && (
          <Notice>
            Current room: {initial.width} × {initial.depth} cm ({formatFeet(initial.width)} × {formatFeet(initial.depth)}).{' '}
            <button type="button" className="font-semibold underline" onClick={() => setMode('manual')}>
              Edit it
            </button>
          </Notice>
        )}
        <ul className="space-y-3">
          {cards.map((c) => {
            const rec = c.mode === recommended && !c.disabled
            return (
              <li key={c.mode}>
                <button
                  type="button"
                  disabled={c.disabled}
                  onClick={() => setMode(c.mode)}
                  className={`flex w-full gap-3 rounded-2xl p-4 text-left ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60 ${rec ? 'bg-orange-50 ring-2 ring-orange-400' : 'bg-white ring-slate-200 hover:bg-slate-50'}`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${rec ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <Icon name={c.icon} className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{c.title}</span>
                      {rec && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">Recommended</span>}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">{c.body}</span>
                    <span className="mt-1 block text-xs font-medium text-slate-500">{c.disabled && c.reason ? c.reason : c.accuracy}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-xl bg-white p-4 text-slate-900 sm:rounded-3xl sm:p-6 sm:shadow-sm">{children}</div>
}

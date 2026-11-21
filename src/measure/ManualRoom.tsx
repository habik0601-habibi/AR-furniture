import { useMemo, useState } from 'react'
import type { Opening, Room, Wall } from '../engine/types'
import { newOpeningId, wallLength } from './geometry'
import { RoomPlanPreview } from './RoomPlanPreview'
import { Btn, Icon, LengthInput, Notice, UnitToggle, type LengthUnit } from './ui'
import { feetInchesToCm } from './units'

export interface ManualRoomProps {
  initial?: Room
  onDone(room: Room): void
  onCancel?(): void
  submitLabel?: string
}

const PRESETS: { label: string; w: number; d: number }[] = [
  { label: 'Bedroom 12×14 ft', w: feetInchesToCm(12, 0), d: feetInchesToCm(14, 0) },
  { label: 'Lounge 16×20 ft', w: feetInchesToCm(16, 0), d: feetInchesToCm(20, 0) },
  { label: 'Drawing room 14×18 ft', w: feetInchesToCm(14, 0), d: feetInchesToCm(18, 0) },
]

const WALL_NAMES: Record<Wall, string> = { N: 'North (top)', E: 'East (right)', S: 'South (bottom)', W: 'West (left)' }

export function validateRoom(room: Room): string[] {
  const errs: string[] = []
  if (!(room.width >= 100 && room.width <= 3000)) errs.push('Width should be between 100 and 3000 cm.')
  if (!(room.depth >= 100 && room.depth <= 3000)) errs.push('Depth should be between 100 and 3000 cm.')
  if (!(room.height >= 180 && room.height <= 600)) errs.push('Ceiling height should be between 180 and 600 cm.')
  room.openings.forEach((o, i) => {
    const len = wallLength(o.wall, room.width, room.depth)
    const name = `${o.kind === 'door' ? 'Door' : 'Window'} ${i + 1}`
    if (!(o.width >= 30)) errs.push(`${name} is narrower than 30 cm.`)
    if (o.offset < 0 || o.offset + o.width > len + 0.5)
      errs.push(`${name} does not fit on the ${WALL_NAMES[o.wall].split(' ')[0]} wall (${Math.round(len)} cm long).`)
  })
  return errs
}

/** Fallback form: type in the room size and openings, with a live plan preview. */
export function ManualRoom({ initial, onDone, onCancel, submitLabel = 'Use these dimensions' }: ManualRoomProps) {
  const [unit, setUnit] = useState<LengthUnit>('ft')
  const [width, setWidth] = useState(initial?.width ?? feetInchesToCm(12, 0))
  const [depth, setDepth] = useState(initial?.depth ?? feetInchesToCm(14, 0))
  const [height, setHeight] = useState(initial?.height ?? 275)
  const [openings, setOpenings] = useState<Opening[]>(initial?.openings ?? [])
  const [selected, setSelected] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  const room: Room = useMemo(
    () => ({ width, depth, height, openings, ...(initial?.name ? { name: initial.name } : {}) }),
    [width, depth, height, openings, initial?.name],
  )
  const errors = validateRoom(room)
  const sel = openings.find((o) => o.id === selected)

  const update = (id: string, patch: Partial<Opening>) =>
    setOpenings((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const addOpening = (kind: 'door' | 'window') => {
    const wall: Wall = kind === 'door' ? 'S' : 'N'
    const w = kind === 'door' ? 90 : 120
    const len = wallLength(wall, width, depth)
    const o: Opening = {
      id: newOpeningId(),
      kind,
      wall,
      offset: Math.max(0, Math.round((len - w) / 2)),
      width: w,
      ...(kind === 'door' ? { swingIn: true } : { sillHeight: 90 }),
    }
    setOpenings((os) => [...os, o])
    setSelected(o.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Room size</h2>
        <UnitToggle unit={unit} onChange={setUnit} />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Presets">
        {PRESETS.map((p) => (
          <Btn
            key={p.label}
            variant="secondary"
            className="!min-h-10 !rounded-full !px-3 !text-xs"
            onClick={() => {
              setWidth(p.w)
              setDepth(p.d)
            }}
          >
            {p.label}
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LengthInput label="Width (N and S walls)" valueCm={width} onChange={setWidth} unit={unit} min={100} />
        <LengthInput label="Depth (E and W walls)" valueCm={depth} onChange={setDepth} unit={unit} min={100} />
        <LengthInput label="Ceiling height" valueCm={height} onChange={setHeight} unit={unit} min={180} hint="Typical: 275 cm (9 ft)" />
      </div>

      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <RoomPlanPreview room={room} highlightWall={sel?.wall} className="mx-auto h-auto max-h-80 w-full" />
      </div>

      <section aria-labelledby="openings-h" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="openings-h" className="font-semibold text-slate-900">
            Doors and windows
          </h3>
          <div className="flex gap-2">
            <Btn onClick={() => addOpening('door')}>
              <Icon name="door" /> Door
            </Btn>
            <Btn onClick={() => addOpening('window')}>
              <Icon name="window" /> Window
            </Btn>
          </div>
        </div>
        {openings.length === 0 && (
          <p className="text-sm text-slate-500">None yet. Add them so furniture is not placed in front of a door or window.</p>
        )}
        <ul className="space-y-2">
          {openings.map((o, i) => {
            const open = o.id === selected
            return (
              <li key={o.id} className="rounded-xl ring-1 ring-slate-200">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setSelected(open ? null : o.id)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm"
                >
                  <Icon name={o.kind} className="h-5 w-5 text-slate-600" />
                  <span className="font-medium text-slate-900">
                    {o.kind === 'door' ? 'Door' : 'Window'} {i + 1}
                  </span>
                  <span className="text-slate-500">
                    {o.wall} wall · {Math.round(o.width)} cm
                  </span>
                </button>
                {open && (
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-3">
                    <label className="col-span-2 text-sm font-medium text-slate-700">
                      Wall
                      <select
                        value={o.wall}
                        onChange={(e) => update(o.id, { wall: e.target.value as Wall })}
                        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
                      >
                        {(Object.keys(WALL_NAMES) as Wall[]).map((w) => (
                          <option key={w} value={w}>
                            {WALL_NAMES[w]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <LengthInput
                      label={o.wall === 'N' || o.wall === 'S' ? 'From west corner' : 'From north corner'}
                      valueCm={o.offset}
                      onChange={(v) => update(o.id, { offset: Math.max(0, v) })}
                      unit={unit}
                    />
                    <LengthInput label="Width" valueCm={o.width} onChange={(v) => update(o.id, { width: v })} unit={unit} />
                    {o.kind === 'door' ? (
                      <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={o.swingIn !== false}
                          onChange={(e) => update(o.id, { swingIn: e.target.checked })}
                        />
                        Door swings into the room
                      </label>
                    ) : (
                      <LengthInput
                        label="Sill height"
                        valueCm={o.sillHeight ?? 90}
                        onChange={(v) => update(o.id, { sillHeight: v })}
                        unit={unit}
                      />
                    )}
                    <Btn
                      variant="danger"
                      className="col-span-2"
                      onClick={() => {
                        setOpenings((os) => os.filter((x) => x.id !== o.id))
                        setSelected(null)
                      }}
                    >
                      <Icon name="trash" /> Remove
                    </Btn>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {showErrors && errors.length > 0 && (
        <Notice tone="error">
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Btn variant="ghost" onClick={onCancel}>
            <Icon name="back" /> Back
          </Btn>
        )}
        <Btn
          variant="primary"
          className="flex-1"
          onClick={() => {
            if (errors.length) {
              setShowErrors(true)
              return
            }
            onDone({
              ...room,
              width: Math.round(width),
              depth: Math.round(depth),
              height: Math.round(height),
              openings: openings.map((o) => ({ ...o, offset: Math.round(o.offset), width: Math.round(o.width) })),
            })
          }}
        >
          <Icon name="check" /> {submitLabel}
        </Btn>
      </div>
    </div>
  )
}

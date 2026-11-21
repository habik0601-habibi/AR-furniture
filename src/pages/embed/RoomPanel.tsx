import { useState } from 'react'
import type { Category, Dimensions, Placed } from '../../engine/types'
import type { MeasuredRoom } from '../../measure/types'
import { MeasureRoom } from '../../measure/MeasureRoom'
import { RoomPlanPreview } from '../../measure/RoomPlanPreview'
import { Badge, Button, Card, Field, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { ShopperContext } from './state'

/** A ready-made 14 × 16 ft lounge so the flow can be tried without measuring. */
export const SAMPLE_ROOM: MeasuredRoom = {
  room: {
    name: 'Sample lounge',
    width: 490,
    depth: 430,
    height: 290,
    openings: [
      { id: 'door-1', kind: 'door', wall: 'S', offset: 340, width: 90, swingIn: true },
      { id: 'win-1', kind: 'window', wall: 'N', offset: 150, width: 180, sillHeight: 90 },
    ],
  },
  method: 'manual',
  confidence: 1,
  notes: ['Sample room for trying RoomSense, not a real measurement.'],
}

/** Furniture already in the sample lounge (the optimiser places it around the new piece). */
export const SAMPLE_EXISTING: Placed[] = [
  { id: 'own-tv', productId: 'own', category: 'tv_unit', dims: { w: 160, d: 40, h: 55 }, name: 'TV unit', x: 0, y: 0, rotation: 0, locked: false },
  { id: 'own-ct', productId: 'own', category: 'coffee_table', dims: { w: 110, d: 60, h: 45 }, name: 'Coffee table', x: 0, y: 0, rotation: 0, locked: false },
  { id: 'own-ac', productId: 'own', category: 'armchair', dims: { w: 85, d: 85, h: 85 }, name: 'Armchair', x: 0, y: 0, rotation: 0, locked: false },
]

/** Typical sizes for furniture shoppers already own (cm). They can edit them. */
const DEFAULT_DIMS: Record<Category, Dimensions> = {
  sofa: { w: 210, d: 90, h: 85 },
  armchair: { w: 85, d: 85, h: 85 },
  bed: { w: 183, d: 213, h: 110 },
  wardrobe: { w: 150, d: 60, h: 210 },
  dining_table: { w: 160, d: 90, h: 76 },
  dining_chair: { w: 45, d: 50, h: 90 },
  coffee_table: { w: 110, d: 60, h: 45 },
  tv_unit: { w: 160, d: 40, h: 55 },
  side_table: { w: 45, d: 45, h: 55 },
  bookshelf: { w: 90, d: 35, h: 190 },
  desk: { w: 120, d: 60, h: 75 },
  dresser: { w: 120, d: 45, h: 80 },
}

const NAMES: Record<Category, string> = {
  sofa: 'Sofa', armchair: 'Armchair', bed: 'Bed (king)', wardrobe: 'Wardrobe', dining_table: 'Dining table',
  dining_chair: 'Dining chair', coffee_table: 'Coffee table', tv_unit: 'TV unit', side_table: 'Side table',
  bookshelf: 'Bookshelf', desk: 'Desk', dresser: 'Dresser',
}

export function RoomPanel(props: {
  shopper: ShopperContext
  update(p: Partial<ShopperContext>): void
  onMeasured(m: MeasuredRoom): void
  onNext(): void
}) {
  const { shopper, update } = props
  const [measuring, setMeasuring] = useState(!shopper.measured)
  const [cat, setCat] = useState<Category>('sofa')
  const [dims, setDims] = useState<Dimensions>(DEFAULT_DIMS.sofa)

  if (measuring) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-2">Your room is saved on this phone only, and reused for every product and shop.</p>
        <MeasureRoom
          initial={shopper.measured?.room}
          onDone={(m) => {
            update({ measured: m })
            props.onMeasured(m)
            setMeasuring(false)
          }}
        />
        <div className="border-t border-line pt-4">
          <Button variant="ghost" icon="home" onClick={() => { update({ measured: SAMPLE_ROOM, existing: shopper.existing.length ? shopper.existing : SAMPLE_EXISTING }); setMeasuring(false) }}>
            No time? Use a sample 14 × 16 ft lounge
          </Button>
        </div>
      </div>
    )
  }

  const m = shopper.measured!
  function addExisting() {
    const id = `own-${Date.now().toString(36)}`
    const item: Placed = { id, productId: 'own', category: cat, dims, name: NAMES[cat], x: 0, y: 0, rotation: 0, locked: false }
    update({ existing: [...shopper.existing, item] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">{m.room.name ?? 'Your room'}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {m.room.width} × {m.room.depth} cm · ceiling {m.room.height} cm
            <Badge tone={m.confidence >= 0.75 ? 'good' : m.confidence >= 0.5 ? 'warn' : 'bad'} icon={false}>
              {methodLabel(m.method)} · {Math.round(m.confidence * 100)}% confidence
            </Badge>
          </p>
        </div>
        <Button size="sm" variant="outline" icon="ruler" onClick={() => setMeasuring(true)}>Re-measure</Button>
      </div>

      <Card className="p-3">
        <RoomPlanPreview room={m.room} polygon={m.polygon} title={m.room.name ?? 'Your room'} className="w-full" />
      </Card>
      {m.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {m.notes.map((n, i) => (
            <li key={i} className="flex gap-1.5"><Icon name="info" size={14} className="mt-px shrink-0" /> {n}</li>
          ))}
        </ul>
      )}

      <section aria-labelledby="own-h">
        <h3 id="own-h" className="font-sans text-sm font-bold tracking-normal">Furniture already in this room</h3>
        <p className="text-xs text-muted">Add what you are keeping. The layout works around it; you can drag it to where it really stands.</p>
        {shopper.existing.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {shopper.existing.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{e.name}</span>{' '}
                  <span className="text-ink-2">{e.dims.w} × {e.dims.d} cm</span>
                  {e.locked && <Badge tone="neutral" icon="lock" className="ml-2">Pinned</Badge>}
                </span>
                <button onClick={() => update({ existing: shopper.existing.filter((x) => x.id !== e.id) })} aria-label={`Remove ${e.name}`} className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2">
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_repeat(2,1fr)_auto]">
          <Field label="Item">
            <select className={inputClass} value={cat} onChange={(e) => { const c = e.target.value as Category; setCat(c); setDims(DEFAULT_DIMS[c]) }}>
              {(Object.keys(NAMES) as Category[]).map((c) => <option key={c} value={c}>{NAMES[c]}</option>)}
            </select>
          </Field>
          <Field label="Width cm"><input className={inputClass} type="number" min={20} max={400} value={dims.w} onChange={(e) => setDims({ ...dims, w: Number(e.target.value) })} /></Field>
          <Field label="Depth cm"><input className={inputClass} type="number" min={20} max={400} value={dims.d} onChange={(e) => setDims({ ...dims, d: Number(e.target.value) })} /></Field>
          <div className="flex items-end">
            <Button variant="outline" icon="plus" onClick={addExisting} className="w-full">Add</Button>
          </div>
        </div>
      </section>

      <Button variant="primary" iconRight="arrowRight" className="w-full" onClick={props.onNext}>Check the fit</Button>
    </div>
  )
}

function methodLabel(m: MeasuredRoom['method']) {
  return { ar: 'Measured in AR', photo: 'Measured from photo', 'ai-photo': 'AI-assisted photo', manual: 'Entered by hand' }[m]
}

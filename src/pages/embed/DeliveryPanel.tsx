import { useEffect, useMemo, useRef } from 'react'
import type { Product, SizeOption } from '../../data/types'
import type { AccessRoute, DeliveryPathResult, DeliveryQuote, DeliveryRules } from '../../engine/types'
import { checkDeliveryPath } from '../../engine/deliveryPath'
import { estimateDelivery } from '../../engine/deliveryCost'
import { pkr } from '../../engine/pricing'
import type { Store } from '../../lib/catalogApi'
import { Button, Field, Notice, cx, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { CITY_IDS, CITY_NAMES, asCity } from './cities'
import type { ShopperContext } from './state'

export function DeliveryPanel(props: {
  store: Store
  product: Product
  size: SizeOption
  price: number
  shopper: ShopperContext
  update(p: Partial<ShopperContext>): void
  onResult(path: DeliveryPathResult, quote: DeliveryQuote): void
}) {
  const { store, product, size, price, shopper, update } = props
  const route = shopper.route
  const setRoute = (patch: Partial<AccessRoute>) => update({ route: { ...route, ...patch } })

  const path = useMemo(
    () =>
      checkDeliveryPath(
        { dims: size.dims, packed: product.assemblyRequired ? size.packed : undefined, removableLegs: product.removableLegs },
        route,
      ),
    [size, product.assemblyRequired, product.removableLegs, route],
  )
  const quote = useMemo(
    () =>
      estimateDelivery({
        fromCity: asCity(store.city),
        toCity: shopper.city,
        items: [{ packed: size.packed, weightKg: size.weightKg, assemblyRequired: product.assemblyRequired }],
        floor: route.floor,
        hasLift: Boolean(route.lift),
        goodsValue: price,
        rules: store.deliveryRules as Partial<DeliveryRules>,
      }),
    [store.city, store.deliveryRules, shopper.city, size, product.assemblyRequired, route.floor, route.lift, price],
  )

  const last = useRef('')
  useEffect(() => {
    const key = `${path.ok}|${quote.total}|${quote.toCity}`
    if (key === last.current) return
    const t = setTimeout(() => {
      last.current = key
      props.onResult(path, quote)
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, quote])

  // no clamping while typing; the engine treats unrealistic values as failing checks
  const num = (v: string) => Math.max(0, Number(v) || 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Delivery</h2>
        <p className="mt-1 text-sm text-ink-2">Will it get into your home, and what will delivery cost from {store.name} in {CITY_NAMES[asCity(store.city)]}?</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Deliver to">
          <select className={inputClass} value={shopper.city} onChange={(e) => update({ city: asCity(e.target.value) })}>
            {CITY_IDS.map((c) => <option key={c} value={c}>{CITY_NAMES[c]}</option>)}
          </select>
        </Field>
        <Field label="Floor" hint="0 = ground">
          <input className={inputClass} type="number" min={0} max={40} value={route.floor} onChange={(e) => setRoute({ floor: num(e.target.value) })} />
        </Field>
      </section>

      <fieldset className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <legend className="px-1 text-sm font-bold">The way in</legend>
        <DoorRow label="Main entrance door" value={route.entranceDoor} onChange={(d) => setRoute({ entranceDoor: d })} />
        <DoorRow label="Room door" value={route.roomDoor} onChange={(d) => setRoute({ roomDoor: d })} />

        {route.floor > 0 && (
          <div className="grid gap-3 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              <ChoiceBtn on={Boolean(route.lift)} onClick={() => setRoute({ lift: route.lift ?? { width: 110, depth: 140, height: 220, doorWidth: 90, doorHeight: 210 }, stairs: undefined })} icon="lift" label="There is a lift" />
              <ChoiceBtn on={!route.lift} onClick={() => setRoute({ lift: undefined, stairs: route.stairs ?? { width: 100, headroom: 210, hasLanding: true, landingDepth: 110 } })} icon="stairs" label="Stairs only" />
            </div>
            {route.lift && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Lift width"><input className={inputClass} type="number" value={route.lift.width} onChange={(e) => setRoute({ lift: { ...route.lift!, width: num(e.target.value) } })} /></Field>
                <Field label="Depth"><input className={inputClass} type="number" value={route.lift.depth} onChange={(e) => setRoute({ lift: { ...route.lift!, depth: num(e.target.value) } })} /></Field>
                <Field label="Height"><input className={inputClass} type="number" value={route.lift.height} onChange={(e) => setRoute({ lift: { ...route.lift!, height: num(e.target.value) } })} /></Field>
                <Field label="Door width"><input className={inputClass} type="number" value={route.lift.doorWidth} onChange={(e) => setRoute({ lift: { ...route.lift!, doorWidth: num(e.target.value) } })} /></Field>
                <Field label="Door height"><input className={inputClass} type="number" value={route.lift.doorHeight} onChange={(e) => setRoute({ lift: { ...route.lift!, doorHeight: num(e.target.value) } })} /></Field>
              </div>
            )}
            {!route.lift && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Stair width"><input className={inputClass} type="number" value={route.stairs?.width ?? 100} onChange={(e) => setRoute({ stairs: { ...(route.stairs ?? { headroom: 210, hasLanding: true, landingDepth: 110 }), width: num(e.target.value) } as AccessRoute['stairs'] })} /></Field>
                <Field label="Headroom"><input className={inputClass} type="number" value={route.stairs?.headroom ?? 210} onChange={(e) => setRoute({ stairs: { ...(route.stairs ?? { width: 100, hasLanding: true, landingDepth: 110 }), headroom: num(e.target.value) } as AccessRoute['stairs'] })} /></Field>
                <Field label="Landing depth"><input className={inputClass} type="number" value={route.stairs?.landingDepth ?? 110} onChange={(e) => setRoute({ stairs: { ...(route.stairs ?? { width: 100, headroom: 210, hasLanding: true }), hasLanding: true, landingDepth: num(e.target.value) } as AccessRoute['stairs'] })} /></Field>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-line pt-3">
          <p className="text-sm font-semibold">Corridor corners on the way</p>
          <p className="text-xs text-muted">Each turn between two corridors. Long sofas often fail here.</p>
          {route.corners.map((c, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field label={`Corner ${i + 1}: coming in`}><input className={inputClass} type="number" value={c.widthIn} onChange={(e) => setRoute({ corners: route.corners.map((x, j) => (j === i ? { ...x, widthIn: num(e.target.value) } : x)) })} /></Field>
              <Field label="Going out"><input className={inputClass} type="number" value={c.widthOut} onChange={(e) => setRoute({ corners: route.corners.map((x, j) => (j === i ? { ...x, widthOut: num(e.target.value) } : x)) })} /></Field>
              <button aria-label={`Remove corner ${i + 1}`} onClick={() => setRoute({ corners: route.corners.filter((_, j) => j !== i) })} className="grid h-11 w-11 place-items-center rounded-xl text-ink-2 hover:bg-paper-2"><Icon name="trash" size={18} /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon="plus" className="mt-2" onClick={() => setRoute({ corners: [...route.corners, { widthIn: 100, widthOut: 100 }] })}>Add a corner</Button>
        </div>
      </fieldset>

      <section aria-live="polite">
        <div className={cx('flex items-center gap-2 rounded-2xl p-4 font-bold', path.ok ? 'bg-sage-soft text-sage' : 'bg-danger-soft text-danger')}>
          <Icon name={path.ok ? 'check' : 'x'} size={22} />
          {path.ok ? 'It can be carried into your room' : 'It may not get into your room'}
        </div>
        <ol className="mt-3 space-y-2">
          {path.steps.map((s) => (
            <li key={s.key} className="flex gap-3 rounded-xl border border-line bg-card px-4 py-3">
              <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', s.ok ? 'bg-sage-soft text-sage' : 'bg-danger-soft text-danger')}>
                <Icon name={s.ok ? 'check' : 'x'} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-sm text-ink-2">{s.detail}</p>
              </div>
              {s.margin != null && Number.isFinite(s.margin) && (
                <span className={cx('self-center text-xs font-semibold tabular-nums', s.margin >= 0 ? 'text-sage' : 'text-danger')}>
                  {s.margin >= 0 ? '+' : ''}{Math.round(s.margin)} cm
                </span>
              )}
            </li>
          ))}
        </ol>
        {path.advice && <Notice tone="warn" className="mt-3" title="What to do">{path.advice}</Notice>}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-baseline justify-between">
          <h3 className="font-sans text-sm font-bold tracking-normal">
            Delivery {CITY_NAMES[quote.fromCity]} → {CITY_NAMES[quote.toCity]}
          </h3>
          <span className="text-xs text-muted">{quote.distanceKm > 0 ? `${quote.distanceKm} km · ` : ''}{quote.days.min === quote.days.max ? quote.days.min : `${quote.days.min}–${quote.days.max}`} days</span>
        </div>
        <p className="mt-1 text-sm text-ink-2">{quote.vehicle.name}{quote.trips > 1 ? ` × ${quote.trips} trips` : ''} · {quote.volumeM3.toFixed(2)} m³ · {Math.round(quote.weightKg)} kg</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          {quote.lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-3">
              <dt className="text-ink-2">{l.label}</dt>
              <dd className="tabular-nums">{pkr(l.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-base font-bold">
            <dt>Delivery total</dt>
            <dd className="tabular-nums">{pkr(quote.total)}</dd>
          </div>
        </dl>
        {quote.notes.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted">{quote.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        <p className="mt-3 text-xs text-muted">Estimate from the store's delivery rules. The store confirms the final charge.</p>
      </section>
    </div>
  )
}

function DoorRow({ label, value, onChange }: { label: string; value: { width: number; height: number }; onChange(v: { width: number; height: number }): void }) {
  return (
    <div className="grid grid-cols-[1fr_88px_88px] items-end gap-2">
      <p className="flex items-center gap-2 pb-3 text-sm font-semibold"><Icon name="door" size={18} /> {label}</p>
      <Field label="Width"><input className={inputClass} type="number" value={value.width} onChange={(e) => onChange({ ...value, width: Math.max(0, Number(e.target.value) || 0) })} /></Field>
      <Field label="Height"><input className={inputClass} type="number" value={value.height} onChange={(e) => onChange({ ...value, height: Math.max(0, Number(e.target.value) || 0) })} /></Field>
    </div>
  )
}

function ChoiceBtn({ on, onClick, icon, label }: { on: boolean; onClick(): void; icon: 'lift' | 'stairs'; label: string }) {
  return (
    <button aria-pressed={on} onClick={onClick} className={cx('flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold', on ? 'bg-ink text-paper' : 'bg-paper-2 text-ink-2')}>
      <Icon name={icon} size={16} /> {label}
    </button>
  )
}

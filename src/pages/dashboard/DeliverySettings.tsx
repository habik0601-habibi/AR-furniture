import { useState } from 'react'
import type { DeliveryRules, VehicleSpec } from '../../engine/types'
import { DEFAULT_DELIVERY_RULES, estimateDelivery } from '../../engine/deliveryCost'
import { pkr } from '../../engine/pricing'
import { db } from '../../lib/supabase'
import { Button, Card, Field, Notice, inputClass } from '../../components/ui'
import { CITY_IDS, CITY_NAMES, asCity } from '../embed/cities'
import type { DashboardCtx } from './Dashboard'

/** Store-level overrides of the delivery cost model, with a live sample quote. */
export function DeliverySettings({ ctx }: { ctx: DashboardCtx }) {
  const saved = ctx.store.delivery_rules as Partial<DeliveryRules>
  const [city, setCity] = useState(asCity(ctx.store.city))
  const [vehicles, setVehicles] = useState<VehicleSpec[]>(saved.vehicles ?? DEFAULT_DELIVERY_RULES.vehicles)
  const [assembly, setAssembly] = useState(saved.assemblyPerItem ?? DEFAULT_DELIVERY_RULES.assemblyPerItem)
  const [insurance, setInsurance] = useState(Math.round((saved.insuranceRate ?? DEFAULT_DELIVERY_RULES.insuranceRate) * 1000) / 10)
  const [stairs, setStairs] = useState(saved.stairLabour ?? DEFAULT_DELIVERY_RULES.stairLabour)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)

  const rules: Partial<DeliveryRules> = { vehicles, assemblyPerItem: assembly, insuranceRate: insurance / 100, stairLabour: stairs }
  const sample = estimateDelivery({
    fromCity: city,
    toCity: city === 'karachi' ? 'lahore' : 'karachi',
    items: [{ packed: { w: 230, d: 100, h: 95 }, weightKg: 75, assemblyRequired: false }],
    floor: 3,
    hasLift: false,
    goodsValue: 180000,
    rules,
  })

  async function save() {
    setBusy(true)
    setMsg(null)
    // JSON cannot store Infinity: the last stair band is saved with a very large limit
    const storable = { ...rules, stairLabour: stairs.map((b) => ({ ...b, maxKg: Number.isFinite(b.maxKg) ? b.maxKg : 100000 })) }
    const { data, error } = await db.from('stores').update({ city, delivery_rules: storable }).eq('id', ctx.store.id).select('id, slug, name, city, brand_color, delivery_rules').single()
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: error.message })
    ctx.setStore(data)
    setMsg({ tone: 'good', text: 'Saved. New delivery estimates use these rules.' })
  }

  const n = (v: string) => Math.max(0, Number(v) || 0)

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl">Delivery rules</h1>
      <p className="mt-1 text-sm text-ink-2">Shoppers see a delivery estimate from these rules before they order.</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Ships from">
              <select className={inputClass} value={city} onChange={(e) => setCity(asCity(e.target.value))}>
                {CITY_IDS.map((c) => <option key={c} value={c}>{CITY_NAMES[c]}</option>)}
              </select>
            </Field>
            <Field label="Assembly" hint="Rs per item"><input className={inputClass} type="number" value={assembly} onChange={(e) => setAssembly(n(e.target.value))} /></Field>
            <Field label="Insurance" hint="% of value"><input className={inputClass} type="number" step={0.1} value={insurance} onChange={(e) => setInsurance(n(e.target.value))} /></Field>
          </Card>

          <Card className="overflow-hidden">
            <p className="p-5 pb-2 text-sm font-bold">Vehicles</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-y border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 font-semibold">Vehicle</th>
                    <th className="px-2 py-2 font-semibold">Base Rs</th>
                    <th className="px-2 py-2 font-semibold">Rs / km</th>
                    <th className="px-2 py-2 font-semibold">Same city Rs</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v, i) => (
                    <tr key={v.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2">
                        <p className="font-semibold">{v.name}</p>
                        <p className="text-xs text-muted">{v.cargo.w}×{v.cargo.d}×{v.cargo.h} cm · {v.payloadKg} kg</p>
                      </td>
                      {(['baseFare', 'perKm', 'intraCityFare'] as const).map((k) => (
                        <td key={k} className="px-2 py-2">
                          <input aria-label={`${v.name} ${k}`} className={`${inputClass} h-10 w-24`} type="number" value={v[k]} onChange={(e) => setVehicles(vehicles.map((x, j) => (j === i ? { ...x, [k]: n(e.target.value) } : x)))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-bold">Stairs without a lift</p>
            <p className="text-xs text-muted">Labour per item, per floor, by weight</p>
            <div className="mt-3 space-y-2">
              {stairs.map((b, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <Field label={Number.isFinite(b.maxKg) && b.maxKg < 100000 ? `Up to ${b.maxKg} kg` : 'Heavier'}>
                    <input className={inputClass} type="number" value={b.perFloor} onChange={(e) => setStairs(stairs.map((x, j) => (j === i ? { ...x, perFloor: n(e.target.value) } : x)))} />
                  </Field>
                </div>
              ))}
            </div>
          </Card>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button variant="primary" busy={busy} onClick={save}>Save delivery rules</Button>
        </div>

        <Card className="h-fit p-5 lg:sticky lg:top-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Live sample</p>
          <p className="mt-1 text-sm text-ink-2">3-seater sofa (75 kg, boxed 230×100×95 cm), {CITY_NAMES[sample.fromCity]} → {CITY_NAMES[sample.toCity]}, 3rd floor, no lift</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            {sample.lines.map((l) => (
              <div key={l.key} className="flex justify-between gap-3">
                <dt className="text-ink-2">{l.label}</dt>
                <dd className="tabular-nums">{pkr(l.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{pkr(sample.total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">{sample.vehicle.name} · {sample.distanceKm} km</p>
        </Card>
      </div>
    </div>
  )
}

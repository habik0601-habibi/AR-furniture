import { useState, type FormEvent } from 'react'
import type { Finish, Product, SizeOption } from '../../data/types'
import type { Store } from '../../lib/catalogApi'
import { db } from '../../lib/supabase'
import { sessionId } from '../../lib/session'
import { pkr } from '../../engine/pricing'
import { CITY_NAMES } from './cities'
import { Badge, Button, Field, Notice, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { ShopperContext } from './state'
import type { Outcome } from './Embed'

const ERRORS: Record<string, string> = {
  too_many_requests: 'You have sent several requests today already. The store will contact you.',
  unknown_product: 'This product is no longer available.',
}

export function QuotePanel(props: {
  store: Store
  product: Product
  size: SizeOption
  finish: Finish
  price: number
  shopper: ShopperContext
  outcome: Outcome
}) {
  const { store, product, size, finish, price, shopper, outcome } = props
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const room = shopper.measured?.room
    const config = {
      productName: product.name,
      sizeId: size.id,
      sizeLabel: size.label,
      dims: size.dims,
      finishId: finish.id,
      finishName: finish.name,
      price,
      room: room ? { width: room.width, depth: room.depth, height: room.height, openings: room.openings.length, method: shopper.measured?.method } : null,
      fit: outcome.fit ? { verdict: outcome.fit.verdict, score: outcome.fit.score, failed: outcome.fit.checks.filter((c) => !c.ok).map((c) => c.label) } : null,
      deliveryPath: outcome.path ? { ok: outcome.path.ok, advice: outcome.path.advice ?? null } : null,
      delivery: outcome.delivery ? { total: outcome.delivery.total, vehicle: outcome.delivery.vehicle.name, from: outcome.delivery.fromCity, to: outcome.delivery.toCity } : null,
      floor: shopper.route.floor,
      lift: Boolean(shopper.route.lift),
    }
    const { error } = await db.rpc('request_quote', {
      p_store: store.slug,
      p_product: product.slug,
      p_session: sessionId(),
      p_name: name,
      p_phone: phone,
      p_city: shopper.city,
      p_config: config,
    })
    setBusy(false)
    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message.includes(k))
      setError(code ? ERRORS[code] : 'Could not send. Please check your name and phone number and try again.')
      return
    }
    setDone(true)
  }

  if (done)
    return (
      <div className="py-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sage-soft text-sage">
          <Icon name="check" size={28} />
        </span>
        <h2 className="mt-4 text-2xl">Sent to {store.name}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">
          They have your configuration{outcome.fit ? ', your room fit report' : ''}
          {outcome.delivery ? ' and the delivery estimate' : ''}. They will call you on {phone}.
        </p>
      </div>
    )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Send this to {store.name}</h2>
        <p className="mt-1 text-sm text-ink-2">The store receives exactly what you configured, with your room's fit check, so they can confirm stock and delivery.</p>
      </div>

      <dl className="divide-y divide-line rounded-2xl border border-line bg-card text-sm">
        <Row k="Product" v={`${product.name}`} />
        <Row k="Size" v={`${size.label} · ${size.dims.w}×${size.dims.d}×${size.dims.h} cm`} />
        <Row k="Finish" v={finish.name} />
        <Row k="Price" v={pkr(price)} strong />
        <Row
          k="Room fit"
          v={
            outcome.fit ? (
              <Badge tone={outcome.fit.verdict === 'fits' ? 'good' : outcome.fit.verdict === 'tight' ? 'warn' : 'bad'}>
                {outcome.fit.verdict.replace('_', ' ')} · {outcome.fit.score}/100
              </Badge>
            ) : (
              <span className="text-muted">Not checked</span>
            )
          }
        />
        <Row
          k="Delivery"
          v={outcome.delivery ? `${pkr(outcome.delivery.total)} to ${CITY_NAMES[outcome.delivery.toCity]}` : <span className="text-muted">Not priced</span>}
        />
        {outcome.delivery && <Row k="Total" v={pkr(price + outcome.delivery.total)} strong />}
      </dl>

      {outcome.path && !outcome.path.ok && (
        <Notice tone="warn" title="Delivery path problem">{outcome.path.advice ?? 'The item may not get through your building. The store will advise.'}</Notice>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" />
        </Field>
        <Field label="Phone / WhatsApp">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required pattern="[0-9+ \-]{7,20}" inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" busy={busy} className="w-full" size="lg">Send request</Button>
        <p className="text-center text-xs text-muted">Only this request is shared with the store. Your room stays on this device otherwise.</p>
      </form>
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-ink-2">{k}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'text-right'}>{v}</dd>
    </div>
  )
}

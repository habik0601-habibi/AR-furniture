import { useEffect, useMemo, useRef, useState } from 'react'
import type { Product, SizeOption } from '../../data/types'
import type { FitReport, ItemSpec, LayoutResult, Placed } from '../../engine/types'
import { assessFit, describePose } from '../../engine/fit'
import { evaluateLayout, optimiseLayout } from '../../engine/placement'
import { Badge, Button, Meter, Notice, Spinner, cx } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { PlanEditor } from './PlanEditor'
import { SAMPLE_EXISTING, SAMPLE_ROOM } from './RoomPanel'
import type { ShopperContext } from './state'

const VERDICT = {
  fits: { tone: 'good' as const, title: 'It fits your room', icon: 'check' as const },
  tight: { tone: 'warn' as const, title: 'It fits, but it is tight', icon: 'alert' as const },
  does_not_fit: { tone: 'bad' as const, title: 'It does not fit', icon: 'x' as const },
}

export function FitPanel(props: {
  product: Product
  size: SizeOption
  shopper: ShopperContext
  update(p: Partial<ShopperContext>): void
  onGoToRoom(): void
  onResult(fit: FitReport): void
  onLayout(): void
}) {
  const { product, size, shopper, update } = props
  const room = shopper.measured?.room ?? null
  const [report, setReport] = useState<FitReport | null>(null)
  const [layout, setLayout] = useState<Placed[] | null>(null)
  const [scored, setScored] = useState<LayoutResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [seed, setSeed] = useState(1)
  const reported = useRef<string>('')

  const item: ItemSpec = useMemo(
    () => ({ id: 'new', productId: product.slug, category: product.category, dims: size.dims, name: product.name }),
    [product.slug, product.category, product.name, size.dims],
  )

  // Fit check + automatic layout. Runs off the click/render path so the UI stays responsive.
  useEffect(() => {
    if (!room) return
    setBusy(true)
    const t = setTimeout(() => {
      const fixed = shopper.existing.filter((e) => e.locked)
      const free: ItemSpec[] = shopper.existing.filter((e) => !e.locked).map(({ id, productId, category, dims, name }) => ({ id, productId, category, dims, name }))
      const fit = assessFit(room, fixed, item, undefined, { seed, delivery: { packed: product.assemblyRequired ? size.packed : undefined, removableLegs: product.removableLegs } })
      const result = optimiseLayout(room, [item, ...free], fixed, { seed })
      setReport(fit)
      setLayout(result.items)
      setScored(result)
      setBusy(false)
      const key = `${product.slug}|${size.id}|${fit.verdict}|${room.width}x${room.depth}`
      if (reported.current !== key) {
        reported.current = key
        props.onResult(fit)
        props.onLayout()
      }
    }, 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, item, seed, shopper.existing.length])

  function edit(next: Placed[], movedId: string) {
    setLayout(next)
    setScored(room ? evaluateLayout(room, next) : null)
    // remember where the shopper put their own furniture
    if (movedId !== 'new') {
      const map = new Map(next.map((p) => [p.id, p]))
      update({ existing: shopper.existing.map((e) => map.get(e.id) ?? e) })
    }
  }

  if (!room) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl">Will it fit?</h2>
          <p className="mt-1 text-sm text-ink-2">Measure your room first. RoomSense then places the {product.name} where it works best and checks walkways, doors and windows.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="primary" icon="ruler" onClick={props.onGoToRoom}>Measure my room</Button>
          <Button variant="outline" icon="home" onClick={() => update({ measured: SAMPLE_ROOM, existing: shopper.existing.length ? shopper.existing : SAMPLE_EXISTING })}>Try a sample lounge</Button>
        </div>
      </div>
    )
  }

  const v = report ? VERDICT[report.verdict] : null
  const newPlaced = layout?.find((p) => p.id === 'new')
  const unplacedNew = scored?.unplaced.includes('new')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">Fit & layout</h2>
          <p className="mt-1 text-sm text-ink-2">
            {room.name ?? 'Your room'} · {room.width} × {room.depth} cm · {shopper.existing.length} existing item{shopper.existing.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon="ruler" onClick={props.onGoToRoom}>Edit room</Button>
      </div>

      {busy && !report && (
        <div className="flex items-center gap-3 text-sm text-ink-2">
          <Spinner small /> Searching layouts…
        </div>
      )}

      {report && v && (
        <section className={cx('rounded-2xl p-4', v.tone === 'good' ? 'bg-sage-soft' : v.tone === 'warn' ? 'bg-amber-soft' : 'bg-danger-soft')} aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className={cx('flex items-center gap-2 text-lg font-bold', v.tone === 'good' ? 'text-sage' : v.tone === 'warn' ? 'text-amber' : 'text-danger')}>
              <Icon name={v.icon} size={22} /> {v.title}
            </p>
            <p className="font-display text-3xl tabular-nums text-ink">
              {report.score}
              <span className="text-base text-ink-2">/100</span>
            </p>
          </div>
          <Meter value={report.score} tone={v.tone} />
          {(newPlaced ?? report.suggested) && <p className="mt-3 text-sm text-ink">Best spot: {describePose(room, (newPlaced ?? report.suggested)!)}.</p>}
        </section>
      )}

      {report && (
        <section aria-labelledby="checks-h">
          <h3 id="checks-h" className="font-sans text-sm font-bold tracking-normal">Compatibility checks</h3>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
            {report.checks.map((c) => (
              <li key={c.key} className="flex gap-3 px-4 py-3">
                <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full', c.ok ? 'bg-sage-soft text-sage' : c.severity === 'error' ? 'bg-danger-soft text-danger' : 'bg-amber-soft text-amber')}>
                  <Icon name={c.ok ? 'check' : c.severity === 'error' ? 'x' : 'alert'} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{c.label}</p>
                  <p className="text-sm text-ink-2">{c.detail}</p>
                </div>
                {c.margin != null && Number.isFinite(c.margin) && (
                  <span className={cx('self-center text-xs font-semibold tabular-nums', c.margin >= 0 ? 'text-sage' : 'text-danger')}>
                    {c.margin >= 0 ? '+' : ''}
                    {Math.round(c.margin)} cm
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {layout && scored && (
        <section aria-labelledby="plan-h">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 id="plan-h" className="font-sans text-sm font-bold tracking-normal">Suggested layout</h3>
              <p className="text-xs text-muted">Placed by the optimiser. Drag anything to try your own arrangement; the score updates live.</p>
            </div>
            <Button size="sm" variant="outline" icon="wand" busy={busy} onClick={() => setSeed((s) => s + 1)}>Re-arrange</Button>
          </div>
          <div className="mt-3">
            <PlanEditor room={room} items={layout} highlightId="new" violations={scored.violations} onChange={edit} />
          </div>
          {unplacedNew && <Notice tone="bad" className="mt-3" title="No valid spot">The optimiser could not place it without blocking a door, a window or another piece. Try a smaller size or remove an existing item.</Notice>}
        
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="rounded-2xl bg-card p-4 text-center shadow-soft sm:w-36">
              <p className="text-xs font-semibold text-muted">Layout score</p>
              <p className="font-display text-4xl tabular-nums">{Math.round(scored.score)}</p>
              <p className="text-xs text-muted">{Math.round(scored.freeFloorRatio * 100)}% floor free</p>
            </div>
            <ul className="space-y-2">
              {scored.terms.map((t) => (
                <li key={t.key}>
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-ink-2" title={t.detail}>{t.label}</span>
                    <span className="tabular-nums text-muted">{Math.round(t.value)}</span>
                  </div>
                  <Meter value={t.value} tone={t.value >= 75 ? 'good' : t.value >= 45 ? 'warn' : 'bad'} />
                </li>
              ))}
            </ul>
          </div>

          {scored.violations.length > 0 && (
            <ul className="mt-4 space-y-2">
              {scored.violations.slice(0, 6).map((x, i) => (
                <li key={i}>
                  <Badge tone={x.severity === 'error' ? 'bad' : 'warn'} className="whitespace-normal text-left">{x.message}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { pkr } from '../../engine/pricing'
import { Badge, Card, Notice, Segmented, Spinner } from '../../components/ui'
import type { DashboardCtx } from './Dashboard'

interface FunnelRow {
  product_id: string
  product_name: string
  opened: number
  viewed_3d: number
  customized: number
  ar: number
  measured: number
  fit: number
  delivery: number
  quotes: number
}

interface QuoteRow {
  id: string
  customer_name: string
  phone: string
  city: string
  status: 'new' | 'contacted' | 'won' | 'lost'
  created_at: string
  config: { productName?: string; sizeLabel?: string; finishName?: string; price?: number; fit?: { verdict?: string; score?: number }; delivery?: { total?: number } }
}

const STEPS: { key: keyof FunnelRow; label: string }[] = [
  { key: 'opened', label: 'Opened RoomSense' },
  { key: 'viewed_3d', label: 'Viewed in 3D' },
  { key: 'customized', label: 'Customized' },
  { key: 'ar', label: 'Opened AR' },
  { key: 'measured', label: 'Measured room' },
  { key: 'fit', label: 'Checked fit' },
  { key: 'delivery', label: 'Priced delivery' },
  { key: 'quotes', label: 'Sent a quote request' },
]

export function Overview({ ctx }: { ctx: DashboardCtx }) {
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [funnel, setFunnel] = useState<FunnelRow[] | null>(null)
  const [fit, setFit] = useState<{ verdict: string; n: number }[]>([])
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setFunnel(null)
    Promise.all([
      db.rpc('store_funnel', { p_store: ctx.store.id, p_days: Number(days) }),
      db.rpc('store_fit_outcomes', { p_store: ctx.store.id, p_days: Number(days) }),
      db.from('quote_requests').select('id, customer_name, phone, city, status, created_at, config').eq('store_id', ctx.store.id).order('created_at', { ascending: false }).limit(25),
    ]).then(([f, o, q]) => {
      if (!alive) return
      const err = f.error ?? o.error ?? q.error
      if (err) return setError(err.message)
      setFunnel((f.data as FunnelRow[]) ?? [])
      setFit((o.data as { verdict: string; n: number }[]) ?? [])
      setQuotes((q.data as QuoteRow[]) ?? [])
    })
    return () => {
      alive = false
    }
  }, [ctx.store.id, days])

  async function setStatus(id: string, status: QuoteRow['status']) {
    setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, status } : q)))
    const { error } = await db.from('quote_requests').update({ status }).eq('id', id)
    if (error) setError(error.message)
  }

  const totals = STEPS.map((s) => ({ ...s, n: (funnel ?? []).reduce((a, r) => a + Number(r[s.key] ?? 0), 0) }))
  const top = Math.max(1, totals[0]?.n ?? 1)
  const fitTotal = fit.reduce((a, r) => a + Number(r.n), 0)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Overview</h1>
          <p className="mt-1 text-sm text-ink-2">What shoppers did inside RoomSense on your product pages.</p>
        </div>
        <Segmented label="Period" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </div>
      {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
      {!funnel && !error && <div className="grid place-items-center py-20"><Spinner /></div>}

      {funnel && (
        <>
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-5">
              <h2 className="font-sans text-base font-bold tracking-normal">Shopper funnel</h2>
              <p className="text-xs text-muted">Unique shopper sessions per step, all products</p>
              {totals[0].n === 0 ? (
                <p className="mt-6 text-sm text-ink-2">No shopper activity in this period yet. Open a product in your shop to see it appear here.</p>
              ) : (
                <ol className="mt-4 space-y-2.5">
                  {totals.map((s) => (
                    <li key={s.key} className="grid grid-cols-[150px_1fr_44px] items-center gap-3 text-sm">
                      <span className="text-ink-2">{s.label}</span>
                      <span className="h-6 overflow-hidden rounded-md bg-paper-2">
                        <span className="block h-full rounded-md bg-ink" style={{ width: `${(s.n / top) * 100}%`, opacity: 0.35 + 0.65 * (s.n / top) }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{s.n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-base font-bold tracking-normal">Fit outcomes</h2>
              <p className="text-xs text-muted">Results of "Will it fit?" checks</p>
              {fitTotal === 0 ? (
                <p className="mt-6 text-sm text-ink-2">No fit checks yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {fit.map((r) => (
                    <li key={r.verdict} className="flex items-center justify-between text-sm">
                      <Badge tone={r.verdict === 'fits' ? 'good' : r.verdict === 'tight' ? 'warn' : 'bad'}>{r.verdict.replace('_', ' ')}</Badge>
                      <span className="font-semibold tabular-nums">
                        {r.n} <span className="font-normal text-muted">({Math.round((Number(r.n) / fitTotal) * 100)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-5 text-xs leading-relaxed text-muted">
                Many "does not fit" results for one product suggest offering a smaller size or removable legs.
              </p>
            </Card>
          </div>

          <Card className="mt-5 overflow-hidden">
            <div className="p-5 pb-3">
              <h2 className="font-sans text-base font-bold tracking-normal">By product</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2.5 font-semibold">Product</th>
                    {['Opened', '3D', 'AR', 'Measured', 'Fit', 'Quotes'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-right font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {funnel.map((r) => (
                    <tr key={r.product_id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 font-semibold">{r.product_name}</td>
                      {[r.opened, r.viewed_3d, r.ar, r.measured, r.fit, r.quotes].map((n, i) => (
                        <td key={i} className="px-3 py-2.5 text-right tabular-nums text-ink-2">{n}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-5 p-5">
            <h2 className="font-sans text-base font-bold tracking-normal">Quote requests</h2>
            <p className="text-xs text-muted">Shoppers who sent you their configuration, room fit and delivery estimate</p>
            {quotes.length === 0 ? (
              <p className="mt-5 text-sm text-ink-2">No requests yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {quotes.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {q.customer_name} <span className="font-normal text-muted">· {q.city} · {q.phone}</span>
                      </p>
                      <p className="text-sm text-ink-2">
                        {q.config.productName} · {q.config.sizeLabel} · {q.config.finishName}
                        {q.config.price ? ` · ${pkr(q.config.price)}` : ''}
                        {q.config.delivery?.total ? ` + delivery ${pkr(q.config.delivery.total)}` : ''}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {q.config.fit?.verdict && (
                          <Badge tone={q.config.fit.verdict === 'fits' ? 'good' : q.config.fit.verdict === 'tight' ? 'warn' : 'bad'}>
                            Room fit: {q.config.fit.verdict.replace('_', ' ')}
                            {q.config.fit.score != null ? ` (${q.config.fit.score})` : ''}
                          </Badge>
                        )}
                        <Badge tone="neutral" icon={false}>{new Date(q.created_at).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</Badge>
                      </p>
                    </div>
                    <select
                      aria-label={`Status for ${q.customer_name}`}
                      value={q.status}
                      onChange={(e) => setStatus(q.id, e.target.value as QuoteRow['status'])}
                      className="h-10 rounded-xl border border-line bg-card px-3 text-sm font-semibold"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

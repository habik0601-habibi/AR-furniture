import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '../../data/types'
import type { RecCandidate, Recommendation } from '../../engine/types'
import { recommend } from '../../engine/recommend'
import { optimiseLayout } from '../../engine/placement'
import { dominantColors } from '../../engine/color'
import { pkr } from '../../engine/pricing'
import { Badge, Button, Field, Notice, Spinner, cx, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { ProductThumb } from '../demo/ProductThumb'
import type { ShopperContext } from './state'

const STYLES = ['modern', 'classic', 'minimal', 'traditional', 'industrial', 'scandinavian']

/** Reads a photo into a small canvas and returns its dominant colours (k-means in the engine). */
async function photoColors(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, 160 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * scale))
    c.height = Math.max(1, Math.round(img.height * scale))
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return dominantColors(ctx.getImageData(0, 0, c.width, c.height).data, 5)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SuggestPanel(props: {
  storeSlug: string
  product: Product
  all: Product[]
  shopper: ShopperContext
  onPick(slug: string): void
  onGoToRoom(): void
}) {
  const { product, all, shopper } = props
  const navigate = useNavigate()
  const room = shopper.measured?.room ?? null
  const [budget, setBudget] = useState<number | ''>('')
  const [styles, setStyles] = useState<string[]>(product.styles.slice(0, 1))
  const [colors, setColors] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [recs, setRecs] = useState<Recommendation[] | null>(null)

  const candidates: RecCandidate[] = useMemo(
    () =>
      all
        .filter((p) => p.slug !== product.slug)
        .map((p) => ({
          productId: p.slug,
          name: p.name,
          category: p.category,
          styles: p.styles,
          sizes: p.sizes.map((s) => ({ sizeId: s.id, label: s.label, dims: s.dims, price: s.price })),
          finishes: p.finishes.map((f) => ({ finishId: f.id, name: f.name, color: f.color, priceDelta: f.priceDelta })),
        })),
    [all, product.slug],
  )

  useEffect(() => {
    if (!room) return
    setRecs(null)
    const t = setTimeout(() => {
      // the product being viewed counts as already chosen: place it first, so the
      // suggestions complete the room around it (a sofa makes coffee tables rank higher)
      const fixed = shopper.existing.filter((e) => e.locked)
      const free = shopper.existing.filter((e) => !e.locked).map(({ id, productId, category, dims, name }) => ({ id, productId, category, dims, name }))
      const size = product.sizes[Math.min(1, product.sizes.length - 1)]
      const chosen = { id: 'chosen', productId: product.slug, category: product.category, dims: size.dims }
      const layout = optimiseLayout(room, [chosen, ...free], fixed, { iterations: 600 }).items
      setRecs(
        recommend({
          room,
          layout,
          candidates,
          budget: budget === '' ? undefined : budget,
          preferredStyles: styles,
          roomColors: colors.length ? colors : undefined,
          limit: 6,
        }),
      )
    }, 30)
    return () => clearTimeout(t)
  }, [room, candidates, budget, styles, colors, shopper.existing, product])

  if (!room)
    return (
      <div className="space-y-4">
        <h2 className="text-2xl">Suggestions for your room</h2>
        <p className="text-sm text-ink-2">Measure your room and RoomSense suggests pieces that fit the free space, your budget and your room's colours.</p>
        <Button variant="primary" icon="ruler" onClick={props.onGoToRoom}>Measure my room</Button>
      </div>
    )

  const byId = new Map(all.map((p) => [p.slug, p]))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Suggestions for your room</h2>
        <p className="mt-1 text-sm text-ink-2">Ranked by fit in the free space, budget, what the room is missing, style and colour match.</p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-line bg-card p-4">
        <Field label="Budget per item" hint="optional, rupees">
          <input className={inputClass} type="number" min={0} step={5000} placeholder="e.g. 80000" value={budget} onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
        <div>
          <p className="text-sm font-semibold">Style</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s}
                aria-pressed={styles.includes(s)}
                onClick={() => setStyles(styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s])}
                className={cx('min-h-9 rounded-full px-3.5 text-sm font-semibold capitalize', styles.includes(s) ? 'bg-ink text-paper' : 'bg-paper-2 text-ink-2')}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Match my room's colours</p>
          <p className="text-xs text-muted">Take or choose a photo of the room. Colours are read on this phone; the photo is not uploaded.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold hover:border-ink-2">
              <Icon name="camera" size={16} /> {colors.length ? 'Change photo' : 'Add a room photo'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setReading(true)
                  try {
                    setColors(await photoColors(f))
                  } finally {
                    setReading(false)
                  }
                }}
              />
            </label>
            {reading && <Spinner small />}
            {colors.length > 0 && (
              <span className="flex items-center gap-1" aria-label="Colours found in your photo">
                {colors.map((c) => <span key={c} className="h-7 w-7 rounded-full ring-1 ring-line" style={{ background: c }} title={c} />)}
              </span>
            )}
          </div>
        </div>
      </section>

      {!recs && <div className="flex items-center gap-3 text-sm text-ink-2"><Spinner small /> Checking every product against your room…</div>}
      {recs && recs.length === 0 && <Notice tone="info">Nothing else in this shop fits the free space in your room right now.</Notice>}
      {recs && recs.length > 0 && (
        <ul className="grid gap-3">
          {recs.map((r) => {
            const p = byId.get(r.productId)
            const finish = p?.finishes.find((f) => f.id === r.finishId)
            return (
              <li key={r.productId}>
                <button
                  onClick={() => {
                    props.onPick(r.productId)
                    navigate(`/embed/${props.storeSlug}/${r.productId}`)
                  }}
                  className="flex w-full gap-3 rounded-2xl border border-line bg-card p-3 text-left shadow-soft transition-colors hover:border-ink-2"
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-paper-2">{p && <ProductThumb product={p} />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">{r.name}</p>
                      <span className="shrink-0 rounded-full bg-paper-2 px-2 py-0.5 text-xs font-bold tabular-nums">{Math.round(r.score)}</span>
                    </div>
                    <p className="text-sm text-ink-2">
                      {pkr(r.price)}
                      {finish ? ` · ${finish.name}` : ''}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {r.reasons.slice(0, 3).map((x, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-ink-2">
                          <Icon name="check" size={13} className="mt-px shrink-0 text-sage" /> {x}
                        </li>
                      ))}
                    </ul>
                    {r.verdict !== 'fits' && <Badge tone="warn" className="mt-1.5">{r.verdict === 'tight' ? 'Tight fit' : 'Does not fit'}</Badge>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import type { Product } from '../../data/types'
import { pkr } from '../../engine/pricing'
import { Icon } from '../../components/Icon'
import { cx } from '../../components/ui'

export function CustomizePanel(props: {
  product: Product
  sizeId: string
  finishId: string
  onSize(id: string): void
  onFinish(id: string): void
  showDims: boolean
  setShowDims(v: boolean): void
  showHotspots: boolean
  setShowHotspots(v: boolean): void
  price: number
}) {
  const { product, sizeId, finishId } = props
  const size = product.sizes.find((s) => s.id === sizeId)!
  const finish = product.finishes.find((f) => f.id === finishId)
  const kinds = Array.from(new Set(product.finishes.map((f) => f.kind)))

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-ink-2">{product.description}</p>
      </div>

      <section aria-labelledby="size-h">
        <h2 id="size-h" className="font-sans text-sm font-bold tracking-normal">Size</h2>
        <div className="mt-2.5 grid gap-2">
          {product.sizes.map((s) => (
            <button
              key={s.id}
              onClick={() => props.onSize(s.id)}
              aria-pressed={s.id === sizeId}
              className={cx(
                'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                s.id === sizeId ? 'border-ink bg-card shadow-soft' : 'border-line bg-card/60 hover:border-ink-2',
              )}
            >
              <span>
                <span className="block font-semibold">{s.label}</span>
                <span className="text-sm text-ink-2">
                  {s.dims.w} W × {s.dims.d} D × {s.dims.h} H cm
                </span>
              </span>
              <span className="font-semibold tabular-nums">{pkr(s.price)}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="finish-h">
        <div className="flex items-baseline justify-between">
          <h2 id="finish-h" className="font-sans text-sm font-bold tracking-normal">Finish</h2>
          <p className="text-sm text-ink-2">
            {finish?.name}
            {finish && finish.priceDelta > 0 && <span className="text-muted"> · +{pkr(finish.priceDelta)}</span>}
          </p>
        </div>
        {kinds.map((k) => (
          <div key={k} className="mt-2.5">
            {kinds.length > 1 && <p className="mb-1.5 text-xs font-semibold capitalize text-muted">{k}</p>}
            <div className="flex flex-wrap gap-2.5">
              {product.finishes
                .filter((f) => f.kind === k)
                .map((f) => (
                  <button
                    key={f.id}
                    onClick={() => props.onFinish(f.id)}
                    aria-label={`${f.name}${f.priceDelta ? `, plus ${pkr(f.priceDelta)}` : ''}`}
                    aria-pressed={f.id === finishId}
                    title={f.name}
                    className={cx(
                      'relative h-11 w-11 rounded-full ring-offset-2 ring-offset-paper transition-shadow',
                      f.id === finishId ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-ink-2',
                    )}
                    style={{ background: f.color }}
                  >
                    {f.id === finishId && (
                      <span className="absolute inset-0 grid place-items-center text-white mix-blend-difference">
                        <Icon name="check" size={18} />
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="view-h">
        <h2 id="view-h" className="font-sans text-sm font-bold tracking-normal">On the model</h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Toggle on={props.showDims} onChange={props.setShowDims} icon="dimension" label="Dimensions" />
          <Toggle on={props.showHotspots} onChange={props.setShowHotspots} icon="info" label="Details" />
        </div>
        <p className="mt-3 text-sm text-ink-2">
          Drag to rotate, pinch or scroll to zoom. On a phone, tap <b>View in AR</b> to place it on your floor at real size.
        </p>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-ink-2">
              {size.label} · {finish?.name}
            </p>
            <p className="font-display text-3xl tabular-nums">{pkr(props.price)}</p>
          </div>
          <p className="text-right text-xs text-muted">
            Ships in {product.leadDays} days
            <br />
            {product.assemblyRequired ? 'Assembly needed' : 'Arrives assembled'}
          </p>
        </div>
      </section>

      {product.credit.author && (
        <p className="text-xs text-muted">
          3D model:{' '}
          {product.credit.url ? (
            <a href={product.credit.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
              {product.credit.title}
            </a>
          ) : (
            product.credit.title
          )}{' '}
          by {product.credit.author}, {product.credit.license}.
        </p>
      )}
    </div>
  )
}

function Toggle({ on, onChange, icon, label }: { on: boolean; onChange(v: boolean): void; icon: 'dimension' | 'info'; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx('flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors', on ? 'bg-ink text-paper' : 'bg-paper-2 text-ink-2 hover:text-ink')}
    >
      <Icon name={icon} size={16} /> {label}
    </button>
  )
}

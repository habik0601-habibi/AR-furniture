import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { fetchStoreProduct, type Store, type StoreProduct } from '../../lib/catalogApi'
import { track } from '../../lib/track'
import { configuredPrice, pkr } from '../../engine/pricing'
import { ProductViewer } from '../../components/ProductViewer'
import { Icon, type IconName } from '../../components/Icon'
import { Notice, Spinner, cx } from '../../components/ui'
import { useShopperContext } from './state'
import { CustomizePanel } from './CustomizePanel'
import { RoomPanel } from './RoomPanel'
import { FitPanel } from './FitPanel'
import { DeliveryPanel } from './DeliveryPanel'
import { SuggestPanel } from './SuggestPanel'
import { QuotePanel } from './QuotePanel'
import type { FitReport, DeliveryQuote, DeliveryPathResult } from '../../engine/types'

export type StepKey = 'customize' | 'room' | 'fit' | 'delivery' | 'suggest' | 'quote'

const STEPS: { key: StepKey; label: string; short: string; icon: IconName }[] = [
  { key: 'customize', label: 'Customize', short: 'Style', icon: 'palette' },
  { key: 'room', label: 'Your room', short: 'Room', icon: 'ruler' },
  { key: 'fit', label: 'Fit & layout', short: 'Fit', icon: 'layout' },
  { key: 'delivery', label: 'Delivery', short: 'Delivery', icon: 'truck' },
  { key: 'suggest', label: 'Suggestions', short: 'Ideas', icon: 'sparkle' },
  { key: 'quote', label: 'Send to store', short: 'Send', icon: 'arrowRight' },
]

/** Results computed in later steps that the quote request carries along. */
export interface Outcome {
  fit?: FitReport
  path?: DeliveryPathResult
  delivery?: DeliveryQuote
}

export default function Embed() {
  const { store: storeSlug = '', product: productSlug = '' } = useParams()
  const [params] = useSearchParams()
  const inline = params.get('view') === 'inline'
  const [data, setData] = useState<{ store: Store; product: StoreProduct; all: StoreProduct[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<StepKey>((params.get('step') as StepKey) || 'customize')
  const [sizeId, setSizeId] = useState('')
  const [finishId, setFinishId] = useState('')
  const [showDims, setShowDims] = useState(false)
  const [showHotspots, setShowHotspots] = useState(true)
  const [shopper, updateShopper] = useShopperContext()
  const [outcome, setOutcome] = useState<Outcome>({})
  const [arMessage, setArMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    fetchStoreProduct(storeSlug, productSlug)
      .then((d) => {
        if (!alive) return
        setData(d)
        setSizeId(d.product.sizes[Math.min(1, d.product.sizes.length - 1)]?.id ?? d.product.sizes[0].id)
        setFinishId(d.product.finishes[0]?.id ?? '')
        setOutcome({})
        if (!inline) track(storeSlug, productSlug, 'widget_opened', {}, true)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [storeSlug, productSlug, inline])

  const product = data?.product
  const size = product?.sizes.find((s) => s.id === sizeId) ?? product?.sizes[0]
  const finish = product?.finishes.find((f) => f.id === finishId) ?? product?.finishes[0]
  const price = size ? configuredPrice(size.price, finish?.priceDelta ?? 0) : 0

  // a new size or finish invalidates earlier fit/delivery results
  useEffect(() => setOutcome({}), [sizeId, finishId])

  const close = () => window.parent?.postMessage({ type: 'roomsense:close' }, '*')
  const openFull = (s?: StepKey) => window.parent?.postMessage({ type: 'roomsense:open', store: storeSlug, product: productSlug, step: s }, '*')

  const viewerEvent = useMemo(
    () => (name: 'viewer_loaded' | 'ar_started' | 'hotspot_opened') => {
      if (name === 'viewer_loaded') track(storeSlug, productSlug, 'viewer_loaded', { inline }, true)
      if (name === 'ar_started') track(storeSlug, productSlug, 'ar_started', { sizeId, finishId })
    },
    [storeSlug, productSlug, inline, sizeId, finishId],
  )

  if (error)
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Notice tone="bad" title="RoomSense could not load this product">{error}</Notice>
      </div>
    )
  if (!data || !product || !size || !finish)
    return (
      <div className="grid min-h-dvh place-items-center text-ink-2">
        <Spinner />
      </div>
    )

  const viewer = (
    <ProductViewer
      product={product}
      sizeId={size.id}
      finishId={finish.id}
      showDimensions={showDims}
      showHotspots={showHotspots}
      onEvent={viewerEvent}
      onArStatus={(s) => setArMessage(s === 'failed' ? 'AR could not start on this device. Try Chrome on Android or Safari on iPhone.' : null)}
      className="h-full w-full"
    />
  )

  if (inline) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-[#f3efe8]">
        {viewer}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <div className="pointer-events-auto flex gap-1.5 rounded-full bg-card/90 p-1.5 shadow-soft backdrop-blur">
            {product.finishes.slice(0, 6).map((f) => (
              <button
                key={f.id}
                onClick={() => setFinishId(f.id)}
                aria-label={f.name}
                aria-pressed={f.id === finish.id}
                title={f.name}
                className={cx('h-7 w-7 rounded-full border-2', f.id === finish.id ? 'border-ink' : 'border-white')}
                style={{ background: f.color }}
              />
            ))}
          </div>
          <button onClick={() => openFull('room')} className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-paper shadow-soft">
            <Icon name="ruler" size={16} /> Will it fit?
          </button>
        </div>
      </div>
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const next = STEPS[stepIndex + 1]

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{data.store.name}</p>
          <p className="truncate font-semibold leading-tight">{product.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-right sm:block">
            <span className="block text-xs text-muted">{size.label} · {finish.name}</span>
            <span className="font-semibold tabular-nums">{pkr(price)}</span>
          </p>
          <button onClick={close} aria-label="Close RoomSense" className="grid h-10 w-10 place-items-center rounded-full bg-paper-2 hover:bg-line">
            <Icon name="x" />
          </button>
        </div>
      </header>

      {/* minmax(0, …) columns: without them the six-tab step bar widens the whole grid on phones */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(240px,42%)_1fr] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-1">
        <section className="relative min-h-0 min-w-0 bg-[#f3efe8]" aria-label="3D view">
          {viewer}
          {arMessage && <Notice tone="warn" className="absolute inset-x-3 top-3">{arMessage}</Notice>}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col border-line lg:border-l">
          <nav aria-label="Steps" className="shrink-0 overflow-x-auto border-b border-line bg-card">
            <ol className="flex min-w-max px-2">
              {STEPS.map((s, i) => (
                <li key={s.key}>
                  <button
                    onClick={() => setStep(s.key)}
                    aria-current={step === s.key ? 'step' : undefined}
                    className={cx(
                      'flex h-12 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors',
                      step === s.key ? 'border-clay text-ink' : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px]', step === s.key ? 'bg-clay text-white' : 'bg-paper-2 text-ink-2')}>{i + 1}</span>
                    <span className="sm:hidden">{s.short}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {step === 'customize' && (
              <CustomizePanel
                product={product}
                sizeId={size.id}
                finishId={finish.id}
                onSize={(id) => { setSizeId(id); track(storeSlug, productSlug, 'customized', { sizeId: id }) }}
                onFinish={(id) => { setFinishId(id); track(storeSlug, productSlug, 'customized', { finishId: id }) }}
                showDims={showDims}
                setShowDims={setShowDims}
                showHotspots={showHotspots}
                setShowHotspots={setShowHotspots}
                price={price}
              />
            )}
            {step === 'room' && (
              <RoomPanel
                shopper={shopper}
                update={updateShopper}
                onMeasured={(m) => track(storeSlug, productSlug, 'room_measured', { method: m.method, w: m.room.width, d: m.room.depth })}
                onNext={() => setStep('fit')}
              />
            )}
            {step === 'fit' && (
              <FitPanel
                product={product}
                size={size}
                shopper={shopper}
                update={updateShopper}
                onGoToRoom={() => setStep('room')}
                onResult={(fit) => {
                  setOutcome((o) => ({ ...o, fit }))
                  track(storeSlug, productSlug, 'fit_checked', { verdict: fit.verdict, score: fit.score })
                }}
                onLayout={() => track(storeSlug, productSlug, 'layout_generated', {}, true)}
              />
            )}
            {step === 'delivery' && (
              <DeliveryPanel
                store={data.store}
                product={product}
                size={size}
                price={price}
                shopper={shopper}
                update={updateShopper}
                onResult={(path, delivery) => {
                  setOutcome((o) => ({ ...o, path, delivery }))
                  track(storeSlug, productSlug, 'delivery_quoted', { ok: path.ok, total: delivery.total, to: delivery.toCity })
                }}
              />
            )}
            {step === 'suggest' && (
              <SuggestPanel
                storeSlug={storeSlug}
                product={product}
                all={data.all}
                shopper={shopper}
                onPick={(slug) => track(storeSlug, slug, 'recommendation_clicked', { from: productSlug })}
                onGoToRoom={() => setStep('room')}
              />
            )}
            {step === 'quote' && (
              <QuotePanel store={data.store} product={product} size={size} finish={finish} price={price} shopper={shopper} outcome={outcome} />
            )}
          </div>

          {next && (
            <div className="shrink-0 border-t border-line bg-card p-3 sm:px-6">
              <button onClick={() => setStep(next.key)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink font-semibold text-paper hover:bg-ink-2">
                Next: {next.label} <Icon name="arrowRight" size={18} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProducts, fetchStore, type Store, type StoreProduct } from '../../lib/catalogApi'
import { withLocalTestProducts } from '../../lib/localTest'
import { pkr } from '../../engine/pricing'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/ui'
import { ProductThumb } from './ProductThumb'

/**
 * Two fictional furniture shops with deliberately different looks. Neither
 * contains any RoomSense code except the two integration lines: the script tag
 * (loaded below, as a shop would put it in its theme) and the
 * <div data-roomsense …> on the product page. That is the point of the demo.
 */
const THEMES = {
  shahi: {
    page: 'bg-[#f6ecdc] text-[#3a1f16]',
    header: 'bg-[#5b2a1e] text-[#f3e3c7]',
    accent: 'text-[#9a6b2f]',
    card: 'bg-[#fffaf1] border border-[#e6d3b5]',
    button: '#5b2a1e',
    font: 'font-display',
    tagline: 'Handcrafted sheesham furniture since 1987 · Lahore',
    nav: ['Living', 'Bedroom', 'Dining', 'Wedding packages'],
  },
  nest: {
    page: 'bg-[#f3f5f4] text-[#1f2b29]',
    header: 'bg-white text-[#1f2b29] border-b border-[#dfe5e3]',
    accent: 'text-[#4f7f74]',
    card: 'bg-white border border-[#e2e8e6]',
    button: '#1f2b29',
    font: 'font-sans font-bold tracking-tight',
    tagline: 'Modern furniture, delivered across Pakistan · Karachi',
    nav: ['New in', 'Sofas', 'Beds', 'Workspace'],
  },
} as const

type ThemeKey = keyof typeof THEMES

function useWidgetScript() {
  useEffect(() => {
    if (document.querySelector('script[data-roomsense-loader]')) {
      ;(window as unknown as { RoomSense?: { scan(): void } }).RoomSense?.scan()
      return
    }
    const s = document.createElement('script')
    s.src = '/widget.js'
    s.defer = true
    s.dataset.roomsenseLoader = ''
    document.body.appendChild(s)
  }, [])
}

export default function DemoShop() {
  const { store: storeSlug = 'shahi', product: productSlug } = useParams()
  const theme = THEMES[(storeSlug in THEMES ? storeSlug : 'shahi') as ThemeKey]
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  useWidgetScript()

  useEffect(() => {
    let alive = true
    setError(null)
    fetchStore(storeSlug)
      .then(async (s) => {
        const p = withLocalTestProducts(s.slug, await fetchProducts(s.id))
        if (!alive) return
        setStore(s)
        setProducts(p)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [storeSlug])

  useEffect(() => {
    document.title = store ? `${store.name}${productSlug ? ' · ' + (products.find((p) => p.slug === productSlug)?.name ?? '') : ''}` : 'Demo shop'
  }, [store, productSlug, products])

  const product = productSlug ? products.find((p) => p.slug === productSlug) : undefined
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products])
  const shown = filter === 'all' ? products : products.filter((p) => p.category === filter)

  return (
    <div className={`min-h-dvh ${theme.page}`}>
      <div className="bg-black/80 px-4 py-1.5 text-center text-xs text-white/80">
        Demo shop for the RoomSense project. Fictional store, no real orders.{' '}
        <Link to="/" className="font-semibold text-white underline underline-offset-2">Back to RoomSense</Link>
      </div>
      <header className={theme.header}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to={`/demo/${storeSlug}`} className={`text-2xl ${theme.font}`}>
            {store?.name ?? '…'}
          </Link>
          <nav className="hidden gap-6 text-sm opacity-90 md:flex">
            {theme.nav.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <span className="flex items-center gap-1.5 text-sm opacity-90">
            <Icon name="store" size={18} /> Cart (0)
          </span>
        </div>
      </header>

      {error && <p className="mx-auto max-w-6xl px-6 py-10 text-center">Could not load the shop: {error}</p>}
      {!error && !store && (
        <div className="grid place-items-center py-24">
          <Spinner />
        </div>
      )}

      {store && !product && (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className={`text-sm ${theme.accent}`}>{theme.tagline}</p>
          <h1 className={`mt-2 text-4xl ${theme.font}`}>Our collection</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            {['all', ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`min-h-9 rounded-full px-4 text-sm capitalize ${filter === c ? 'bg-black/85 text-white' : 'bg-black/5 hover:bg-black/10'}`}
              >
                {c.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
            {shown.map((p) => (
              <Link key={p.slug} to={`/demo/${storeSlug}/${p.slug}`} className={`group overflow-hidden rounded-xl ${theme.card}`}>
                <div className="aspect-[4/3] bg-black/[0.03]">
                  <ProductThumb product={p} />
                </div>
                <div className="p-3 sm:p-4">
                  <p className="text-[15px] font-semibold leading-snug group-hover:underline">{p.name}</p>
                  <p className={`mt-1 text-sm ${theme.accent}`}>from {pkr(Math.min(...p.sizes.map((s) => s.price)))}</p>
                </div>
              </Link>
            ))}
          </div>
        </main>
      )}

      {store && productSlug && !product && products.length > 0 && (
        <p className="mx-auto max-w-6xl px-6 py-10">This product is not available.</p>
      )}

      {store && product && (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Link to={`/demo/${storeSlug}`} className="inline-flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100">
            <Icon name="arrowLeft" size={16} /> All products
          </Link>
          <div className="mt-5 grid gap-8 md:grid-cols-[1.25fr_1fr]">
            {/* ↓↓↓ The only RoomSense integration on this page ↓↓↓ */}
            <div key={product.slug} data-roomsense="" data-store={store.slug} data-product={product.slug} data-color={theme.button} data-height="460" />
            {/* ↑↑↑ ---------------------------------------------- ↑↑↑ */}
            <div>
              <p className={`text-sm capitalize ${theme.accent}`}>{product.category.replace('_', ' ')}</p>
              <h1 className={`mt-1 text-3xl leading-tight sm:text-4xl ${theme.font}`}>{product.name}</h1>
              <p className="mt-3 text-2xl font-semibold">{pkr(Math.min(...product.sizes.map((s) => s.price)))}</p>
              <p className="mt-4 leading-relaxed opacity-85">{product.description}</p>
              <dl className={`mt-6 divide-y divide-black/10 rounded-xl text-sm ${theme.card}`}>
                {product.sizes.map((s) => (
                  <div key={s.id} className="flex justify-between gap-3 px-4 py-3">
                    <dt className="font-semibold">{s.label}</dt>
                    <dd className="text-right opacity-80">
                      {s.dims.w} × {s.dims.d} × {s.dims.h} cm · {pkr(s.price)}
                    </dd>
                  </div>
                ))}
              </dl>
              <button disabled className="mt-6 h-12 w-full rounded-full bg-black/80 font-semibold text-white opacity-60" title="Demo shop">
                Add to cart (demo)
              </button>
              <p className="mt-3 text-xs opacity-70">
                Delivery in {product.leadDays} days{product.assemblyRequired ? ' · assembly included' : ''}.
              </p>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

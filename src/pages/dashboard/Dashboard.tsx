import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { db, supabaseConfigured } from '../../lib/supabase'
import { fetchProducts, type StoreProduct } from '../../lib/catalogApi'
import { Icon, type IconName } from '../../components/Icon'
import { Button, Card, Field, Notice, Spinner, inputClass } from '../../components/ui'
import { Logo } from '../Landing'
import { Overview } from './Overview'
import { Products } from './Products'
import { DeliverySettings } from './DeliverySettings'
import { EmbedCode } from './EmbedCode'

export interface OwnerStore {
  id: string
  slug: string
  name: string
  city: string
  brand_color: string
  delivery_rules: Record<string, unknown>
}

export interface DashboardCtx {
  store: OwnerStore
  products: StoreProduct[]
  reload(): Promise<void>
  setStore(s: OwnerStore): void
}

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.title = 'RoomSense · Store dashboard'
    db.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured) return <Centered><Notice tone="bad" title="Supabase is not configured">Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.</Notice></Centered>
  if (!ready) return <Centered><Spinner /></Centered>
  if (!session) return <Login />
  return <Shell session={session} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center px-4">{children}</div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
  }

  return (
    <div className="grid-paper grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-sm p-7">
        <Logo />
        <h1 className="mt-6 text-2xl">Store dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">Sign in to manage your catalogue, delivery rules and leads.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" busy={busy} className="w-full">Sign in</Button>
        </form>
      </Card>
    </div>
  )
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/dashboard', label: 'Overview', icon: 'chart', end: true },
  { to: '/dashboard/products', label: 'Products', icon: 'cube' },
  { to: '/dashboard/delivery', label: 'Delivery', icon: 'truck' },
  { to: '/dashboard/embed', label: 'Embed code', icon: 'code' },
]

function Shell({ session }: { session: Session }) {
  const [store, setStore] = useState<OwnerStore | null>(null)
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await db
      .from('stores')
      .select('id, slug, name, city, brand_color, delivery_rules')
      .eq('owner_id', session.user.id)
      .maybeSingle()
    if (error) return setError(error.message)
    if (!data) return setError('This account does not own a store.')
    setStore(data as OwnerStore)
    setProducts(await fetchProducts(data.id, true))
  }, [session.user.id])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <Centered><Notice tone="bad" title="Could not open the dashboard">{error}</Notice></Centered>
  if (!store) return <Centered><Spinner /></Centered>
  const ctx: DashboardCtx = { store, products, reload: load, setStore }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-4 md:block md:p-5">
          <Logo />
          <div className="md:mt-6">
            <p className="hidden text-xs font-bold uppercase tracking-[0.12em] text-muted md:block">Store</p>
            <p className="text-sm font-semibold md:mt-1 md:text-base">{store.name}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold ${isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2'}`
              }
            >
              <Icon name={n.icon} size={18} /> {n.label}
            </NavLink>
          ))}
          <a href={`/demo/${store.slug}`} target="_blank" rel="noreferrer" className="flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-paper-2">
            <Icon name="external" size={18} /> View shop
          </a>
          <button onClick={() => db.auth.signOut()} className="flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-ink-2 hover:bg-paper-2">
            <Icon name="logout" size={18} /> Sign out
          </button>
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <Routes>
          <Route index element={<Overview ctx={ctx} />} />
          <Route path="products" element={<Products ctx={ctx} />} />
          <Route path="delivery" element={<DeliverySettings ctx={ctx} />} />
          <Route path="embed" element={<EmbedCode ctx={ctx} />} />
        </Routes>
      </main>
    </div>
  )
}

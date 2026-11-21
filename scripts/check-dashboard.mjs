// Signs in as the Shahi demo owner (credentials from .env.local, never printed)
// and prints what the dashboard would show: funnel totals and recent quote requests.
// Also checks that the Nest owner cannot see Shahi's data (RLS).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })

const shahi = client()
await shahi.auth.signInWithPassword({ email: env.DEMO_SHAHI_EMAIL, password: env.DEMO_SHAHI_PASSWORD })
const { data: store } = await shahi.from('stores').select('id').eq('slug', 'shahi').single()
const f = await shahi.rpc('store_funnel', { p_store: store.id, p_days: 30 })
const tot = {}
for (const r of f.data ?? []) for (const k of ['opened', 'viewed_3d', 'customized', 'ar', 'measured', 'fit', 'delivery', 'quotes']) tot[k] = (tot[k] ?? 0) + Number(r[k])
console.log('shahi funnel totals', f.error?.message ?? tot)
const q = await shahi.from('quote_requests').select('customer_name, city, config->>productName, config->>price').limit(3)
console.log('shahi quotes', q.error?.message ?? q.data)

const nest = client()
await nest.auth.signInWithPassword({ email: env.DEMO_NEST_EMAIL, password: env.DEMO_NEST_PASSWORD })
const nq = await nest.from('quote_requests').select('id').eq('store_id', store.id)
const nf = await nest.rpc('store_funnel', { p_store: store.id, p_days: 30 })
console.log('nest sees shahi quotes:', nq.data?.length ?? nq.error?.message, '| nest sees shahi funnel rows:', nf.data?.length ?? nf.error?.message)

const anon = client()
const aq = await anon.from('quote_requests').select('id')
const ae = await anon.from('events').insert({ store_id: store.id, session_id: 'abcdefgh12', name: 'widget_opened' })
console.log('anon reads quotes:', aq.data?.length ?? aq.error?.message, '| anon direct event insert:', ae.error ? 'refused' : 'ALLOWED')

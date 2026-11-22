// Verifies the cross-site demo: the quote sent from the plain-HTML Hearth & Home
// site reached ITS owner, and the other stores' owners cannot see it.
// Credentials come from .env.local and are never printed.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const login = async (who) => {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: env[`DEMO_${who}_EMAIL`], password: env[`DEMO_${who}_PASSWORD`] })
  if (error) throw new Error(`${who}: ${error.message}`)
  return db
}
const hearth = await login('HEARTH')
const { data: store } = await hearth.from('stores').select('id').eq('slug', 'hearth').single()
const q = await hearth.from('quote_requests').select('customer_name, city, config->>productName, config->>price').eq('store_id', store.id)
console.log('hearth owner sees quotes:', q.error?.message ?? q.data)
const f = await hearth.rpc('store_funnel', { p_store: store.id, p_days: 30 })
const tot = {}
for (const r of f.data ?? []) for (const k of ['opened', 'viewed_3d', 'customized', 'ar', 'measured', 'fit', 'delivery', 'quotes']) tot[k] = (tot[k] ?? 0) + Number(r[k])
console.log('hearth funnel totals:', f.error?.message ?? tot)
for (const who of ['SHAHI', 'NEST']) {
  const db = await login(who)
  const r = await db.from('quote_requests').select('id').eq('store_id', store.id)
  const fr = await db.rpc('store_funnel', { p_store: store.id, p_days: 30 })
  console.log(`${who.toLowerCase()} owner sees hearth quotes:`, r.data?.length ?? r.error?.message, '| hearth funnel rows:', fr.data?.length ?? fr.error?.message)
}

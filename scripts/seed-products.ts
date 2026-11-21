// Seeds both demo stores with the catalogue in src/data/catalog.ts.
// Signs in as each store owner (credentials from .env.local, never printed),
// so the inserts go through the same row-level security as the dashboard.
// Usage: npx tsx scripts/seed-products.ts
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { catalog } from '../src/data/catalog'
import { productToRow } from '../src/lib/catalogApi'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)

// Nest Living (modern) carries a subset and prices 4% higher, so the two shops differ.
const plans = [
  { who: 'SHAHI', slug: 'shahi', pick: () => true, markup: 1 },
  { who: 'NEST', slug: 'nest', pick: (styles: string[]) => !styles.includes('traditional') || styles.includes('modern'), markup: 1.04 },
]

for (const plan of plans) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { error: authErr } = await db.auth.signInWithPassword({ email: env[`DEMO_${plan.who}_EMAIL`], password: env[`DEMO_${plan.who}_PASSWORD`] })
  if (authErr) throw new Error(`${plan.slug}: ${authErr.message}`)
  const { data: store, error: sErr } = await db.from('stores').select('id').eq('slug', plan.slug).single()
  if (sErr) throw sErr
  const rows = catalog
    .filter((p) => plan.pick(p.styles))
    .map((p, i) => {
      const poster = existsSync(new URL(`../public/posters/${p.slug}.webp`, import.meta.url)) ? `/posters/${p.slug}.webp` : p.model.poster
      const priced = { ...p, model: { ...p.model, poster }, sizes: p.sizes.map((s) => ({ ...s, price: Math.round((s.price * plan.markup) / 500) * 500 })) }
      return productToRow(priced, store.id, i + 1)
    })
  const { error } = await db.from('products').upsert(rows, { onConflict: 'store_id,slug' })
  console.log(plan.slug, error ? `error: ${error.message}` : `${rows.length} products upserted`)
}

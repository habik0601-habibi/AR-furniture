// Seeds the demo stores with the catalogue in src/data/catalog.ts.
// Signs in as each store owner (credentials from .env.local, never printed),
// so the inserts go through the same row-level security as the dashboard.
// Usage: npx tsx scripts/seed-products.ts [shahi|nest|hearth]   (no argument = all)
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { catalog } from '../src/data/catalog'
import { productToRow } from '../src/lib/catalogApi'
import { HEARTH, markupPrice } from './demoStores'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)

// Nest Living (modern) carries a subset and prices 4% higher, so the shops differ.
const plans = [
  { who: 'SHAHI', slug: 'shahi', pick: () => true, markup: 1 },
  { who: 'NEST', slug: 'nest', pick: (p: { styles: string[] }) => !p.styles.includes('traditional') || p.styles.includes('modern'), markup: 1.04 },
  { who: 'HEARTH', slug: HEARTH.slug, pick: (p: { slug: string }) => (HEARTH.products as readonly string[]).includes(p.slug), markup: HEARTH.markup },
]

const only = process.argv[2]
for (const plan of plans.filter((p) => !only || p.slug === only)) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { error: authErr } = await db.auth.signInWithPassword({ email: env[`DEMO_${plan.who}_EMAIL`], password: env[`DEMO_${plan.who}_PASSWORD`] })
  if (authErr) throw new Error(`${plan.slug}: ${authErr.message}`)
  const { data: store, error: sErr } = await db.from('stores').select('id').eq('slug', plan.slug).single()
  if (sErr) throw sErr
  const rows = catalog
    .filter((p) => plan.pick(p as never))
    .map((p, i) => {
      const poster = existsSync(new URL(`../public/posters/${p.slug}.webp`, import.meta.url)) ? `/posters/${p.slug}.webp` : p.model.poster
      const priced = { ...p, model: { ...p.model, poster }, sizes: p.sizes.map((s) => ({ ...s, price: markupPrice(s.price, plan.markup) })) }
      return productToRow(priced, store.id, i + 1)
    })
  const { error } = await db.from('products').upsert(rows, { onConflict: 'store_id,slug' })
  console.log(plan.slug, error ? `error: ${error.message}` : `${rows.length} products upserted`)
}

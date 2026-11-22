// One-off: creates the Hearth & Home demo store and its owner login through a
// temporary database function (dropped right after). Reads credentials from
// .env.local and never prints the password.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const { data, error } = await db.rpc('tmp_seed_hearth', { p_email: env.DEMO_HEARTH_EMAIL, p_password: env.DEMO_HEARTH_PASSWORD })
console.log(env.DEMO_HEARTH_EMAIL, error ? `error: ${error.message}` : `created ${data}`)
if (!error) {
  const s = await db.auth.signInWithPassword({ email: env.DEMO_HEARTH_EMAIL, password: env.DEMO_HEARTH_PASSWORD })
  console.log('sign-in check:', s.error ? s.error.message : 'ok')
}

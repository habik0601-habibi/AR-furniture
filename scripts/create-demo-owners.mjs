// One-off: creates the two demo store owners through a temporary database
// function (tmp_seed_owner, dropped right after). Reads credentials from
// .env.local and never prints the passwords.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
for (const who of ['SHAHI', 'NEST']) {
  const email = env[`DEMO_${who}_EMAIL`]
  const { data, error } = await db.rpc('tmp_seed_owner', { p_email: email, p_password: env[`DEMO_${who}_PASSWORD`] })
  console.log(email, error ? `error: ${error.message}` : `created ${data}`)
  if (!error) {
    const s = await db.auth.signInWithPassword({ email, password: env[`DEMO_${who}_PASSWORD`] })
    console.log('  sign-in check:', s.error ? s.error.message : 'ok')
  }
}

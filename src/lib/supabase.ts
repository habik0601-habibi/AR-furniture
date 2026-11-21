import { createClient } from '@supabase/supabase-js'

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

/**
 * One client for the whole app. Shoppers never sign in (the publishable key
 * only allows reading active catalogues and calling the rate-limited
 * track_event / request_quote functions). Store owners sign in with email.
 */
export const db = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'roomsense-auth' },
})

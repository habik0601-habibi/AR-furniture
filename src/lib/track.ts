import { db, supabaseConfigured } from './supabase'
import { sessionId } from './session'

export type EventName =
  | 'widget_opened'
  | 'viewer_loaded'
  | 'customized'
  | 'ar_started'
  | 'room_measured'
  | 'layout_generated'
  | 'fit_checked'
  | 'delivery_quoted'
  | 'recommendation_clicked'
  | 'quote_requested'

const sent = new Set<string>()

/**
 * Fire-and-forget analytics for the store dashboard. Never throws and never
 * blocks the shopper. `once` de-duplicates within a page load.
 */
export function track(store: string, product: string | null, name: EventName,
                      data: Record<string, unknown> = {}, once = false): void {
  if (!supabaseConfigured) return
  const dedupe = `${store}|${product}|${name}`
  if (once && sent.has(dedupe)) return
  sent.add(dedupe)
  void db
    .rpc('track_event', { p_store: store, p_product: product, p_session: sessionId(), p_name: name, p_data: data })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('track_event', error.message)
    })
}

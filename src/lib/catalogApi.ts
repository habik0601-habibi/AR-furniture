import type { Product } from '../data/types'
import { db, supabaseConfigured } from './supabase'

export interface Store {
  id: string
  slug: string
  name: string
  city: string
  brandColor: string
  deliveryRules: Record<string, unknown>
}

interface ProductRow {
  id: string
  slug: string
  name: string
  category: Product['category']
  description: string
  sizes: Product['sizes']
  finishes: Product['finishes']
  model: Product['model']
  hotspots: Product['hotspots']
  styles: Product['styles']
  assembly_required: boolean
  removable_legs: boolean
  lead_days: number
  credit: Product['credit'] | null
  active: boolean
  sort: number
}

export interface StoreProduct extends Product {
  dbId: string
  active: boolean
  sort: number
}

export const PRODUCT_COLUMNS =
  'id, slug, name, category, description, sizes, finishes, model, hotspots, styles, assembly_required, removable_legs, lead_days, credit, active, sort'

export function rowToProduct(r: ProductRow): StoreProduct {
  return {
    dbId: r.id,
    id: r.slug,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    sizes: r.sizes,
    finishes: r.finishes,
    model: r.model,
    hotspots: r.hotspots,
    styles: r.styles,
    assemblyRequired: r.assembly_required,
    removableLegs: r.removable_legs,
    leadDays: r.lead_days,
    credit: r.credit ?? { title: '', author: '', license: '', url: '' },
    active: r.active,
    sort: r.sort,
  }
}

export function productToRow(p: Product, storeId: string, sort = 0) {
  return {
    store_id: storeId,
    slug: p.slug,
    name: p.name,
    category: p.category,
    description: p.description,
    sizes: p.sizes,
    finishes: p.finishes,
    model: p.model,
    hotspots: p.hotspots,
    styles: p.styles,
    assembly_required: p.assemblyRequired,
    removable_legs: p.removableLegs,
    lead_days: p.leadDays,
    credit: p.credit,
    sort,
  }
}

interface StoreRow {
  id: string
  slug: string
  name: string
  city: string
  brand_color: string
  delivery_rules: Record<string, unknown>
}

function rowToStore(r: StoreRow): Store {
  return { id: r.id, slug: r.slug, name: r.name, city: r.city, brandColor: r.brand_color, deliveryRules: r.delivery_rules }
}

export async function fetchStore(slug: string): Promise<Store> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured (.env.local)')
  const { data, error } = await db
    .from('stores')
    .select('id, slug, name, city, brand_color, delivery_rules')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Store "${slug}" not found`)
  return rowToStore(data as StoreRow)
}

export async function fetchProducts(storeId: string, includeInactive = false): Promise<StoreProduct[]> {
  let q = db.from('products').select(PRODUCT_COLUMNS).eq('store_id', storeId).order('sort').order('name')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data as ProductRow[]).map(rowToProduct)
}

export async function fetchStoreProduct(storeSlug: string, productSlug: string): Promise<{ store: Store; product: StoreProduct; all: StoreProduct[] }> {
  const store = await fetchStore(storeSlug)
  const all = await fetchProducts(store.id)
  const product = all.find((p) => p.slug === productSlug)
  if (!product) throw new Error(`Product "${productSlug}" not found in ${store.name}`)
  return { store, product, all }
}

/** Resolve model URLs: relative paths are served by this app; storage paths are absolute URLs. */
export function modelUrl(glb: string): string {
  if (/^https?:\/\//.test(glb)) return glb
  return glb.startsWith('/') ? glb : `/${glb}`
}

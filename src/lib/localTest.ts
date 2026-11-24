/**
 * Private, local-only test products.
 *
 * Any `*.json` file in src/data/local-test/ ({ store, product }) is added to that
 * store's catalogue, but ONLY while running the dev server on this computer. The
 * folder (and public/local-test/, where such models live) is git-ignored, and in a
 * production build this module resolves to an empty list, so nothing here can reach
 * GitHub or the deployed site. Used to try a third-party model for comparison
 * without publishing it.
 */
import type { Product } from '../data/types'
import { fetchProducts, fetchStore, type Store, type StoreProduct } from './catalogApi'

interface LocalEntry {
  store: string
  product: Product
}

// Vite replaces the glob call at build time, so it must be written as a plain call (no typeof guard).
const entries: LocalEntry[] = import.meta.env.DEV
  ? (Object.values(import.meta.glob('../data/local-test/*.json', { eager: true, import: 'default' })) as LocalEntry[])
  : []

export function withLocalTestProducts(storeSlug: string, products: StoreProduct[]): StoreProduct[] {
  const extra = entries
    .filter((e) => e.store === storeSlug && !products.some((p) => p.slug === e.product.slug))
    .map((e) => ({ ...e.product, dbId: `local-${e.product.slug}`, active: true, sort: 999 }) as StoreProduct)
  return [...products, ...extra]
}

/** Like fetchStoreProduct, but also finds local test products. */
export async function fetchStoreProductWithLocal(
  storeSlug: string,
  productSlug: string,
): Promise<{ store: Store; product: StoreProduct; all: StoreProduct[] }> {
  const store = await fetchStore(storeSlug)
  const all = withLocalTestProducts(storeSlug, await fetchProducts(store.id))
  const product = all.find((p) => p.slug === productSlug)
  if (!product) throw new Error(`Product "${productSlug}" not found in ${store.name}`)
  return { store, product, all }
}

import type { Category, Dimensions } from '../engine/types'

export type StyleTag = 'modern' | 'classic' | 'minimal' | 'traditional' | 'industrial' | 'scandinavian'

export interface Finish {
  id: string
  name: string
  kind: 'fabric' | 'velvet' | 'leather' | 'wood' | 'metal'
  /** CSS hex, used for the swatch and to tint the model. */
  color: string
  /** Added to the size price, PKR. */
  priceDelta: number
}

export interface SizeOption {
  id: string
  label: string
  /** Real-world size of this option. The 3D model is scaled to match it. */
  dims: Dimensions
  /** Price of this size before finish surcharge, PKR. */
  price: number
  /** Packed box size for delivery, cm. */
  packed: Dimensions
  weightKg: number
}

export interface Hotspot {
  id: string
  label: string
  detail: string
  /** model-viewer position in metres in the model's own space, e.g. "0 0.4 0.3". */
  position: string
  normal?: string
}

export interface ModelInfo {
  /** Path under /public, e.g. "/models/sofa-velvet.glb". */
  glb: string
  /** Native bounding box of the GLB in cm (w = x, h = y, d = z), used to scale to the chosen size. */
  native: Dimensions
  /** Names of the GLB materials that take the chosen finish colour. Empty = finish not shown on model. */
  tintMaterials: string[]
  /** Poster image shown while the model loads (optional). */
  poster?: string
}

export interface Credit {
  title: string
  author: string
  license: string
  url: string
}

export interface Product {
  id: string
  slug: string
  name: string
  category: Category
  description: string
  sizes: SizeOption[]
  finishes: Finish[]
  model: ModelInfo
  hotspots: Hotspot[]
  styles: StyleTag[]
  assemblyRequired: boolean
  /** Can the legs come off for delivery? Lets the item pass a narrower door. */
  removableLegs: boolean
  leadDays: number
  credit: Credit
}

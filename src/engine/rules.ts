/**
 * Category knowledge used by the optimiser and the fit checker.
 *
 * All distances (cm) below are common interior-design rules of thumb as found in
 * general furniture-layout guidance (e.g. ~90 cm in front of a hinged wardrobe so
 * the doors open, ~75 cm behind a dining table edge to pull a chair out, a
 * 35-50 cm reach from sofa to coffee table, a TV viewing distance of roughly
 * 1.5-3.5 m for common screen sizes). They are not taken from one specific
 * standard; every value lives in this one file so a store can tune them.
 */
import type { Category } from './types'

export interface CategoryRule {
  /** Human name used in messages ("the wardrobe"). */
  label: string
  /** Clear depth wanted in front of the item. */
  front: number
  /** Clear depth wanted on each side (bed access, dining table). */
  side: number
  /** Clear depth wanted behind (dining chair pull-out). */
  back: number
  /** How many sides need `side` clearance: 'auto' = bed rule (2 for >= 120 cm wide, else 1). */
  sidesRequired: 0 | 1 | 2 | 'auto'
  /** Why the front clearance matters, used in warnings. */
  frontReason: string
  /** Belongs with its back against a wall. */
  againstWall: boolean
  /** Tall item: must never stand in front of a window. */
  tall: boolean
  /** Greedy placement order: lower is placed first (anchors first). */
  priority: number
  /** Footprint looks the same rotated 180 degrees: only 0/90 need trying. */
  symmetric: boolean
  /** Where a person must be able to reach it from: 'front' or 'any' side. */
  access: 'front' | 'any'
  /** Categories allowed to stand inside this item's clearance zones. */
  allowInClearance: Category[]
}

export const CATEGORY_RULES: Record<Category, CategoryRule> = {
  bed: {
    label: 'bed', front: 60, side: 60, back: 0, sidesRequired: 'auto',
    frontReason: 'to walk around the foot of the bed',
    againstWall: true, tall: false, priority: 0, symmetric: false, access: 'any',
    allowInClearance: ['side_table'],
  },
  wardrobe: {
    label: 'wardrobe', front: 90, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'so the doors can open fully',
    againstWall: true, tall: true, priority: 1, symmetric: false, access: 'front',
    allowInClearance: [],
  },
  sofa: {
    label: 'sofa', front: 45, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'for knee and leg room',
    againstWall: true, tall: false, priority: 2, symmetric: false, access: 'front',
    allowInClearance: ['coffee_table'],
  },
  dining_table: {
    label: 'dining table', front: 75, side: 75, back: 75, sidesRequired: 2,
    frontReason: 'to pull the chairs out',
    againstWall: false, tall: false, priority: 3, symmetric: true, access: 'any',
    allowInClearance: ['dining_chair'],
  },
  tv_unit: {
    label: 'TV unit', front: 40, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'to reach the drawers',
    againstWall: true, tall: false, priority: 4, symmetric: false, access: 'front',
    allowInClearance: [],
  },
  bookshelf: {
    label: 'bookshelf', front: 60, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'to stand and browse',
    againstWall: true, tall: true, priority: 5, symmetric: false, access: 'front',
    allowInClearance: [],
  },
  desk: {
    label: 'desk', front: 75, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'for the chair and to sit down',
    againstWall: true, tall: false, priority: 5, symmetric: false, access: 'front',
    allowInClearance: [],
  },
  dresser: {
    label: 'dresser', front: 75, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'so the drawers can be pulled out',
    againstWall: true, tall: false, priority: 5, symmetric: false, access: 'front',
    allowInClearance: [],
  },
  armchair: {
    label: 'armchair', front: 45, side: 0, back: 0, sidesRequired: 0,
    frontReason: 'for leg room',
    againstWall: false, tall: false, priority: 6, symmetric: false, access: 'front',
    allowInClearance: ['coffee_table'],
  },
  coffee_table: {
    label: 'coffee table', front: 0, side: 0, back: 0, sidesRequired: 0,
    frontReason: '',
    againstWall: false, tall: false, priority: 7, symmetric: true, access: 'any',
    allowInClearance: [],
  },
  dining_chair: {
    label: 'dining chair', front: 0, side: 0, back: 30, sidesRequired: 0,
    frontReason: '',
    againstWall: false, tall: false, priority: 8, symmetric: false, access: 'any',
    allowInClearance: [],
  },
  side_table: {
    label: 'side table', front: 0, side: 0, back: 0, sidesRequired: 0,
    frontReason: '',
    againstWall: false, tall: false, priority: 9, symmetric: true, access: 'any',
    allowInClearance: [],
  },
}

/** Items at least this tall are treated as tall regardless of category. */
export const TALL_HEIGHT = 150

export type RelationKind = 'faces' | 'in_front_of' | 'beside' | 'around' | 'near_facing'

/**
 * Pairwise relationships. `subject` is scored against the best `partner` present.
 * min/max is the comfortable band (cm) of the measured distance; outside it the
 * score falls linearly to 0 over `falloff` cm.
 *  - faces:       distance between the two front-edge centres, both must face each other
 *  - in_front_of: gap between the partner's front edge and the subject, laterally aligned
 *  - beside:      edge-to-edge gap, subject at the partner's side
 *  - around:      edge-to-edge gap, subject facing the partner
 *  - near_facing: edge-to-edge gap to partner, subject facing one of `faceTargets`
 */
export interface Relation {
  subject: Category
  partners: Category[]
  kind: RelationKind
  min: number
  max: number
  falloff: number
  label: string
  faceTargets?: Category[]
}

export const RELATIONS: Relation[] = [
  { subject: 'sofa', partners: ['tv_unit'], kind: 'faces', min: 180, max: 350, falloff: 120, label: 'Sofa faces the TV at a comfortable viewing distance' },
  { subject: 'coffee_table', partners: ['sofa', 'armchair'], kind: 'in_front_of', min: 35, max: 50, falloff: 60, label: 'Coffee table within reach of the sofa' },
  { subject: 'side_table', partners: ['sofa', 'bed', 'armchair'], kind: 'beside', min: 0, max: 15, falloff: 60, label: 'Side table next to a seat or bed' },
  { subject: 'dining_chair', partners: ['dining_table'], kind: 'around', min: 0, max: 15, falloff: 60, label: 'Chairs around the dining table' },
  { subject: 'armchair', partners: ['sofa'], kind: 'near_facing', min: 30, max: 120, falloff: 120, label: 'Armchair grouped with the sofa', faceTargets: ['coffee_table', 'sofa'] },
]

/** Linear band score: 1 inside [min,max], falling to 0 over `falloff` outside. */
export function band(v: number, min: number, max: number, falloff: number): number {
  if (v < min) return Math.max(0, 1 - (min - v) / falloff)
  if (v > max) return Math.max(0, 1 - (v - max) / falloff)
  return 1
}

export function isTall(category: Category, h: number): boolean {
  return CATEGORY_RULES[category].tall || h >= TALL_HEIGHT
}

/** Complementary categories: having the key but not a value suggests the value. */
export const COMPLEMENTS: Partial<Record<Category, Category[]>> = {
  sofa: ['coffee_table', 'side_table', 'tv_unit', 'armchair'],
  bed: ['side_table', 'wardrobe', 'dresser'],
  dining_table: ['dining_chair'],
  tv_unit: ['sofa'],
  desk: ['bookshelf'],
  armchair: ['side_table'],
}

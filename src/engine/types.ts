/**
 * Shared types for the RoomSense spatial engine.
 *
 * Units: centimetres and degrees everywhere.
 * Floor-plan coordinates: origin at the room's top-left corner, x grows to the
 * right (along the room's width), y grows downward (along its depth).
 * Wall N is y = 0, S is y = depth, W is x = 0, E is x = width.
 */

export type Wall = 'N' | 'E' | 'S' | 'W'

export interface Opening {
  id: string
  kind: 'door' | 'window'
  wall: Wall
  /** Distance from the wall's start corner to the near edge of the opening.
   *  N and S walls start at the west corner; E and W walls start at the north corner. */
  offset: number
  width: number
  /** Doors: whether the leaf swings into the room (its swing area must stay clear). */
  swingIn?: boolean
  /** Windows: height of the sill above the floor. Tall furniture under a low sill blocks it. */
  sillHeight?: number
}

export interface Room {
  width: number
  depth: number
  height: number
  openings: Opening[]
  name?: string
}

export type Category =
  | 'sofa'
  | 'armchair'
  | 'bed'
  | 'wardrobe'
  | 'dining_table'
  | 'dining_chair'
  | 'coffee_table'
  | 'tv_unit'
  | 'side_table'
  | 'bookshelf'
  | 'desk'
  | 'dresser'

/** w = width across the front, d = front to back, h = height. */
export interface Dimensions {
  w: number
  d: number
  h: number
}

export type Rotation = 0 | 90 | 180 | 270

/** An item to be placed. `id` is unique within one layout request. */
export interface ItemSpec {
  id: string
  productId: string
  category: Category
  dims: Dimensions
  name?: string
}

/** A placed item. (x, y) is the centre of its footprint. Rotation 0 = front faces S (+y). */
export interface Placed extends ItemSpec {
  x: number
  y: number
  rotation: Rotation
  /** True when the user pinned it; the optimiser must not move pinned items. */
  locked?: boolean
}

export type Severity = 'error' | 'warning'

export interface Violation {
  code: string
  severity: Severity
  message: string
  itemIds: string[]
}

export interface ScoreTerm {
  key: string
  label: string
  /** Contribution on a 0-100 scale before weighting. */
  value: number
  weight: number
  detail?: string
}

export interface LayoutResult {
  items: Placed[]
  /** 0-100, higher is better. */
  score: number
  terms: ScoreTerm[]
  violations: Violation[]
  /** Item ids the optimiser could not place without a hard violation. */
  unplaced: string[]
  /** Free floor area after placement, as a fraction of the room (0-1). */
  freeFloorRatio: number
  iterations: number
}

export interface PlacementOptions {
  seed?: number
  iterations?: number
  /** Minimum width of a walking route, default 75 cm. */
  walkway?: number
}

export type FitVerdict = 'fits' | 'tight' | 'does_not_fit'

export interface FitCheck {
  key: string
  label: string
  ok: boolean
  severity: Severity
  detail: string
  /** Spare room in cm when meaningful (negative = short by). */
  margin?: number
}

export interface FitReport {
  productId: string
  /** 0-100 compatibility score. */
  score: number
  verdict: FitVerdict
  checks: FitCheck[]
  /** Where the engine would put it, if anywhere. */
  suggested?: Placed
}

/** The route a delivery takes from the street into the room. */
export interface AccessRoute {
  /** Floor number of the flat/room; 0 = ground. */
  floor: number
  entranceDoor: { width: number; height: number }
  roomDoor: { width: number; height: number }
  /** Hallway corners on the way, each defined by the widths of the two corridors meeting there. */
  corners: { widthIn: number; widthOut: number }[]
  stairs?: { width: number; headroom: number; hasLanding: boolean; landingDepth?: number }
  lift?: { width: number; depth: number; height: number; doorWidth: number; doorHeight: number }
}

export interface PathStep {
  key: string
  label: string
  ok: boolean
  detail: string
  margin?: number
  /** How the item must be carried for this step to work (e.g. "stood on end"). */
  orientation?: string
}

export interface DeliveryPathResult {
  ok: boolean
  steps: PathStep[]
  /** Short advice when it fails, e.g. "Choose the 2-seater or a model with removable legs". */
  advice?: string
}

/* ------------------------------------------------------------------------ */
/* Additions for recommendation and delivery-cost modules (appended).       */
/* ------------------------------------------------------------------------ */

/** Delivery-path input: the item as it travels (assembled dims, optional boxed dims). */
export interface DeliveryItem {
  dims: Dimensions
  /** Boxed size when it ships flat-packed / unassembled. When given it is used instead of `dims`. */
  packed?: Dimensions
  removableLegs?: boolean
  /** Height the legs add, removed when `removableLegs` (default 15 cm). */
  legHeight?: number
}

export interface RecSizeOption {
  sizeId: string
  label?: string
  dims: Dimensions
  /** PKR, before finish surcharge. */
  price: number
}

export interface RecFinishOption {
  finishId: string
  name?: string
  /** CSS hex. */
  color: string
  /** PKR added to the size price. */
  priceDelta?: number
}

/** A product the recommender may suggest, flattened from the catalogue. */
export interface RecCandidate {
  productId: string
  name: string
  category: Category
  sizes: RecSizeOption[]
  styles: string[]
  finishes: RecFinishOption[]
}

export interface Recommendation {
  productId: string
  name: string
  category: Category
  sizeId: string
  finishId?: string
  /** Size price + finish surcharge, PKR. */
  price: number
  /** 0-100. */
  score: number
  /** Specific, human-readable reasons, strongest first. */
  reasons: string[]
  verdict: FitVerdict
  /** Where the engine would put it. */
  suggested?: Placed
}

export type CityId =
  | 'karachi'
  | 'lahore'
  | 'islamabad'
  | 'rawalpindi'
  | 'faisalabad'
  | 'multan'
  | 'peshawar'
  | 'quetta'
  | 'sialkot'
  | 'hyderabad'
  | 'gujranwala'

export interface VehicleSpec {
  id: string
  name: string
  /** Inner cargo box, cm. */
  cargo: Dimensions
  payloadKg: number
  /** PKR, inter-city: base + perKm * distance. */
  baseFare: number
  perKm: number
  /** PKR flat fare for a delivery inside one city. */
  intraCityFare: number
}

export interface DeliveryRules {
  /** Smallest first. */
  vehicles: VehicleSpec[]
  /** Fraction of the cargo volume that can really be filled when stacking boxes (0-1). */
  loadEfficiency: number
  /** Stair-carry labour per item per floor, by weight band (first band whose maxKg >= weight). */
  stairLabour: { maxKg: number; perFloor: number }[]
  assemblyPerItem: number
  /** Optional insurance + packing charge as a fraction of goods value (0 = off). */
  insuranceRate: number
  /** Round the total up to a multiple of this (PKR). */
  roundTo: number
  /** Inter-city transit speed used for the delivery-days estimate, km per day. */
  kmPerDay: number
}

export interface DeliveryLine {
  key: string
  label: string
  amount: number
}

export interface DeliveryQuote {
  fromCity: CityId
  toCity: CityId
  distanceKm: number
  vehicle: VehicleSpec
  trips: number
  /** Total packed volume, m^3. */
  volumeM3: number
  weightKg: number
  lines: DeliveryLine[]
  total: number
  days: { min: number; max: number }
  notes: string[]
}

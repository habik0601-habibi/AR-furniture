/**
 * Pakistani furniture delivery cost model.
 *
 * total = transport + stair labour (only when there is no lift) + assembly
 *         + optional insurance/packing (% of goods value), rounded up.
 * Transport: the smallest vehicle whose usable volume (cargo volume x load
 * efficiency, because boxes never stack perfectly), payload and cargo length
 * take the whole load; if even the largest is too small, several trips of the
 * largest. Inside one city a flat fare applies, otherwise base + per-km.
 *
 * All rates are ILLUSTRATIVE 2026 figures in PKR for the demo; every store
 * overrides them through `rules`.
 */
import type { CityId, DeliveryLine, DeliveryQuote, DeliveryRules, Dimensions, VehicleSpec } from './types'

export const CITIES: Record<CityId, string> = {
  karachi: 'Karachi',
  lahore: 'Lahore',
  islamabad: 'Islamabad',
  rawalpindi: 'Rawalpindi',
  faisalabad: 'Faisalabad',
  multan: 'Multan',
  peshawar: 'Peshawar',
  quetta: 'Quetta',
  sialkot: 'Sialkot',
  hyderabad: 'Hyderabad',
  gujranwala: 'Gujranwala',
}

/**
 * APPROXIMATE road distances in km (rounded, main motorway/highway routes).
 * Good enough for a cost estimate; not survey data. Each pair is listed once.
 */
const ROAD_KM: [CityId, CityId, number][] = [
  ['karachi', 'lahore', 1210], ['karachi', 'islamabad', 1410], ['karachi', 'rawalpindi', 1400],
  ['karachi', 'faisalabad', 1120], ['karachi', 'multan', 900], ['karachi', 'peshawar', 1530],
  ['karachi', 'quetta', 690], ['karachi', 'sialkot', 1290], ['karachi', 'hyderabad', 165],
  ['karachi', 'gujranwala', 1270],
  ['lahore', 'islamabad', 375], ['lahore', 'rawalpindi', 380], ['lahore', 'faisalabad', 185],
  ['lahore', 'multan', 340], ['lahore', 'peshawar', 510], ['lahore', 'quetta', 860],
  ['lahore', 'sialkot', 125], ['lahore', 'hyderabad', 1050], ['lahore', 'gujranwala', 70],
  ['islamabad', 'rawalpindi', 15], ['islamabad', 'faisalabad', 320], ['islamabad', 'multan', 560],
  ['islamabad', 'peshawar', 185], ['islamabad', 'quetta', 920], ['islamabad', 'sialkot', 250],
  ['islamabad', 'hyderabad', 1250], ['islamabad', 'gujranwala', 230],
  ['rawalpindi', 'faisalabad', 310], ['rawalpindi', 'multan', 550], ['rawalpindi', 'peshawar', 175],
  ['rawalpindi', 'quetta', 910], ['rawalpindi', 'sialkot', 240], ['rawalpindi', 'hyderabad', 1240],
  ['rawalpindi', 'gujranwala', 220],
  ['faisalabad', 'multan', 240], ['faisalabad', 'peshawar', 480], ['faisalabad', 'quetta', 840],
  ['faisalabad', 'sialkot', 190], ['faisalabad', 'hyderabad', 960], ['faisalabad', 'gujranwala', 140],
  ['multan', 'peshawar', 700], ['multan', 'quetta', 620], ['multan', 'sialkot', 410],
  ['multan', 'hyderabad', 730], ['multan', 'gujranwala', 360],
  ['peshawar', 'quetta', 820], ['peshawar', 'sialkot', 420], ['peshawar', 'hyderabad', 1390],
  ['peshawar', 'gujranwala', 400],
  ['quetta', 'sialkot', 980], ['quetta', 'hyderabad', 660], ['quetta', 'gujranwala', 930],
  ['sialkot', 'hyderabad', 1150], ['sialkot', 'gujranwala', 55],
  ['hyderabad', 'gujranwala', 1110],
]

const DIST = new Map<string, number>()
for (const [a, b, km] of ROAD_KM) {
  DIST.set(`${a}|${b}`, km)
  DIST.set(`${b}|${a}`, km)
}

/** Approximate road distance in km (0 within the same city). */
export function roadDistance(a: CityId, b: CityId): number {
  if (a === b) return 0
  const d = DIST.get(`${a}|${b}`)
  if (d === undefined) throw new Error(`No distance for ${a} - ${b}`)
  return d
}

/** Illustrative 2026 rates (PKR); cargo boxes in cm. Smallest first. */
export const DEFAULT_VEHICLES: VehicleSpec[] = [
  { id: 'ravi', name: 'Suzuki Ravi pickup', cargo: { w: 130, d: 220, h: 120 }, payloadKg: 600, baseFare: 2500, perKm: 70, intraCityFare: 3000 },
  { id: 'shehzore', name: 'Hyundai Shehzore', cargo: { w: 170, d: 310, h: 170 }, payloadKg: 2000, baseFare: 5000, perKm: 110, intraCityFare: 6500 },
  { id: 'mazda16', name: 'Mazda 16 ft truck', cargo: { w: 210, d: 490, h: 210 }, payloadKg: 4000, baseFare: 9000, perKm: 160, intraCityFare: 12000 },
  { id: 'container20', name: '20 ft container truck', cargo: { w: 235, d: 590, h: 239 }, payloadKg: 10000, baseFare: 15000, perKm: 230, intraCityFare: 20000 },
]

export const DEFAULT_DELIVERY_RULES: DeliveryRules = {
  vehicles: DEFAULT_VEHICLES,
  loadEfficiency: 0.7,
  stairLabour: [
    { maxKg: 30, perFloor: 300 },
    { maxKg: 80, perFloor: 600 },
    { maxKg: Infinity, perFloor: 1000 },
  ],
  assemblyPerItem: 1500,
  insuranceRate: 0.01,
  roundTo: 50,
  kmPerDay: 500,
}

export interface DeliveryInput {
  fromCity: CityId
  toCity: CityId
  items: { packed: Dimensions; weightKg: number; assemblyRequired: boolean; qty?: number }[]
  floor: number
  hasLift: boolean
  /** Goods value (PKR) for the optional insurance/packing charge. */
  goodsValue?: number
  rules?: Partial<DeliveryRules>
}

const vol = (d: Dimensions) => (d.w * d.d * d.h) / 1e6 // m^3

function longest(d: Dimensions): number {
  return Math.max(d.w, d.d, d.h)
}

export function estimateDelivery(input: DeliveryInput): DeliveryQuote {
  const rules: DeliveryRules = { ...DEFAULT_DELIVERY_RULES, ...input.rules }
  const vehicles = [...rules.vehicles].sort((a, b) => vol(a.cargo) - vol(b.cargo))
  const units = input.items.flatMap((it) => Array.from({ length: Math.max(1, it.qty ?? 1) }, () => it))
  const volumeM3 = units.reduce((s, u) => s + vol(u.packed), 0)
  const weightKg = units.reduce((s, u) => s + u.weightKg, 0)
  const maxLen = units.reduce((m, u) => Math.max(m, longest(u.packed)), 0)
  const distanceKm = roadDistance(input.fromCity, input.toCity)
  const sameCity = distanceKm === 0
  const notes: string[] = []

  // Smallest vehicle that takes everything in one trip
  const usable = (v: VehicleSpec) => vol(v.cargo) * rules.loadEfficiency
  const fitsLength = (v: VehicleSpec) => maxLen <= longest(v.cargo)
  let vehicle = vehicles.find((v) => usable(v) >= volumeM3 && v.payloadKg >= weightKg && fitsLength(v))
  let trips = 1
  if (!vehicle) {
    vehicle = vehicles[vehicles.length - 1]
    trips = Math.max(Math.ceil(volumeM3 / usable(vehicle)), Math.ceil(weightKg / vehicle.payloadKg), 1)
    notes.push(`Load exceeds one ${vehicle.name}; ${trips} trips needed`)
    if (!fitsLength(vehicle)) notes.push(`An item of ${maxLen} cm is longer than the cargo box; needs special transport`)
  }

  const lines: DeliveryLine[] = []
  const transport = (sameCity ? vehicle.intraCityFare : vehicle.baseFare + vehicle.perKm * distanceKm) * trips
  lines.push({
    key: 'transport',
    label: sameCity
      ? `${vehicle.name}, within ${CITIES[input.toCity]}${trips > 1 ? ` x${trips}` : ''}`
      : `${vehicle.name}, ${CITIES[input.fromCity]} to ${CITIES[input.toCity]} (~${distanceKm} km)${trips > 1 ? ` x${trips}` : ''}`,
    amount: Math.round(transport),
  })

  if (input.floor > 0 && !input.hasLift) {
    const perFloor = units.reduce((s, u) => s + (rules.stairLabour.find((b) => u.weightKg <= b.maxKg)?.perFloor ?? 0), 0)
    lines.push({ key: 'stairs', label: `Carrying up ${input.floor} floor(s) by stairs, ${units.length} item(s)`, amount: perFloor * input.floor })
  } else if (input.floor > 0) notes.push('Lift available: no stair-carry labour')

  const toAssemble = units.filter((u) => u.assemblyRequired).length
  if (toAssemble && rules.assemblyPerItem > 0) lines.push({ key: 'assembly', label: `Assembly, ${toAssemble} item(s)`, amount: toAssemble * rules.assemblyPerItem })

  if (input.goodsValue && rules.insuranceRate > 0)
    lines.push({ key: 'insurance', label: `Packing and transit insurance (${(rules.insuranceRate * 100).toFixed(1)}% of goods value)`, amount: Math.round(input.goodsValue * rules.insuranceRate) })

  const raw = lines.reduce((s, l) => s + l.amount, 0)
  const total = rules.roundTo > 0 ? Math.ceil(raw / rules.roundTo) * rules.roundTo : raw
  const transit = sameCity ? 0 : Math.ceil(distanceKm / rules.kmPerDay)
  const days = { min: 1 + transit, max: 2 + transit + (trips > 1 ? 1 : 0) }
  notes.push('Distances are approximate road distances; rates are illustrative and set by each store')

  return {
    fromCity: input.fromCity,
    toCity: input.toCity,
    distanceKm,
    vehicle,
    trips,
    volumeM3: Math.round(volumeM3 * 100) / 100,
    weightKg,
    lines,
    total,
    days,
    notes,
  }
}

import type { CityId } from '../../engine/types'

export const CITY_NAMES: Record<CityId, string> = {
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

export const CITY_IDS = Object.keys(CITY_NAMES) as CityId[]

export function asCity(s: string | undefined | null): CityId {
  return s && s in CITY_NAMES ? (s as CityId) : 'lahore'
}

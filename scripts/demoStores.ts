/**
 * Config for the third demo store, Hearth & Home. Its website is a separate,
 * plain-HTML site (examples/hearth-and-home) that is NOT part of the RoomSense
 * app; it only embeds the widget. Both the database seed and the site
 * generator read this file so the product list and prices always agree.
 */
export const HEARTH = {
  slug: 'hearth',
  name: 'Hearth & Home',
  city: 'Islamabad',
  /** Its catalogue is priced 8% above the base catalogue so the shops differ. */
  markup: 1.08,
  /** Product slugs from src/data/catalog.ts that Hearth & Home sells. */
  products: [
    'kohsar-chesterfield-sofa',
    'hunza-tufted-lounge-chair',
    'margalla-carved-bed',
    'kaghan-round-dining-table',
    'ravi-coffee-table',
    'indus-slatted-tv-unit',
  ],
} as const

/** Same rounding the seed uses: scale, then round to the nearest Rs 500. */
export function markupPrice(price: number, markup: number): number {
  return Math.round((price * markup) / 500) * 500
}

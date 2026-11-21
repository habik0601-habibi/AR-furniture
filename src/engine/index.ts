/** Public API of the RoomSense spatial decision engine. */
export type * from './types'
export * from './geometry'
export { CATEGORY_RULES, RELATIONS, COMPLEMENTS, TALL_HEIGHT, band, isTall } from './rules'
export type { CategoryRule, Relation, RelationKind } from './rules'
export {
  optimiseLayout,
  evaluateLayout,
  clearanceOf,
  walkwayReach,
  wallPose,
  isFeasiblePose,
  mulberry32,
  DEFAULT_WALKWAY,
  DEFAULT_ITERATIONS,
  WEIGHTS,
} from './placement'
export type { ClearanceSide } from './placement'
export { assessFit, describePose, MAX_FLOOR_SHARE, MAX_SOFA_WALL_SHARE } from './fit'
export type { FitOptions } from './fit'
export {
  checkDeliveryPath,
  doorwayFit,
  cornerMaxLength,
  canTurnCorner,
  cornerFit,
  rectFitsInRect,
  liftCabinFit,
} from './deliveryPath'
export type { DoorwayFit } from './deliveryPath'
export { recommend, colourHarmony, categoryScore, budgetScore, styleScore, freeWallStretch, REC_WEIGHTS } from './recommend'
export type { RecommendInput } from './recommend'
export * from './color'
export { estimateDelivery, roadDistance, CITIES, DEFAULT_VEHICLES, DEFAULT_DELIVERY_RULES } from './deliveryCost'
export type { DeliveryInput } from './deliveryCost'
export { configuredPrice, sumPrices, applyDiscount, groupPk, pkr, pkrCompact } from './pricing'

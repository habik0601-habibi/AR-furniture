import type { Room } from '../engine/types'

/** A 2-D point. In floor space the unit is cm; in image space it is pixels. */
export interface Vec2 {
  x: number
  y: number
}

export type MeasureMethod = 'ar' | 'photo' | 'ai-photo' | 'manual'

/** The result every measurement mode produces. */
export interface MeasuredRoom {
  room: Room
  /** Raw measured floor polygon in the room's plan frame (cm), when one exists. */
  polygon?: Vec2[]
  method: MeasureMethod
  /** 0-1, how much the numbers can be trusted (see docs/measurement.md). */
  confidence: number
  /** Human-readable caveats, shown to the user and kept for the report. */
  notes: string[]
}

/** An opening captured as two floor points along a wall, before it is snapped to the room. */
export interface RawOpening {
  kind: 'door' | 'window'
  a: Vec2
  b: Vec2
}

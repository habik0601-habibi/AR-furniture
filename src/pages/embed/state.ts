import { useCallback, useState } from 'react'
import type { AccessRoute, CityId, Placed, Room } from '../../engine/types'
import type { MeasuredRoom } from '../../measure/types'
import { loadJson, saveJson } from '../../lib/session'

/**
 * The shopper's own context (room, furniture they already own, their
 * building's access route, city) lives in this browser only, so it carries
 * over between products and shops that use RoomSense on the same device, and
 * is never uploaded unless they send a quote request.
 */
export interface ShopperContext {
  measured: MeasuredRoom | null
  existing: Placed[]
  route: AccessRoute
  city: CityId
}

const KEY = 'roomsense-shopper-v1'

export const DEFAULT_ROUTE: AccessRoute = {
  floor: 0,
  entranceDoor: { width: 90, height: 210 },
  roomDoor: { width: 80, height: 205 },
  corners: [],
}

function initial(): ShopperContext {
  const saved = loadJson<ShopperContext>(KEY)
  return {
    measured: saved?.measured ?? null,
    existing: saved?.existing ?? [],
    route: saved?.route ?? DEFAULT_ROUTE,
    city: saved?.city ?? 'lahore',
  }
}

export function useShopperContext() {
  const [ctx, setCtx] = useState<ShopperContext>(initial)
  const update = useCallback((patch: Partial<ShopperContext>) => {
    setCtx((prev) => {
      const next = { ...prev, ...patch }
      saveJson(KEY, next)
      return next
    })
  }, [])
  return [ctx, update] as const
}

export function roomOf(ctx: ShopperContext): Room | null {
  return ctx.measured?.room ?? null
}

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point, polygon } from '@turf/helpers'
import type { components } from '../../../api/generated/schema'

type StoreGeoDto = components['schemas']['StoreGeoDto']

/** polygon: array of [lng, lat] vertices, not required to be closed. */
export function storesInPolygon(stores: StoreGeoDto[], polygonPoints: number[][]): string[] {
  if (polygonPoints.length < 3) return []

  const ring = [...polygonPoints]
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first)
  }
  const poly = polygon([ring])

  return stores
    .filter((s) => s.id && s.activeRouteId == null && s.latitude != null && s.longitude != null)
    .filter((s) => booleanPointInPolygon(point([s.longitude!, s.latitude!]), poly))
    .map((s) => s.id!)
}

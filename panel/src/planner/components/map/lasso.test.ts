import { describe, expect, it } from 'vitest'
import { storesInPolygon } from './lasso'
import type { components } from '../../../api/generated/schema'

type StoreGeoDto = components['schemas']['StoreGeoDto']

function store(id: string, lat: number, lng: number, activeRouteId: string | null = null): StoreGeoDto {
  return {
    id,
    name: id,
    chainName: null,
    format: 1,
    category: 1,
    latitude: lat,
    longitude: lng,
    activeRouteId,
    activeRouteCode: null,
    sixMonthRevenue: 0,
  }
}

describe('storesInPolygon', () => {
  const square = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ]

  it('returns pool stores inside the polygon', () => {
    const stores = [store('inside', 5, 5), store('outside', 20, 20)]
    expect(storesInPolygon(stores, square)).toEqual(['inside'])
  })

  it('excludes stores already on a route even if inside', () => {
    const stores = [store('routed', 5, 5, 'route-1')]
    expect(storesInPolygon(stores, square)).toEqual([])
  })

  it('returns empty for fewer than 3 vertices', () => {
    expect(storesInPolygon([store('a', 5, 5)], [[0, 0], [1, 1]])).toEqual([])
  })
})

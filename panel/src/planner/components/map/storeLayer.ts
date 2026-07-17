import type maplibregl from 'maplibre-gl'
import type { components } from '../../../api/generated/schema'
import { colors } from '../../../theme/tokens'

type StoreGeoDto = components['schemas']['StoreGeoDto']

const SOURCE_ID = 'stores'
const LAYER_ID = 'stores-circles'

const CATEGORY_STROKE: Record<number, string> = {
  1: colors.tealDark, // Planlanan
  2: colors.amberDark, // Değişken
  3: colors.text2, // Sabit
}

export function toFeatureCollection(stores: StoreGeoDto[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stores
      .filter((s) => s.id)
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.longitude ?? 0, s.latitude ?? 0] },
        properties: {
          id: s.id,
          chainName: s.chainName ?? null,
          category: s.category ?? null,
          activeRouteId: s.activeRouteId ?? null,
          activeRouteCode: s.activeRouteCode ?? null,
          sixMonthRevenue: s.sixMonthRevenue ?? 0,
          name: s.name ?? '',
          format: s.format ?? null,
        },
      })),
  }
}

export function upsertStoreLayer(map: maplibregl.Map, stores: StoreGeoDto[], focusedRouteId: string | null) {
  const data = toFeatureCollection(stores)
  const existingSource = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined

  if (existingSource) {
    existingSource.setData(data)
  } else {
    map.addSource(SOURCE_ID, { type: 'geojson', data })
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 5,
        'circle-color': colors.blue,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.border2,
        'circle-opacity': 0.85,
      },
    })
  }

  applyFocusPaint(map, focusedRouteId)
}

export function applyFocusPaint(map: maplibregl.Map, focusedRouteId: string | null) {
  if (!map.getLayer(LAYER_ID)) return

  map.setPaintProperty(LAYER_ID, 'circle-stroke-color', [
    'match',
    ['coalesce', ['get', 'category'], 0],
    1,
    CATEGORY_STROKE[1],
    2,
    CATEGORY_STROKE[2],
    3,
    CATEGORY_STROKE[3],
    colors.border2,
  ])

  map.setPaintProperty(LAYER_ID, 'circle-radius', focusedRouteId
    ? ['case', ['==', ['get', 'activeRouteId'], focusedRouteId], 7, 5]
    : 5)

  map.setPaintProperty(LAYER_ID, 'circle-opacity', focusedRouteId
    ? ['case',
        ['==', ['get', 'activeRouteId'], focusedRouteId], 1,
        ['all', ['!=', ['get', 'activeRouteId'], null], ['!=', ['get', 'activeRouteId'], focusedRouteId]], 0.25,
        0.85]
    : 0.85)
}

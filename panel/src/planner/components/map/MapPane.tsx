import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useStoresGeo } from '../../api/queries'
import { useMapLibre } from './useMapLibre'
import { upsertStoreLayer, applyFocusPaint } from './storeLayer'
import { StorePopover } from './StorePopover'
import { LassoTool } from './LassoTool'
import { useBulkAddStops, useMoveStoreToRoute } from '../../api/mutations'
import type { components } from '../../../api/generated/schema'

type StoreGeoDto = components['schemas']['StoreGeoDto']

interface PopoverState {
  store: StoreGeoDto
  x: number
  y: number
}

export function MapPane() {
  const containerRef = useRef<HTMLDivElement>(null)
  const map = useMapLibre(containerRef)
  const province = useWorkspaceStore((s) => s.province)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const { data: stores } = useStoresGeo(province)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const bulkAdd = useBulkAddStops(focusedRouteId ?? '', province)
  const moveHere = useMoveStoreToRoute(focusedRouteId ?? '', province)

  useEffect(() => {
    if (!map || !stores) return
    upsertStoreLayer(map, stores, focusedRouteId)
  }, [map, stores, focusedRouteId])

  useEffect(() => {
    if (!map || !stores) return
    applyFocusPaint(map, focusedRouteId)
  }, [map, focusedRouteId, stores])

  useEffect(() => {
    if (!map || !stores) return
    const bounds: [number, number][] = stores
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => [s.longitude!, s.latitude!])
    if (bounds.length === 0) return
    const lngs = bounds.map((b) => b[0])
    const lats = bounds.map((b) => b[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 40, maxZoom: 12, duration: 400 },
    )
  }, [map, province, stores])

  useEffect(() => {
    if (!map) return

    function onClick(e: maplibregl.MapMouseEvent) {
      const features = map!.queryRenderedFeatures(e.point, { layers: ['stores-circles'] })
      if (features.length === 0) {
        setPopover(null)
        return
      }
      const feature = features[0]
      const props = feature.properties as Record<string, unknown>
      const store = stores?.find((s) => s.id === props.id)
      if (!store) return
      setPopover({ store, x: e.point.x, y: e.point.y })
    }

    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, stores])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {map && <LassoTool map={map} stores={stores ?? []} />}
      {popover && (
        <StorePopover
          store={popover.store}
          x={popover.x}
          y={popover.y}
          canAct={Boolean(focusedRouteId)}
          onClose={() => setPopover(null)}
          onAddToRoute={
            focusedRouteId && !popover.store.activeRouteId && popover.store.id
              ? () => {
                  bulkAdd.mutate({ storeIds: [popover.store.id!], frequency: 2, weekdayMask: 0, serviceMinutes: null })
                  setPopover(null)
                }
              : undefined
          }
          onMoveHere={
            focusedRouteId && popover.store.activeRouteId && popover.store.activeRouteId !== focusedRouteId && popover.store.id
              ? () => {
                  moveHere.mutate(popover.store.id!)
                  setPopover(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

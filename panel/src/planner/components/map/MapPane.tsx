import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useStoresGeo, useRoute } from '../../api/queries'
import { useMapLibre } from './useMapLibre'
import { upsertStoreLayer, applyFocusPaint, upsertRouteLine } from './storeLayer'
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
  const focusStore = useWorkspaceStore((s) => s.focusStore)
  const { data: stores } = useStoresGeo(province)
  const { data: focusedRoute } = useRoute(focusedRouteId)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const bulkAdd = useBulkAddStops(focusedRouteId ?? '', province)
  const moveHere = useMoveStoreToRoute(focusedRouteId ?? '', province)
  const markersRef = useRef<maplibregl.Marker[]>([])

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

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (!focusedRouteId || !focusedRoute?.stops || !stores) {
      upsertRouteLine(map, [])
      return
    }

    const storeById = new Map(stores.filter((s) => s.id).map((s) => [s.id!, s]))
    const orderedStops = [...focusedRoute.stops]
      .filter((s) => s.storeId && storeById.has(s.storeId))
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))

    const coordinates: [number, number][] = []
    orderedStops.forEach((stop, i) => {
      const store = storeById.get(stop.storeId!)!
      if (store.longitude == null || store.latitude == null) return
      coordinates.push([store.longitude, store.latitude])

      const el = document.createElement('div')
      el.textContent = String(i + 1)
      el.style.cssText =
        'width:20px;height:20px;border-radius:50%;background:var(--blue-d);color:#fff;font-size:11px;' +
        'font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;' +
        'box-shadow:0 1px 4px rgba(0,0,0,.3);'
      const marker = new maplibregl.Marker({ element: el }).setLngLat([store.longitude, store.latitude]).addTo(map)
      markersRef.current.push(marker)
    })

    upsertRouteLine(map, coordinates)

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
    }
  }, [map, focusedRouteId, focusedRoute, stores])

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
    <div className="pane" id="mapPane">
      <div className="pane-head">
        HARİTA <span style={{ color: 'var(--tx3)' }}>— pin: tıkla · kement: seç</span>
        <div className="spacer" />
      </div>
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
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
          onExpand={() => {
            if (popover.store.id) focusStore(popover.store.id)
            setPopover(null)
          }}
        />
        )}
      </div>
    </div>
  )
}

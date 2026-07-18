import { useEffect, useRef, useState, type RefObject } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export function useMapLibre(containerRef: RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // OpenFreeMap's "liberty" style — real streets/buildings/POI labels (OSM data), free, no API
    // key. Routes are neighborhood-scale (design decision 2026-07-18): a route's 3-4 stores need to
    // render against real street detail, not MapLibre's placeholder demotiles (bare country outlines,
    // no streets at all).
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [35, 39],
      zoom: 5,
    })
    mapRef.current = instance
    instance.once('load', () => setMap(instance))

    return () => {
      instance.remove()
      mapRef.current = null
      setMap(null)
    }
  }, [containerRef])

  return map
}

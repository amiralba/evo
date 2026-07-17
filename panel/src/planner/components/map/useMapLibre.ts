import { useEffect, useRef, useState, type RefObject } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export function useMapLibre(containerRef: RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
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

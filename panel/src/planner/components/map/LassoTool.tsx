import { useEffect, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { useTranslation } from 'react-i18next'
import type { components } from '../../../api/generated/schema'
import { colors, spacing, radius } from '../../../theme/tokens'
import { storesInPolygon } from './lasso'
import { useWorkspaceStore } from '../../state/workspaceStore'

type StoreGeoDto = components['schemas']['StoreGeoDto']

interface LassoToolProps {
  map: maplibregl.Map | null
  stores: StoreGeoDto[]
}

/** Lasso rubber-band outline (prototype: marquee always on, live polygon while drawing —
 * gap-matrix §1/§4/§10 "no visible outline while drawing"). Points are tracked as state (not just
 * a ref) so the SVG overlay redraws on every click, plus a live dashed segment to the cursor. */
export function LassoTool({ map, stores }: LassoToolProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState(false)
  const [points, setPoints] = useState<[number, number][]>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [screenPoints, setScreenPoints] = useState<[number, number][]>([])
  const [screenCursor, setScreenCursor] = useState<[number, number] | null>(null)
  const setSelection = useWorkspaceStore((s) => s.setSelection)
  const selectionSize = useWorkspaceStore((s) => s.selection.size)

  useEffect(() => {
    if (!map || !active) return

    function onClick(e: maplibregl.MapMouseEvent) {
      setPoints((p) => [...p, [e.lngLat.lng, e.lngLat.lat]])
    }
    function onMouseMove(e: maplibregl.MapMouseEvent) {
      setCursor([e.lngLat.lng, e.lngLat.lat])
    }
    function onDblClick(e: maplibregl.MapMouseEvent) {
      e.preventDefault()
      setPoints((p) => {
        const ids = storesInPolygon(stores, p)
        setSelection(ids)
        return []
      })
      setCursor(null)
      setActive(false)
    }

    map.on('click', onClick)
    map.on('mousemove', onMouseMove)
    map.on('dblclick', onDblClick)
    map.getCanvas().style.cursor = 'crosshair'

    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMouseMove)
      map.off('dblclick', onDblClick)
      map.getCanvas().style.cursor = ''
    }
  }, [map, active, stores, setSelection])

  useEffect(() => {
    if (!map) return
    function project() {
      setScreenPoints(points.map(([lng, lat]) => { const p = map!.project([lng, lat]); return [p.x, p.y] }))
      setScreenCursor(cursor ? (() => { const p = map!.project(cursor); return [p.x, p.y] as [number, number] })() : null)
    }
    project()
    map.on('move', project)
    return () => {
      map.off('move', project)
    }
  }, [map, points, cursor])

  const polylinePoints = screenCursor ? [...screenPoints, screenCursor] : screenPoints

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
      {active && polylinePoints.length > 0 && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <polyline
            points={polylinePoints.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="rgba(55,138,221,0.12)"
            stroke={colors.blueDark}
            strokeWidth={1.5}
            strokeDasharray="5,4"
          />
          {screenPoints.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3} fill={colors.blueDark} />
          ))}
        </svg>
      )}
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: spacing.sm, pointerEvents: 'auto' }}>
        <button
          type="button"
          onClick={() => {
            setPoints([])
            setCursor(null)
            setActive((a) => !a)
          }}
          style={{
            fontSize: 11,
            padding: `${spacing.sm} ${spacing.lg}`,
            borderRadius: radius.md,
            border: `1px solid ${active ? colors.blueDark : colors.border}`,
            background: active ? colors.blueLight : colors.card,
            color: active ? colors.blueDark : colors.text,
            cursor: 'pointer',
          }}
        >
          {t('planner.lasso', 'Kement')}
        </button>
        {selectionSize > 0 && (
          <span style={{ fontSize: 11, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.pill, padding: `2px ${spacing.lg}` }}>
            {selectionSize} {t('planner.selected', 'seçili')}
          </span>
        )}
      </div>
    </div>
  )
}

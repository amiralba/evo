import { useEffect, useRef, useState } from 'react'
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

export function LassoTool({ map, stores }: LassoToolProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState(false)
  const pointsRef = useRef<number[][]>([])
  const setSelection = useWorkspaceStore((s) => s.setSelection)
  const selectionSize = useWorkspaceStore((s) => s.selection.size)

  useEffect(() => {
    if (!map || !active) return

    function onClick(e: maplibregl.MapMouseEvent) {
      pointsRef.current.push([e.lngLat.lng, e.lngLat.lat])
    }
    function onDblClick(e: maplibregl.MapMouseEvent) {
      e.preventDefault()
      const ids = storesInPolygon(stores, pointsRef.current)
      setSelection(ids)
      pointsRef.current = []
      setActive(false)
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    map.getCanvas().style.cursor = 'crosshair'

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.getCanvas().style.cursor = ''
    }
  }, [map, active, stores, setSelection])

  return (
    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 5, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      <button
        type="button"
        onClick={() => {
          pointsRef.current = []
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
  )
}

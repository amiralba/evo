import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useBulkAddStops, useMoveStoreToRoute } from '../../api/mutations'
import { BulkAddResult } from './BulkAddResult'
import { spacing, radius, fontSize } from '../../../theme/tokens'
import type { components } from '../../../api/generated/schema'

type BulkAddResultDto = components['schemas']['BulkAddResultDto']

export function SelectionBar() {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const selection = useWorkspaceStore((s) => s.selection)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  const [result, setResult] = useState<BulkAddResultDto | null>(null)

  const bulkAdd = useBulkAddStops(focusedRouteId ?? '', province)
  const moveHere = useMoveStoreToRoute(focusedRouteId ?? '', province)

  if (selection.size === 0) return null

  function handleAdd() {
    if (!focusedRouteId) return
    bulkAdd.mutate(
      { storeIds: [...selection], frequency: 2, weekdayMask: 0, serviceMinutes: null },
      {
        onSuccess: (res) => {
          setResult(res)
          clearSelection()
        },
      },
    )
  }

  // The prototype's .actionbar is a floating pill anchored to the map pane (lasso-selection
  // only). This bar serves both the map lasso AND the Tablo checkbox-list, which can't both
  // anchor to the map, so it stays docked full-width — but reuses the actionbar's dark pill
  // color language (var(--tx) bg, translucent white buttons) for visual consistency.
  return (
    <div style={{ background: 'var(--tx)', color: '#fff' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.lg,
          padding: `${spacing.lg} ${spacing.xl}`,
        }}
      >
        <span style={{ fontSize: fontSize.md }}>
          {selection.size} {t('planner.selected', 'seçili')}
        </span>
        <button
          type="button"
          disabled={!focusedRouteId || bulkAdd.isPending}
          onClick={handleAdd}
          style={{
            borderRadius: radius.md,
            padding: `${spacing.sm} ${spacing.lg}`,
            background: 'rgba(255,255,255,.14)',
            color: '#fff',
            border: 'none',
          }}
        >
          {t('planner.addToRoute', 'Rotaya ekle')} ({selection.size})
        </button>
        <button
          type="button"
          onClick={clearSelection}
          style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: 'none' }}
        >
          {t('common.clear', 'Temizle')}
        </button>
      </div>
      {result && <BulkAddResult result={result} onMoveHere={(storeId) => moveHere.mutate(storeId)} />}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useStoresGeo } from '../../api/queries'
import { colors, spacing, fontSize } from '../../../theme/tokens'
import { formatTRY } from '../../format'

export function SelectionListPane() {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const selection = useWorkspaceStore((s) => s.selection)
  const toggleSelect = useWorkspaceStore((s) => s.toggleSelect)
  const setSelection = useWorkspaceStore((s) => s.setSelection)
  const { data: poolStores, isLoading } = useStoresGeo(province, false)

  const allIds = (poolStores ?? []).map((s) => s.id).filter((id): id is string => Boolean(id))
  const allSelected = allIds.length > 0 && allIds.every((id) => selection.has(id))

  if (isLoading) {
    return <div style={{ padding: spacing.xl, fontSize: fontSize.md }}>{t('common.loading', 'Yükleniyor…')}</div>
  }

  return (
    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.lg,
          padding: `${spacing.sm} ${spacing.xl}`,
          borderBottom: `1px solid ${colors.border}`,
          fontSize: fontSize.sm,
          color: colors.text2,
        }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => setSelection(allSelected ? [] : allIds)}
          aria-label="select-all-pool"
        />
        <span>{t('planner.selectAllInView', 'Tümünü seç')}</span>
        <span style={{ marginLeft: 'auto' }}>{allIds.length} {t('planner.poolStores', 'havuz mağazası')}</span>
      </div>

      {(poolStores ?? []).map((store) => {
        if (!store.id) return null
        const id = store.id
        return (
          <label
            key={id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.lg,
              padding: `${spacing.sm} ${spacing.xl}`,
              borderBottom: `1px solid ${colors.border}`,
              fontSize: fontSize.md,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              data-testid={`select-store-${id}`}
              checked={selection.has(id)}
              onChange={() => toggleSelect(id)}
            />
            <span style={{ flex: 1 }}>{store.name}</span>
            <span style={{ color: colors.text2, fontSize: fontSize.sm }}>{store.chainName ?? '—'}</span>
            <span style={{ color: colors.text3, fontSize: fontSize.sm }}>{formatTRY(store.sixMonthRevenue ?? 0)}</span>
          </label>
        )
      })}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import type { components } from '../../../api/generated/schema'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'
import { formatTRY } from '../../format'

type StoreGeoDto = components['schemas']['StoreGeoDto']

interface StorePopoverProps {
  store: StoreGeoDto
  x: number
  y: number
  canAct: boolean
  onAddToRoute?: () => void
  onMoveHere?: () => void
  onClose: () => void
}

export function StorePopover({ store, x, y, canAct, onAddToRoute, onMoveHere, onClose }: StorePopoverProps) {
  const { t } = useTranslation()

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -110%)',
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        padding: spacing.xl,
        minWidth: 200,
        fontSize: fontSize.md,
        zIndex: 10,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        style={{ position: 'absolute', top: 4, right: 6, border: 'none', background: 'none', cursor: 'pointer' }}
      >
        ×
      </button>
      <div style={{ fontWeight: 600 }}>{store.name}</div>
      <div style={{ color: colors.text2, fontSize: fontSize.sm }}>{store.chainName ?? '—'}</div>
      <div style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}>{formatTRY(store.sixMonthRevenue ?? 0)}</div>
      <div style={{ marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.text2 }}>
        {store.activeRouteCode ?? t('planner.pool', 'Havuz')}
      </div>
      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
        <button type="button" disabled={!canAct || !onAddToRoute} onClick={onAddToRoute}>
          {t('planner.addToRoute', 'Rotaya ekle')}
        </button>
        <button type="button" disabled={!canAct || !onMoveHere} onClick={onMoveHere}>
          {t('planner.moveHere', 'Buraya taşı')}
        </button>
      </div>
    </div>
  )
}

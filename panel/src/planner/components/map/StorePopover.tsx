import { useTranslation } from 'react-i18next'
import type { components } from '../../../api/generated/schema'
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
    <div className="popover" style={{ left: x, top: y, transform: 'translate(-50%, -110%)' }}>
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        style={{ position: 'absolute', top: 4, right: 6, border: 'none', background: 'none' }}
      >
        ×
      </button>
      <div className="nm">{store.name}</div>
      <div className="row">{store.chainName ?? '—'}</div>
      <div className="row">{formatTRY(store.sixMonthRevenue ?? 0)}</div>
      <div className="row">{store.activeRouteCode ?? t('planner.pool', 'Havuz')}</div>
      <div className="actions">
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

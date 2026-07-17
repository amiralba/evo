import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useRoute } from '../../api/queries'
import { StopsList } from './StopsList'
import { HealthCard } from './HealthCard'
import { PatchForm } from '../editing/PatchForm'
import { PublishModal } from '../publish/PublishModal'

const STATUS_LABEL: Record<number, string> = { 1: 'Taslak', 2: 'Aktif', 3: 'Pasif' }

export function RouteDetailPanel() {
  const { t } = useTranslation()
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const { data: route, isLoading, isError } = useRoute(focusedRouteId)
  const [showPatchForm, setShowPatchForm] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)

  if (!focusedRouteId) {
    return (
      <>
        <div className="panel-head">
          <div className="ttl">{t('planner.detail', 'Detay')}</div>
          <div className="sub">{t('planner.detailEmptySub', 'Bir mağaza, rut veya kişi seç')}</div>
        </div>
        <div className="empty">{t('planner.noRouteFocused', 'Haritadan veya listeden bir rota seçin.')}</div>
      </>
    )
  }

  if (isLoading) {
    return <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>
  }

  if (isError || !route) {
    return <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>
  }

  return (
    <>
      <div className="panel-head">
        <div className="ttl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {route.routeCode}
          <span className="pill">{route.status !== undefined ? (STATUS_LABEL[route.status] ?? route.status) : '—'}</span>
          <button
            type="button"
            className="primary"
            data-testid="publish-trigger"
            onClick={() => setShowPublishModal(true)}
            style={{ marginLeft: 'auto' }}
          >
            {t('common.publish', 'Yayınla')}
          </button>
        </div>
        <div className="sub">{route.name}</div>
        <div className="sub">{route.currentAssignment?.merchandiserName ?? t('planner.unassigned', 'Atanmamış')}</div>
      </div>

      <div className="panel-body">
        <HealthCard routeId={focusedRouteId} />
        <StopsList routeId={focusedRouteId} stops={route.stops ?? []} />

        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setShowPatchForm((v) => !v)}>
            {t('planner.addPatch', '+ Yama ekle')}
          </button>
        </div>
        {showPatchForm && (
          <PatchForm routeId={focusedRouteId} stops={route.stops ?? []} onClose={() => setShowPatchForm(false)} />
        )}
      </div>

      {showPublishModal && (
        <PublishModal routeId={focusedRouteId} onClose={() => setShowPublishModal(false)} />
      )}
    </>
  )
}

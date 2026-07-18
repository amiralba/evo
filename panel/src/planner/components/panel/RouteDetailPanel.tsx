import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useRoute } from '../../api/queries'
import { StopsList } from './StopsList'
import { HealthCard } from './HealthCard'
import { HistoryTab } from './HistoryTab'
import { TasksTab } from './TasksTab'
import { PatchForm } from '../editing/PatchForm'
import { EvidenceStrip } from './EvidenceStrip'
import { StoreDetailPanel } from './StoreDetailPanel'
import { ReassignPersonModal } from './ReassignPersonModal'

const STATUS_LABEL: Record<number, string> = { 1: 'Taslak', 2: 'Aktif', 3: 'Pasif' }

type PanelTab = 'info' | 'tasks' | 'history'

export function RouteDetailPanel() {
  const { t } = useTranslation()
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const focusedStoreId = useWorkspaceStore((s) => s.focusedStoreId)
  const { data: route, isLoading, isError } = useRoute(focusedRouteId)
  const [showPatchForm, setShowPatchForm] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [tab, setTab] = useState<PanelTab>('info')
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null)

  if (focusedStoreId) {
    return <StoreDetailPanel storeId={focusedStoreId} />
  }

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
        </div>
        <div className="sub">{route.name}</div>
        <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {route.currentAssignment?.merchandiserName ?? t('planner.unassigned', 'Atanmamış')}
          <button type="button" data-testid="reassign-trigger" onClick={() => setShowReassign(true)} style={{ fontSize: 10, padding: '1px 6px' }}>
            {t('planner.reassignPerson', 'Kişi değiştir')}
          </button>
        </div>
      </div>

      <div className="panel-tabs">
        <div className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>
          {t('planner.tabInfo', 'Bilgi')}
        </div>
        <div className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>
          {t('planner.tabTasks', 'Görevler')}
        </div>
        <div className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          {t('planner.tabHistory', 'Geçmiş')}
        </div>
      </div>

      <div className="panel-body">
        {tab === 'info' && (
          <>
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

            <EvidenceStrip routeId={focusedRouteId} />
          </>
        )}

        {tab === 'tasks' && (() => {
          const stops = route.stops ?? []
          if (stops.length === 0) {
            return <div className="empty">{t('planner.noStops', 'Bu rotada durak yok.')}</div>
          }
          const selectedStop = stops.find((s) => s.id === focusedStopId) ?? stops[0]
          const today = new Date().toISOString().slice(0, 10)
          return (
            <>
              <select
                value={selectedStop.id}
                onChange={(e) => setFocusedStopId(e.target.value)}
                style={{ marginBottom: 10, width: '100%' }}
              >
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.storeName}
                  </option>
                ))}
              </select>
              {selectedStop.storeId && (
                <TasksTab routeId={focusedRouteId} storeId={selectedStop.storeId} date={today} />
              )}
            </>
          )
        })()}

        {tab === 'history' && <HistoryTab routeId={focusedRouteId} />}
      </div>

      {showReassign && (
        <ReassignPersonModal
          routeId={focusedRouteId}
          routeCode={route.routeCode ?? ''}
          currentMerchandiserName={route.currentAssignment?.merchandiserName ?? null}
          onClose={() => setShowReassign(false)}
        />
      )}
    </>
  )
}

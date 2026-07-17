import { useTranslation } from 'react-i18next'
import { useRouteAuditLog } from '../../api/queries'

const EVENT_LABEL: Record<string, string> = {
  StopAdded: 'Durak eklendi',
  StopRemoved: 'Durak kaldırıldı',
  StopMoved: 'Durak taşındı',
  StopsReordered: 'Duraklar yeniden sıralandı',
  FreqChanged: 'Sıklık değişti',
  Assigned: 'Kişi atandı',
  Unassigned: 'Atama kaldırıldı',
  Patched: 'Yama eklendi',
  Published: 'Yayınlandı',
}

interface HistoryTabProps {
  routeId: string
}

export function HistoryTab({ routeId }: HistoryTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useRouteAuditLog(true)

  if (isLoading) return <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>
  if (isError) return <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>

  const entries = (data?.items ?? []).filter((e) => e.entityKey === routeId)

  if (entries.length === 0) {
    return <div className="empty">{t('planner.noHistory', 'Bu rota için henüz geçmiş kaydı yok.')}</div>
  }

  return (
    <div>
      {entries.map((e) => (
        <div key={e.id} className="hist-item">
          <div className="d">{e.occurredAt ? new Date(e.occurredAt).toLocaleString('tr-TR') : ''}</div>
          {EVENT_LABEL[e.event ?? ''] ?? e.event}
        </div>
      ))}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { useRouteEvidence } from '../../../analytics/api/queries'
import '../../../analytics/analytics.css'

interface EvidenceStripProps {
  routeId: string
}

export function EvidenceStrip({ routeId }: EvidenceStripProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useRouteEvidence(routeId, 4)

  if (isLoading) {
    return <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>
  }

  if (isError || !data) {
    return <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>
  }

  const stores = data.stores ?? []
  if (stores.length === 0) {
    return null
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="sub" style={{ marginBottom: 6 }}>
        {t('analytics.evidenceTitle', 'Kanıt Zinciri (son 4 hafta)')}
      </div>
      <table className="analytics-table">
        <thead>
          <tr>
            <th>{t('analytics.store', 'Mağaza')}</th>
            <th>{t('analytics.planned', 'Planlanan')}</th>
            <th>{t('analytics.done', 'Tamamlanan')}</th>
            <th>{t('analytics.missed', 'Kaçırılan')}</th>
            <th>{t('analytics.skipped', 'Atlanan')}</th>
            <th>{t('analytics.variance', 'Süre Sapması')}</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.storeId}>
              <td>{s.storeName}</td>
              <td>{s.planned ?? 0}</td>
              <td>{s.done ?? 0}</td>
              <td>{s.missed ?? 0}</td>
              <td>{s.skipped ?? 0}</td>
              <td>{(s.durationVariancePct ?? 0).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sub" style={{ marginTop: 6, fontStyle: 'italic' }}>
        {t('analytics.causalityDisclaimer', 'Kanıt, nedensellik değil.')}
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import type { components } from '../../api/generated/schema'

type MerchandiserMobilityDto = components['schemas']['MerchandiserMobilityDto']

interface MobilityTableProps {
  merchandisers: MerchandiserMobilityDto[]
}

export function MobilityTable({ merchandisers }: MobilityTableProps) {
  const { t } = useTranslation()

  if (merchandisers.length === 0) {
    return <div className="empty">{t('analytics.noMerchandisers', 'Bu bölgede saha ekibi bulunamadı.')}</div>
  }

  return (
    <table className="analytics-table">
      <thead>
        <tr>
          <th>{t('analytics.merchandiser', 'Saha Elemanı')}</th>
          <th>{t('analytics.routesHeld', 'Farklı Rota Sayısı')}</th>
          <th>{t('analytics.reshuffles', 'Rota İçi Değişim')}</th>
          <th>{t('analytics.regionalMedian', 'Bölge Medyanı')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {merchandisers.map((m) => (
          <tr key={m.merchandiserId} className={m.outlier ? 'outlier-row' : undefined}>
            <td>{m.name}</td>
            <td>{m.distinctRoutesHeld ?? 0}</td>
            <td>{m.intraRouteReshuffles ?? 0}</td>
            <td>{(m.regionalMedianRoutesHeld ?? 0).toFixed(1)}</td>
            <td>
              {m.outlier && (
                <span className="badge" style={{ background: '#faeeda', color: '#854f0b' }}>
                  {t('analytics.reviewFlag', 'gözden geçir')}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

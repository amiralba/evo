import { useTranslation } from 'react-i18next'
import type { components } from '../../api/generated/schema'
import { formatPct, formatVariance, utilizationBandInfo } from '../format'

type RoutePlanHealthDto = components['schemas']['RoutePlanHealthDto']

interface PlanHealthTableProps {
  routes: RoutePlanHealthDto[]
}

export function PlanHealthTable({ routes }: PlanHealthTableProps) {
  const { t } = useTranslation()
  const sorted = [...routes].sort((a, b) => (b.planHealthScore ?? 0) - (a.planHealthScore ?? 0))

  if (sorted.length === 0) {
    return <div className="empty">{t('analytics.noRoutes', 'Bu bölgede rota bulunamadı.')}</div>
  }

  return (
    <table className="analytics-table">
      <thead>
        <tr>
          <th>{t('analytics.route', 'Rota')}</th>
          <th>{t('analytics.completion', 'Tamamlanma')}</th>
          <th>{t('analytics.variance', 'Süre Sapması')}</th>
          <th>{t('analytics.utilization', 'Kullanım')}</th>
          <th>{t('analytics.taskCompliance', 'Görev Uyumu')}</th>
          <th>{t('analytics.patchLoad', 'Yama Yükü')}</th>
          <th>{t('analytics.stability', 'Kararlılık')}</th>
          <th>{t('analytics.turnover', 'Devir')}</th>
          <th>{t('analytics.overrideRate', 'Geçersiz Kılma')}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const band = utilizationBandInfo(r.utilizationBand ?? '')
          const patchLoadTotal = Object.values(r.patchLoad ?? {}).reduce((a, b) => a + (b ?? 0), 0)
          return (
            <tr key={r.routeId}>
              <td>
                {r.routeCode} — {r.routeName}
              </td>
              <td>{formatPct(r.completionPct ?? 0)}</td>
              <td>{formatVariance(r.durationVariancePct ?? 0, 1)}</td>
              <td>
                <span className="band-pill" style={{ background: band.color }}>
                  {band.label}
                </span>
              </td>
              <td>{formatPct(r.taskCompliancePct ?? 0)}</td>
              <td>{patchLoadTotal}</td>
              <td>{(r.stabilityScore ?? 0).toFixed(0)}</td>
              <td>{r.assignmentTurnover ?? 0}</td>
              <td>{formatPct(r.overrideRatePct ?? 0, 1)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

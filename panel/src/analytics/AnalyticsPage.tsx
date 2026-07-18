import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { usePlanHealth, useMobility } from './api/queries'
import { PlanHealthTable } from './components/PlanHealthTable'
import { MobilityTable } from './components/MobilityTable'
import './analytics.css'

const PROVINCES = ['Adana', 'Ankara', 'İstanbul', 'İzmir', 'Bursa']

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function AnalyticsPage() {
  const { t } = useTranslation()
  const [region, setRegion] = useState<string>('')

  const { from, to } = useMemo(() => {
    const now = new Date()
    return { to: isoDate(now), from: isoDate(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)) }
  }, [])

  const planHealth = usePlanHealth(region || undefined, from, to)
  const mobility = useMobility(region || undefined, 6)

  return (
    <div className="analytics-page">
      <p>
        <Link to="/planner">{t('analytics.backToPlanner', '← Planlamaya dön')}</Link>
      </p>
      <h1>{t('analytics.title', 'Analitik')}</h1>

      <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="region">
        <option value="">{t('analytics.allRegions', 'Tüm Bölgeler')}</option>
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <h2>{t('analytics.planHealth', 'Plan Sağlığı')}</h2>
      <div className="analytics-card">
        {planHealth.isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
        {planHealth.isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}
        {planHealth.data && <PlanHealthTable routes={planHealth.data.routes ?? []} />}
      </div>

      <h2>{t('analytics.mobility', 'Hareketlilik')}</h2>
      <div className="analytics-card">
        {mobility.isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
        {mobility.isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}
        {mobility.data && <MobilityTable merchandisers={mobility.data} />}
      </div>
    </div>
  )
}

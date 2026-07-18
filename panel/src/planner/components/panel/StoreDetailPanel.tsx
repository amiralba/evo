import { useTranslation } from 'react-i18next'
import { useStoreDetail } from '../../api/queries'
import { formatTRY } from '../../format'

const CATEGORY_LABEL: Record<number, string> = { 1: 'Potansiyel', 2: 'Yüksek Değer', 3: 'Servis' }
const CATEGORY_CODE: Record<number, string> = { 1: 'P', 2: 'V', 3: 'S' }

interface StoreDetailPanelProps {
  storeId: string
}

/** Store-focus panel context (prototype `focus.type==='store'`, evo-planner-prototype-v0.5.html:
 * 1647-1680) — parity gap-matrix §1/§6/§8 item #6: the panel wasn't route-only in the prototype,
 * it switched content by focus type. This is the store branch; selection/draft stay their own
 * follow-ups (draft/new-route needs a flow that doesn't exist yet, selection summary is next). */
export function StoreDetailPanel({ storeId }: StoreDetailPanelProps) {
  const { t } = useTranslation()
  const { data: store, isLoading, isError } = useStoreDetail(storeId)

  if (isLoading) {
    return <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>
  }
  if (isError || !store) {
    return <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>
  }

  const sixMonthRevenue = (store.revenue ?? []).reduce((sum, r) => sum + (r.revenue ?? 0), 0)
  const activeFlag = (store.flags ?? []).find((f) => f.type === 2 && (!f.endsOn || f.endsOn >= new Date().toISOString().slice(0, 10)))

  return (
    <>
      <div className="panel-head">
        <div className="ttl">{store.name}</div>
        <div className="sub">
          {store.chainName} · {store.district}
          {store.category !== undefined && (
            <span
              className="badge"
              style={{ marginLeft: 6, background: 'var(--gray-l)', color: 'var(--tx2)' }}
            >
              {CATEGORY_CODE[store.category]} {CATEGORY_LABEL[store.category]}
            </span>
          )}
        </div>
      </div>
      <div className="panel-body">
        <div className="kv">
          <span className="k">{t('planner.revenue', 'Ciro')} (6 ay)</span>
          <b>{formatTRY(sixMonthRevenue)}</b>
        </div>
        <div className="kv">
          <span className="k">{t('planner.format', 'Format')}</span>
          <span>{store.format}</span>
        </div>
        <div className="kv">
          <span className="k">{t('planner.channel', 'Kanal')}</span>
          <span>{store.channel ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="k">{t('planner.defaultDuration', 'Varsayılan süre')}</span>
          <span>{store.defaultServiceMinutes ? `${store.defaultServiceMinutes} dk` : '—'}</span>
        </div>
        {activeFlag && (
          <div className="kv">
            <span className="k">{t('planner.status', 'Durum')}</span>
            <b style={{ color: 'var(--red-d)' }}>
              🏪 {t('planner.closedUntil', 'Kapalı')}
              {activeFlag.endsOn ? ` — ${activeFlag.endsOn}` : ''}
            </b>
          </div>
        )}
      </div>
    </>
  )
}

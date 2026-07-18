import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useRoutes, useStoresGeo } from '../api/queries'
import { RailExpandedStops } from './RailExpandedStops'
import { NewRouteModal } from './NewRouteModal'
import { categoryColors } from '../../theme/tokens'

const CATEGORY_CODE: Record<number, keyof typeof categoryColors> = { 1: 'P', 2: 'V', 3: 'S' }
const ROUTE_COLORS = ['#378ADD', '#1D9E75', '#EF9F27', '#E24B4A', '#639922', '#8B5CF6']

function routeColor(routeId: string): string {
  let hash = 0
  for (let i = 0; i < routeId.length; i++) hash = (hash * 31 + routeId.charCodeAt(i)) >>> 0
  return ROUTE_COLORS[hash % ROUTE_COLORS.length]
}

function formatK(value: number): string {
  return `${Math.round(value / 1000)}K`
}

type RailTab = 'routes' | 'pool'

/** Left rail — prototype parity (evo-planner-prototype-v0.5.html:93-107, 1095-1145): Rutlar/Havuz
 * tabs, each route item's subtitle is assignee + accrued revenue + target-met icon + point count
 * (NOT route name/status), expand-to-ordered-stores (drag-reorder), Havuz lists stores with no
 * active route, + Yeni rut opens a real create-route form (backend POST /routes already existed). */
export function RouteRail() {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const focusRoute = useWorkspaceStore((s) => s.focusRoute)
  const focusStore = useWorkspaceStore((s) => s.focusStore)
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const { data: routesPage } = useRoutes(province)
  const [tab, setTab] = useState<RailTab>('routes')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { data: poolStores } = useStoresGeo(province, false)
  const [showNewRoute, setShowNewRoute] = useState(false)

  function toggleExpand(routeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(routeId)) next.delete(routeId)
      else next.add(routeId)
      return next
    })
  }

  return (
    <div className="rail">
      <div className="tabs">
        <div className={tab === 'routes' ? 'on' : ''} onClick={() => setTab('routes')}>
          {t('planner.railRoutes', 'Rutlar')}
        </div>
        <div className={tab === 'pool' ? 'on' : ''} onClick={() => setTab('pool')}>
          {t('planner.pool', 'Havuz')} {poolStores?.length ?? 0}
        </div>
      </div>

      <div className="list">
        {tab === 'routes' &&
          routesPage?.items
            ?.filter((r) => r.status !== 3)
            .map((r) => {
              if (!r.id) return null
              const routeId = r.id
              const focused = routeId === focusedRouteId
              const isExpanded = expanded.has(routeId)
              const color = routeColor(routeId)
              return (
                <div key={routeId} className={`route-item${focused ? ' on' : ''}`} onClick={() => (focused ? clearFocus() : focusRoute(routeId))}>
                  <div className="code">
                    <span className="dot" style={{ background: color }} />
                    {r.routeCode}
                    <span className="spacer" style={{ flex: 1 }} />
                    <span
                      style={{ cursor: 'pointer', color: 'var(--tx3)', padding: '0 3px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(routeId)
                      }}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                  <div className="sub">
                    {r.merchandiserName ?? t('planner.railNoPerson', 'kişi yok')} · {formatK(r.sixMonthRevenue ?? 0)}{' '}
                    {(r.sixMonthRevenue ?? 0) >= (r.revenueTarget ?? 0) ? '✅' : '⚠️'} · {r.stopCount} {t('planner.railStops', 'nokta')}
                  </div>
                  {isExpanded && <RailExpandedStops routeId={routeId} routeColor={color} />}
                </div>
              )
            })}

        {tab === 'routes' && (
          <div className="pool-item" data-testid="new-route-trigger" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setShowNewRoute(true)}>
            <span style={{ color: 'var(--tx2)' }}>{t('planner.newRoute', '+ Yeni rut')}</span>
          </div>
        )}

        {tab === 'pool' &&
          (poolStores ?? []).map((s) => (
            <div key={s.id} className="pool-item" style={{ cursor: 'pointer' }} onClick={() => s.id && focusStore(s.id)} data-testid="pool-store-item">
              <div className="nm">{s.name}</div>
              <div className="sub">
                {s.category !== undefined && (
                  <span
                    style={{
                      fontSize: 10,
                      borderRadius: 8,
                      padding: '1px 7px',
                      fontWeight: 600,
                      background: categoryColors[CATEGORY_CODE[s.category]].bg,
                      color: categoryColors[CATEGORY_CODE[s.category]].fg,
                      marginRight: 4,
                    }}
                  >
                    {CATEGORY_CODE[s.category]}
                  </span>
                )}
                {s.chainName}
              </div>
            </div>
          ))}

        {tab === 'pool' && (poolStores ?? []).length === 0 && <div className="empty">{t('planner.railPoolEmpty', 'Havuz boş 🎉')}</div>}
      </div>

      {showNewRoute && (
        <NewRouteModal
          onClose={() => setShowNewRoute(false)}
          onCreated={(routeId) => {
            focusRoute(routeId)
            setTab('routes')
          }}
        />
      )}
    </div>
  )
}

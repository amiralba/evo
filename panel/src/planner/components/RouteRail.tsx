import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useRoutes, useStoresGeo } from '../api/queries'
import { RailExpandedStops } from './RailExpandedStops'
import { categoryColors } from '../../theme/tokens'

const STATUS_LABEL: Record<number, string> = { 1: 'Taslak', 2: 'Aktif', 3: 'Pasif' }
const CATEGORY_CODE: Record<number, keyof typeof categoryColors> = { 1: 'P', 2: 'V', 3: 'S' }
const ROUTE_COLORS = ['#378ADD', '#1D9E75', '#EF9F27', '#E24B4A', '#639922', '#8B5CF6']

function routeColor(routeId: string): string {
  let hash = 0
  for (let i = 0; i < routeId.length; i++) hash = (hash * 31 + routeId.charCodeAt(i)) >>> 0
  return ROUTE_COLORS[hash % ROUTE_COLORS.length]
}

type RailTab = 'routes' | 'pool'

/** Left rail — prototype parity (evo-planner-prototype-v0.5.html:93-107, 1095-1145): Rutlar/Havuz
 * tabs, route items expand to their ordered stores (drag-reorder), Havuz lists stores with no
 * active route. "+ Yeni rut" (route creation) is intentionally NOT built here — it needs a real
 * draft-mode/new-route flow that doesn't exist in the panel yet (gap-matrix §3, no create-route API
 * wiring); a decorative no-op button would violate the "don't build fake buttons" rule. */
export function RouteRail() {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const focusRoute = useWorkspaceStore((s) => s.focusRoute)
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const { data: routesPage } = useRoutes(province)
  const [tab, setTab] = useState<RailTab>('routes')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { data: poolStores } = useStoresGeo(province, false)

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
                    {r.name} · {r.status !== undefined ? (STATUS_LABEL[r.status] ?? r.status) : '—'} · {r.stopCount}{' '}
                    {t('planner.railStops', 'nokta')}
                  </div>
                  {isExpanded && <RailExpandedStops routeId={routeId} routeColor={color} />}
                </div>
              )
            })}

        {tab === 'pool' &&
          (poolStores ?? []).map((s) => (
            <div key={s.id} className="pool-item">
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

        {tab === 'pool' && (poolStores ?? []).length === 0 && <div className="empty">{t('planner.railPoolEmpty', 'Tüm mağazalar rutlarda')}</div>}
      </div>
    </div>
  )
}

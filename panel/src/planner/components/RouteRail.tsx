import { useWorkspaceStore } from '../state/workspaceStore'
import { useRoutes } from '../api/queries'

const STATUS_LABEL: Record<number, string> = { 1: 'Taslak', 2: 'Aktif', 3: 'Pasif' }
const STATUS_DOT: Record<number, string> = { 1: 'var(--tx3)', 2: 'var(--teal-d)', 3: 'var(--gray-m)' }

export function RouteRail() {
  const province = useWorkspaceStore((s) => s.province)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const focusRoute = useWorkspaceStore((s) => s.focusRoute)
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const { data: routesPage } = useRoutes(province)

  return (
    <div className="rail">
      <div className="list">
        {routesPage?.items?.map((r) => {
          if (!r.id) return null
          const routeId = r.id
          const focused = routeId === focusedRouteId
          return (
            <div
              key={routeId}
              className={`route-item${focused ? ' on' : ''}`}
              onClick={() => (focused ? clearFocus() : focusRoute(routeId))}
            >
              <div className="code">
                <span className="dot" style={{ background: r.status !== undefined ? STATUS_DOT[r.status] : 'var(--tx3)' }} />
                {r.routeCode}
              </div>
              <div className="sub">{r.name}</div>
              <div className="sub">
                {r.status !== undefined ? (STATUS_LABEL[r.status] ?? r.status) : '—'} · {r.stopCount} durak
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

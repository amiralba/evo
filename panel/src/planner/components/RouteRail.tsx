import { useWorkspaceStore } from '../state/workspaceStore'
import { useRoutes } from '../api/queries'
import { colors, spacing, radius, fontSize } from '../../theme/tokens'

const STATUS_LABEL: Record<number, string> = { 1: 'Taslak', 2: 'Aktif', 3: 'Pasif' }

export function RouteRail() {
  const province = useWorkspaceStore((s) => s.province)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const focusRoute = useWorkspaceStore((s) => s.focusRoute)
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const { data: routesPage } = useRoutes(province)

  return (
    <div
      style={{
        width: 220,
        borderRight: `1px solid ${colors.border}`,
        overflowY: 'auto',
        background: colors.card,
      }}
    >
      {routesPage?.items?.map((r) => {
        if (!r.id) return null
        const routeId = r.id
        const focused = routeId === focusedRouteId
        return (
          <div
            key={routeId}
            onClick={() => (focused ? clearFocus() : focusRoute(routeId))}
            style={{
              padding: `${spacing.lg} ${spacing.xl}`,
              cursor: 'pointer',
              borderBottom: `1px solid ${colors.border}`,
              background: focused ? colors.blueLight : 'transparent',
              fontSize: fontSize.md,
            }}
          >
            <div style={{ fontWeight: 600 }}>{r.routeCode}</div>
            <div style={{ color: colors.text2, fontSize: fontSize.sm }}>{r.name}</div>
            <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.xs }}>
              <span
                style={{
                  fontSize: fontSize.xs,
                  padding: `1px ${spacing.sm}`,
                  borderRadius: radius.pill,
                  background: colors.grayLight,
                  color: colors.text2,
                }}
              >
                {(r.status !== undefined && STATUS_LABEL[r.status]) ?? r.status}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.text3 }}>{r.stopCount} durak</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

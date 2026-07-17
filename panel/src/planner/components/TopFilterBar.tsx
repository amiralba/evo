import { useTranslation } from 'react-i18next'
import { useWorkspaceStore, type WorkspaceLayout } from '../state/workspaceStore'
import { useRoutes } from '../api/queries'
import { colors, spacing, radius, fontSize } from '../../theme/tokens'

const PROVINCES = ['Adana', 'Ankara', 'İstanbul', 'İzmir', 'Bursa']
const LAYOUTS: { key: WorkspaceLayout; label: string }[] = [
  { key: 'map', label: 'Harita' },
  { key: 'split', label: 'Bölünmüş' },
  { key: 'schedule', label: 'Takvim' },
  { key: 'table', label: 'Tablo' },
]

export function TopFilterBar() {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const setProvince = useWorkspaceStore((s) => s.setProvince)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const focusRoute = useWorkspaceStore((s) => s.focusRoute)
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const { data: routesPage } = useRoutes(province)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xl,
        padding: `${spacing.lg} ${spacing.xl}`,
        borderBottom: `1px solid ${colors.border}`,
        background: colors.card,
        fontSize: fontSize.md,
      }}
    >
      <strong>{t('planner.title')}</strong>

      <select value={province} onChange={(e) => setProvince(e.target.value)} aria-label="province">
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={focusedRouteId ?? ''}
        onChange={(e) => e.target.value && focusRoute(e.target.value)}
        aria-label="route"
      >
        <option value="">{t('planner.selectRoute', 'Rota seçin')}</option>
        {routesPage?.items?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.routeCode} — {r.name}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: spacing.sm, marginLeft: 'auto' }}>
        {LAYOUTS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setLayout(l.key)}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              background: layout === l.key ? colors.blueLight : colors.card,
              color: layout === l.key ? colors.blueDark : colors.text,
              cursor: 'pointer',
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

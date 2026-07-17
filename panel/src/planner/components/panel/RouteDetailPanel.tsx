import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useRoute } from '../../api/queries'
import { StopsList } from './StopsList'
import { HealthCard } from './HealthCard'
import { PatchForm } from '../editing/PatchForm'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'

const STATUS_LABEL: Record<number, string> = { 1: 'Taslak', 2: 'Aktif', 3: 'Pasif' }

export function RouteDetailPanel() {
  const { t } = useTranslation()
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const { data: route, isLoading, isError } = useRoute(focusedRouteId)
  const [showPatchForm, setShowPatchForm] = useState(false)

  if (!focusedRouteId) {
    return (
      <div style={{ padding: spacing.xl, color: colors.text3, fontSize: fontSize.md }}>
        {t('planner.noRouteFocused', 'Haritadan veya listeden bir rota seçin.')}
      </div>
    )
  }

  if (isLoading) {
    return <div style={{ padding: spacing.xl, fontSize: fontSize.md }}>{t('common.loading', 'Yükleniyor…')}</div>
  }

  if (isError || !route) {
    return (
      <div style={{ padding: spacing.xl, color: colors.redDark, fontSize: fontSize.md }}>
        {t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: spacing.xl, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
          <strong style={{ fontSize: fontSize.xl }}>{route.routeCode}</strong>
          <span
            style={{
              fontSize: fontSize.xs,
              padding: `1px ${spacing.sm}`,
              borderRadius: radius.pill,
              background: colors.grayLight,
              color: colors.text2,
            }}
          >
            {route.status !== undefined ? (STATUS_LABEL[route.status] ?? route.status) : '—'}
          </span>
        </div>
        <div style={{ color: colors.text2, fontSize: fontSize.md }}>{route.name}</div>
        <div style={{ color: colors.text3, fontSize: fontSize.sm, marginTop: spacing.xs }}>
          {route.currentAssignment?.merchandiserName ?? t('planner.unassigned', 'Atanmamış')}
        </div>
      </div>

      <HealthCard routeId={focusedRouteId} />
      <StopsList routeId={focusedRouteId} stops={route.stops ?? []} />

      <div style={{ padding: spacing.xl }}>
        <button type="button" onClick={() => setShowPatchForm((v) => !v)}>
          {t('planner.addPatch', '+ Yama ekle')}
        </button>
      </div>
      {showPatchForm && (
        <PatchForm routeId={focusedRouteId} stops={route.stops ?? []} onClose={() => setShowPatchForm(false)} />
      )}
    </div>
  )
}

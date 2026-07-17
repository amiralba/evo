import { useTranslation } from 'react-i18next'
import type { components } from '../../../api/generated/schema'
import { colors, spacing, fontSize, radius } from '../../../theme/tokens'
import { formatMinutes } from '../../format'

type RouteStopDto = components['schemas']['RouteStopDto']

const FREQUENCY_LABEL: Record<number, string> = { 1: 'Günlük', 2: 'Haftalık', 3: 'İki Haftalık' }

interface StopsListProps {
  routeId: string
  stops: RouteStopDto[]
}

export function StopsList({ stops }: StopsListProps) {
  const { t } = useTranslation()
  const ordered = [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))

  if (ordered.length === 0) {
    return (
      <div style={{ padding: spacing.xl, color: colors.text3, fontSize: fontSize.md }}>
        {t('planner.noStops', 'Bu rotada durak yok.')}
      </div>
    )
  }

  return (
    <div style={{ padding: spacing.xl }}>
      {ordered.map((stop) => (
        <div
          key={stop.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.lg,
            padding: `${spacing.md} 0`,
            borderBottom: `1px solid ${colors.border}`,
            fontSize: fontSize.md,
          }}
        >
          <span style={{ color: colors.text3, minWidth: 18 }}>{stop.sequence}</span>
          <span style={{ flex: 1 }}>{stop.storeName}</span>
          <span style={{ color: colors.text2, fontSize: fontSize.sm }}>
            {stop.serviceMinutes != null ? formatMinutes(stop.serviceMinutes) : t('planner.defaultDuration', 'varsayılan')}
          </span>
          <span
            style={{
              fontSize: fontSize.xs,
              padding: `1px ${spacing.sm}`,
              borderRadius: radius.pill,
              background: colors.grayLight,
              color: colors.text2,
            }}
          >
            {stop.frequency !== undefined ? (FREQUENCY_LABEL[stop.frequency] ?? stop.frequency) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import type { WeekRange } from '../../schedule/week'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'

interface WeekNavigatorProps {
  week: WeekRange
  onPrev: () => void
  onNext: () => void
  onReset: () => void
}

function formatRange(week: WeekRange): string {
  const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
  return `${fmt.format(new Date(`${week.from}T00:00:00Z`))} – ${fmt.format(new Date(`${week.to}T00:00:00Z`))}`
}

export function WeekNavigator({ week, onPrev, onNext, onReset }: WeekNavigatorProps) {
  const { t } = useTranslation()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, padding: `${spacing.lg} ${spacing.xl}`, borderBottom: `1px solid ${colors.border}` }}>
      <button type="button" onClick={onPrev} aria-label="prev-week">
        ‹ {t('planner.prevWeek', 'Önceki')}
      </button>
      <strong style={{ fontSize: fontSize.md }}>{formatRange(week)}</strong>
      <button type="button" onClick={onNext} aria-label="next-week">
        {t('planner.nextWeek', 'Sonraki')} ›
      </button>
      <button
        type="button"
        onClick={onReset}
        style={{ marginLeft: 'auto', fontSize: fontSize.sm, borderRadius: radius.pill, padding: `2px ${spacing.lg}` }}
      >
        {t('planner.thisWeek', 'Bu hafta')}
      </button>
    </div>
  )
}

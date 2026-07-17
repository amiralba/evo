import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { usePlan } from '../../api/queries'
import { currentWeek, nextWeek, prevWeek } from '../../schedule/week'
import { WeekNavigator } from './WeekNavigator'
import { VisitBlock } from './VisitBlock'
import { BREAK_BLOCKS } from '../../schedule/breaks'
import { PX_PER_MINUTE } from '../../schedule/position'
import { colors, spacing, radius, fontSize, loadStatusColors, severityColors } from '../../../theme/tokens'
import { formatMinutes } from '../../format'

const DAY_START_MINUTES = 9 * 60
const DAY_END_MINUTES = 18 * 60
const GRID_HEIGHT = (DAY_END_MINUTES - DAY_START_MINUTES) * PX_PER_MINUTE
const WEEKDAY_LABEL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum']

function loadColor(minutes: number): string {
  if (minutes > 450) return loadStatusColors.over
  if (minutes < 400) return loadStatusColors.under
  return loadStatusColors.ok
}

export function SchedulePane() {
  const { t } = useTranslation()
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const [week, setWeek] = useState(currentWeek())
  const { data: days, isLoading, isError } = usePlan(focusedRouteId, week.from, week.to)

  if (!focusedRouteId) {
    return (
      <div style={{ padding: spacing.xl, color: colors.text3, fontSize: fontSize.md }}>
        {t('planner.noRouteFocused', 'Haritadan veya listeden bir rota seçin.')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WeekNavigator
        week={week}
        onPrev={() => setWeek((w) => prevWeek(w.from))}
        onNext={() => setWeek((w) => nextWeek(w.from))}
        onReset={() => setWeek(currentWeek())}
      />

      {isLoading && <div style={{ padding: spacing.xl, fontSize: fontSize.md }}>{t('common.loading', 'Yükleniyor…')}</div>}
      {isError && (
        <div style={{ padding: spacing.xl, color: colors.redDark, fontSize: fontSize.md }}>
          {t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}
        </div>
      )}
      {!isLoading && !isError && (!days || days.length === 0) && (
        <div style={{ padding: spacing.xl, color: colors.text3, fontSize: fontSize.md }}>
          {t('planner.noPlanYet', 'Bu rota için henüz bir plan yok.')}
        </div>
      )}

      {!isLoading && !isError && days && days.length > 0 && (
        <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
          {days.map((day, i) => {
            const minutes = day.plannedMinutes ?? 0
            return (
              <div
                key={day.date ?? i}
                style={{ flex: 1, borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', minWidth: 140 }}
              >
                <div style={{ padding: spacing.sm, textAlign: 'center', fontSize: fontSize.sm, fontWeight: 600, borderBottom: `1px solid ${colors.border}` }}>
                  {WEEKDAY_LABEL[i] ?? day.date} <span style={{ color: colors.text3, fontWeight: 400 }}>{day.date}</span>
                </div>

                <div style={{ position: 'relative', height: GRID_HEIGHT, background: colors.grayLight }}>
                  {BREAK_BLOCKS.map((b, bi) => (
                    <div
                      key={bi}
                      style={{
                        position: 'absolute',
                        top: (b.startMinutes - DAY_START_MINUTES) * PX_PER_MINUTE,
                        height: (b.endMinutes - b.startMinutes) * PX_PER_MINUTE,
                        left: 0,
                        right: 0,
                        background: colors.border,
                        color: colors.text2,
                        fontSize: fontSize.xs,
                        padding: `1px ${spacing.sm}`,
                      }}
                    >
                      {b.label}
                    </div>
                  ))}
                  {(day.visits ?? []).map((visit, vi) => (
                    <VisitBlock key={vi} visit={visit} dayStartMinutes={DAY_START_MINUTES} />
                  ))}
                </div>

                <div style={{ padding: spacing.sm, textAlign: 'center', fontSize: fontSize.sm, color: loadColor(minutes), borderTop: `1px solid ${colors.border}` }}>
                  {formatMinutes(minutes)} / 450
                </div>

                {(day.findings ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.sm }}>
                    {day.findings!.map((f, fi) => (
                      <span
                        key={fi}
                        title={f.message ?? ''}
                        style={{
                          fontSize: fontSize.xs,
                          padding: `1px ${spacing.sm}`,
                          borderRadius: radius.pill,
                          background: f.severity === 1 ? severityColors.err.bg : severityColors.warn.bg,
                          color: f.severity === 1 ? severityColors.err.fg : severityColors.warn.fg,
                        }}
                      >
                        {f.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

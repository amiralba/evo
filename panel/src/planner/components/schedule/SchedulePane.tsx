import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { usePlan } from '../../api/queries'
import { currentWeek, nextWeek, prevWeek } from '../../schedule/week'
import { WeekNavigator } from './WeekNavigator'
import { VisitBlock } from './VisitBlock'
import { BREAK_BLOCKS } from '../../schedule/breaks'
import { PX_PER_MINUTE, DAY_START_MINUTES, DAY_END_MINUTES } from '../../schedule/position'
import { spacing, fontSize, radius, severityColors } from '../../../theme/tokens'
import { formatMinutes } from '../../format'

const GRID_HEIGHT = (DAY_END_MINUTES - DAY_START_MINUTES) * PX_PER_MINUTE
const WEEKDAY_LABEL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum']

function loadClass(minutes: number): string {
  if (minutes > 450) return 'over'
  if (minutes < 400) return 'under'
  return 'ok'
}

export function SchedulePane() {
  const { t } = useTranslation()
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const [week, setWeek] = useState(currentWeek())
  const { data: days, isLoading, isError } = usePlan(focusedRouteId, week.from, week.to)

  return (
    <div className="pane" id="schedPane">
      <div className="pane-head">
        TAKVİM <span style={{ color: 'var(--tx3)' }}>— blok: sürükle / alt kenar: süre uzat</span>
      </div>

      {!focusedRouteId && (
        <div className="empty">{t('planner.noRouteFocused', 'Haritadan veya listeden bir rota seçin.')}</div>
      )}

      {focusedRouteId && (
        <>
          <WeekNavigator
            week={week}
            onPrev={() => setWeek((w) => prevWeek(w.from))}
            onNext={() => setWeek((w) => nextWeek(w.from))}
            onReset={() => setWeek(currentWeek())}
          />

          {isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
          {isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}
          {!isLoading && !isError && (!days || days.length === 0) && (
            <div className="empty">{t('planner.noPlanYet', 'Bu rota için henüz bir plan yok.')}</div>
          )}

          {!isLoading && !isError && days && days.length > 0 && (
            <div className="sched-scroll" style={{ flex: 1, overflow: 'auto', padding: spacing.xl }}>
              <div style={{ display: 'flex', gap: spacing.lg }}>
                {days.map((day, i) => {
                  const minutes = day.plannedMinutes ?? 0
                  return (
                    <div key={day.date ?? i} style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ textAlign: 'center', fontSize: fontSize.sm, color: 'var(--tx2)', padding: `0 0 ${spacing.xs}` }}>
                        {WEEKDAY_LABEL[i] ?? day.date} <span style={{ color: 'var(--tx3)' }}>{day.date}</span>
                      </div>

                      <div className="day-cell" style={{ height: GRID_HEIGHT }}>
                        <div className={`day-total ${loadClass(minutes)}`}>{formatMinutes(minutes)} / 450</div>
                        {BREAK_BLOCKS.map((b, bi) => (
                          <div
                            key={bi}
                            className="brk"
                            style={{
                              top: (b.startMinutes - DAY_START_MINUTES) * PX_PER_MINUTE,
                              height: (b.endMinutes - b.startMinutes) * PX_PER_MINUTE,
                            }}
                          >
                            {b.label}
                          </div>
                        ))}
                        {(day.visits ?? []).map((visit, vi) => (
                          <VisitBlock key={vi} visit={visit} dayStartMinutes={DAY_START_MINUTES} />
                        ))}
                      </div>

                      {(day.findings ?? []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, padding: `${spacing.sm} 0` }}>
                          {day.findings!.map((f, fi) => (
                            <span
                              key={fi}
                              title={f.message ?? ''}
                              className="badge"
                              style={{
                                background: f.severity === 1 ? severityColors.err.bg : severityColors.warn.bg,
                                color: f.severity === 1 ? severityColors.err.fg : severityColors.warn.fg,
                                borderRadius: radius.pill,
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
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { usePlan } from '../../api/queries'
import { useUpdateStop, useCreatePatch, useCancelPatch } from '../../api/mutations'
import { toast } from '../../state/toastStore'
import { currentWeek, weekdayDates } from '../../schedule/week'
import { VisitBlock } from './VisitBlock'
import { BREAK_BLOCKS } from '../../schedule/breaks'
import { PX_PER_MINUTE, DAY_START_MINUTES, DAY_END_MINUTES, minutesOfDay } from '../../schedule/position'
import { pxToMinutes, snapMinutes, clampStart, clampDuration } from '../../schedule/dragMath'
import { reflowDay, type ReflowResult } from '../../schedule/reflow'
import { decideDrop } from '../../schedule/dropDecision'
import { spacing, radius, severityColors, colors } from '../../../theme/tokens'
import { formatMinutes } from '../../format'
import type { components } from '../../../api/generated/schema'

type PlanDayDto = components['schemas']['PlanDayDto']

const GRID_HEIGHT = (DAY_END_MINUTES - DAY_START_MINUTES) * PX_PER_MINUTE
const WEEKDAY_LABEL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum']
const HOUR_LABELS = Array.from(
  { length: Math.floor((DAY_END_MINUTES - DAY_START_MINUTES) / 60) + 1 },
  (_, i) => DAY_START_MINUTES + i * 60,
)

interface ParsedVisit {
  routeStopId: string
  storeId: string
  storeName: string
  startMin: number
  durationMin: number
  isPatch: boolean
  status?: number
  checkInAt?: string | null
  actualMinutes?: number | null
}

const DAILY_QUOTA_MINUTES = 450

// Prototype's under-threshold is QUOTA*0.6 (evo-planner-prototype-v0.5.html:1396) — was
// hardcoded to 400 here, flagging far more days as under-loaded than the prototype does.
function loadClass(minutes: number): string {
  if (minutes > DAILY_QUOTA_MINUTES) return 'over'
  if (minutes < DAILY_QUOTA_MINUTES * 0.6) return 'under'
  return 'ok'
}

function fmtHour(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function parseDay(day: PlanDayDto): ParsedVisit[] {
  return (day.visits ?? [])
    .filter((v) => v.start && v.end && v.routeStopId && v.storeId)
    .map((v) => ({
      routeStopId: v.routeStopId!,
      storeId: v.storeId!,
      storeName: v.storeName ?? '',
      startMin: minutesOfDay(v.start!),
      durationMin: Math.round((new Date(v.end!).getTime() - new Date(v.start!).getTime()) / 60_000),
      isPatch: v.source === 2,
      status: v.status,
      checkInAt: v.checkInAt,
      actualMinutes: v.actualMinutes,
    }))
    .sort((a, b) => a.startMin - b.startMin)
}

interface DragState {
  dayIndex: number
  visitIndex: number
  kind: 'move' | 'resize'
  pointerStartY: number
  pointerStartX: number
  currentY: number
  currentX: number
  targetDayIndex: number
  /** Real pointer travel (>5px), not just a click — prototype's startMove() treats <5px as a
   * click and focuses the store instead of dropping it in place (v0.5.html:1499-1538). */
  moved: boolean
}

interface SchedulePaneProps {
  routeId: string
  routeCode: string
  merchandiserName: string
}

export function SchedulePane({ routeId, routeCode, merchandiserName }: SchedulePaneProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const week = useWorkspaceStore((s) => s.week)
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const setDrawerOpen = useWorkspaceStore((s) => s.setDrawerOpen)
  const focusStore = useWorkspaceStore((s) => s.focusStore)
  const { data: days, isLoading, isError } = usePlan(routeId, week.from, week.to)
  const updateStop = useUpdateStop(routeId, province)
  const createPatch = useCreatePatch(routeId, province)
  const cancelPatch = useCancelPatch(routeId, province)

  const [drag, setDrag] = useState<DragState | null>(null)
  const dayRefs = useRef<(HTMLDivElement | null)[]>([])
  const dragRef = useRef<DragState | null>(null)

  const isPastWeek = week.from < currentWeek().from

  // Always render all 5 weekdays, even ones with no materialized visits yet (GetPlan only
  // returns dates that have at least one planned_visit row) -- otherwise a week where only
  // today has visits (e.g. this week, since past dates are never regenerated) renders as a
  // single mislabeled column instead of a normal 5-day grid with empty days.
  const dates = useMemo(() => weekdayDates(week), [week])
  const dayByDate = useMemo(() => {
    const map = new Map<string, PlanDayDto>()
    for (const day of days ?? []) {
      if (day.date) map.set(day.date, day)
    }
    return map
  }, [days])
  const visibleDays = useMemo(
    () => dates.map((date) => dayByDate.get(date) ?? { date, visits: [], plannedMinutes: 0, findings: [] }),
    [dates, dayByDate],
  )

  const parsedDays = useMemo(() => visibleDays.map(parseDay), [visibleDays])

  const weekLoadPct = useMemo(() => {
    const total = visibleDays.reduce((sum, d) => sum + (d.plannedMinutes ?? 0), 0)
    return Math.round((total / (DAILY_QUOTA_MINUTES * 5)) * 100)
  }, [visibleDays])

  function updateDrag(next: DragState) {
    dragRef.current = next
    setDrag(next)
  }

  function startDrag(kind: 'move' | 'resize', dayIndex: number, visitIndex: number, e: React.PointerEvent) {
    if (isPastWeek) return
    const next: DragState = {
      dayIndex,
      visitIndex,
      kind,
      pointerStartY: e.clientY,
      pointerStartX: e.clientX,
      currentY: e.clientY,
      currentX: e.clientX,
      targetDayIndex: dayIndex,
      moved: false,
    }
    updateDrag(next)

    function hitTestDay(clientX: number, fallback: number): number {
      for (let i = 0; i < dayRefs.current.length; i++) {
        const el = dayRefs.current[i]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (clientX >= rect.left && clientX <= rect.right) return i
      }
      return fallback
    }

    function onMove(ev: PointerEvent) {
      const current = dragRef.current
      if (!current) return
      const moved =
        current.moved || Math.abs(ev.clientX - current.pointerStartX) > 5 || Math.abs(ev.clientY - current.pointerStartY) > 5
      const targetDayIndex = current.kind === 'move' ? hitTestDay(ev.clientX, current.dayIndex) : current.dayIndex
      updateDrag({ ...current, currentY: ev.clientY, currentX: ev.clientX, targetDayIndex, moved })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      commitDrag()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function commitDrag() {
    const current = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!current) return

    const visit = parsedDays[current.dayIndex]?.[current.visitIndex]
    if (!visit) return

    if (!current.moved) {
      if (current.kind === 'move') focusStore(visit.storeId)
      return
    }

    const sourceDate = dates[current.dayIndex]
    const targetDate = dates[current.targetDayIndex]
    if (!sourceDate || !targetDate) return

    const decision = decideDrop({
      kind: current.kind,
      storeId: visit.storeId,
      storeName: visit.storeName,
      originalStartMin: visit.startMin,
      durationMin: visit.durationMin,
      deltaPx: current.currentY - current.pointerStartY,
      sourceDate,
      targetDate,
      weekEndsOn: week.to,
    })

    if (decision.action === 'resize') {
      updateStop.mutate({ stopId: visit.routeStopId, body: decision.update })
    } else if (decision.action === 'patch') {
      // Drag applies immediately as a this-week-only patch (design §10: "Drag = patch-for-
      // this-week by default") — matches the prototype's startMove()/startResizeTop(), which
      // commit the change on drop and offer a toast to undo, rather than blocking on a modal
      // asking the user to type an expiry date before anything visibly happens.
      createPatch.mutate(decision.request, {
        onSuccess: (created) => {
          toast(`${decision.summary} — sadece ${week.from}–${week.to}`, [
            {
              label: t('common.undo', 'Geri al'),
              onClick: () => created.id && cancelPatch.mutate(created.id),
            },
          ])
        },
      })
    }
  }

  /** Live reflow preview — only computed for same-day moves/resizes, where the reflowed array's
   * indices line up 1:1 with the day's parsed visit list. Cross-day drags render a separate
   * floating ghost in the target column instead (index alignment breaks once an item is removed
   * from one day's array, so a full two-day reflow preview isn't attempted here). */
  const sameDayPreview: ReflowResult[] | null = useMemo(() => {
    if (!drag || drag.targetDayIndex !== drag.dayIndex) return null
    const dayVisits = parsedDays[drag.dayIndex]
    const visit = dayVisits?.[drag.visitIndex]
    if (!visit) return null

    const deltaMin = pxToMinutes(drag.currentY - drag.pointerStartY)
    if (drag.kind === 'resize') {
      const newDuration = clampDuration(visit.durationMin + deltaMin)
      return reflowDay(dayVisits, drag.visitIndex, visit.startMin, newDuration, BREAK_BLOCKS)
    }
    const rawStart = snapMinutes(visit.startMin + deltaMin)
    const newStart = clampStart(rawStart, visit.durationMin, DAY_START_MINUTES, DAY_END_MINUTES)
    return reflowDay(dayVisits, drag.visitIndex, newStart, visit.durationMin, BREAK_BLOCKS)
  }, [drag, parsedDays])

  const crossDayGhost = useMemo(() => {
    if (!drag || drag.kind !== 'move' || drag.targetDayIndex === drag.dayIndex) return null
    const visit = parsedDays[drag.dayIndex]?.[drag.visitIndex]
    if (!visit) return null
    const deltaMin = pxToMinutes(drag.currentY - drag.pointerStartY)
    const rawStart = snapMinutes(visit.startMin + deltaMin)
    const newStart = clampStart(rawStart, visit.durationMin, DAY_START_MINUTES, DAY_END_MINUTES)
    return { dayIndex: drag.targetDayIndex, visit, startMin: newStart }
  }, [drag, parsedDays])

  /** Exact-snap drop indicator (dashed box + "HH:MM–HH:MM · Ndk" label) shown in the target day
   * column for any in-progress move — matches the prototype's dropInd (evo-planner-prototype-
   * v0.5.html:1514-1531), which is the only clear "here's exactly where this lands" feedback
   * during a drag; the plain day-cell outline alone doesn't communicate a time. */
  const dropIndicator = useMemo(() => {
    if (!drag || drag.kind !== 'move' || !drag.moved) return null
    const visit = parsedDays[drag.dayIndex]?.[drag.visitIndex]
    if (!visit) return null
    const deltaMin = pxToMinutes(drag.currentY - drag.pointerStartY)
    const rawStart = snapMinutes(visit.startMin + deltaMin)
    const newStart = clampStart(rawStart, visit.durationMin, DAY_START_MINUTES, DAY_END_MINUTES)
    return { dayIndex: drag.targetDayIndex, startMin: newStart, durationMin: visit.durationMin }
  }, [drag, parsedDays])

  if (!routeId) return null

  return (
    <div className="pane" id="schedPane">
      <div className="pane-head">
        TAKVİM <span style={{ color: 'var(--tx3)' }}>— blok: sürükle / alt kenar: süre uzat</span>
        {isPastWeek && (
          <span style={{ color: 'var(--amber-d)', marginLeft: 8 }}>
            {t('planner.pastWeekReadOnly', '(geçmiş hafta — salt okunur)')}
          </span>
        )}
        <div className="spacer" />
        <button type="button" data-testid="drawer-toggle" onClick={() => setDrawerOpen(!drawerOpen)}>
          ▤ {t('planner.tableDrawer', 'Tabloda gör')}
        </button>
      </div>

      {isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
      {isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}

      {!isLoading && !isError && (
        <div className="sched-scroll" style={{ flex: 1, overflow: 'auto', padding: spacing.xl }}>
          <div className="sched-grid">
            {/* Row 1: corner spacers + day headers */}
            <div />
            <div />
            {visibleDays.map((day, dayIndex) => (
              <div key={`head-${day.date ?? dayIndex}`} className="day-head">
                {WEEKDAY_LABEL[dayIndex] ?? day.date} <span style={{ color: 'var(--tx3)' }}>{day.date}</span>
              </div>
            ))}

            {/* Row 2: person-cell, time-axis, day-cells */}
            <div className="person-cell">
              <div className="nm">{merchandiserName}</div>
              <div className="meta">{routeCode}</div>
              <div className="loadbar">
                <div
                  style={{
                    width: `${Math.min(weekLoadPct, 100)}%`,
                    background: weekLoadPct > 100 ? colors.red : weekLoadPct < 80 ? colors.amber : colors.green,
                  }}
                />
              </div>
              <div className="meta">%{weekLoadPct} yük</div>
            </div>

            <div className="time-axis" style={{ height: GRID_HEIGHT }}>
              {HOUR_LABELS.map((m) => (
                <span key={m} style={{ top: (m - DAY_START_MINUTES) * PX_PER_MINUTE }}>
                  {fmtHour(m)}
                </span>
              ))}
            </div>

            {visibleDays.map((day, dayIndex) => {
              const parsed = parsedDays[dayIndex] ?? []
              const isSameDayDrag = drag?.dayIndex === dayIndex && drag.targetDayIndex === dayIndex
              const isDragTarget = drag?.kind === 'move' && drag.targetDayIndex === dayIndex && drag.dayIndex !== dayIndex
              const dayMinutes = isSameDayDrag && sameDayPreview
                ? sameDayPreview.reduce((sum, p) => sum + (p.endMin - p.startMin), 0)
                : (day.plannedMinutes ?? 0)

              return (
                <div key={day.date ?? dayIndex}>
                  <div
                    ref={(el) => {
                      dayRefs.current[dayIndex] = el
                    }}
                    className="day-cell"
                    style={{ height: GRID_HEIGHT, outline: isDragTarget ? '2px solid var(--blue-d)' : undefined }}
                  >
                    {HOUR_LABELS.slice(1, -1).map((m) => (
                      <div key={m} className="hline" style={{ top: (m - DAY_START_MINUTES) * PX_PER_MINUTE }} />
                    ))}

                    <div className={`day-total ${loadClass(dayMinutes)}`}>
                      {formatMinutes(dayMinutes)} / {DAILY_QUOTA_MINUTES}
                    </div>
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

                    {parsed.map((visit, visitIndex) => {
                      const isDraggingThis = Boolean(drag) && drag!.dayIndex === dayIndex && drag!.visitIndex === visitIndex
                      const reflowed = isSameDayDrag ? sameDayPreview?.[visitIndex] : undefined
                      const startMin = reflowed?.startMin ?? visit.startMin
                      const durationMin = reflowed ? reflowed.endMin - reflowed.startMin : visit.durationMin

                      return (
                        <VisitBlock
                          key={visit.routeStopId}
                          storeName={visit.storeName}
                          startMin={startMin}
                          durationMin={durationMin}
                          dayStartMinutes={DAY_START_MINUTES}
                          isPatch={visit.isPatch}
                          readOnly={isPastWeek}
                          ghost={isDraggingThis && drag?.kind === 'move' && drag.targetDayIndex !== dayIndex}
                          status={visit.status}
                          checkInAt={visit.checkInAt}
                          actualMinutes={visit.actualMinutes}
                          onMoveStart={(e) => startDrag('move', dayIndex, visitIndex, e)}
                          onResizeStart={(e) => startDrag('resize', dayIndex, visitIndex, e)}
                        />
                      )
                    })}

                    {crossDayGhost && crossDayGhost.dayIndex === dayIndex && (
                      <VisitBlock
                        storeName={crossDayGhost.visit.storeName}
                        startMin={crossDayGhost.startMin}
                        durationMin={crossDayGhost.visit.durationMin}
                        dayStartMinutes={DAY_START_MINUTES}
                        isPatch={crossDayGhost.visit.isPatch}
                        readOnly
                        ghost={false}
                      />
                    )}

                    {dropIndicator && dropIndicator.dayIndex === dayIndex && (
                      <div
                        className="drop-indicator"
                        style={{
                          top: (dropIndicator.startMin - DAY_START_MINUTES) * PX_PER_MINUTE,
                          height: Math.max(dropIndicator.durationMin * PX_PER_MINUTE - 2, 12),
                        }}
                      >
                        <span>
                          {fmtHour(dropIndicator.startMin)}–{fmtHour(dropIndicator.startMin + dropIndicator.durationMin)} ·{' '}
                          {dropIndicator.durationMin}dk
                        </span>
                      </div>
                    )}
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
    </div>
  )
}

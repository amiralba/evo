import { useTranslation } from 'react-i18next'
import { usePlan } from '../../api/queries'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { minutesOfDay } from '../../schedule/position'
import { currentWeek } from '../../schedule/week'
import { formatMinutes } from '../../format'
import type { components } from '../../../api/generated/schema'

type PlanDayDto = components['schemas']['PlanDayDto']

const WEEKDAY_LABEL = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum']

interface TableDrawerProps {
  routeId: string | null
  open: boolean
}

function fmtT(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

interface DrawerRow {
  storeId: string
  storeName: string
  dayIndex: number
  startMin: number
  durationMin: number
  isPatch: boolean
}

function rowsFromDays(days: PlanDayDto[] | undefined): DrawerRow[] {
  if (!days) return []
  const rows: DrawerRow[] = []
  days.forEach((day, dayIndex) => {
    for (const v of day.visits ?? []) {
      if (!v.start || !v.end || !v.storeId) continue
      rows.push({
        storeId: v.storeId,
        storeName: v.storeName ?? '',
        dayIndex,
        startMin: minutesOfDay(v.start),
        durationMin: Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000),
        isPatch: v.source === 2,
      })
    }
  })
  return rows.sort((a, b) => a.dayIndex - b.dayIndex || a.startMin - b.startMin)
}

/** Bottom table drawer (prototype: `.drawer`/`.drawer.open`, evo-planner-prototype-v0.5.html:420,
 * 1876-1900) — a flat, sortable-by-day view of the week's visits, distinct from the deferred
 * full-canvas 6-tab Table preset (gap-matrix §1/§8 item #7). Read-only: the prototype's inline
 * duration `<input>` edits a single visit occurrence directly, but the real backend has no
 * per-visit duration override mechanism (only permanent per-stop ServiceMinutes) — an editable
 * field here would silently do nothing or lie about what it does, so it's display + row-click-to-
 * focus only until that capability exists. */
export function TableDrawer({ routeId, open }: TableDrawerProps) {
  const { t } = useTranslation()
  const focusStore = useWorkspaceStore((s) => s.focusStore)
  const week = currentWeek()
  const { data: days } = usePlan(open ? routeId : null, week.from, week.to)
  const rows = rowsFromDays(days)

  return (
    <div className={`drawer${open ? ' open' : ''}`} id="drawer">
      <div className="drawer-inner">
        <table>
          <thead>
            <tr>
              <th>{t('planner.store', 'Mağaza')}</th>
              <th>{t('planner.railStops', 'Gün')}</th>
              <th>{t('planner.time', 'Saat')}</th>
              <th>{t('planner.duration', 'Süre (dk)')}</th>
              <th>{t('planner.patch', 'Yama')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.storeId}-${row.dayIndex}-${i}`} onClick={() => focusStore(row.storeId)}>
                <td>{row.storeName}</td>
                <td>{WEEKDAY_LABEL[row.dayIndex]}</td>
                <td>{fmtT(row.startMin)}</td>
                <td>{formatMinutes(row.durationMin)}</td>
                <td>{row.isPatch && <span className="pill">{t('planner.patch', 'yama')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

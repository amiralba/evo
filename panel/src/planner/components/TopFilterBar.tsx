import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore, type WorkspaceLayout } from '../state/workspaceStore'
import { useRoutes, useNotes } from '../api/queries'
import { NotesInbox } from './inbox/NotesInbox'
import { DecisionJournalModal } from './DecisionJournalModal'
import { OnarimWorkbench } from '../../onarim/OnarimWorkbench'
import { formatWeekRange } from '../schedule/week'
import { HelpModal } from './HelpModal'
import { TopSearch } from './TopSearch'
import { PublishModal } from './publish/PublishModal'

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
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const week = useWorkspaceStore((s) => s.week)
  const goToPrevWeek = useWorkspaceStore((s) => s.goToPrevWeek)
  const goToNextWeek = useWorkspaceStore((s) => s.goToNextWeek)
  const { data: routesPage } = useRoutes(province)
  const { data: openNotes } = useNotes({ status: 1 })
  const [showInbox, setShowInbox] = useState(false)
  const [openDisruptionId, setOpenDisruptionId] = useState<string | null>(null)
  const [showJournal, setShowJournal] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showPublish, setShowPublish] = useState(false)

  return (
    <div className="topbar">
      <span className="logo">
        EVO · {t('planner.title')} <span className="pill">v0.6</span>
      </span>

      <select value={province} onChange={(e) => setProvince(e.target.value)} aria-label="province">
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <button type="button" onClick={goToPrevWeek} aria-label="prev-week">
        ‹
      </button>
      <span data-testid="week-range" style={{ fontSize: 12, color: 'var(--tx2)' }}>
        {formatWeekRange(week)}
      </span>
      <button type="button" onClick={goToNextWeek} aria-label="next-week">
        ›
      </button>

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

      <div className="seg" id="layoutSeg">
        {LAYOUTS.map((l) => (
          <button key={l.key} type="button" className={layout === l.key ? 'on' : ''} onClick={() => setLayout(l.key)}>
            {l.label}
          </button>
        ))}
      </div>

      {focusedRouteId && (
        <span className="chip">
          ◉ {routesPage?.items?.find((r) => r.id === focusedRouteId)?.routeCode} · {t('planner.filter', 'filtre')}{' '}
          <span className="x" style={{ cursor: 'pointer' }} onClick={clearFocus}>
            ✕
          </span>
        </span>
      )}

      <div className="spacer" />

      <TopSearch />

      <button
        type="button"
        className="primary"
        data-testid="publish-trigger"
        disabled={!focusedRouteId}
        onClick={() => setShowPublish(true)}
      >
        {t('common.publish', 'Yayınla')}
      </button>

      <button type="button" title={t('planner.helpTitle', 'Kullanım kılavuzu')} data-testid="help-trigger" style={{ fontWeight: 800 }} onClick={() => setShowHelp(true)}>
        ?
      </button>

      <button type="button" title={t('planner.decisionJournal', 'Karar Günlüğü')} data-testid="decision-journal-trigger" onClick={() => setShowJournal(true)}>
        📖
      </button>

      <button type="button" title={t('planner.notesInbox', 'Gelen kutusu')} data-testid="inbox-trigger" onClick={() => setShowInbox(true)}>
        🔔 {openNotes?.length ?? 0}
      </button>

      <NotesInbox open={showInbox} onClose={() => setShowInbox(false)} onOpenDisruption={(id) => setOpenDisruptionId(id)} />
      {openDisruptionId && (
        <OnarimWorkbench initialDisruptionId={openDisruptionId} onClose={() => setOpenDisruptionId(null)} />
      )}
      {showJournal && <DecisionJournalModal onClose={() => setShowJournal(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showPublish && focusedRouteId && <PublishModal routeId={focusedRouteId} onClose={() => setShowPublish(false)} />}
    </div>
  )
}

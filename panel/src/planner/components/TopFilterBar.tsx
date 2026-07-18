import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useWorkspaceStore, type WorkspaceLayout } from '../state/workspaceStore'
import { useRoutes, useNotes } from '../api/queries'
import { NotesInbox } from './inbox/NotesInbox'
import { useDisruptions } from '../../onarim/api/queries'
import { OnarimWorkbench } from '../../onarim/OnarimWorkbench'

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
  const { data: openNotes } = useNotes({ status: 1 })
  const [showInbox, setShowInbox] = useState(false)
  const { data: disruptions } = useDisruptions()
  const [showOnarim, setShowOnarim] = useState(false)
  const affectedVisitTotal = (disruptions ?? []).reduce((sum, d) => sum + (d.affectedVisitCount ?? 0), 0)

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

      <div className="spacer" />

      <Link to="/analytics" data-testid="analytics-link">
        {t('analytics.navLabel', 'Analitik')}
      </Link>

      {affectedVisitTotal > 0 && (
        <button type="button" data-testid="onarim-trigger" onClick={() => setShowOnarim(true)}>
          ✨ {t('onarim.navLabel', 'Onarım')}
          <span className="pill">{affectedVisitTotal}</span>
        </button>
      )}

      <button type="button" data-testid="inbox-trigger" onClick={() => setShowInbox(true)}>
        {t('planner.notesInbox', 'Gelen Kutusu')}
        {(openNotes?.length ?? 0) > 0 && <span className="pill">{openNotes!.length}</span>}
      </button>

      {showInbox && <NotesInbox onClose={() => setShowInbox(false)} />}
      {showOnarim && <OnarimWorkbench onClose={() => setShowOnarim(false)} />}
    </div>
  )
}

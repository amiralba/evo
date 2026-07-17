import { useEffect } from 'react'
import { useWorkspaceStore } from './state/workspaceStore'
import { TopFilterBar } from './components/TopFilterBar'
import { RouteRail } from './components/RouteRail'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { MapPane } from './components/map/MapPane'
import { SchedulePane } from './components/schedule/SchedulePane'
import { RouteDetailPanel } from './components/panel/RouteDetailPanel'
import { SelectionListPane } from './components/editing/SelectionListPane'
import { SelectionBar } from './components/editing/SelectionBar'
import { colors } from '../theme/tokens'

export function PlannerPage() {
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        clearFocus()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearFocus, clearSelection])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopFilterBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <RouteRail />
        <WorkspaceLayout
          map={<MapPane />}
          schedule={<SchedulePane />}
          bottom={<SelectionListPane />}
        />
        <div style={{ width: 320, borderLeft: `1px solid ${colors.border}`, background: colors.card, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <RouteDetailPanel />
        </div>
      </div>
      <SelectionBar />
    </div>
  )
}

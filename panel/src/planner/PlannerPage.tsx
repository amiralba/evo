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
import './planner.css'

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
    <div className="planner-root">
      <TopFilterBar />
      <div className="main">
        <RouteRail />
        <WorkspaceLayout
          map={<MapPane />}
          schedule={<SchedulePane />}
          bottom={<SelectionListPane />}
        />
        <div className="panel">
          <RouteDetailPanel />
        </div>
      </div>
      <SelectionBar />
    </div>
  )
}

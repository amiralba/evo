import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from './state/workspaceStore'
import { useRoute } from './api/queries'
import { TopFilterBar } from './components/TopFilterBar'
import { RouteRail } from './components/RouteRail'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { MapPane } from './components/map/MapPane'
import { SchedulePane } from './components/schedule/SchedulePane'
import { RouteDetailPanel } from './components/panel/RouteDetailPanel'
import { SelectionListPane } from './components/editing/SelectionListPane'
import { SelectionBar } from './components/editing/SelectionBar'
import { Toast } from './components/Toast'
import { TableDrawer } from './components/schedule/TableDrawer'
import './planner.css'

export function PlannerPage() {
  const { t } = useTranslation()
  const clearFocus = useWorkspaceStore((s) => s.clearFocus)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  const focusedRouteId = useWorkspaceStore((s) => s.focusedRouteId)
  const drawerOpen = useWorkspaceStore((s) => s.drawerOpen)
  const { data: focusedRoute } = useRoute(focusedRouteId)

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
          schedule={
            focusedRouteId ? (
              <SchedulePane
                routeId={focusedRouteId}
                routeCode={focusedRoute?.routeCode ?? ''}
                merchandiserName={focusedRoute?.currentAssignment?.merchandiserName ?? t('planner.unassigned', 'Atanmamış')}
              />
            ) : (
              <div className="empty">{t('planner.noRouteFocused', 'Haritadan veya listeden bir rota seçin.')}</div>
            )
          }
          bottom={<SelectionListPane />}
        />
        <div className="panel">
          <RouteDetailPanel />
        </div>
      </div>
      <TableDrawer routeId={focusedRouteId} open={drawerOpen} />
      <SelectionBar />
      <Toast />
    </div>
  )
}

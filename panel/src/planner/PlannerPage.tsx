import { useEffect } from 'react'
import { useWorkspaceStore } from './state/workspaceStore'
import { TopFilterBar } from './components/TopFilterBar'
import { RouteRail } from './components/RouteRail'
import { WorkspaceLayout } from './components/WorkspaceLayout'
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
          map={<div style={{ padding: 16 }}>Harita (Phase 3)</div>}
          schedule={<div style={{ padding: 16 }}>Takvim (Phase 5)</div>}
          bottom={<div style={{ padding: 16 }}>Seçim listesi (Phase 6)</div>}
        />
        <div style={{ width: 320, borderLeft: `1px solid ${colors.border}`, background: colors.card }}>
          {/* Route detail panel — Phase 4 */}
        </div>
      </div>
    </div>
  )
}

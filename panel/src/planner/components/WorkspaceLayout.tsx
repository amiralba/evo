import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useWorkspaceStore } from '../state/workspaceStore'
import { colors } from '../../theme/tokens'

interface WorkspaceLayoutProps {
  map: ReactNode
  schedule: ReactNode
  bottom?: ReactNode
}

export function WorkspaceLayout({ map, schedule, bottom }: WorkspaceLayoutProps) {
  const layout = useWorkspaceStore((s) => s.layout)
  const [splitPct, setSplitPct] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const onPointerDown = useCallback(() => {
    draggingRef.current = true
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pct = ((e.clientX - rect.left) / rect.width) * 100
    setSplitPct(Math.min(80, Math.max(20, pct)))
  }, [])

  const onPointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  const showMap = layout === 'map' || layout === 'split'
  const showSchedule = layout === 'schedule' || layout === 'split'
  const showBottom = layout === 'table'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}
      >
        {showMap && (
          <div style={{ display: 'flex', flexBasis: layout === 'split' ? `${splitPct}%` : '100%', minWidth: 0, overflow: 'hidden' }}>
            {map}
          </div>
        )}
        {layout === 'split' && (
          <div
            onPointerDown={onPointerDown}
            style={{
              width: 6,
              cursor: 'col-resize',
              background: colors.border,
              flexShrink: 0,
            }}
          />
        )}
        {showSchedule && (
          <div
            style={{
              display: 'flex',
              flexBasis: layout === 'split' ? `${100 - splitPct}%` : '100%',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {schedule}
          </div>
        )}
      </div>
      {showBottom && <div style={{ borderTop: `1px solid ${colors.border}` }}>{bottom}</div>}
    </div>
  )
}

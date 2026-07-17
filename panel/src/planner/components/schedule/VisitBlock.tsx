import { formatMinutes } from '../../format'

interface VisitBlockProps {
  storeName: string
  startMin: number
  durationMin: number
  dayStartMinutes: number
  isPatch: boolean
  readOnly: boolean
  ghost?: boolean
  onMoveStart?: (e: React.PointerEvent) => void
  onResizeStart?: (e: React.PointerEvent) => void
}

export function VisitBlock({
  storeName,
  startMin,
  durationMin,
  dayStartMinutes,
  isPatch,
  readOnly,
  ghost,
  onMoveStart,
  onResizeStart,
}: VisitBlockProps) {
  const topPx = (startMin - dayStartMinutes) * 1.2
  const heightPx = Math.max(4, durationMin * 1.2)

  return (
    <div
      className={`vblock catS${isPatch ? ' patched' : ''}`}
      style={{
        top: topPx,
        height: heightPx,
        opacity: ghost ? 0.5 : 1,
        cursor: readOnly ? 'default' : 'grab',
        pointerEvents: ghost ? 'none' : undefined,
      }}
      title={`${storeName} — ${formatMinutes(durationMin)}`}
      onPointerDown={!readOnly && !ghost ? onMoveStart : undefined}
    >
      <div className="t">{storeName}</div>
      <div className="s">{formatMinutes(durationMin)}</div>
      {!readOnly && !ghost && (
        <div
          className="rz"
          onPointerDown={(e) => {
            e.stopPropagation()
            onResizeStart?.(e)
          }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 7, cursor: 'ns-resize' }}
        />
      )}
    </div>
  )
}

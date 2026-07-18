import { useTranslation } from 'react-i18next'
import { formatMinutes } from '../../format'
import { PX_PER_MINUTE } from '../../schedule/position'

const OUTCOME_CLASS: Record<number, string> = { 2: 'outcome-done', 3: 'outcome-missed', 4: 'outcome-skipped' }

interface VisitBlockProps {
  storeName: string
  startMin: number
  durationMin: number
  dayStartMinutes: number
  isPatch: boolean
  readOnly: boolean
  ghost?: boolean
  status?: number
  checkInAt?: string | null
  actualMinutes?: number | null
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
  status,
  checkInAt,
  actualMinutes,
  onMoveStart,
  onResizeStart,
}: VisitBlockProps) {
  const { t } = useTranslation()
  const topPx = (startMin - dayStartMinutes) * PX_PER_MINUTE
  const heightPx = Math.max(4, durationMin * PX_PER_MINUTE)
  const outcomeClass = status !== undefined ? OUTCOME_CLASS[status] : undefined

  const title = checkInAt
    ? `${storeName} — ${t('planner.checkInAt', 'Giriş')}: ${new Date(checkInAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} — ${t('planner.actualVsPlanned', 'gerçekleşen {{actual}} / planlanan {{planned}}', { actual: formatMinutes(actualMinutes ?? 0), planned: formatMinutes(durationMin) })}`
    : `${storeName} — ${formatMinutes(durationMin)}`

  return (
    <div
      className={`vblock${outcomeClass ? ` ${outcomeClass}` : ' catS'}${isPatch ? ' patched' : ''}`}
      style={{
        top: topPx,
        height: heightPx,
        opacity: ghost ? 0.5 : 1,
        cursor: readOnly ? 'default' : 'grab',
        pointerEvents: ghost ? 'none' : undefined,
      }}
      title={title}
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

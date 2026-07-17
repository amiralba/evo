import type { components } from '../../../api/generated/schema'
import { blockGeometry } from '../../schedule/position'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'
import { formatMinutes } from '../../format'

type PlannedVisitDto = components['schemas']['PlannedVisitDto']

interface VisitBlockProps {
  visit: PlannedVisitDto
  dayStartMinutes: number
}

export function VisitBlock({ visit, dayStartMinutes }: VisitBlockProps) {
  if (!visit.start || !visit.end) return null

  const { topPx, heightPx } = blockGeometry(visit.start, visit.end, dayStartMinutes)
  const minutes = Math.round((new Date(visit.end).getTime() - new Date(visit.start).getTime()) / 60_000)
  const isPatch = visit.source === 2

  return (
    <div
      style={{
        position: 'absolute',
        top: topPx,
        height: heightPx,
        left: 2,
        right: 2,
        borderRadius: radius.sm,
        border: `1px ${isPatch ? 'dashed' : 'solid'} ${colors.blueDark}`,
        background: colors.blueLight,
        color: colors.blueDark,
        fontSize: fontSize.xs,
        padding: `1px ${spacing.sm}`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
      title={`${visit.storeName ?? ''} — ${formatMinutes(minutes)}`}
    >
      {visit.storeName} · {formatMinutes(minutes)}
    </div>
  )
}

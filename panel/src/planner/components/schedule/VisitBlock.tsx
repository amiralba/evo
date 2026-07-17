import type { components } from '../../../api/generated/schema'
import { blockGeometry } from '../../schedule/position'
import { formatMinutes } from '../../format'

type PlannedVisitDto = components['schemas']['PlannedVisitDto']

interface VisitBlockProps {
  visit: PlannedVisitDto
  dayStartMinutes: number
}

/** Category isn't on PlannedVisitDto (005's plan endpoint doesn't join it), so blocks default
 * to the prototype's "catS" (neutral) styling until that's threaded through — see Phase 9 follow-up. */
export function VisitBlock({ visit, dayStartMinutes }: VisitBlockProps) {
  if (!visit.start || !visit.end) return null

  const { topPx, heightPx } = blockGeometry(visit.start, visit.end, dayStartMinutes)
  const minutes = Math.round((new Date(visit.end).getTime() - new Date(visit.start).getTime()) / 60_000)
  const isPatch = visit.source === 2

  return (
    <div
      className={`vblock catS${isPatch ? ' patched' : ''}`}
      style={{ top: topPx, height: heightPx }}
      title={`${visit.storeName ?? ''} — ${formatMinutes(minutes)}`}
    >
      <div className="t">{visit.storeName}</div>
      <div className="s">{formatMinutes(minutes)}</div>
    </div>
  )
}

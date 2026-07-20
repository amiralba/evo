import { PrototypeHost } from './prototype/PrototypeHost'
import { PersonOverviewModal } from './components/PersonOverviewModal'

/**
 * The planner workspace IS the v0.5 prototype now (hosted verbatim by PrototypeHost), per the
 * decision to run the prototype directly and wire the backend in behind it rather than
 * re-implement its UI in React. The prototype's own `changes[]` buffer gives draft-until-publish
 * for free: nothing commits until Yayınla.
 */
export function PlannerPage() {
  return (
    <>
      <PrototypeHost />
      {/* Aylık genel bakış (FullCalendar multiMonth) — opened from the TAKVİM person row via
          window.__evoPersonOverview; overlays the prototype, read-only. */}
      <PersonOverviewModal />
    </>
  )
}

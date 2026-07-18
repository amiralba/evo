import { PrototypeHost } from './prototype/PrototypeHost'

/**
 * The planner workspace IS the v0.5 prototype now (hosted verbatim by PrototypeHost), per the
 * decision to run the prototype directly and wire the backend in behind it rather than
 * re-implement its UI in React. The prototype's own `changes[]` buffer gives draft-until-publish
 * for free: nothing commits until Yayınla.
 *
 * The previous React re-implementation (TopFilterBar / RouteRail / SchedulePane / RouteDetailPanel
 * / MapPane / …) still lives under planner/components and is kept for its MapLibre map, which will
 * be portaled into the prototype's map pane in a later step.
 */
export function PlannerPage() {
  return <PrototypeHost />
}

import type { components } from '../api/generated/schema'

type OnarimAction = components['schemas']['OnarimAction']

export interface RowDecision {
  action: OnarimAction
  targetDate?: string
  targetMerchandiserId?: string
  targetRouteId?: string
}

export type DecisionState = Record<string, RowDecision>

export function setDecision(state: DecisionState, visitId: string, decision: RowDecision): DecisionState {
  return { ...state, [visitId]: decision }
}

export function clearDecision(state: DecisionState, visitId: string): DecisionState {
  const next = { ...state }
  delete next[visitId]
  return next
}

export function undecidedVisitIds(state: DecisionState, allVisitIds: string[]): string[] {
  return allVisitIds.filter((id) => !(id in state))
}

export function isDecided(state: DecisionState, visitId: string): boolean {
  return visitId in state
}

/** Skip and MoveDay only need the visit's own id — no target fields required. ReassignRoute needs
 * a targetMerchandiserId (the whole route gets covered); ReassignPerson needs both
 * targetMerchandiserId and targetRouteId (the candidate's own route). MoveDay needs targetDate. */
export function isRowDecisionComplete(decision: RowDecision): boolean {
  switch (decision.action) {
    case 1: // Skip
      return true
    case 2: // MoveDay
      return Boolean(decision.targetDate)
    case 3: // ReassignRoute
      return Boolean(decision.targetMerchandiserId)
    case 4: // ReassignPerson
      return Boolean(decision.targetMerchandiserId && decision.targetRouteId)
    default:
      return false
  }
}

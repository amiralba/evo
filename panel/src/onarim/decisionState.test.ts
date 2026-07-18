import { describe, expect, it } from 'vitest'
import { clearDecision, isDecided, isRowDecisionComplete, setDecision, undecidedVisitIds } from './decisionState'

describe('setDecision / clearDecision', () => {
  it('adds a decision for a visit', () => {
    const state = setDecision({}, 'v1', { action: 1 })
    expect(state.v1).toEqual({ action: 1 })
  })

  it('overwrites an existing decision for the same visit', () => {
    let state = setDecision({}, 'v1', { action: 1 })
    state = setDecision(state, 'v1', { action: 2, targetDate: '2026-07-20' })
    expect(state.v1).toEqual({ action: 2, targetDate: '2026-07-20' })
  })

  it('clears a decision, leaving others untouched', () => {
    let state = setDecision({}, 'v1', { action: 1 })
    state = setDecision(state, 'v2', { action: 1 })
    state = clearDecision(state, 'v1')
    expect(state.v1).toBeUndefined()
    expect(state.v2).toEqual({ action: 1 })
  })
})

describe('undecidedVisitIds / isDecided', () => {
  it('lists visits with no decision yet', () => {
    const state = setDecision({}, 'v1', { action: 1 })
    expect(undecidedVisitIds(state, ['v1', 'v2', 'v3'])).toEqual(['v2', 'v3'])
  })

  it('reports decided status per visit', () => {
    const state = setDecision({}, 'v1', { action: 1 })
    expect(isDecided(state, 'v1')).toBe(true)
    expect(isDecided(state, 'v2')).toBe(false)
  })
})

describe('isRowDecisionComplete', () => {
  it('Skip is always complete', () => {
    expect(isRowDecisionComplete({ action: 1 })).toBe(true)
  })

  it('MoveDay requires a targetDate', () => {
    expect(isRowDecisionComplete({ action: 2 })).toBe(false)
    expect(isRowDecisionComplete({ action: 2, targetDate: '2026-07-20' })).toBe(true)
  })

  it('ReassignRoute requires a targetMerchandiserId', () => {
    expect(isRowDecisionComplete({ action: 3 })).toBe(false)
    expect(isRowDecisionComplete({ action: 3, targetMerchandiserId: 'm1' })).toBe(true)
  })

  it('ReassignPerson requires both targetMerchandiserId and targetRouteId', () => {
    expect(isRowDecisionComplete({ action: 4, targetMerchandiserId: 'm1' })).toBe(false)
    expect(isRowDecisionComplete({ action: 4, targetMerchandiserId: 'm1', targetRouteId: 'r1' })).toBe(true)
  })
})

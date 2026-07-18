import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'
import { currentWeek } from '../schedule/week'

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      province: 'Adana',
      focusedRouteId: null,
      focusedStoreId: null,
      selection: new Set(),
      layout: 'split',
    })
  })

  it('focusRoute sets focusedRouteId', () => {
    useWorkspaceStore.getState().focusRoute('route-1')
    expect(useWorkspaceStore.getState().focusedRouteId).toBe('route-1')
  })

  it('clearFocus nulls focusedRouteId', () => {
    useWorkspaceStore.getState().focusRoute('route-1')
    useWorkspaceStore.getState().clearFocus()
    expect(useWorkspaceStore.getState().focusedRouteId).toBeNull()
  })

  it('focusRoute clears any store focus (prototype: focus is a single discriminated union)', () => {
    useWorkspaceStore.getState().focusStore('store-1')
    useWorkspaceStore.getState().focusRoute('route-1')
    expect(useWorkspaceStore.getState().focusedRouteId).toBe('route-1')
    expect(useWorkspaceStore.getState().focusedStoreId).toBeNull()
  })

  it('focusStore sets focusedStoreId WITHOUT clearing focusedRouteId — the schedule pane must stay put', () => {
    useWorkspaceStore.getState().focusRoute('route-1')
    useWorkspaceStore.getState().focusStore('store-1')
    expect(useWorkspaceStore.getState().focusedRouteId).toBe('route-1')
    expect(useWorkspaceStore.getState().focusedStoreId).toBe('store-1')
  })

  it('clearFocus nulls both focusedRouteId and focusedStoreId', () => {
    useWorkspaceStore.getState().focusRoute('route-1')
    useWorkspaceStore.getState().focusStore('store-1')
    useWorkspaceStore.getState().clearFocus()
    expect(useWorkspaceStore.getState().focusedRouteId).toBeNull()
    expect(useWorkspaceStore.getState().focusedStoreId).toBeNull()
  })

  it('toggleSelect adds then removes an id', () => {
    useWorkspaceStore.getState().toggleSelect('store-1')
    expect(useWorkspaceStore.getState().selection.has('store-1')).toBe(true)
    useWorkspaceStore.getState().toggleSelect('store-1')
    expect(useWorkspaceStore.getState().selection.has('store-1')).toBe(false)
  })

  it('setSelection and clearSelection behave', () => {
    useWorkspaceStore.getState().setSelection(['a', 'b'])
    expect(useWorkspaceStore.getState().selection).toEqual(new Set(['a', 'b']))
    useWorkspaceStore.getState().clearSelection()
    expect(useWorkspaceStore.getState().selection.size).toBe(0)
  })

  it('setLayout switches layout', () => {
    useWorkspaceStore.getState().setLayout('map')
    expect(useWorkspaceStore.getState().layout).toBe('map')
  })

  it('goToNextWeek/goToPrevWeek move by 7 days and are inverse of each other', () => {
    const start = useWorkspaceStore.getState().week
    useWorkspaceStore.getState().goToNextWeek()
    const next = useWorkspaceStore.getState().week
    expect(next.from).not.toBe(start.from)

    useWorkspaceStore.getState().goToPrevWeek()
    expect(useWorkspaceStore.getState().week).toEqual(start)
  })

  it('resetWeek returns to the current week', () => {
    useWorkspaceStore.getState().goToNextWeek()
    useWorkspaceStore.getState().goToNextWeek()
    useWorkspaceStore.getState().resetWeek()
    expect(useWorkspaceStore.getState().week).toEqual(currentWeek())
  })
})

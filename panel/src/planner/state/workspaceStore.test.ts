import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      province: 'Adana',
      focusedRouteId: null,
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
})

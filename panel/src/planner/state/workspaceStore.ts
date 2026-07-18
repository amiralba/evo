import { create } from 'zustand'

export type WorkspaceLayout = 'split' | 'map' | 'schedule' | 'table'

interface WorkspaceState {
  province: string
  focusedRouteId: string | null
  /** Store-level focus (prototype `focus.type==='store'`, evo-planner-prototype-v0.5.html:1647) —
   * drives which context the RIGHT PANEL shows, independent of focusedRouteId (which drives the
   * schedule pane's calendar and is unaffected by clicking a store pin — matches the prototype,
   * where `focus` only ever repaints the panel/map highlight, never the calendar). */
  focusedStoreId: string | null
  selection: Set<string>
  layout: WorkspaceLayout
  /** Bottom table drawer (prototype `.drawer`/`.drawer.open`, evo-planner-prototype-v0.5.html:420,
   * 1874) — global like the prototype's `drawerOpen`, since the drawer itself renders full-width
   * below `.main`, not scoped to any one pane. */
  drawerOpen: boolean
  setProvince: (province: string) => void
  focusRoute: (id: string) => void
  focusStore: (id: string) => void
  clearFocus: () => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
  clearSelection: () => void
  setLayout: (layout: WorkspaceLayout) => void
  setDrawerOpen: (open: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  province: 'Ankara',
  focusedRouteId: null,
  focusedStoreId: null,
  selection: new Set<string>(),
  layout: 'split',
  drawerOpen: false,
  setProvince: (province) => set({ province }),
  focusRoute: (id) => set({ focusedRouteId: id, focusedStoreId: null }),
  focusStore: (id) => set({ focusedStoreId: id }),
  clearFocus: () => set({ focusedRouteId: null, focusedStoreId: null }),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selection)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selection: next }
    }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  clearSelection: () => set({ selection: new Set() }),
  setLayout: (layout) => set({ layout }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
}))

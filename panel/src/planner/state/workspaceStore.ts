import { create } from 'zustand'

export type WorkspaceLayout = 'split' | 'map' | 'schedule' | 'table'

interface WorkspaceState {
  province: string
  focusedRouteId: string | null
  selection: Set<string>
  layout: WorkspaceLayout
  setProvince: (province: string) => void
  focusRoute: (id: string) => void
  clearFocus: () => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
  clearSelection: () => void
  setLayout: (layout: WorkspaceLayout) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  province: 'Adana',
  focusedRouteId: null,
  selection: new Set<string>(),
  layout: 'split',
  setProvince: (province) => set({ province }),
  focusRoute: (id) => set({ focusedRouteId: id }),
  clearFocus: () => set({ focusedRouteId: null }),
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
}))

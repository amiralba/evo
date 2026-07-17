import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as planner from '../../api/planner'
import type { components } from '../../api/generated/schema'

type BulkAddStopsRequest = components['schemas']['BulkAddStopsRequest']
type UpdateStopRequest = components['schemas']['UpdateStopRequest']
type CreatePatchRequest = components['schemas']['CreatePatchRequest']
type PublishRequest = components['schemas']['PublishRequest']
type PatchTaskInstanceRequest = components['schemas']['PatchTaskInstanceRequest']

function invalidateRoute(queryClient: ReturnType<typeof useQueryClient>, routeId: string, province: string) {
  void queryClient.invalidateQueries({ queryKey: ['route', routeId] })
  void queryClient.invalidateQueries({ queryKey: ['plan', routeId] })
  void queryClient.invalidateQueries({ queryKey: ['health', routeId] })
  void queryClient.invalidateQueries({ queryKey: ['stores-geo', province] })
}

export function useBulkAddStops(routeId: string, province: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkAddStopsRequest) => planner.bulkAddStops(routeId, body),
    onSuccess: () => invalidateRoute(queryClient, routeId, province),
  })
}

export function useUpdateStop(routeId: string, province: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ stopId, body }: { stopId: string; body: UpdateStopRequest }) =>
      planner.updateStop(routeId, stopId, body),
    onSuccess: () => invalidateRoute(queryClient, routeId, province),
  })
}

export function useReorderStops(routeId: string, province: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stopIds: string[]) => planner.reorderStops(routeId, stopIds),
    onSuccess: () => invalidateRoute(queryClient, routeId, province),
  })
}

export function useMoveStop(sourceRouteId: string, province: string, targetRouteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (stopId: string) => planner.moveStop(sourceRouteId, stopId, targetRouteId),
    onSuccess: () => {
      invalidateRoute(queryClient, sourceRouteId, province)
      invalidateRoute(queryClient, targetRouteId, province)
    },
  })
}

/** Resolves a store's current stop on its active route, then moves it — for callers (map popover,
 * bulk-add rejection list) that only know the storeId, not the source route/stop id. */
export function useMoveStoreToRoute(targetRouteId: string, province: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (storeId: string) => {
      const stores = await planner.getStoresGeo(province)
      const store = stores.find((s) => s.id === storeId)
      const sourceRouteId = store?.activeRouteId
      if (!sourceRouteId) {
        throw new Error('Store has no active route to move from')
      }
      const route = await planner.getRoute(sourceRouteId)
      const stop = route.stops?.find((s) => s.storeId === storeId)
      if (!stop?.id) {
        throw new Error('Stop not found on source route')
      }
      await planner.moveStop(sourceRouteId, stop.id, targetRouteId)
      return { sourceRouteId }
    },
    onSuccess: ({ sourceRouteId }) => {
      invalidateRoute(queryClient, sourceRouteId, province)
      invalidateRoute(queryClient, targetRouteId, province)
    },
  })
}

export function useCreatePatch(routeId: string, province: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePatchRequest) => planner.createPatch(routeId, body),
    onSuccess: () => invalidateRoute(queryClient, routeId, province),
  })
}

export function usePublish(routeId: string, province: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PublishRequest) => planner.publishRoute(routeId, body),
    onSuccess: () => invalidateRoute(queryClient, routeId, province),
  })
}

/** Invalidates the schedule/health for the owning route plus this store's task-plan cache, so the
 * grid, health card, and Görevler tab all reflect the new resolved minutes (design §6.4 save flow). */
export function useUpdateTaskInstanceScope(routeId: string, province: string, storeId: string, date: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskInstanceId, body }: { taskInstanceId: string; body: PatchTaskInstanceRequest }) =>
      planner.updateTaskInstanceScope(taskInstanceId, body),
    onSuccess: () => {
      invalidateRoute(queryClient, routeId, province)
      void queryClient.invalidateQueries({ queryKey: ['store-task-plan', storeId, date] })
    },
  })
}

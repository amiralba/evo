import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as planner from '../../api/planner'
import type { components } from '../../api/generated/schema'

type BulkAddStopsRequest = components['schemas']['BulkAddStopsRequest']
type UpdateStopRequest = components['schemas']['UpdateStopRequest']
type CreatePatchRequest = components['schemas']['CreatePatchRequest']
type PublishRequest = components['schemas']['PublishRequest']

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

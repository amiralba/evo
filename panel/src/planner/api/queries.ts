import { useQuery } from '@tanstack/react-query'
import * as planner from '../../api/planner'
import type { components } from '../../api/generated/schema'

type RouteStatus = components['schemas']['RouteStatus']

export function useRoutes(province: string, status?: RouteStatus) {
  return useQuery({
    queryKey: ['routes', province, status],
    queryFn: () => planner.listRoutes(province, status),
    enabled: Boolean(province),
  })
}

export function useRoute(id: string | null) {
  return useQuery({
    queryKey: ['route', id],
    queryFn: () => planner.getRoute(id!),
    enabled: Boolean(id),
  })
}

export function useStoresGeo(province: string, onRoute?: boolean) {
  return useQuery({
    queryKey: ['stores-geo', province, onRoute],
    queryFn: () => planner.getStoresGeo(province, onRoute),
    enabled: Boolean(province),
  })
}

export function usePlan(id: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['plan', id, from, to],
    queryFn: () => planner.getPlan(id!, from, to),
    enabled: Boolean(id && from && to),
  })
}

export function useHealth(id: string | null) {
  return useQuery({
    queryKey: ['health', id],
    queryFn: () => planner.getHealth(id!),
    enabled: Boolean(id),
  })
}

/** Fetches once per session (route-change audit entries are append-only and small in volume for
 * a demo dataset); the caller filters the page by routeId. */
export function useRouteAuditLog(enabled: boolean) {
  return useQuery({
    queryKey: ['route-audit-log'],
    queryFn: () => planner.getRouteAuditLog(),
    enabled,
  })
}

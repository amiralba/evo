import { useQuery } from '@tanstack/react-query'
import * as planner from '../../api/planner'
import type { RuleImpactParams } from '../../api/planner'
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

export function useStoreDetail(storeId: string | null) {
  return useQuery({
    queryKey: ['store-detail', storeId],
    queryFn: () => planner.getStoreDetail(storeId!),
    enabled: Boolean(storeId),
  })
}

export function useStoreTaskPlan(storeId: string | null, date: string) {
  return useQuery({
    queryKey: ['store-task-plan', storeId, date],
    queryFn: () => planner.getStoreTaskPlan(storeId!, date),
    enabled: Boolean(storeId && date),
  })
}

/** Enabled only once the scope modal has a concrete candidate rule to preview (design §6.4 impact
 * preview) — never fetched just from opening the modal. */
export function useRuleImpact(params: RuleImpactParams | null) {
  return useQuery({
    queryKey: ['rule-impact', params],
    queryFn: () => planner.getRuleImpact(params!),
    enabled: Boolean(params),
  })
}

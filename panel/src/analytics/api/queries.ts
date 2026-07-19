import { useQuery } from '@tanstack/react-query'
import * as analytics from './analytics'

export function usePlanHealth(region: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['plan-health', region, from, to],
    queryFn: () => analytics.getPlanHealth(region, from, to),
    enabled: Boolean(from && to),
  })
}

export function useMobility(region: string | undefined, months?: number) {
  return useQuery({
    queryKey: ['mobility', region, months],
    queryFn: () => analytics.getMobility(region, months),
  })
}

import { useQuery } from '@tanstack/react-query'
import * as onarim from './onarim'

export function useDisruptions(region?: string) {
  return useQuery({
    queryKey: ['disruptions', region],
    queryFn: () => onarim.getDisruptions(region),
  })
}

export function useAffectedVisits(disruptionId: string | null) {
  return useQuery({
    queryKey: ['affected-visits', disruptionId],
    queryFn: () => onarim.getAffectedVisits(disruptionId!),
    enabled: Boolean(disruptionId),
  })
}

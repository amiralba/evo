import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as onarim from './onarim'
import type { components } from '../../api/generated/schema'

type ApplyOnarimRequest = components['schemas']['ApplyOnarimRequest']

export function useApplyOnarim(disruptionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ApplyOnarimRequest) => onarim.applyOnarim(disruptionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disruptions'] })
      void queryClient.invalidateQueries({ queryKey: ['affected-visits', disruptionId] })
      void queryClient.invalidateQueries({ queryKey: ['plan'] })
      void queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })
}

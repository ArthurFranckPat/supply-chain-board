import { useState, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/api/client'
import type { RunState } from '@/types/api'
import type { SchedulerResult } from '@/types/scheduler'

export function useScheduleRun() {
  const [runId, setRunId] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (params: {
      immediate_components?: boolean
      blocking_components_mode?: string
      demand_horizon_days?: number
      algorithm?: string
      ga_random_seed?: number | null
      ga_config_overrides?: Record<string, unknown> | null
    }) => {
      const isCompare = params.algorithm === 'compare'
      // Le backend n'accepte que 'greedy' ou 'ga' — 'compare' est une instruction UI
      const backendParams = { ...params, algorithm: isCompare ? 'ga' : params.algorithm }
      const resp = isCompare
        ? await apiClient.runCompare(backendParams)
        : await apiClient.runSchedule(backendParams)
      setRunId(resp.run_id)
      return resp
    },
  })

  const query = useQuery<RunState, ApiError>({
    queryKey: ['schedule-run', runId],
    queryFn: () => apiClient.getRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      if (query.state.data?.status === 'running') return 5000
      return false
    },
    refetchIntervalInBackground: false,
    staleTime: 3000,
  })

  const scheduleResult: SchedulerResult | null =
    query.data?.status === 'completed' && query.data.result
      ? (query.data.result as unknown as SchedulerResult)
      : null

  const reset = useCallback(() => {
    setRunId(null)
    mutation.reset()
  }, [mutation])

  return {
    trigger: mutation.mutateAsync,
    isLoading: mutation.isPending || query.data?.status === 'running',
    isError: mutation.isError || query.data?.status === 'failed',
    error: mutation.error ?? (query.data?.status === 'failed' ? query.data.error : null),
    result: scheduleResult,
    runState: query.data,
    reset,
  }
}

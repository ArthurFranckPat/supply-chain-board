import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { suiviClient } from '@/api/suivi-client'
import type { DataSource, DataSourceSnapshot } from '@/types/api'
import type { SuiviStatusResponse } from '@/types/suivi-commandes'

type BackendState = 'checking' | 'ready' | 'error'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export type { BackendState, LoadState }

export function useAppBootstrap(source: DataSource) {
  const [backendState, setBackendState] = useState<BackendState>('checking')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<DataSourceSnapshot | null>(null)
  const [suiviData, setSuiviData] = useState<SuiviStatusResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const health = await apiClient.getHealth()
        if (cancelled) return
        setBackendState(health.status === 'ok' ? 'ready' : 'error')

        if (health.status === 'ok') {
          setLoadState('loading')
          try {
            const [ordoData, suiviResp] = await Promise.all([
              apiClient.loadData(source),
              suiviClient.getStatusFromErp().catch(() => null),
            ])
            if (cancelled) return
            setLastSourceSnapshot(ordoData)
            setSuiviData(suiviResp)
            setLoadState('ready')
          } catch {
            if (!cancelled) setLoadState('error')
          }
        }
      } catch {
        if (!cancelled) setBackendState('error')
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [source])

  function reloadSuivi() {
    suiviClient.getStatusFromErp().then(setSuiviData).catch(() => {})
  }

  return { backendState, loadState, lastSourceSnapshot, suiviData, reloadSuivi }
}

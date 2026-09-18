import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void) {
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Vrai sous 640 px (seuil « compact » de la vue proactive du Suivi). */
export function useIsCompact(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(QUERY).matches,
    () => false
  )
}

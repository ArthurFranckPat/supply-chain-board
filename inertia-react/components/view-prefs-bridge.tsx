import { useLayoutEffect } from 'react'
import { usePage } from '@inertiajs/react'

import { useViewPrefsStore } from '@r/lib/view-prefs/store'
import type { ViewPrefs } from '@r/lib/view-prefs/registry'

/**
 * Amorce le store client des préférences de vues depuis les props Inertia
 * partagées (`viewPrefs`), avant le premier paint.
 *
 * `useLayoutEffect` et non `useEffect` : le masthead lit le store au même
 * commit ; semer après le paint ferait clignoter une entrée de menu masquée le
 * temps d'une frame à chaque navigation. Rendu `null`, monté une fois dans
 * `AppLayout`.
 */
export function ViewPrefsBridge() {
  const page = usePage<{ viewPrefs: ViewPrefs | null }>()
  const seed = useViewPrefsStore((s) => s.seed)

  useLayoutEffect(() => {
    seed(page.props.viewPrefs)
  }, [page.props.viewPrefs, seed])

  return null
}

export default ViewPrefsBridge

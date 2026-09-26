/**
 * Store client des préférences de vues (pages + sous-vues).
 *
 * Source de vérité : serveur (`users.view_prefs`) → props Inertia `viewPrefs`
 * → `ViewPrefsBridge` amorce ce store. La page `/configuration/vues` mute le
 * store (retour visuel immédiat) puis PATCH `user.view_prefs.update`.
 *
 * Pas de persistance localStorage : les props Inertia sont disponibles dès le
 * premier rendu (pas de flash), et une copie locale pourrait masquer un réglage
 * modifié depuis un autre poste. Le serveur reste l'unique vérité.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import {
  DEFAULT_VIEW_PREFS,
  PAGES,
  isPageHidden,
  isSubviewHidden,
  normalizeViewPrefs,
  subviewKey,
  type PageKey,
  type ViewPrefs,
} from '@r/lib/view-prefs/registry'

interface ViewPrefsState {
  prefs: ViewPrefs
  /** Amorce depuis les props serveur (n'écrase pas une édition locale non PATCHée). */
  seed: (raw: ViewPrefs | null | undefined) => void
  setPageHidden: (page: PageKey, hidden: boolean) => void
  setSubviewHidden: (page: PageKey, sub: string, hidden: boolean) => void
  reset: () => void
}

/**
 * Dernière valeur serveur semée. On ne ré-amorce que sur une valeur DIFFÉRENTE :
 * sans cette garde, chaque rendu de page écraserait l'édition locale faite sur
 * `/configuration/vues` (les props ne changent pas avant la réponse du serveur).
 */
let lastSeededKey: string | null = null

export const useViewPrefsStore = create<ViewPrefsState>((set) => ({
  prefs: DEFAULT_VIEW_PREFS,

  seed: (raw) => {
    const key = JSON.stringify(raw ?? null)
    if (key === lastSeededKey) return
    lastSeededKey = key
    set({ prefs: normalizeViewPrefs(raw) })
  },

  setPageHidden: (page, hidden) =>
    set((s) => ({
      prefs: normalizeViewPrefs({
        ...s.prefs,
        hiddenPages: hidden
          ? [...s.prefs.hiddenPages, page]
          : s.prefs.hiddenPages.filter((k) => k !== page),
      }),
    })),

  setSubviewHidden: (page, sub, hidden) =>
    set((s) => {
      const key = subviewKey(page, sub)
      return {
        prefs: normalizeViewPrefs({
          ...s.prefs,
          hiddenSubviews: hidden
            ? [...s.prefs.hiddenSubviews, key]
            : s.prefs.hiddenSubviews.filter((k) => k !== key),
        }),
      }
    }),

  reset: () => set({ prefs: DEFAULT_VIEW_PREFS }),
}))

/** Préférences courantes (référence stable tant qu'elles ne changent pas). */
export function useViewPrefs(): ViewPrefs {
  return useViewPrefsStore((s) => s.prefs)
}

/** Une page est-elle visible ? */
export function useIsPageVisible(page: PageKey): boolean {
  const prefs = useViewPrefs()
  return !isPageHidden(prefs, page)
}

/** Une sous-vue est-elle visible ? */
export function useIsSubviewVisible(page: PageKey, sub: string): boolean {
  const prefs = useViewPrefs()
  return !isSubviewHidden(prefs, page, sub)
}

/** Clés des sous-vues VISIBLES d'une page, dans l'ordre du registre. */
export function useVisibleSubviews(page: PageKey): string[] {
  const prefs = useViewPrefs()
  return useMemo(
    () =>
      PAGES.find((p) => p.key === page)
        ?.subviews.filter((s) => !isSubviewHidden(prefs, page, s.key))
        .map((s) => s.key) ?? [],
    [prefs, page]
  )
}

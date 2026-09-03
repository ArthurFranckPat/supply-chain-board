/**
 * Préférences d'AFFICHAGE de l'utilisateur — réglages de confort visuel, sans
 * effet sur les données ni sur les calculs. Réglés depuis
 * `/configuration/affichage`.
 *
 * Persistées dans le navigateur (localStorage via `zustand/persist`), pas en
 * base : ce sont des réglages de POSTE, pas d'identité. Deux conséquences
 * assumées — un réglage ne suit pas l'utilisateur d'une machine à l'autre, et
 * vider les données du site le remet à son défaut. En contrepartie, aucune
 * migration, aucun aller-retour serveur, et le réglage s'applique dès le
 * rendu (pas d'état intermédiaire pendant que le serveur répond).
 *
 * Le SSR Inertia est désactivé (config/inertia.ts) : lire le localStorage à la
 * création du store ne peut donc pas produire de divergence d'hydratation.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Défauts — ce que voit un poste qui n'a jamais rien réglé. */
export const DISPLAY_PREFS_DEFAULTS = {
  /**
   * Animer le diff au rechargement (issue #186) : flash des cellules modifiées,
   * des lignes entrées/sorties, et récap dans la barre d'état des données.
   * Activé par défaut — c'est la valeur de la fonctionnalité ; on l'éteint
   * quand le clignotement gêne (grand écran de supervision, sensibilité au
   * mouvement, capture vidéo).
   */
  diffFlash: true,
}

export type DisplayPrefs = typeof DISPLAY_PREFS_DEFAULTS

interface DisplayPrefsState extends DisplayPrefs {
  setDiffFlash: (on: boolean) => void
  /** Remet TOUTES les préférences d'affichage à leur défaut. */
  reset: () => void
}

export const useDisplayPrefsStore = create<DisplayPrefsState>()(
  persist(
    (set) => ({
      ...DISPLAY_PREFS_DEFAULTS,
      setDiffFlash: (on) => set({ diffFlash: on }),
      reset: () => set({ ...DISPLAY_PREFS_DEFAULTS }),
    }),
    {
      name: 'display-prefs',
      // `version` + `merge` sur les défauts : une préférence ajoutée plus tard
      // ne doit pas rester `undefined` sur un poste qui a déjà un état stocké.
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        ...DISPLAY_PREFS_DEFAULTS,
        ...(persisted as Partial<DisplayPrefs>),
      }),
    }
  )
)

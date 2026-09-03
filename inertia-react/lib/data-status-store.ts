/**
 * Store global de l'état de chargement des données de la page courante —
 * consommé par le widget <DataStatus /> du masthead (présent sur toutes les
 * pages). Deux sources d'activité s'y enregistrent :
 *
 *   • `useTimedFetch` — chaque fetch JSON minuté (fragments lourds chargés en
 *     différé) ; le nonce `bump()` sert de bouton « recharger » global : le
 *     hook l'ajoute à l'URL fetchée, ce qui re-déclenche ses effets.
 *   • les événements `start`/`finish` du routeur Inertia — visites et
 *     `router.reload()` (pages dont les données arrivent en props).
 *
 * Le compteur `active` permet d'afficher le chargement tant qu'AU MOINS une
 * requête court (une page peut charger plusieurs fragments en parallèle) ;
 * `ms`/`loadedAt` reflètent le dernier fetch terminé (sur une page, c'est le
 * plus lent qui finit par s'afficher — celui que l'utilisateur perçoit).
 *
 * Le store loge aussi le RÉCAPITULATIF du diff de rechargement (issue #186) :
 * chaque source de données (un fetch minuté, les props d'une visite Inertia)
 * publie ses compteurs sous son propre nom, la barre en affiche la somme. Les
 * compteurs sont rattachés au `nonce` du rechargement qui les a produits — une
 * publication portant un autre nonce remplace la précédente au lieu de s'y
 * ajouter, ce qui évite d'additionner deux rechargements successifs.
 */
import { create } from 'zustand'

import type { DiffCounts } from '@r/lib/diff-flash'

interface DataStatusState {
  /** Requêtes données en cours (fetch JSON + navigation Inertia). */
  active: number
  /** Instant (epoch ms) du démarrage du chargement courant — chrono live. */
  t0: number | null
  /** Durée du dernier chargement de données terminé (ms). */
  ms: number | null
  /** Horodatage (epoch ms) du dernier chargement de données terminé. */
  loadedAt: number | null
  /** Message de la dernière erreur de chargement (null si OK). */
  error: string | null
  /** Incrémenté à chaque clic « recharger » — consommé par useTimedFetch. */
  nonce: number
  /**
   * Récap du diff du dernier rechargement, par source (issue #186). Vide tant
   * qu'aucun rechargement explicite n'a produit de changement.
   */
  diffBySource: Record<string, DiffCounts>
  /** Nonce du rechargement auquel `diffBySource` se rapporte. */
  diffNonce: number

  /** Déclare le démarrage d'une requête (incrémente active, pose le chrono). */
  begin: () => void
  /** Termine une requête en succès : ms + heure de mise à jour. */
  end: (ms: number) => void
  /** Termine une requête en échec : l'erreur est affichée, ms inchangés. */
  fail: (error: string) => void
  /** Abandon (unmount pendant le vol) : décompte sans toucher ms/maj. */
  abort: () => void
  /** Bouton « recharger » : re-déclenche les fetch minutés. */
  bump: () => void
  /**
   * Amorce au premier montage (chargement document initial) : la navigation
   * Inertia elle-même a déjà chargé les props — durée ≈ performance.now().
   * Sans effet si une vraie requête a déjà alimenté le store.
   */
  seed: (ms: number) => void
  /**
   * Publie le récap de diff d'une source pour un rechargement donné. Une
   * publication portant un nonce plus récent efface les compteurs du
   * rechargement précédent (on ne cumule jamais deux rechargements).
   */
  publishDiff: (source: string, nonce: number, counts: DiffCounts) => void
  /** Efface le récap — navigation, ou rechargement suivant. */
  clearDiff: () => void
}

export const useDataStatusStore = create<DataStatusState>((set) => ({
  active: 0,
  t0: null,
  ms: null,
  loadedAt: null,
  error: null,
  nonce: 0,
  diffBySource: {},
  diffNonce: 0,

  begin: () =>
    set((s) => ({
      active: s.active + 1,
      t0: s.t0 ?? Date.now(),
      error: null,
    })),

  end: (ms) =>
    set((s) => {
      const active = Math.max(0, s.active - 1)
      return {
        active,
        ms,
        loadedAt: Date.now(),
        error: null,
        // Dernière requête terminée : le chrono s'arrête.
        ...(active === 0 ? { t0: null } : {}),
      }
    }),

  fail: (error) =>
    set((s) => {
      const active = Math.max(0, s.active - 1)
      return {
        active,
        error,
        ...(active === 0 ? { t0: null } : {}),
      }
    }),

  abort: () =>
    set((s) => {
      const active = Math.max(0, s.active - 1)
      return { active, ...(active === 0 ? { t0: null } : {}) }
    }),

  // Le récap du rechargement précédent disparaît dès qu'on en redemande un :
  // laisser « 12 changements » à l'écran pendant le nouveau chargement
  // laisserait croire qu'il décrit les données en train d'arriver.
  bump: () => set((s) => ({ nonce: s.nonce + 1, diffBySource: {}, diffNonce: s.nonce + 1 })),

  seed: (ms) => set((s) => (s.loadedAt === null ? { ms, loadedAt: Date.now() } : {})),

  publishDiff: (source, nonce, counts) =>
    set((s) => ({
      diffNonce: nonce,
      diffBySource:
        s.diffNonce === nonce ? { ...s.diffBySource, [source]: counts } : { [source]: counts },
    })),

  clearDiff: () => set({ diffBySource: {}, diffNonce: 0 }),
}))

/** Somme des récaps publiés — `null` si aucun changement à annoncer. */
export function totalDiff(bySource: Record<string, DiffCounts>): DiffCounts | null {
  let changed = 0
  let entered = 0
  let exited = 0
  for (const c of Object.values(bySource)) {
    changed += c.changed
    entered += c.entered
    exited += c.exited
  }
  return changed + entered + exited === 0 ? null : { changed, entered, exited }
}

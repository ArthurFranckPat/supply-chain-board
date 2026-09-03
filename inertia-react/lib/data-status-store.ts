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
  /**
   * Âge de la DONNÉE affichée AU MOMENT de sa réception (ms), dérivé du tampon
   * `computedAt` que le serveur pose dans le payload caché
   * (app/services/computed_age.ts) : `Date.now()` du NAVIGATEUR moins le
   * tampon, borné à 0. Ancré côté client volontairement — un décalage
   * d'horloge entre le serveur et le poste ne doit ni rajeunir ni vieillir
   * l'âge affiché ; il grandit ensuite avec l'horloge du navigateur
   * (`dataAgeMs + now - loadedAt`). Null = endpoint sans tampon : la fraîcheur
   * retombe sur `loadedAt` (heure de réception), qui ne dit rien de l'âge.
   * Fusion des fragments : le PLUS VIEUX gagne — une page est aussi fraîche
   * que son fragment le plus vieux.
   */
  dataAgeMs: number | null
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
  /**
   * Termine une requête en succès : ms + heure de mise à jour, et le tampon
   * serveur `computedAt` (epoch posé par l'HORLOGE DU SERVEUR) quand le
   * endpoint en porte un — converti ici en âge côté navigateur, à l'abri du
   * décalage d'horloge entre les deux machines.
   */
  end: (ms: number, computedAt?: number) => void
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
  /**
   * Oublie l'âge de la donnée — au changement de page : celui de la page
   * PRÉCÉDENTE ne doit pas s'afficher sur la suivante (le store survit aux
   * navigations Inertia). Distinct de `clearDiff`, aussi appelé par l'écran
   * Affichage sans changer de page.
   */
  resetDataAge: () => void
}

export const useDataStatusStore = create<DataStatusState>((set) => ({
  active: 0,
  t0: null,
  ms: null,
  loadedAt: null,
  dataAgeMs: null,
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

  end: (ms, computedAt) =>
    set((s) => {
      const active = Math.max(0, s.active - 1)
      // Âge à la réception, mesuré par l'horloge du NAVIGATEUR (borné à 0 : un
      // serveur en avance ne doit pas produire un âge négatif). Le plus vieux
      // des fragments gagne au fil des `end`.
      const age = computedAt === undefined ? null : Math.max(0, Date.now() - computedAt)
      return {
        active,
        ms,
        loadedAt: Date.now(),
        error: null,
        dataAgeMs:
          age === null ? s.dataAgeMs : s.dataAgeMs === null ? age : Math.max(s.dataAgeMs, age),
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
  // laisserait croire qu'il décrit les données en train d'arriver. L'âge de la
  // donnée aussi : un rechargement re-court TOUS les fragments, la page repart
  // d'une fraîcheur inconnue que le max() reconstruira.
  bump: () =>
    set((s) => ({
      nonce: s.nonce + 1,
      diffBySource: {},
      diffNonce: s.nonce + 1,
      dataAgeMs: null,
    })),

  seed: (ms) => set((s) => (s.loadedAt === null ? { ms, loadedAt: Date.now() } : {})),

  publishDiff: (source, nonce, counts) =>
    set((s) => ({
      diffNonce: nonce,
      diffBySource:
        s.diffNonce === nonce ? { ...s.diffBySource, [source]: counts } : { [source]: counts },
    })),

  clearDiff: () => set({ diffBySource: {}, diffNonce: 0 }),
  resetDataAge: () => set({ dataAgeMs: null }),
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

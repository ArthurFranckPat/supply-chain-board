/**
 * Formes renvoyées par SchedulerController.shortageRows (GET /api/v1/planning/shortages/rows).
 * Lignes DÉJÀ pré-formatées côté serveur (dates FR, quantités, presets verdict) — la page
 * Solid les rend telles quelles. Voir `displayRows` dans scheduler_controller.ts.
 */

export interface ShortageReceptionDisplay {
  id: string
  supplier: string
  qty: string
  dateArrivee: string
}

export interface ShortageDisplayRow {
  component: string
  componentDesc: string
  qteManquante: string
  numOf: string
  ofHref: string
  articleParent: string
  articleParentDesc: string
  numCommande: string
  client: string
  hasCommande: boolean
  dateExpedition: string
  reception: ShortageReceptionDisplay | null
  dateArrivee: string
  arriveeLate: boolean
  /** Clé courte du verdict pour les filtres + le tri (miroir de ShortageRow.verdict). */
  verdictKey: ShortageVerdictKey
  verdictLabel: string
  verdictCls: string
  verdictIcon: string
  // ── Vue « Couverture » (frise temporelle) ──
  /** Date d'expédition commande ISO (YYYY-MM-DD) — null si OF non rattaché. */
  dateExpeditionIso: string | null
  /** Date d'arrivée de la réception couvrante ISO — null si aucune couverture. */
  receptionIso: string | null
  /** Jours de retard d'arrivée (réception après expé) — 0 si à temps / sans réception. */
  joursRetardReception: number
  /** Texte concaténé (composant / commande / fournisseur / OF / PF) pour le filtre client. */
  filter: string
}

export type ShortageVerdictKey = 'couvert' | 'retard' | 'sans_couverture'

export interface ShortageStats {
  nbRuptures: number
  nbCouvertes: number
  nbSansCouverture: number
}

export interface ShortageRowsResponse {
  rows: ShortageDisplayRow[]
  stats: ShortageStats
  x3Error: string | null
}

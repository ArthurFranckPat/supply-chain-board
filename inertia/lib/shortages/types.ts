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
  /** Qté manquante brute (numérique) — sert aux agrégations de la vue « Par composant ». */
  qteManquanteNum: number
  numOf: string
  ofHref: string
  articleParent: string
  articleParentDesc: string
  numCommande: string
  client: string
  hasCommande: boolean
  /** Autres commandes allouées au même OF (au-delà de la plus urgente affichée). */
  autresCommandes: string[]
  dateExpedition: string
  reception: ShortageReceptionDisplay | null
  dateArrivee: string
  arriveeLate: boolean
  /** Vrai si la réception couvrante est en retard de livraison (attendue dans le passé). */
  overdue: boolean
  /** OFs fils produisant le composant (verdict `sous_ensemble` — composant FABRIQUÉ). */
  sousEnsembleOfs: string[]
  /** Clé courte du verdict pour les filtres + le tri (miroir de ShortageRow.verdict). */
  verdictKey: ShortageVerdictKey
  verdictLabel: string
  verdictCls: string
  // ── Vue « Couverture » (frise temporelle) ──
  /** Date d'expédition commande ISO (YYYY-MM-DD) — null si OF non rattaché. */
  dateExpeditionIso: string | null
  /** Date d'arrivée de la réception couvrante ISO — null si aucune couverture. */
  receptionIso: string | null
  /** Jours de retard d'arrivée vs date de besoin (expé − buffers) — dépassement buffer fab. */
  joursRetardReception: number
  /**
   * Marge logistique signée (j) entre la réception et la deadline client (expédition).
   * > 0 : marge restante avant expé ; ≤ 0 : retard client projeté. 0 si pas de réception
   * ou OF orphelin. Sert au badge « Marge +Nj » et au gap de la frise.
   */
  joursMarge: number
  /** Texte concaténé (composant / commande / fournisseur / OF / PF) pour le filtre client. */
  filter: string
}

/**
 * Continuum de ponctualité (cf. ShortageRow.verdict) :
 *  - `couvert`        : réception ≤ dateBesoin (production + logistique tranquilles)
 *  - `a_risque`       : réception entre dateBesoin et expédition (buffers entamés,
 *                       PAS un retard client — tension logistique seulement)
 *  - `retard`         : réception ≥ expédition (retard client réel projeté)
 *  - `sous_ensemble`  : composant FABRIQUÉ couvert par un OF fils (pas par PO)
 *  - `sans_couverture`: aucune réception prévue.
 */
export type ShortageVerdictKey =
  'couvert' | 'a_risque' | 'retard' | 'sans_couverture' | 'sous_ensemble'

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

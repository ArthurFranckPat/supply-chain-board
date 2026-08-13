/**
 * Formes renvoyées par SchedulerController.ruptureRows (GET /api/v1/planning/ruptures/rows).
 * Lignes DÉJÀ pré-formatées côté serveur (dates FR, quantités, presets verdict) — la page
 * Solid les rend telles quelles. Voir `displayRows` dans scheduler_controller.ts.
 */

export interface RuptureReceptionDisplay {
  id: string
  supplier: string
  qty: string
  dateArrivee: string
}

export interface RuptureDisplayRow {
  component: string
  componentDesc: string
  qteManquante: string
  /** Qté manquante brute (numérique) — sert aux agrégations de la vue « Par composant ». */
  qteManquanteNum: number
  numOf: string
  ofHref: string
  /**
   * OF(s) qui sur-déclarent ce même composant en PF ailleurs (issue #95) — cause
   * probable de rupture invisible depuis cet écran. null si aucun signal.
   */
  overDeclaration: { numOf: string; ecart: number }[] | null
  articleParent: string
  articleParentDesc: string
  numCommande: string
  client: string
  hasCommande: boolean
  /** Autres commandes allouées au même OF (au-delà de la plus urgente affichée). */
  autresCommandes: string[]
  dateExpedition: string
  reception: RuptureReceptionDisplay | null
  /** Vrai si la réception couvrante est en retard de livraison (attendue dans le passé). */
  overdue: boolean
  /** OFs fils produisant le composant (verdict `sous_ensemble` — composant FABRIQUÉ). */
  sousEnsembleOfs: string[]
  /** Clé courte du verdict pour les filtres + le tri (miroir de RuptureRow.verdict). */
  verdictKey: RuptureVerdictKey
  verdictLabel: string
  verdictCls: string
  /** Date d'expédition commande ISO (YYYY-MM-DD) — tooltip du Registre. Null si OF non rattaché. */
  dateExpeditionIso: string | null
  /** Texte concaténé (composant / commande / fournisseur / OF / PF) pour le filtre client. */
  filter: string
}

/**
 * Continuum de ponctualité (cf. RuptureRow.verdict) :
 *  - `couvert`        : réception ≤ dateBesoin (production + logistique tranquilles)
 *  - `a_risque`       : réception entre dateBesoin et expédition (buffers entamés,
 *                       PAS un retard client — tension logistique seulement)
 *  - `retard`         : réception ≥ expédition (retard client réel projeté)
 *  - `sous_ensemble`  : composant FABRIQUÉ couvert par un OF fils (pas par PO)
 *  - `sans_couverture`: aucune réception prévue.
 */
export type RuptureVerdictKey =
  'couvert' | 'a_risque' | 'retard' | 'sans_couverture' | 'sous_ensemble'

export interface RuptureStats {
  nbRuptures: number
  nbCouvertes: number
  nbSansCouverture: number
}

/**
 * OF pointé à 100 % en atelier mais jamais soldé : ORDERS annonce encore un reste qui
 * n'existe pas. Écarté de l'offre côté serveur (il couvrait faussement des commandes),
 * remonté ici pour être signalé — c'est une action de gestion, pas un détail technique.
 */
export interface PhantomOfDisplay {
  numOf: string
  article: string
  qteRestante: number
  qtyRealisee: number
  qtyPrevueOp: number
}

export interface RuptureRowsResponse {
  rows: RuptureDisplayRow[]
  stats: RuptureStats
  phantomOfs?: PhantomOfDisplay[]
  x3Error: string | null
}

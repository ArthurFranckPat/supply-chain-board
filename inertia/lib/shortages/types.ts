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
  verdictLabel: string
  verdictCls: string
  verdictIcon: string
  /** Texte concaténé (composant / commande / fournisseur / OF / PF) pour le filtre client. */
  filter: string
}

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

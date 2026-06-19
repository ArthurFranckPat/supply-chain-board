/**
 * Types du registre « suivi des commandes » — miroir des formes émises par
 * SuiviController.rows() (app/controllers/suivi_controller.ts).
 *
 * Le moteur domaine (#app/domain/suivi) assigne 4 statuts métier (axe
 * allocation/expédition) + cause de retard + signal CQ. Cette couche est la
 * projection d'affichage (statut court, icône, cause + composants, action,
 * allocation strict/CQ, date FR) prête au rendu du registre.
 */

/** Clé courte du statut pour le badge (dérivée de SuiviStatus côté serveur). */
export type SuiviStatusKey = 'exp' | 'alc' | 'ret' | 'ras'

/** Type de cause de retard (miroir de app/domain/suivi.ts CauseType). */
export type SuiviCauseType =
  | 'STOCK_DISPONIBLE_NON_ALLOUE'
  | 'ATTENTE_RECEPTION_FOURNISSEUR'
  | 'AUCUN_OF_PLANIFIE'
  | 'RUPTURE_COMPOSANTS'
  | 'RETARD_ORDONNANCEMENT'
  | 'RETARD_COMPOSANT_TARDIF'
  | 'INCONNUE'

export interface SuiviCauseDisplay {
  type: SuiviCauseType
  label: string
  comps: { art: string; qty: number }[]
  /** ETA du composant goulot (date JJ/MM + n° d'achat) pour RUPTURE_COMPOSANTS — null sinon. */
  reception: { eta: string; po: string; supplier: string } | null
  /** Analyse rétro (RETARD_COMPOSANT_TARDIF) : affermissement OF + composant disponible tard. */
  retro: {
    ofPegue: string
    affermissement: string
    composant: { art: string; dispoA: string; cq: boolean } | null
  } | null
}

/**
 * Emplacement projeté pour la colonne « Emplacement » (miroir de
 * SuiviEmplacementDisplay côté serveur). Conserve la source (STOALL/STOCK)
 * et la qté pour la pastille, et précalcule enZoneExpe pour le rendu.
 */
export interface SuiviEmplacement {
  nom: string
  qte: number
  source: 'STOALL' | 'STOCK'
  enZoneExpe: boolean
  alreadyAllocated?: boolean
  /** PALNUM (identifiant palette). */
  hum?: string | null
}

export interface SuiviDisplayRow {
  numCommande: string
  client: string
  article: string
  designation: string
  /** MTS / MTO / NOR. */
  type: string
  statusKey: SuiviStatusKey
  statusLabel: string
  statusIcon: string
  qteRestante: number
  besoinNet: number
  /** Allocation virtuelle (split strict / sous contrôle qualité). */
  allocStrict: number
  allocCq: number
  /** Signal CQ : du stock sous contrôle qualité a été consommé pour cette ligne. */
  cq: boolean
  /** Date d'expédition (JJ/MM) — '' si absente. */
  dateExp: string
  /** ISO YYYY-MM-DD pour le tri chronologique (null si absente). */
  dateExpIso: string | null
  /** True si en retard de production (date expé dépassée, hors zone expé). */
  late: boolean
  /** Emplacements rattachés à la ligne (source + qté + zone). */
  emplacements: SuiviEmplacement[]
  /** True si au moins un emplacement est en zone d'expédition. */
  enZoneExpe: boolean
  cause: SuiviCauseDisplay | null
  action: { severity: 'info' | 'warning' | 'critical'; label: string }
  /** Champ texte pré-concaténé (lowercase) pour le filtre client. */
  filter: string
}

export type SuiviStatusCounts = {
  A_EXPEDIER: number
  ALLOCATION_A_FAIRE: number
  RETARD_PROD: number
  RAS: number
}

/** Réponse de GET /api/v1/status/rows (fetch différé côté client). */
export interface SuiviRowsResponse {
  total: number
  statusCounts: SuiviStatusCounts
  cqCount: number
  rows: SuiviDisplayRow[]
  x3Error: string | null
  referenceDate: string
}

/** Props de la page GET /suivi (shell Inertia rendu instantané). */
export interface SuiviPageProps {
  referenceDate: string
  /** URL JSON du calcul lourd (lignes + stats). Re-fetch auto quand elle change. */
  rowsHref: string
}

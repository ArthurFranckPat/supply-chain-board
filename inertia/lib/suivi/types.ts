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

/** Option de filtre atelier (STOLOC) : code X3 + libellé lisible (issue #36). */
export interface AtelierOption {
  code: string
  label: string
}

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
  /** Référence commande client (SORDER.CUSORDREF_0) — null si absente. */
  refCommandeClient?: string | null
  /** Référence article client (ITMBPC.ITMREFBPC_0) — null si absente / identique à l'article. */
  refArticleClient?: string | null
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
  /** Ligne A_EXPEDIER d'une commande MTO incomplète (expédition partielle bloquée). */
  attenteLignes: boolean
  /** Date d'expédition (JJ/MM) — '' si absente. */
  dateExp: string
  /** ISO YYYY-MM-DD pour le tri chronologique (null si absente). */
  dateExpIso: string | null
  /** True si en retard de production (date expé dépassée, hors zone expé). */
  late: boolean
  /** Jours ouvrés de retard (0 si pas en retard). Exclut week-ends + fériés FR. */
  lateDays: number
  /** Gravité du retard : 'tolerance' (≤ 1 j ouvré, rouge clair) | 'critical' (au-delà, rouge foncé) | null. */
  lateSeverity: 'tolerance' | 'critical' | null
  /** Emplacements rattachés à la ligne (source + qté + zone). */
  emplacements: SuiviEmplacement[]
  /** True si au moins un emplacement est en zone d'expédition. */
  enZoneExpe: boolean
  cause: SuiviCauseDisplay | null
  action: { severity: 'info' | 'warning' | 'critical'; label: string }
  /** Atelier (STOLOC du poste de gamme) — '' si inconnu (issue #36). */
  atelier: string
  atelierLabel: string
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
  /** Ateliers distincts présents (chips de filtre, issue #36). */
  ateliers: AtelierOption[]
  rows: SuiviDisplayRow[]
  x3Error: string | null
  referenceDate: string
}

/** Props de la page GET /suivi (shell Inertia rendu instantané). */
export interface SuiviPageProps {
  referenceDate: string
  /** URL JSON du calcul lourd (lignes + stats). Re-fetch auto quand elle change. */
  rowsHref: string
  /** URL JSON de la vue proactive (réalisabilité séquentielle des commandes). */
  proactiveRowsHref: string
}

// ---------------------------------------------------------------------------
// Vue proactive (réalisabilité des commandes via le moteur séquentiel)
// ---------------------------------------------------------------------------

/** Clé courte du verdict moteur pour le badge proactif. */
export type ProactiveVerdictKey = 'time' | 'stock' | 'late' | 'blocked' | 'uncov' | 'risk'

export interface ProactiveOf {
  numOf: string
  article: string
  qteAllouee: number
  dateFin: string
  feasible: boolean | null
  statutNum: number
  missingComponents: { art: string; qty: number }[]
  /** Vrai si l'OF a des pointages d'opérations intermédiaires (issue #41). */
  estDebuté?: boolean
}

export interface ProactiveDisplayRow {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  /** Référence commande client (SORDER.CUSORDREF_0) — null si absente. */
  refCommandeClient?: string | null
  /** Référence article client (ITMBPC.ITMREFBPC_0) — null si absente / identique à l'article. */
  refArticleClient?: string | null
  qteRestante: number
  qteAllouee: number
  reliquat: number
  dateExp: string
  dateExpIso: string | null
  verdictKey: ProactiveVerdictKey
  verdictLabel: string
  /** Gravité du retard : 'tolerance' (≤ 1 j ouvré, rouge clair) | 'critical' (au-delà, rouge foncé) | null. */
  lateSeverity: 'tolerance' | 'critical' | null
  /** Mode de couverture : « Stock » | n° OF (« · »-séparés) | « Achat » | « — ». */
  couverture: string
  joursRetard: number
  /** Composants goulots agrégés sur les OFs de la commande.
   *  `reception` = 1ère réception d'achat couvrante (ETA FR + n° commande d'achat), null sinon. */
  composants: {
    art: string
    desc: string
    qty: number
    reception: { eta: string; po: string; supplier: string; overdue: boolean; retardJ: number } | null
  }[]
  ofs: ProactiveOf[]
  /** Atelier (STOLOC du poste de gamme) — '' si inconnu (issue #36). */
  atelier: string
  atelierLabel: string
  filter: string
}

export type ProactiveVerdictCounts = {
  time: number
  stock: number
  late: number
  blocked: number
  uncov: number
}

/** Réponse de GET /api/v1/status/proactive-rows (vue proactive). */
export interface ProactiveRowsResponse {
  total: number
  verdictCounts: ProactiveVerdictCounts
  /** Ateliers distincts présents (chips de filtre, issue #36). */
  ateliers: AtelierOption[]
  rows: ProactiveDisplayRow[]
  x3Error: string | null
  referenceDate: string
}

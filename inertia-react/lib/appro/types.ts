/**
 * Plan d'approvisionnement — miroir client des shapes serveur
 * (app/services/material_plan_loader.ts : MaterialBucket / MaterialRow /
 * MaterialPayload / MaterialDetailLine). Même convention que SuiviController
 * ↔ lib/suivi/types.ts : le build casse si le serveur dérive.
 */

export type ApproGran = 'jour' | 'semaine' | 'mois'
/**
 * Vue de lecture de la grille :
 *  - `manque` : ce qui manquera réellement (besoin non couvert par le stock
 *    projeté ni par les arrivées attendues) — la question du planificateur ;
 *  - `besoin` : le besoin appelé par les parents, déjà net de ce qu'ils
 *    couvrent — utile pour voir le volume, pas pour décider.
 */
export type ApproVue = 'manque' | 'besoin'

export interface ApproBucket {
  key: string
  label: string
}

/** Ligne de production portant du besoin (miroir `MaterialLigneOption`). */
export interface ApproLigne {
  /** Poste de charge (1ʳᵉ opération de gamme du PF), ex. `PP_830`. */
  code: string
  label: string
  count: number
}

export interface ApproRow {
  article: string
  description: string
  supplyType: 'ACHAT' | 'FABRICATION'
  stock: number
  /** Valorisation du stock (stock × PMP), NULL si PMP inconnu. */
  valeur: number | null
  /** En-cours de fabrication non déclaré, crédité au premier bucket. */
  encours: number
  /** Arrivées attendues par bucket (réceptions d'achat ouvertes). */
  arrivees: number[]
  /** Part des arrivées déjà en retard, repliée sur le premier bucket. */
  arriveesRetard: number
  /** Besoin appelé par les parents — déjà net de ce qu'ils couvrent. */
  besoinFerme: number[]
  besoinPrevi: number[]
  /** Stock projeté disponible en fin de bucket. Jamais négatif. */
  solde: number[]
  /** Manque du bucket, ventilé par nature du besoin qui l'encaisse. */
  manqueFerme: number[]
  manquePrevi: number[]
  /** Manque en ne comptant QUE le carnet ferme (second passage du moteur). */
  manqueFermeSeul: number[]
  /** Premier bucket porteur d'un manque, `-1` si la fenêtre passe entière. */
  ruptureAt: number
  ruptureFermeAt: number
  /** Descendance incomplète (coupe profondeur) — à marquer. */
  tronque: boolean
}

export interface ApproPayload {
  buckets: ApproBucket[]
  rows: ApproRow[]
  /** Lignes de production de la fenêtre (population complète, hors filtre). */
  lignes: ApproLigne[]
  /** Version du snapshot pinné — le détail la réclame. */
  version: string
  /** Branches coupées par le plafond de profondeur (diagnostic). */
  truncated: number
  x3Error: string | null
  computedAt?: number
}

export interface ApproDetailLine {
  /** Jour de la demande (YYYY-MM-DD) — le panneau regroupe par semaine. */
  date: string
  numCommande: string | null
  ligne: string | null
  client: string | null
  pfArticle: string
  nature: 'ferme' | 'prevision'
  quantite: number
  path: string[]
}

export interface ApproDetail {
  article: string
  lignes: ApproDetailLine[]
}

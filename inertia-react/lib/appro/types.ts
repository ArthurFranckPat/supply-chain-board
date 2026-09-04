/**
 * Plan d'approvisionnement — miroir client des shapes serveur
 * (app/services/material_plan_loader.ts : MaterialBucket / MaterialRow /
 * MaterialPayload / MaterialDetailLine). Même convention que SuiviController
 * ↔ lib/suivi/types.ts : le build casse si le serveur dérive.
 */

export type ApproGran = 'jour' | 'semaine' | 'mois'
export type ApproCran = 'brut' | 'net' | 'reste'

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
  brutFerme: number[]
  brutPrevi: number[]
  netFerme: number[]
  netPrevi: number[]
  resteFerme: number[]
  restePrevi: number[]
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

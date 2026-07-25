/**
 * Formes renvoyées par ConditionnementsController.
 *
 * La page charge en 2 temps : `rows` (articles seuls, fast) puis `estimations`
 * (enrichissement STOCK/STOJOU + mouvements, lazy — déclenché par l'utilisateur).
 */

/** Une source d'estimation (STOCK ou STOJOU). */
export interface EstimationSourceDisplay {
  usParPalette: number
  confiance: 'ok' | 'faible'
  observations: number
}

/** État du conditionnement référencé (filtre dynamique). */
export type EtatCoef = 'complet' | 'manquant_0' | 'manquant_1' | 'manquant_les_deux'

/** Article pré-formaté (sans estimations — chargées séparément). */
export interface ConditionnementDisplayRow {
  article: string
  designation: string
  categorie: string | null
  pcuStuCoe: number | null
  ucParPal: number | null
  etatCoef: EtatCoef
  codeFrnsr: string | null
  nomFrnsr: string | null
}

/** Enrichissement d'un article : estimations + mouvements (chargés en lazy). */
export interface ArticleEnrichissement {
  stock: EstimationSourceDisplay | null
  stojou: EstimationSourceDisplay | null
  derniereEntree: string | null
  typeEntree: string | null
  derniereSortie: string | null
  typeSortie: string | null
  /** Concordance des 3 sources (UC/pal ITMMASTER, STOCK, STOJOU). */
  concordance: {
    niveau: 0 | 1 | 2 | 3
    nbSources: number
    nbConcordantes: number
  }
}

export interface ConditionnementsStats {
  totalArticles: number
  nbComplets: number
  nbManquant0: number
  nbManquant1: number
  nbManquantLesDeux: number
  tauxRemplissage: number
}

export interface ConditionnementsRowsResponse {
  rows: ConditionnementDisplayRow[]
  estimationsHref: string
  stats: ConditionnementsStats
  x3Error: string | null
}

/** Réponse de l'endpoint d'enrichissement : Map article → enrichissement. */
export interface EstimationsResponse {
  [article: string]: ArticleEnrichissement
}

export interface EstimationsFetchResponse {
  enrichissements: EstimationsResponse
  x3Error: string | null
}

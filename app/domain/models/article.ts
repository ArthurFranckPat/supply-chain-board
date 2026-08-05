/**
 * Article -- fiche produit du catalogue ERP.
 */

export type SupplyType = 'ACHAT' | 'FABRICATION'

/**
 * Délais de repli, quand le référentiel ne dit rien : article absent du
 * catalogue, ou champ de délai vide.
 *
 * Ils vivent ICI et pas dans chaque moteur. Le délai d'achat effectif vient
 * d'`OFS_0` depuis #132 (ITMFACILIT AE1, rempli à 98,9 %, médiane 28 j — mesure
 * du 05/08/2026), après quoi `promise_engine` et `plan_diff` gardaient chacun
 * leur `?? 14` en dur : le chemin « article connu, champ vide » et le chemin
 * « article inconnu » ne répondaient plus la même chose, et un seul des deux
 * avait été mis à jour.
 *
 * Le repli d'achat reste à 14 j faute d'arbitrage sur les 1,1 % d'articles sans
 * `OFS_0` — mais il se change désormais en un seul endroit, et l'écart avec la
 * médiane réelle du parc est explicite plutôt que dispersé dans six fichiers.
 */
export const DELAI_REPLI_ACHAT = 14
export const DELAI_REPLI_FABRICATION = 10

export interface Article {
  code: string
  description: string
  category: string
  supplyType: SupplyType
  /** Grande famille X3 (YFAMSTAT7_0) — ex: ESH, BDH. Optionnel (synthétiques BOM). */
  famille?: string
  /** Typologie fine X3 (TSICOD_4) — ex: ESH10-60, BDH60 (bouche), BDH10 (module hygro). Optionnel. */
  typologie?: string
  reorderDelay: number
  /** ITMMASTER.PCUSTUCOE_1 — US par palette (#119). null/absent = pas de
   *  coefficient : l'équivalent palette est une ABSENCE de donnée, pas zéro. */
  usParPalette?: number | null
  productFamily: string | null
  pmp: number | null
  economicLot: number | null
  unitStock: string | null
  unitPurchase: string | null
  purchaseToStockRatio: number
  packagings: Packaging[]
}

export interface Packaging {
  quantity: number
  type: string
}

// -- Helpers --

export function isPhantom(article: Pick<Article, 'category'>): boolean {
  return article.category.toUpperCase() === 'AFANT'
}

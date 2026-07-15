/**
 * Transforms purs de `loadOrderImpacts` (app/services/order_impacts_loader.ts), extraits
 * pour être testables sans mocker X3 (issue #48). Zéro I/O — tout est passé en paramètre.
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { NomenclatureEntry } from './models/nomenclature.js'
import type { OfOverride } from './planning_board.js'
import type { MfgMaterialInput } from './of-feasibility.js'
import { evaluateRuptures, directMissing, type RuptureOfInput } from './rupture-engine.js'

/**
 * Applique les overrides de date de ligne de commande (clé `id#ligne`) aux demandes.
 * Une commande sans override, ou avec une date invalide, ressort inchangée.
 */
export function remapDemandDates(demands: Flow[], dateOverrides: Map<string, string>): Flow[] {
  if (dateOverrides.size === 0) return demands
  return demands.map((f) => {
    const o = f.origin as { type?: string; id?: string; ligne?: string | null }
    if (o.type !== 'order') return f
    const ov = dateOverrides.get(`${o.id}#${o.ligne ?? ''}`)
    if (!ov || !/^\d{4}-\d{2}-\d{2}$/.test(ov)) return f
    return { ...f, date: new Date(ov) }
  })
}

/**
 * Ferme l'ensemble d'articles par expansion récursive de la nomenclature (tous niveaux,
 * ACHETE + FABRIQUE). Sans ça, un sous-ensemble fabriqué sans OF descend dans la faisabilité
 * avec 0 stock chargé pour ses composants ACHETE.
 */
export function expandArticleSetWithBom(
  seed: Iterable<string>,
  nomenclatureEntries: NomenclatureEntry[]
): Set<string> {
  const articleSet = new Set(seed)
  let added = true
  while (added) {
    added = false
    for (const entry of nomenclatureEntries) {
      if (articleSet.has(entry.parentArticle) && !articleSet.has(entry.componentArticle)) {
        articleSet.add(entry.componentArticle)
        added = true
      }
    }
  }
  return articleSet
}

/**
 * Complète le catalogue article (chargé depuis le référentiel) avec les entrées BOM
 * (parent/composant) absentes — cas des sous-ensembles ou composants hors catalogue actif.
 */
export function buildArticleCatalog(
  articlesList: Article[],
  nomenclatureEntries: NomenclatureEntry[]
): Map<string, Article> {
  const articles = new Map<string, Article>(articlesList.map((a) => [a.code, a]))

  const placeholder = (
    code: string,
    description: string,
    supplyType: Article['supplyType']
  ): Article => ({
    code,
    description,
    category: '',
    supplyType,
    famille: '',
    typologie: '',
    reorderDelay: 0,
    productFamily: null,
    pmp: null,
    economicLot: null,
    unitStock: null,
    unitPurchase: null,
    purchaseToStockRatio: 1,
    packagings: [],
  })

  for (const entry of nomenclatureEntries) {
    if (!articles.has(entry.parentArticle)) {
      articles.set(
        entry.parentArticle,
        placeholder(entry.parentArticle, entry.parentDescription, 'FABRICATION')
      )
    }
    if (!articles.has(entry.componentArticle)) {
      articles.set(
        entry.componentArticle,
        placeholder(
          entry.componentArticle,
          entry.componentDescription,
          entry.componentType === 'ACHETE' ? 'ACHAT' : 'FABRICATION'
        )
      )
    }
  }
  return articles
}

/**
 * Précalcule le verdict MFGMAT par OF (matières réelles) — MÊME calcul que le détail OF,
 * pour garantir badge == détail (issue #11). Les OF sans matières MFGMAT (suggérés non
 * éclatés) ne sont pas dans la map retournée : le moteur retombe sur son calcul BOM théorique.
 *
 * #73 étape 2.3 : verdict rendu par le moteur unique (photo, source MFGMAT). Dispo = stock
 * strict/qc SEUL (pas d'ofSupply) : le chemin MFGMAT est un engagement réel, la couverture
 * d'un SE par d'autres OF se lit dans le diagnostic — et le détail OF fait pareil (parité #11).
 * OF ferme : verdict « faisable » mais manque résiduel VISIBLE (règle 3 — fini le missing {}).
 */
export function precomputeMfgFeasibility(
  ofFlows: Flow[],
  mfgByOf: Map<string, MfgMaterialInput[]>,
  stockByArticle: Map<string, number>,
  overrideMap: Map<string, OfOverride>
): Map<string, { feasible: boolean | null; missingComponents: Record<string, number> }> {
  const engineOfs: RuptureOfInput[] = []
  for (const f of ofFlows) {
    const numOf = (f.origin as { id?: string }).id?.trim() ?? ''
    if (!numOf) continue
    const materials = mfgByOf.get(numOf)
    if (!materials || materials.length === 0) continue
    engineOfs.push({
      numOf,
      article: f.article,
      qteRestante: f.quantity,
      statutNum: overrideMap.get(numOf)?.status ?? (f.origin as { status?: number }).status ?? 3,
      dateBesoin: null,
      materials,
    })
  }

  const verdicts = evaluateRuptures(
    engineOfs,
    { articles: new Map(), nomenclatures: new Map(), stockNet: stockByArticle },
    'photo'
  )

  const mfgFeasibility = new Map<
    string,
    { feasible: boolean | null; missingComponents: Record<string, number> }
  >()
  for (const [numOf, verdict] of verdicts) {
    mfgFeasibility.set(numOf, {
      feasible: verdict.feasible,
      missingComponents: directMissing(verdict),
    })
  }
  return mfgFeasibility
}

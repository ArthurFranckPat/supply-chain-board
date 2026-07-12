/**
 * Moteur de rupture UNIQUE (issue #73).
 *
 * Remplace à terme les 5 calculs divergents (checkFeasibility/evaluateSequentialFeasibility,
 * evaluateMfgFeasibility en direct, RecursiveChecker, la descente privée du contrôleur).
 * Pur : aucune I/O — les adapters chargent les données, le moteur décide.
 *
 * Règles métier actées (gelées par tests/domain/feasibility-contract.test.ts) :
 *  1. Besoins par OF : MFGMAT si l'OF est éclaté (engagement réel, substitutions, reste à
 *     sortir), repli nomenclature théorique sinon (suggestions).
 *  2. Fantômes AFANT : stock strict net du fantôme crédité D'ABORD, descente dans SA
 *     nomenclature pour le RELIQUAT seulement (sémantique MRP). Un manque se rapporte sur
 *     la feuille réelle, jamais sur le fantôme.
 *  3. Allocations ERP (STOALL, qté = QTYSTUACT_0) : créditées au document détenteur en
 *     déduction PARTIELLE (besoin − alloué), jamais de skip tout-ou-rien. OF ferme ≠
 *     exemption de check : verdict « faisable » (il est lancé) mais manque résiduel VISIBLE.
 *  4. Dispo = stock strict net (PHYSTO − PHYALL − GLOALL, hors CQ). JAMAIS les réceptions
 *     futures dans le verdict « maintenant » (invariant #43) — par construction : le moteur
 *     ne reçoit même pas les réceptions.
 *  5. Deux modes, mêmes règles : « photo » (chaque OF évalué seul) et « contention »
 *     (consommation virtuelle séquentielle entre OFs triés par date besoin).
 *
 * Choix unifiés là où les anciens moteurs se contredisaient :
 *  - Composant FABRIQUÉ : dispo = stock net + Σ qteRestante des OF producteurs (`ofSupply`),
 *    PLAFONNÉE à la quantité (l'ancien badge disait « ok dès qu'un OF existe » sans regarder
 *    la quantité ; l'ancien override MFGMAT ne créditait aucun OF). Le manque résiduel est
 *    descendu dans sa nomenclature pour exposer les feuilles achetées réellement manquantes
 *    (sémantique RecursiveChecker / diagnostic).
 *  - OF ferme en contention : il consomme (il VA tourner) — besoin net d'allocation, plafonné
 *    au disponible. L'ancien séquentiel l'exemptait ET ne le faisait rien consommer.
 *  - Un OF non ferme en rupture ne consomme rien (il ne tournera pas en l'état).
 */

import type { Article } from './models/article.js'
import { isPhantom as isPhantomCategory } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import type { MfgMaterialInput } from './of-feasibility.js'
import { isFirm } from './rules.js'

/** Garde-fou anti-descente infinie sur fantômes imbriqués — LA valeur unique (étape 3 #73). */
export const PHANTOM_DEPTH_CAP = 5
/** Profondeur max de descente des sous-ensembles fabriqués en manque (alignée diagnostic). */
const FABRICATED_DESCENT_CAP = 6

export interface RuptureOfInput {
  numOf: string
  article: string
  qteRestante: number
  statutNum: number
  /** Date besoin (tri du mode contention). null = fin de file. */
  dateBesoin: Date | null
  /** Matières réelles MFGMAT si l'OF est éclaté ; null/vide → repli nomenclature (règle 1). */
  materials?: MfgMaterialInput[] | null
}

export interface RuptureDataset {
  articles: Map<string, Article>
  nomenclatures: Map<string, Nomenclature>
  /** Stock net strict par article (PHYSTO − PHYALL − GLOALL, hors CQ) — règle 4. */
  stockNet: Map<string, number>
  /** Σ qteRestante des OF par article PRODUIT — couverture des composants fabriqués. */
  ofSupply?: Map<string, number>
  /** Allocations ERP par OF : Map<numOf, Map<article, qteAllouee>> — règle 3. */
  allocationsByOf?: Map<string, Map<string, number>>
}

export type RuptureMode = 'photo' | 'contention'

export interface MissingComponent {
  article: string
  /** Besoin net vérifié (après crédit allocation et part fantôme pré-couverte). */
  needed: number
  /** Dispo au moment du verdict (≥ 0). */
  available: number
  shortage: number
  /** Sous-ensemble fabriqué (à lancer) vs feuille achetée (à acheter). */
  fabricated: boolean
}

/** Source des besoins retenue pour un OF (règle 1). */
export type RequirementSource = 'MFGMAT' | 'NOMENCLATURE' | 'AUCUNE'

export interface RuptureVerdict {
  numOf: string
  article: string
  statutNum: number
  dateBesoin: Date | null
  source: RequirementSource
  /**
   * Ferme → true même en manque (on peut affermir malgré rupture, règle 3) ; le manque
   * résiduel reste visible dans `missing`/`missingDetail`.
   */
  feasible: boolean
  /**
   * Manquants à plat : feuilles achetées ET sous-ensembles fabriqués non couverts (un
   * sous-ensemble en manque apparaît lui-même + ses feuilles descendues). Filtrer par
   * `missingDetail[].fabricated` pour n'afficher qu'une famille.
   */
  missing: Record<string, number>
  missingDetail: MissingComponent[]
  /** Consommations virtuelles par article — mode contention uniquement. */
  consumed: Record<string, number>
}

/** Σ qteRestante par article produit — helper pour construire `ofSupply` depuis le pool. */
export function buildOfSupply(
  ofs: Array<Pick<RuptureOfInput, 'article' | 'qteRestante'>>,
): Map<string, number> {
  const supply = new Map<string, number>()
  for (const of of ofs) {
    if (of.qteRestante > 0) supply.set(of.article, (supply.get(of.article) ?? 0) + of.qteRestante)
  }
  return supply
}

function isSubcontracted(article: Article | undefined): boolean {
  return article?.category?.toUpperCase().startsWith('ST') ?? false
}

function isPhantom(article: Article | undefined): boolean {
  return article ? isPhantomCategory(article) : false
}

/** Stock virtuel à deux poches : stock net (règle 4) + production OF (fabriqués seulement). */
class VirtualStock {
  private stock: Map<string, number>
  private supply: Map<string, number>

  constructor(stockNet: Map<string, number>, ofSupply?: Map<string, number>) {
    this.stock = new Map(stockNet)
    this.supply = new Map(ofSupply ?? [])
  }

  /** Dispo ≥ 0 pour le verdict : stock net, + production OF si composant fabriqué. */
  availFor(article: string, fabricated: boolean): number {
    const stock = Math.max(0, this.stock.get(article) ?? 0)
    if (!fabricated) return stock
    return stock + Math.max(0, this.supply.get(article) ?? 0)
  }

  /** Consomme jusqu'à `qty` (stock d'abord, puis production OF si fabriqué). Rend le pris. */
  take(article: string, qty: number, fabricated: boolean): number {
    if (qty <= 0) return 0
    let taken = 0
    const stock = Math.max(0, this.stock.get(article) ?? 0)
    const fromStock = Math.min(qty, stock)
    if (fromStock > 0) {
      this.stock.set(article, (this.stock.get(article) ?? 0) - fromStock)
      taken += fromStock
    }
    if (fabricated && taken < qty) {
      const supply = Math.max(0, this.supply.get(article) ?? 0)
      const fromSupply = Math.min(qty - taken, supply)
      if (fromSupply > 0) {
        this.supply.set(article, supply - fromSupply)
        taken += fromSupply
      }
    }
    return taken
  }
}

/** Besoin net agrégé par article après résolution (fantômes + allocations). */
interface ResolvedRequirement {
  /** Part à VÉRIFIER contre la dispo. */
  checkNeed: number
  /** Part pré-couverte par le stock du fantôme lui-même (à consommer, jamais en manque). */
  coveredNeed: number
  fabricated: boolean
}

export function evaluateRuptures(
  ofs: RuptureOfInput[],
  dataset: RuptureDataset,
  mode: RuptureMode,
): Map<string, RuptureVerdict> {
  const verdicts = new Map<string, RuptureVerdict>()
  const vstock = new VirtualStock(dataset.stockNet, dataset.ofSupply)

  const ordered =
    mode === 'contention'
      ? [...ofs].sort((a, b) => {
          const ta = a.dateBesoin?.getTime() ?? Number.POSITIVE_INFINITY
          const tb = b.dateBesoin?.getTime() ?? Number.POSITIVE_INFINITY
          if (ta !== tb) return ta - tb
          if (a.statutNum !== b.statutNum) return a.statutNum - b.statutNum
          return a.numOf.localeCompare(b.numOf)
        })
      : ofs

  for (const of of ordered) {
    verdicts.set(of.numOf, checkOne(of, dataset, vstock, mode === 'contention'))
  }
  return verdicts
}

function checkOne(
  of: RuptureOfInput,
  dataset: RuptureDataset,
  vstock: VirtualStock,
  consume: boolean,
): RuptureVerdict {
  const requirements = new Map<string, ResolvedRequirement>()
  let source: RequirementSource = 'AUCUNE'

  if (of.materials && of.materials.length > 0) {
    source = 'MFGMAT'
    resolveMfgmat(of.materials, dataset, requirements)
  } else if ((dataset.nomenclatures.get(of.article)?.components.length ?? 0) > 0) {
    source = 'NOMENCLATURE'
    const allocations = new Map(dataset.allocationsByOf?.get(of.numOf) ?? [])
    resolveBom(of.article, of.qteRestante, allocations, dataset, vstock, requirements, 0, new Set([of.article]))
  }

  const missing: Record<string, number> = {}
  const missingDetail: MissingComponent[] = []

  for (const [article, req] of requirements) {
    if (req.checkNeed <= 0) continue
    const available = vstock.availFor(article, req.fabricated)
    const shortage = Math.max(0, req.checkNeed - available)
    if (shortage <= 0) continue

    missing[article] = (missing[article] ?? 0) + shortage
    missingDetail.push({ article, needed: req.checkNeed, available, shortage, fabricated: req.fabricated })

    // Sous-ensemble fabriqué non couvert : descendre SA nomenclature pour le manque
    // seulement, afin d'exposer les feuilles achetées réellement manquantes.
    if (req.fabricated) {
      descendFabricatedShortage(article, shortage, dataset, vstock, missing, missingDetail, 1, new Set([of.article, article]))
    }
  }

  const blocked = missingDetail.length > 0
  const firm = isFirm(of.statutNum)
  const consumed: Record<string, number> = {}

  // Consommation virtuelle (contention) : un OF qui VA tourner (ferme, ou non ferme
  // faisable) réserve ses besoins, plafonnés au disponible. Un non-ferme en rupture ne
  // consomme rien.
  if (consume && (firm || !blocked)) {
    for (const [article, req] of requirements) {
      const taken = vstock.take(article, req.checkNeed + req.coveredNeed, req.fabricated)
      if (taken > 0) consumed[article] = taken
    }
  }

  return {
    numOf: of.numOf,
    article: of.article,
    statutNum: of.statutNum,
    dateBesoin: of.dateBesoin,
    source,
    feasible: firm || !blocked,
    missing,
    missingDetail,
    consumed,
  }
}

/**
 * Besoins depuis les matières réelles MFGMAT (règle 1) : plat, crédit ALLQTY par ligne
 * (règle 3 — l'allocation STOALL est la même donnée, ne PAS la re-créditer par-dessus).
 */
function resolveMfgmat(
  materials: MfgMaterialInput[],
  dataset: RuptureDataset,
  out: Map<string, ResolvedRequirement>,
): void {
  for (const m of materials) {
    const net = Math.max(0, m.remaining - m.allocated)
    if (net <= 0) continue
    addRequirement(out, m.article, net, 0, isFabricatedArticle(m.article, dataset))
  }
}

/**
 * Besoins depuis la nomenclature théorique (repli, règle 1), avec :
 *  - crédit d'allocation ERP partiel par composant direct (règle 3) ;
 *  - fantômes AFANT : stock net crédité d'abord, descente pour le reliquat (règle 2).
 */
function resolveBom(
  article: string,
  quantity: number,
  allocations: Map<string, number>,
  dataset: RuptureDataset,
  vstock: VirtualStock,
  out: Map<string, ResolvedRequirement>,
  phantomDepth: number,
  visited: Set<string>,
): void {
  const bom = dataset.nomenclatures.get(article)
  if (!bom) return

  for (const entry of bom.components) {
    const component = entry.componentArticle
    if (visited.has(component)) continue

    const needed = requiredQuantity(entry, quantity)

    // Règle 3 : crédit d'allocation partiel, consommé une seule fois entre lignes dupliquées.
    const allocCredit = Math.min(needed, allocations.get(component) ?? 0)
    if (allocCredit > 0) allocations.set(component, (allocations.get(component) ?? 0) - allocCredit)
    const net = needed - allocCredit
    if (net <= 0) continue

    const info = dataset.articles.get(component)

    // Règle 2 : fantôme = stock d'abord, descente du reliquat dans SA nomenclature.
    if (
      isPhantom(info) &&
      (dataset.nomenclatures.get(component)?.components.length ?? 0) > 0 &&
      phantomDepth < PHANTOM_DEPTH_CAP
    ) {
      const availPhantom = vstock.availFor(component, false)
      const fromStock = Math.min(net, availPhantom)
      if (fromStock > 0) addRequirement(out, component, 0, fromStock, false)
      if (net - fromStock > 0) {
        resolveBom(component, net - fromStock, allocations, dataset, vstock, out, phantomDepth + 1, new Set(visited).add(component))
      }
      continue
    }

    const fabricated = entry.componentType === 'FABRIQUE' && !isSubcontracted(info) && !isPhantom(info)
    addRequirement(out, component, net, 0, fabricated)
  }
}

/**
 * Descente d'un sous-ensemble fabriqué en manque : expose les feuilles achetées manquantes
 * pour le reliquat non couvert. Verdict seulement — ne consomme jamais (le sous-ensemble
 * n'existe pas, ses composants ne sont pas réservés par cet OF).
 */
function descendFabricatedShortage(
  article: string,
  shortage: number,
  dataset: RuptureDataset,
  vstock: VirtualStock,
  missing: Record<string, number>,
  missingDetail: MissingComponent[],
  depth: number,
  visited: Set<string>,
): void {
  if (depth > FABRICATED_DESCENT_CAP) return
  const subRequirements = new Map<string, ResolvedRequirement>()
  resolveBom(article, shortage, new Map(), dataset, vstock, subRequirements, 0, visited)

  for (const [component, req] of subRequirements) {
    if (req.checkNeed <= 0) continue
    const available = vstock.availFor(component, req.fabricated)
    const componentShortage = Math.max(0, req.checkNeed - available)
    if (componentShortage <= 0) continue

    missing[component] = (missing[component] ?? 0) + componentShortage
    missingDetail.push({
      article: component,
      needed: req.checkNeed,
      available,
      shortage: componentShortage,
      fabricated: req.fabricated,
    })
    if (req.fabricated && !visited.has(component)) {
      descendFabricatedShortage(component, componentShortage, dataset, vstock, missing, missingDetail, depth + 1, new Set(visited).add(component))
    }
  }
}

function addRequirement(
  out: Map<string, ResolvedRequirement>,
  article: string,
  checkNeed: number,
  coveredNeed: number,
  fabricated: boolean,
): void {
  const existing = out.get(article)
  if (existing) {
    existing.checkNeed += checkNeed
    existing.coveredNeed += coveredNeed
    existing.fabricated = existing.fabricated || fabricated
  } else {
    out.set(article, { checkNeed, coveredNeed, fabricated })
  }
}

/** Un article est « fabriqué » s'il a une nomenclature et n'est ni sous-traité ni fantôme. */
function isFabricatedArticle(article: string, dataset: RuptureDataset): boolean {
  const info = dataset.articles.get(article)
  if (isSubcontracted(info) || isPhantom(info)) return false
  return (dataset.nomenclatures.get(article)?.components.length ?? 0) > 0
}

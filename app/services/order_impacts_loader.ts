/**
 * Chargement + orchestration de la faisabilité par commande/OF (source de vérité unique).
 *
 * Extrait du corps de `PlanningBoardController.boardFeasibility` afin d'être PARTAGÉ entre :
 *  - le board (badges de faisabilité, `POST /board-feasibility`),
 *  - le tableau de suivi des ruptures (issue #15, `GET /shortages`).
 *
 * Le pipeline est volontairement IDENTIQUE à celui du board (issue #11) : faisabilité par OF
 * basée sur les matières réelles MFGMAT, stock strict/qc uniquement, expansion BOM récursive.
 * Toute modification ici impacte les badges du board — à préserver à l'identique.
 */

import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { evaluateOrderImpacts, type OrderImpactResult } from '#app/domain/order-impacts'
import { evaluateMfgFeasibility, buildStrictQcStock } from '#app/domain/of-feasibility'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import { X3OrderLineRepository, type OfCommandePeg } from '#repositories/order_line_repository'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'

export interface LoadOrderImpactsOptions {
  from: Date
  to: Date
  /** Filtre poste de charge (sous-chaîne, comparée en minuscules sur le code workstation). */
  workstation?: string
  mode?: 'immediate' | 'sequential'
  force?: boolean
}

export interface OrderImpactsContext {
  result: OrderImpactResult
  /** Catalogue article (PF + composants), avec descriptions issues de la BOM. */
  articles: Map<string, Article>
  nomenclatures: Map<string, Nomenclature>
  /** Reverse peg OF → commande (contremarque), pour les OF dont la commande sort de la fenêtre. */
  ofPegs: Map<string, OfCommandePeg>
}

/**
 * Charge les données X3 (cachées via boardDataset), calcule la faisabilité MFGMAT par OF et
 * croise avec les commandes clientes via `evaluateOrderImpacts`.
 *
 * `from`/`to` doivent être déjà bornées (from à minuit, to à 23:59:59) par l'appelant.
 */
export async function loadOrderImpacts(opts: LoadOrderImpactsOptions): Promise<OrderImpactsContext> {
  const { from: windowFrom, to: windowTo, workstation: workstationFilter, mode, force = false } = opts

  // ISO sur les composantes LOCALES (pas toISOString, qui repasse en UTC et recule d'un jour
  // en fuseau UTC+1/+2 quand l'heure locale est minuit → scoping getLive décalé).
  const isoLocal = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  }
  const fromIso = isoLocal(windowFrom)
  const toIso = isoLocal(windowTo)

  // Données via le loader : OF (supply) + référentiel cachés, demande/réception
  // scopées à l'horizon, stock scopé aux articles concernés.
  const [{ supply: ofFlows }, { demand: demandFlows, reception: receptionFlows, suggestion: suggestionFlows }, { gamme }, nomenclatureEntries, articlesList] =
    await Promise.all([
      boardDataset.getOrders(force),
      boardDataset.getLive(fromIso, toIso, force),
      boardDataset.getReferential(force),
      boardDataset.getNomenclature(force),
      boardDataset.getArticles(),
    ])

  const overrides = await new OverrideStore().getAll()

  // OF affermis/planifiés (MFGHEAD) + suggestions CBN (WOS), tous scopés à l'horizon.
  // Les suggestions couvrent les commandes MTO/NOR non encore affermies — sans elles, ces
  // commandes n'ont aucun supply à matcher. Statut « suggéré » → priorité basse dans le matcher.
  const filteredOfFlows = [...ofFlows, ...suggestionFlows].filter((f) => {
    if (!f.date) return true
    return f.date >= windowFrom && f.date <= windowTo
  })

  // Filtrer par workstation si demandé (gammes du référentiel caché)
  let finalOfFlows = filteredOfFlows
  if (workstationFilter) {
    const wstByArticle = new Map<string, string>()
    for (const g of gamme) {
      if (g.workstation && g.article) wstByArticle.set(g.article, g.workstation)
    }
    finalOfFlows = filteredOfFlows.filter((f) => {
      const wst = wstByArticle.get(f.article) ?? ''
      return wst.toLowerCase().includes(workstationFilter)
    })
  }

  // Demandes déjà scopées par X3 ; re-filtre défensif sur l'horizon exact.
  const filteredDemands = demandFlows.filter((f) => {
    if (!f.date) return false
    return f.date >= windowFrom && f.date <= windowTo
  })

  // Stock vivant, scopé aux articles de la fenêtre + composants BOM ACHAT (tous niveaux).
  const articleSet = new Set<string>()
  for (const f of finalOfFlows) if (f.article) articleSet.add(f.article)
  for (const f of filteredDemands) if (f.article) articleSet.add(f.article)
  for (const f of receptionFlows) if (f.article) articleSet.add(f.article)

  // Matières RÉELLES des OF (MFGMAT) — source de vérité de la faisabilité, partagée
  // avec le détail OF (issue #11). Chargées en batch pour tous les OF de la fenêtre.
  const windowNumOfs = finalOfFlows
    .map((f) => (f.origin as { id?: string }).id?.trim() ?? '')
    .filter(Boolean)
  // Reverse peg OF → commande (contremarque), pour rattacher les OF dont la commande
  // expédie hors fenêtre (le matcher ne voit que les demandes échéant dans la fenêtre).
  const ofPegs = await new X3OrderLineRepository().getCommandesByOf(windowNumOfs)
  const mfgByOf = await new X3MfgmatRepository().getMaterialsForOfs(windowNumOfs)
  // Les composants MFGMAT peuvent différer de la BOM théorique → s'assurer que leur
  // stock est bien chargé.
  for (const materials of mfgByOf.values()) {
    for (const m of materials) if (m.article) articleSet.add(m.article)
  }

  // Expand récursivement à TOUS les composants (ACHETE + FABRIQUE) de tous les niveaux BOM.
  // Sans ça, checkFeasibility descend dans un sous-ensemble fabriqué sans OF et trouve 0 stock
  // pour ses composants ACHETE car ils n'ont pas été chargés.
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
  // Périmètre stock aligné sur le détail OF (issue #11) : seul le stock strict/qc
  // est consommable. Le stock 'rejected' (rebut) ne doit jamais compter comme dispo,
  // sinon le badge sur-évalue la faisabilité vs le panneau de détail.
  const rawStockFlows = await boardDataset.getStock([...articleSet])
  const stockFlows = rawStockFlows.filter((f) => {
    if (f.origin.type !== 'stock') return true
    const sub = (f.origin as { subType?: string }).subType
    return sub === 'strict' || sub === 'qc'
  })

  const allSupply = [...finalOfFlows, ...stockFlows, ...receptionFlows]

  const nomenclatures = new Map<string, Nomenclature>()
  for (const entry of nomenclatureEntries) {
    const existing = nomenclatures.get(entry.parentArticle)
    if (existing) {
      existing.components.push(entry)
    } else {
      nomenclatures.set(entry.parentArticle, {
        article: entry.parentArticle,
        description: entry.parentDescription,
        components: [entry],
      })
    }
  }

  const articles = new Map<string, Article>(articlesList.map((a) => [a.code, a]))
  for (const entry of nomenclatureEntries) {
    if (!articles.has(entry.parentArticle)) {
      articles.set(entry.parentArticle, {
        code: entry.parentArticle,
        description: entry.parentDescription,
        category: '',
        supplyType: 'FABRICATION',
        reorderDelay: 0,
        productFamily: null,
        pmp: null,
        economicLot: null,
        unitStock: null,
        unitPurchase: null,
        purchaseToStockRatio: 1,
        packagings: [],
      })
    }
    if (!articles.has(entry.componentArticle)) {
      articles.set(entry.componentArticle, {
        code: entry.componentArticle,
        description: entry.componentDescription,
        category: '',
        supplyType: entry.componentType === 'ACHETE' ? 'ACHAT' : 'FABRICATION',
        reorderDelay: 0,
        productFamily: null,
        pmp: null,
        economicLot: null,
        unitStock: null,
        unitPurchase: null,
        purchaseToStockRatio: 1,
        packagings: [],
      })
    }
  }

  const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

  // Faisabilité par OF basée sur MFGMAT (matières réelles) — MÊME calcul que le détail.
  // Surcharge le verdict théorique du moteur pour les OF qui ont des matières MFGMAT,
  // garantissant badge == détail (issue #11). Les OF sans MFGMAT (suggérés non éclatés)
  // conservent le calcul BOM théorique partagé du moteur.
  const stockByArticle = buildStrictQcStock(stockFlows)
  const mfgFeasibility = new Map<string, { feasible: boolean | null; missingComponents: Record<string, number> }>()
  for (const f of finalOfFlows) {
    const numOf = (f.origin as { id?: string }).id?.trim() ?? ''
    if (!numOf) continue
    const materials = mfgByOf.get(numOf)
    if (!materials || materials.length === 0) continue
    const status = overrideMap.get(numOf)?.status ?? (f.origin as { status?: number }).status ?? 3
    const verdict = evaluateMfgFeasibility(materials, stockByArticle, status === 1)
    mfgFeasibility.set(numOf, { feasible: verdict.feasible, missingComponents: verdict.missingComponents })
  }

  const result = evaluateOrderImpacts(
    filteredDemands, allSupply, nomenclatures, articles, overrideMap,
    { from: windowFrom, to: windowTo },
    mode,
    mfgFeasibility,
  )

  return { result, articles, nomenclatures, ofPegs }
}

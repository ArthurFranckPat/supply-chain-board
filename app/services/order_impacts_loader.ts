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
import { timeStage } from '#services/perf_metrics'
import { OverrideStore } from '#services/override_store'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import {
  evaluateOrderImpacts,
  netDemandsByAllocation,
  type OrderImpactResult,
} from '#app/domain/order-impacts'
import { computeAvancement } from '#app/domain/of-avancement'
import { X3OperationRepository } from '#repositories/operation_repository'
import { buildStrictQcStock } from '#app/domain/of-feasibility'
import {
  remapDemandDates,
  expandArticleSetWithBom,
  buildArticleCatalog,
  precomputeMfgFeasibility,
} from '#app/domain/order-impacts-assembly'
import type { OfCommandePeg } from '#repositories/order_line_repository'
import type { OfOverrideRow } from '#app/domain/planning_board'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { Flow } from '#app/domain/models/flow'

/**
 * Déclare QUI appelle `loadOrderImpacts`, pas la mécanique (issue #48 — OCP). Résolu en
 * interne vers les options mécaniques (useWindowOfs/preferEngineFeasibility) par
 * PIPELINE_MECHANICS ci-dessous.
 *
 * 'board-badges' et 'ruptures' partagent aujourd'hui la même mécanique (STRDAT + verdict
 * MFGMAT) mais restent des points de divergence futurs distincts — ne pas les fusionner
 * en un seul nom par souci de brièveté : ce sont deux features, pas un flag.
 */
export type OrderImpactsPipeline = 'programme' | 'board-badges' | 'ruptures' | 'proactive'

interface PipelineMechanics {
  /**
   * OFs via getOrdersForWindow (STRDAT, ~25× moins de lignes) + demande via
   * getDemandAndReception (WIPTYP=1+2, ~2-3× moins) au lieu de getLive (WIPTYP=1+2+5).
   * Filtre ENDDAT sauté : OFs déjà scopés par STRDAT dans la fenêtre board.
   */
  useWindowOfs: boolean
  /**
   * Si vrai, ignore le verdict MFGMAT précalculé (snapshot plat, sans consommation) au profit
   * du verdict du moteur séquentiel — sinon la consommation virtuelle des composants partagés
   * (achat ET sous-ensembles) entre OFs resterait invisible : l'override MFGMAT écraserait le
   * verdict séquentiel pour tout OF ayant des matières réelles.
   */
  preferEngineFeasibility: boolean
}

const PIPELINE_MECHANICS: Record<OrderImpactsPipeline, PipelineMechanics> = {
  'programme': { useWindowOfs: true, preferEngineFeasibility: true },
  'board-badges': { useWindowOfs: true, preferEngineFeasibility: false },
  'ruptures': { useWindowOfs: true, preferEngineFeasibility: false },
  'proactive': { useWindowOfs: false, preferEngineFeasibility: true },
}

export interface LoadOrderImpactsOptions {
  from: Date
  to: Date
  /** Filtre poste de charge (sous-chaîne, comparée en minuscules sur le code workstation). */
  workstation?: string
  mode?: 'immediate' | 'sequential'
  force?: boolean
  /** Qui appelle — pas de défaut, choix forcé à la frontière (cf. #51). */
  pipeline: OrderImpactsPipeline
}

export interface OrderImpactsContext {
  result: OrderImpactResult
  /** Catalogue article (PF + composants), avec descriptions issues de la BOM. */
  articles: Map<string, Article>
  nomenclatures: Map<string, Nomenclature>
  /** Reverse peg OF → commande (contremarque), pour les OF dont la commande sort de la fenêtre. */
  ofPegs: Map<string, OfCommandePeg>
  /** Réceptions d'achat de la fenêtre (déjà fetchées par getLive — évite un SOAP dupliqué). */
  receptionFlows: Flow[]
  /**
   * Entrées brutes du moteur (demandes nettées, supply combinée, overrides), telles
   * qu'injectées dans `evaluateOrderImpacts`. Exposées pour le diff de scénario
   * (issue #57) : `evaluatePlanDiff` réévalue le plan muté sur ces mêmes entrées.
   */
  planInputs: { demands: Flow[]; supplyFlows: Flow[]; overrides: Map<string, OfOverrideRow> }
}

/**
 * Charge les données X3 (cachées via boardDataset), calcule la faisabilité MFGMAT par OF et
 * croise avec les commandes clientes via `evaluateOrderImpacts`.
 *
 * `from`/`to` doivent être déjà bornées (from à minuit, to à 23:59:59) par l'appelant.
 */
export async function loadOrderImpacts(
  opts: LoadOrderImpactsOptions
): Promise<OrderImpactsContext> {
  const {
    from: windowFrom,
    to: windowTo,
    workstation: workstationFilter,
    mode,
    force = false,
    pipeline,
  } = opts
  const { useWindowOfs, preferEngineFeasibility } = PIPELINE_MECHANICS[pipeline]

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
  // useWindowOfs=true (/programme) : OFs via STRDAT (fenêtre courte, ~25× moins de lignes) +
  // demande/réceptions sans OFs (WIPTYP=1+2). getOrdersForWindow coalescé avec loadBoardData.
  const [rawLive, { gamme }, nomenclatureEntries, articlesList] = await timeStage(
    'loadOrderImpacts.datasets',
    () =>
      Promise.all([
        useWindowOfs
          ? Promise.all([
              boardDataset.getOrdersForWindow(windowFrom, windowTo, force),
              boardDataset.getDemandAndReception(fromIso, toIso, force),
            ]).then(([ordWindow, demandRecep]) => ({
              demand: demandRecep.demand,
              reception: demandRecep.reception,
              supply: ordWindow.supply,
            }))
          : boardDataset.getLive(fromIso, toIso, force),
        boardDataset.getReferential(force),
        boardDataset.getNomenclature(force),
        boardDataset.getArticles(),
      ])
  )
  const demandFlows = rawLive.demand
  const receptionFlows = rawLive.reception ?? []
  const ofFlows = rawLive.supply ?? []

  const overrides = await new OverrideStore().getAll()

  // OF affermis/planifiés (MFGHEAD) + suggestions CBN (WOS), tous scopés à l'horizon.
  // Les suggestions couvrent les commandes MTO/NOR non encore affermies — sans elles, ces
  // commandes n'ont aucun supply à matcher. Statut « suggéré » → priorité basse dans le matcher.
  // ofFlows contient déjà les suggestions (statut 3) depuis ORDERS (#32).
  // useWindowOfs : OFs déjà scopés par STRDAT → filtre ENDDAT inutile et contre-productif.
  const filteredOfFlows = useWindowOfs
    ? ofFlows
    : ofFlows.filter((f) => {
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

  // Overrides de date de commande (issue #10 /planification, désormais partagés) :
  // une ligne re-datée à la main décale sa demande → repositionne la commande
  // partout (vision DnD, ruptures). Clé composite numCommande#ligne.
  const lineDateOverrides = await new OrderLineOverrideStore().getMap()
  const remappedDemands = remapDemandDates(demandFlows, lineDateOverrides)

  // Demandes déjà scopées par X3 ; re-filtre défensif sur l'horizon exact (après
  // remap : une commande re-datée peut entrer/sortir de la fenêtre).
  let filteredDemands = remappedDemands.filter((f) => {
    if (!f.date) return false
    return f.date >= windowFrom && f.date <= windowTo
  })

  // Nettage demande − allocation ERP propre (origin.qteAllouee), TOUTES vues : la quantité
  // à RÉALISER = reste à livrer − déjà alloué. Historique : d'abord gated au proactif
  // (commit 4005f7e, ex. 11033025/AR2602608), généralisé après validation X3 du faux positif
  // /ruptures (AR2602595/AEA833XX allouée à 100 % matchée sur une suggestion d'août).
  // Une commande entièrement allouée disparaît de la demande (rien à produire).
  filteredDemands = netDemandsByAllocation(filteredDemands)

  // Stock vivant, scopé aux articles de la fenêtre + composants BOM ACHAT (tous niveaux).
  const articleSet = new Set<string>()
  for (const f of finalOfFlows) if (f.article) articleSet.add(f.article)
  for (const f of filteredDemands) if (f.article) articleSet.add(f.article)
  for (const f of receptionFlows) if (f.article) articleSet.add(f.article)

  const windowNumOfs = finalOfFlows
    .map((f) => (f.origin as { id?: string }).id?.trim() ?? '')
    .filter(Boolean)

  // Peg (SORDERQ) : non utilisé par proactiveRows (destructuré mais pas consommé) → sauté hors
  // board/ruptures. MFGMAT en revanche est chargé pour TOUTES les vues (issue conso séquentielle
  // ignorant l'alloc réelle d'un OF ferme) : le moteur en a besoin pour créditer l'ALLQTY déjà
  // posée sur un OF avant de le confronter à la contention théorique (règle 1, rupture-engine.ts).
  let ofPegs = new Map<string, OfCommandePeg>()
  let mfgByOf: Map<string, import('#repositories/mfgmat_repository').OfMaterial[]>

  if (!preferEngineFeasibility) {
    const [pegs, mfg] = await timeStage('loadOrderImpacts.pegs+mfg', () =>
      Promise.all([
        boardDataset.getOfPegs(windowNumOfs),
        boardDataset.getMfgMaterials(windowNumOfs),
      ])
    )
    ofPegs = pegs
    mfgByOf = mfg
  } else {
    mfgByOf = await timeStage('loadOrderImpacts.mfg', () =>
      boardDataset.getMfgMaterials(windowNumOfs)
    )
  }
  for (const materials of mfgByOf.values()) {
    for (const m of materials) if (m.article) articleSet.add(m.article)
  }

  // Expand récursivement à TOUS les composants (ACHETE + FABRIQUE) de tous les niveaux BOM.
  // Sans ça, le moteur unique descend dans un sous-ensemble fabriqué sans OF et trouve 0 stock
  // pour ses composants ACHETE car ils n'ont pas été chargés.
  const expandedArticleSet = expandArticleSetWithBom(articleSet, nomenclatureEntries)
  // Périmètre stock aligné sur le détail OF (issue #11) : seul le stock strict/qc
  // est consommable. Le stock 'rejected' (rebut) ne doit jamais compter comme dispo,
  // sinon le badge sur-évalue la faisabilité vs le panneau de détail.
  const rawStockFlows = await timeStage('loadOrderImpacts.stock', () =>
    boardDataset.getStock([...expandedArticleSet])
  )
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

  const articles = buildArticleCatalog(articlesList, nomenclatureEntries)

  const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

  // Faisabilité par OF basée sur MFGMAT (matières réelles) — MÊME calcul que le détail.
  // Surcharge le verdict théorique du moteur pour les OF qui ont des matières MFGMAT,
  // garantissant badge == détail (issue #11). Les OF sans MFGMAT (suggérés non éclatés)
  // conservent le calcul BOM théorique partagé du moteur.
  //
  // Vue proactive (preferEngineFeasibility) : on SAUTE cet override — le verdict MFGMAT est un
  // snapshot plat sans consommation virtuelle ; il écraserait le moteur séquentiel et masquerait
  // la contention des composants partagés entre OFs. Le moteur (consommation séquentielle tous
  // composants) devient seul juge.
  const stockByArticle = buildStrictQcStock(stockFlows)
  const mfgFeasibility = preferEngineFeasibility
    ? undefined
    : precomputeMfgFeasibility(finalOfFlows, mfgByOf, stockByArticle, overrideMap)

  // Avancement des OFs via pointages MFGOPE (issue #41) : détermine si chaque OF
  // est réellement débuté en atelier (opérations intermédiaires pointées).
  const operations = await timeStage('loadOrderImpacts.operations', () =>
    new X3OperationRepository().getOperations(windowNumOfs)
  )
  const avancementByOf = computeAvancement(operations)

  const result = evaluateOrderImpacts(
    filteredDemands,
    allSupply,
    nomenclatures,
    articles,
    overrideMap,
    { from: windowFrom, to: windowTo },
    mode,
    mfgFeasibility,
    avancementByOf,
    undefined,
    mfgByOf
  )

  return {
    result,
    articles,
    nomenclatures,
    ofPegs,
    receptionFlows,
    planInputs: { demands: filteredDemands, supplyFlows: allSupply, overrides: overrideMap },
  }
}

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
} from '#app/domain/order_impacts'
import { computeAvancement, estOfFantome, resteAProduire } from '#app/domain/of_avancement'
import { buildStrictQcStock } from '#app/domain/of_feasibility'
import { fabricationDaysFromHours, DEFAULT_HOURS_PER_DAY } from '#app/domain/shortages'
import {
  remapDemandDates,
  expandArticleSetWithBom,
  buildArticleCatalog,
  precomputeMfgFeasibility,
} from '#app/domain/order_impacts_assembly'
import type { OfCommandePeg } from '#repositories/order_line_repository'
import type { OfOverrideRow } from '#app/domain/planning_board'
import type { ArticleRouting, OfCharge, PlanDiffEngineInputs } from '#app/domain/plan_diff'
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

/**
 * OF écarté de l'offre parce que sa gamme est pointée à 100 % alors qu'ORDERS annonce encore
 * un reste (cf. `estOfFantome`). Remonté pour être SIGNALÉ : « OF à solder », action de
 * gestion — et non simplement retranché en silence.
 */
export interface PhantomOf {
  numOf: string
  article: string
  /** Reste à produire annoncé par ORDERS (RMNEXTQTY) — la quantité fictive. */
  qteRestante: number
  /** Pointage constaté à l'opération la plus avancée, et qté prévue sur cette opération. */
  qtyRealisee: number
  qtyPrevueOp: number
}

export interface OrderImpactsContext {
  result: OrderImpactResult
  /** OF fantômes écartés de l'offre (gamme soldée, reste ORDERS non nul). */
  phantomOfs: PhantomOf[]
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
  /** Charge réelle gamme par OF (heures brutes, arrondies au dixième) — cf calcul de retard. */
  fabricationHoursByOf: Map<string, number>
  /**
   * Entrées moteur telles qu'injectées dans `evaluateOrderImpacts` ci-dessous. Le diff de
   * scénario (#57) les rejoue à l'identique sur le plan muté : sans elles, il évaluerait
   * le plan muté au BOM théorique et à 1 jour de fabrication par OF, et son « avant » ne
   * correspondrait plus au board affiché.
   */
  engine: PlanDiffEngineInputs
  /**
   * Charge par OF (poste gamme + heures + date de fin) — alimente l'axe charge du diff
   * de scénario. Sans ça l'axe restait structurellement vide.
   */
  ofCharges: OfCharge[]
  /**
   * Gamme condensée par article (poste + heures/unité) — alimente la réaction d'offre
   * virtuelle du diff de scénario (#58) : sans elle, un OF virtuel n'a ni poste ni charge.
   */
  routingByArticle: Map<string, ArticleRouting>
  /** Instant où les données du plan ont été assemblées (« sur données du … »). */
  dataAt: Date
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
  // Delta matching (#99) : OFs démarrés avant la fenêtre qui servent encore une demande de
  // la fenêtre. Uniquement pour les pipelines scopés STRDAT — `getLive` borne déjà sur ENDDAT.
  const [rawLive, { gamme }, nomenclatureEntries, articlesList, matchingOnlyOfFlows] =
    await timeStage('loadOrderImpacts.datasets', () =>
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
        useWindowOfs
          ? boardDataset
              .getOrdersForMatchingDelta(windowFrom, windowTo, force)
              // Delta non bloquant : sans lui on retombe sur le comportement d'avant #99
              // (matching dégradé), pas sur une page en erreur.
              .catch(() => [] as Flow[])
          : Promise.resolve([] as Flow[]),
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

  // Poste de charge par article (gammes du référentiel caché) — sert au filtre workstation
  // ET à l'axe charge du diff de scénario, qui a besoin du poste de chaque OF.
  const wstByArticle = new Map<string, string>()
  for (const g of gamme) {
    if (g.workstation && g.article) wstByArticle.set(g.article, g.workstation)
  }

  // Filtrer par workstation si demandé
  const matchesWorkstation = (f: Flow) => {
    if (!workstationFilter) return true
    const wst = wstByArticle.get(f.article) ?? ''
    return wst.toLowerCase().includes(workstationFilter)
  }
  // `let` : ces deux pools sont encore purgés de leurs OF fantômes plus bas, une fois MFGOPE lu.
  let finalOfFlows = workstationFilter
    ? filteredOfFlows.filter(matchesWorkstation)
    : filteredOfFlows
  // Même filtre sur le delta matching : un OF hors périmètre du poste ne doit pas consommer
  // la demande affichée quand la vue est restreinte à un poste.
  let matchingOnlySupply = workstationFilter
    ? matchingOnlyOfFlows.filter(matchesWorkstation)
    : matchingOnlyOfFlows

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

  const numOfDe = (f: Flow) => (f.origin as { id?: string }).id?.trim() ?? ''
  const windowNumOfs = finalOfFlows.map(numOfDe).filter(Boolean)
  // Le delta matching entre dans le fetch MFGOPE : sans ses pointages, un OF fantôme du delta
  // (cas `F126-44429`) resterait indétectable — or c'est précisément là qu'ils se cachent, les
  // OF lancés il y a des mois et jamais soldés.
  const operationNumOfs = [...windowNumOfs, ...matchingOnlySupply.map(numOfDe).filter(Boolean)]

  // Peg (SORDERQ) : non utilisé par proactiveRows (destructuré mais pas consommé) → sauté hors
  // board/ruptures. MFGMAT en revanche est chargé pour TOUTES les vues (issue conso séquentielle
  // ignorant l'alloc réelle d'un OF ferme) : le moteur en a besoin pour créditer l'ALLQTY déjà
  // posée sur un OF avant de le confronter à la contention théorique (règle 1, rupture-engine.ts).
  let ofPegs = new Map<string, OfCommandePeg>()
  let mfgByOf: Map<string, import('#repositories/mfgmat_repository').OfMaterial[]>

  // Avancement (MFGOPE) remonté ICI et plus après le calcul de faisabilité : il sert à écarter
  // les OF fantômes de l'offre AVANT que quoi que ce soit ne s'appuie dessus.
  let operations: import('#repositories/operation_repository').OperationRecord[]

  if (!preferEngineFeasibility) {
    const [pegs, mfg, ops] = await timeStage('loadOrderImpacts.pegs+mfg+ope', () =>
      Promise.all([
        boardDataset.getOfPegs(windowNumOfs),
        boardDataset.getMfgMaterials(windowNumOfs),
        boardDataset.getOperations(operationNumOfs),
      ])
    )
    ofPegs = pegs
    mfgByOf = mfg
    operations = ops
  } else {
    const [mfg, ops] = await timeStage('loadOrderImpacts.mfg+ope', () =>
      Promise.all([
        boardDataset.getMfgMaterials(windowNumOfs),
        boardDataset.getOperations(operationNumOfs),
      ])
    )
    mfgByOf = mfg
    operations = ops
  }

  const avancementByOf = computeAvancement(operations)

  // OF FANTÔMES : gamme pointée à 100 % mais ORDERS annonce encore un reste (cf. estOfFantome).
  // Leur « production restante » n'existe pas — la compter couvre faussement des commandes,
  // gonfle le stock prévisionnel et charge l'atelier pour du travail déjà fait. On les sort donc
  // de l'offre, et on les REMONTE à l'appelant : un OF non soldé est une action de gestion, pas
  // un détail à masquer.
  const phantomOfs: PhantomOf[] = []
  const estFantome = (f: Flow) => {
    const id = numOfDe(f)
    if (!id || !estOfFantome(avancementByOf.get(id), f.quantity)) return false
    phantomOfs.push({
      numOf: id,
      article: f.article,
      qteRestante: f.quantity,
      qtyRealisee: avancementByOf.get(id)?.qtyRealisee ?? 0,
      qtyPrevueOp: avancementByOf.get(id)?.qtyPrevueOp ?? 0,
    })
    return true
  }
  finalOfFlows = finalOfFlows.filter((f) => !estFantome(f))
  matchingOnlySupply = matchingOnlySupply.filter((f) => !estFantome(f))
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
  // Dispo hors CQ : sert à isoler les composants qui ne tiennent QUE grâce au stock statut Q.
  // Le verdict reste rendu sur `stockByArticle` (CQ compté dispo) — on ne change pas la règle,
  // on la rend lisible.
  const stockStrictByArticle = buildStrictQcStock(
    stockFlows.filter((f) => (f.origin as { subType?: string }).subType !== 'qc')
  )
  const mfgFeasibility = preferEngineFeasibility
    ? undefined
    : precomputeMfgFeasibility(
        finalOfFlows,
        mfgByOf,
        stockByArticle,
        overrideMap,
        stockStrictByArticle
      )

  // Charge réelle par OF (cadence gamme × reste à produire) pour le calcul de retard —
  // volontairement indépendant du jalonnement CBN (STRDAT/ENDDAT). Même formule que
  // /ruptures (shortage_payload_loader.ts) : Σ qteRestante/cadence par opération, converti
  // en jours (7,5h/j par défaut), plancher 1j.
  const hoursPerDay = Number(process.env.RUPTURES_HOURS_PER_DAY) || DEFAULT_HOURS_PER_DAY
  const opsByArticle = new Map<string, { rate: number }[]>()
  for (const g of gamme) {
    if (!g.article || g.rate <= 0) continue
    const arr = opsByArticle.get(g.article) ?? []
    arr.push(g)
    opsByArticle.set(g.article, arr)
  }
  // Gamme condensée par article : heures/unité (Σ 1/cadence) + poste. Même source que la
  // charge par OF ci-dessous, mais indexée par ARTICLE — un ordre virtuel (#58) n'existe
  // dans aucun OF, il ne peut être chargé que depuis la gamme de son article.
  const routingByArticle = new Map<string, ArticleRouting>()
  for (const [article, ops] of opsByArticle) {
    const poste = wstByArticle.get(article)
    if (!poste) continue
    let heuresParUnite = 0
    for (const op of ops) heuresParUnite += 1 / op.rate
    if (heuresParUnite <= 0) continue
    routingByArticle.set(article, { poste, heuresParUnite })
  }

  const fabricationDaysByOf = new Map<string, number>()
  const fabricationHoursByOf = new Map<string, number>()
  for (const f of finalOfFlows) {
    const id = (f.origin as { id?: string }).id?.trim() ?? ''
    const ops = opsByArticle.get(f.article)
    if (!id || !ops || !f.quantity) continue
    // Déduit les pièces déjà pointées (cf. `resteAProduire` — c'est lui qui porte le
    // discriminant EXTQTY et les deux cas X3 vérifiés). La vue charge applique
    // exactement la même règle via le même helper.
    const launched = (f.origin as { launched?: number }).launched
    const qtyRestante = resteAProduire(
      f.quantity,
      launched,
      avancementByOf.get(id)?.qtyRealisee ?? 0
    )
    if (qtyRestante <= 0) {
      fabricationDaysByOf.set(id, 0)
      fabricationHoursByOf.set(id, 0)
      continue
    }
    let hours = 0
    for (const op of ops) hours += qtyRestante / op.rate
    fabricationDaysByOf.set(id, fabricationDaysFromHours(hours, hoursPerDay))
    fabricationHoursByOf.set(id, Math.round(hours * 10) / 10)
  }

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
    mfgByOf,
    fabricationDaysByOf,
    matchingOnlySupply
  )

  // Charge par OF pour l'axe charge du diff (poste gamme + heures + date de fin effective).
  // Les OF sans poste connu sont écartés : un bucket « poste vide » ne veut rien dire en
  // réunion charge-capacité.
  const ofCharges: OfCharge[] = []
  for (const f of finalOfFlows) {
    const id = (f.origin as { id?: string }).id?.trim() ?? ''
    if (!id) continue
    const poste = overrideMap.get(id)?.workstation || wstByArticle.get(f.article) || ''
    const dateFin = overrideMap.get(id)?.dateFin || (f.date ? isoLocal(f.date) : '')
    const heures = fabricationHoursByOf.get(id)
    if (!poste || !dateFin || !heures) continue
    ofCharges.push({ numOf: id, poste, dateFin, heures })
  }

  return {
    result,
    phantomOfs,
    articles,
    nomenclatures,
    ofPegs,
    receptionFlows,
    fabricationHoursByOf,
    planInputs: { demands: filteredDemands, supplyFlows: allSupply, overrides: overrideMap },
    engine: {
      precomputedFeasibility: mfgFeasibility,
      avancementByOf,
      mfgMaterialsByOf: mfgByOf,
      fabricationDaysByOf,
    },
    ofCharges,
    routingByArticle,
    dataAt: new Date(),
  }
}

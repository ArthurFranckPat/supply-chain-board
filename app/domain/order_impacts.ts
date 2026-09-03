/**
 * Orchestrateur : matching OF↔commande × faisabilité × overrides → statut par commande.
 *
 * Chaîne :
 * 1. CommandeOFMatcher.matchCommandes() → OF alloués par commande
 * 2. buildEffectiveFlows() → OF avec overrides appliqués
 * 3. evaluateRuptures() → faisabilité par OF (moteur unique #73, photo/contention)
 * 4. Croisement → statut : on_time / stock / retard / bloquee / sans_couverture
 *
 * Port de services/planning_board_orders.py (evaluate_order_impacts).
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import { resteAFabriquer } from './models/orders_qty.js'
import type { FeasibilityOptions } from './stock_state.js'
import type { Nomenclature } from './models/nomenclature.js'
import type { OfOverride } from './planning_board.js'
import { CommandeOFMatcher, type AllocationStrategy } from './of_conso.js'
import type { OfInput } from './stock_state.js'
import type { MfgMaterialInput } from './of_feasibility.js'
import {
  evaluateRuptures,
  buildOfSupply,
  directMissing,
  orderOfsForMode,
  type RuptureOfInput,
} from './rupture_engine.js'

/** Part de production nommément attribuée à un OF consommateur : quel OF producteur, combien. */
export interface CoveringOfPart {
  numOf: string
  /** Date de fin de l'OF producteur (ISO YYYY-MM-DD) — null si inconnue. */
  dateFin: string | null
  /** Part PRISE SUR CET OF pour ce besoin-là : jamais sa quantité d'ordre. */
  qty: number
}

/** Tolérance de comparaison des quantités (flottants issus de coefficients de nomenclature). */
const QTY_EPSILON = 1e-6

/** Arrondit les quantités d'un dictionnaire article → qté à 2 décimales (affichage). */
function roundQties(qties: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [art, qty] of Object.entries(qties)) out[art] = Math.round(qty * 100) / 100
  return out
}

/**
 * Attribution NOMINATIVE de la production aux besoins qu'elle couvre : quel OF producteur
 * couvre la part `seComponents` de quel OF consommateur, et à hauteur de combien.
 *
 * Pourquoi une passe dédiée : `ofSupply` est un COMPTEUR PLAT par article (Σ des qtés
 * restantes). Le moteur sait qu'il reste de la production, pas LAQUELLE — il ne peut donc
 * nommer aucun OF. La vue, elle, doit en nommer un ; sans cette passe elle repartait du
 * premier OF de la liste pour CHAQUE ligne d'affichage, si bien que le même OF producteur
 * était annoncé couvrant partout, très au-delà de ce qu'il produit. Relevé PROD 02/09/2026,
 * SE EH4276 : F126-49910 (1 700 pièces) annoncé couvrant sur 7 lignes pour un total de plus
 * de 4 000 pièces, pendant que SGAE10663280358 (2 289) n'apparaissait nulle part — là où la
 * grille X3 fait bien basculer les besoins du 03/09 sur ce second OF.
 *
 * La capacité de chaque producteur est donc DÉCRÉMENTÉE au fil des consommateurs, dans la
 * chronologie exacte du moteur (`orderOfsForMode`) : un OF déjà entièrement pris par un besoin
 * antérieur ne peut plus être nommé sur le suivant. Producteurs servis au plus tôt d'abord,
 * comme le fait la projection de stock de X3.
 *
 * En mode PHOTO (`consume: false`) la capacité n'est pas décrémentée : chaque OF y est évalué
 * seul contre la production entière, décrémenter contredirait le verdict rendu.
 *
 * Les besoins sont ceux mesurés par le moteur (`seComponents` = part réellement prise sur la
 * production), donc leur somme ne dépasse pas la capacité du pool : la somme des parts d'un
 * consommateur vaut son besoin, sauf pool épuisé où elle vaut ce qui restait — jamais plus,
 * on n'invente pas de production.
 *
 * `consumers` DOIT déjà être trié (cf. `orderOfsForMode`) : cette fonction ne retrie pas, elle
 * sert le premier arrivé d'abord.
 */
export function allocateSeCoveringOfs(
  producers: Array<{ numOf: string; article: string; qteRestante: number; dateFin: string | null }>,
  consumers: Array<{ numOf: string; seComponents: Record<string, number> }>,
  options: { consume: boolean }
): Map<string, Record<string, CoveringOfPart[]>> {
  const pool = new Map<string, Array<{ numOf: string; dateFin: string | null; reste: number }>>()
  for (const p of producers) {
    if (p.qteRestante <= 0) continue
    const arr = pool.get(p.article) ?? []
    arr.push({ numOf: p.numOf, dateFin: p.dateFin, reste: p.qteRestante })
    pool.set(p.article, arr)
  }
  // Au plus tôt d'abord : c'est l'OF qui arrive AVANT le besoin qui le couvre. Date inconnue
  // en dernier (on ne peut rien promettre d'une production non jalonnée).
  for (const arr of pool.values()) {
    arr.sort((a, b) => {
      const d = (a.dateFin ?? '9999-12-31').localeCompare(b.dateFin ?? '9999-12-31')
      return d !== 0 ? d : a.numOf.localeCompare(b.numOf)
    })
  }

  const out = new Map<string, Record<string, CoveringOfPart[]>>()
  for (const consumer of consumers) {
    const parts: Record<string, CoveringOfPart[]> = {}
    for (const [article, besoin] of Object.entries(consumer.seComponents)) {
      if (besoin <= QTY_EPSILON) continue
      const arr = pool.get(article)
      if (!arr) continue
      let reste = besoin
      const list: CoveringOfPart[] = []
      for (const producer of arr) {
        if (reste <= QTY_EPSILON) break
        const part = Math.min(reste, producer.reste)
        if (part <= QTY_EPSILON) continue
        list.push({
          numOf: producer.numOf,
          dateFin: producer.dateFin,
          qty: Math.round(part * 100) / 100,
        })
        reste -= part
        if (options.consume) producer.reste -= part
      }
      if (list.length > 0) parts[article] = list
    }
    if (Object.keys(parts).length > 0) out.set(consumer.numOf, parts)
  }
  return out
}

export interface OrderImpactRow {
  numCommande: string
  /** N° de ligne de commande (X3 VCRLIN_0). Distingue deux lignes d'une même
   *  commande portant éventuellement le même article. Null/absent pour les
   *  prévisions et les anciennes fixtures. */
  ligne?: string | null
  client: string
  article: string
  description: string
  qteRestante: number
  /** Quantité déjà allouée en ERP (réservée en stock pour cette commande). Optionnel (fixtures). */
  qteAllouee?: number
  dateExpedition: string
  dejaEnRetard: boolean
  nature: 'commande' | 'prevision'
  typeCommande: string
  /** Référence commande client (SORDER.CUSORDREF_0) — null si absente. */
  refCommandeClient?: string | null
  /** Référence article client (ITMBPC.ITMREFBPC_0) — null si absente / identique à l'article. */
  refArticleClient?: string | null
  matchingMethod: string
  reliquat: number
  statut: 'on_time' | 'stock' | 'retard' | 'bloquee' | 'sans_couverture'
  joursRetard: number
  ofs: Array<{
    numOf: string
    article: string
    qteAllouee: number
    dateFin: string
    feasible: boolean | null
    missingComponents: Record<string, number>
    /**
     * Composants dont la couverture repose sur du stock sous contrôle qualité (statut Q) :
     * article → quantité qui manquerait sans le CQ. Le verdict `feasible` compte le Q comme
     * disponible (décision métier assumée), ce champ rend la dépendance EXPLICITE pour que
     * l'ordonnanceur relance le service contrôle réception.
     * Optionnel dans le TYPE seulement (fixtures de tests) — toujours produit par le moteur.
     */
    qcComponents?: Record<string, number>
    /**
     * Sous-ensembles FABRIQUÉS dont la couverture ne tient que grâce à un OF producteur :
     * article → quantité qui manquerait sans cette production. Stock physique net insuffisant,
     * donc le SE est suspendu à un OF qui doit tourner. Ne compte PAS comme un manque (absent
     * de `missingComponents`, `feasible` inchangé) — c'est une lentille de dépendance.
     *
     * Ramené à CETTE LIGNE de commande : sa tranche du besoin de l'OF, servie en séquence
     * (la 1re ligne consomme sa tranche en totalité, la suivante prend le reliquat). L'OF
     * entier est dans `OrderImpactResult.ofs[]`. Sans ce découpage, un OF servant deux lignes
     * annonçait son besoin ENTIER sur chacune, avec la même production couvrante.
     * Optionnel dans le TYPE seulement (fixtures de tests) — toujours produit par le moteur.
     */
    seComponents?: Record<string, number>
    /**
     * Part d'un SE de `seComponents` qui ne tient que grâce au stock sous CQ, mesurée SANS
     * crédit de production — c'est la seule mesure juste quand la production est abondante
     * (cf. `seQcDelta`). `seComponents[a] + seQcComponents[a]` = manque de `a` vs stock STRICT
     * et sans production, la décomposition que les vues annoncent.
     *
     * Découpé par ligne comme `seComponents`, et le CQ passe AVANT la production dans chaque
     * tranche (ordre du moteur) : le stock Q d'un SE revient à la première ligne servie, pas
     * à toutes par prorata.
     * Optionnel dans le TYPE seulement (fixtures de tests).
     */
    seQcComponents?: Record<string, number>
    /**
     * OF producteurs NOMMÉS pour chaque article de `seComponents`, avec la part prise sur
     * chacun (cf. `allocateSeCoveringOfs`). Découpé par ligne, capacité de chaque producteur
     * décrémentée au fil des tranches : le même OF ne peut pas être annoncé couvrant partout.
     * Σ des parts = `seComponents[article]` de la ligne.
     * Optionnel dans le TYPE seulement (fixtures de tests).
     */
    seCoveringOfs?: Record<string, CoveringOfPart[]>
    modified: boolean
    statutNum: number
    /** Vrai si au moins une opération intermédiaire a un pointage > 0 (issue #41). */
    estDebuté?: boolean
    /** Pièces déjà réalisées (poste le plus avancé pointé) / total de l'OF — état d'avancement. */
    piecesFaites?: number
    piecesTotalOf?: number
  }>
}

export interface OrderImpactResult {
  orders: OrderImpactRow[]
  /**
   * Faisabilité de TOUS les OFs évalués dans la fenêtre (pas seulement ceux
   * rattachés à une commande). Consommé par le board pour badger chaque carte.
   */
  ofs: Array<{
    numOf: string
    article: string
    /** Qté restant à produire — sert au calcul de charge (buffer fabrication ruptures).
     *  Optionnel (fixtures) : absent → charge inconnue → plancher 1 j de fabrication. */
    qteRestante?: number
    feasible: boolean | null
    statutNum: number
    missingComponents: Record<string, number>
    /** Composants couverts uniquement grâce au stock sous CQ (cf. `orders[].ofs[].qcComponents`). */
    qcComponents?: Record<string, number>
    /**
     * SE couverts uniquement par un OF producteur — besoin de l'OF ENTIER, contrairement à
     * `orders[].ofs[].seComponents` qui est la tranche d'une ligne de commande.
     */
    seComponents?: Record<string, number>
    /** Part CQ de ces SE, mesurée sans production (OF entier). */
    seQcComponents?: Record<string, number>
    /** OF producteurs nommés pour ces SE, tranches de l'OF recollées (OF entier). */
    seCoveringOfs?: Record<string, CoveringOfPart[]>
    /** Vrai si au moins une opération intermédiaire a un pointage > 0 (issue #41). */
    estDebuté?: boolean
  }>
  window: { from: string; to: string }
  stats: {
    nbCommandes: number
    nbOnTime: number
    nbRetard: number
    nbBloquees: number
    nbSansCouverture: number
  }
}

/**
 * Nette la demande de son allocation ERP propre (origin.qteAllouee = stock déjà réservé
 * en X3 pour CETTE commande). Quantité à couvrir par le matching = reste à livrer − alloué ;
 * une commande entièrement allouée n'a rien à faire produire et sort de la demande.
 *
 * Sans ce nettage, le matcher ne voit que le stock LIBRE (PHYSTO − PHYALL) — la part
 * réservée de la commande lui est invisible → il accroche un OF/suggestion destiné à un
 * autre besoin et déclare une fausse rupture (cas AR2602595/AEA833XX : 104 alloués à 100 %,
 * matchée sur la suggestion SGAE10649392338 du besoin d'août). Appliqué à TOUTES les vues
 * depuis fix/ruptures-fiabilite — d'abord gated au proactif (commit 4005f7e), généralisé
 * après validation X3 du cas ruptures.
 */
export function netDemandsByAllocation(demands: Flow[]): Flow[] {
  return demands
    .map((f) => {
      const alloc = (f.origin as { qteAllouee?: number }).qteAllouee ?? 0
      return alloc > 0 ? { ...f, quantity: resteAFabriquer(f.quantity, alloc) } : f
    })
    .filter((f) => f.quantity > 0)
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function effectiveDateFin(
  ofId: string,
  overrides: Map<string, OfOverride>,
  matchingDate: Date | null
): Date | null {
  const ov = overrides.get(ofId)
  const overrideDate = safeDate(ov?.dateFin)
  if (overrideDate) return overrideDate
  return matchingDate
}
/**
 * Évalue le statut de service de chaque commande client dans la fenêtre.
 *
 * @param demands - Flows de demande (commandes + prévisions)
 * @param supplyFlows - Flows de supply (stock + réceptions + OF)
 * @param nomenclatures - BOM par article
 * @param articles - Catalogue articles
 * @param overrides - Overrides locaux (dates/statuts modifiés)
 * @param window - Fenêtre d'analyse { from, to }
 * @param mode - 'immediate' | 'sequential' (défaut: sequential)
 * @param precomputedFeasibility - Verdict de faisabilité par OF calculé en amont (MFGMAT,
 *   matières réelles). S'il existe pour un OF, il SURCHARGE le verdict théorique du moteur
 *   → garantit la cohérence avec le détail OF (issue #11).
 */
export function evaluateOrderImpacts(
  demands: Flow[],
  supplyFlows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  overrides: Map<string, OfOverride>,
  window: { from: Date; to: Date },
  mode?: FeasibilityOptions['mode'],
  precomputedFeasibility?: Map<
    string,
    {
      feasible: boolean | null
      missingComponents: Record<string, number>
      qcComponents?: Record<string, number>
    }
  >,
  /**
   * Avancement des OFs via pointages MFGOPE (issue #41). Permet d'enrichir chaque OF
   * avec `estDebuté` et de qualifier le verdict proactif. Optionnel (fixtures/tests).
   */
  avancementByOf?: Map<string, { estDebuté: boolean; qtyRealisee?: number }>,
  strategy?: AllocationStrategy,
  /**
   * Matières réelles MFGMAT par OF (règle 1 du moteur unique, rupture-engine.ts) — permet au
   * moteur séquentiel de créditer l'alloc déjà posée sur CET OF (ALLQTY) avant de le faire
   * consommer/vérifier dans la contention virtuelle, plutôt que de lui redemander le besoin
   * théorique BOM complet. Sans ça, un OF ferme déjà partiellement/totalement approvisionné
   * (ALLQTY couvrant le reste à sortir) peut ressortir en rupture côté vue proactive alors que
   * X3 lui-même (MFGMAT.SHTQTY_0) ne voit aucun manque — la contention théorique ignore son
   * acquis réel. Optionnel : absent → repli nomenclature théorique pour tous les OF (comportement
   * historique, inchangé pour board/ruptures qui utilisent `precomputedFeasibility` à la place).
   */
  mfgMaterialsByOf?: Map<string, MfgMaterialInput[]>,
  /**
   * Jours de fabrication réels par OF (charge gamme : Σ qteRestante/cadence, plancher 1j,
   * cf. `fabricationDaysFromHours`) — utilisé pour le calcul du retard (règle "charge réelle",
   * indépendante du jalonnement CBN STRDAT/ENDDAT). Absent → repli 1 jour par OF.
   */
  fabricationDaysByOf?: Map<string, number>,
  /**
   * Supply visible du MATCHEUR SEUL (issue #99) : OFs qui servent encore une demande de la
   * fenêtre sans y démarrer. Ils consomment de la demande — donc empêchent qu'une commande
   * déjà couverte par un OF ferme lancé soit ré-attribuée à une suggestion ultérieure — mais
   * n'entrent NI dans les verdicts de faisabilité (`ofInputs`), NI dans `result.ofs`, NI dans
   * le stock net. Sinon : lignes /ruptures hors fenêtre + MFGMAT/MFGOPE dimensionnés dessus.
   */
  matchingOnlySupply?: Flow[]
): OrderImpactResult {
  // 1. Filter demands in window
  const windowDemands = demands.filter((d) => {
    if (d.direction !== 'demand' || d.quantity <= 0) return false
    if (!d.date) return false
    return d.date >= window.from && d.date <= window.to
  })

  // 2. Matching commande→OF
  const matcher = new CommandeOFMatcher(
    matchingOnlySupply?.length ? [...supplyFlows, ...matchingOnlySupply] : supplyFlows,
    articles,
    nomenclatures,
    30,
    strategy
  )
  const matchingResults = matcher.matchCommandes(windowDemands)

  // 3. Build effective OFs with overrides → evaluate feasibility
  const ofInputs: OfInput[] = supplyFlows
    .filter((f) => f.direction === 'supply' && f.origin.type === 'of' && f.quantity > 0)
    .map((f) => {
      const id = (f.origin as any).id ?? ''
      const ov = overrides.get(id)
      return {
        numOf: id,
        article: f.article,
        qteRestante: f.quantity,
        dateDebut: ov?.dateDebut ?? null,
        dateFin: ov?.dateFin ?? f.date?.toISOString().slice(0, 10) ?? null,
        statutNum: ov?.status ?? (f.origin as any).status ?? 3,
      }
    })

  // Moteur de rupture unique (#73, étape 2.2) : remplace evaluateSequentialFeasibility.
  // 'immediate' → photo (chaque OF seul), 'sequential' → contention (consommation virtuelle
  // triée par date besoin). Dispo = flux stock à date nulle (strict+qc, filtrés en amont) ;
  // couverture des sous-ensembles fabriqués = Σ qteRestante des OF producteurs, PLAFONNÉE.
  const stockNet = new Map<string, number>()
  // Même dispo, MOINS le stock sous contrôle qualité : sert uniquement à révéler quels
  // composants ne tiennent QUE grâce au CQ (le verdict rendu reste celui de `stockNet`).
  const stockNetStrict = new Map<string, number>()
  let hasQcStock = false
  for (const f of supplyFlows) {
    if (f.date !== null) continue
    const delta = f.direction === 'supply' ? f.quantity : -f.quantity
    stockNet.set(f.article, (stockNet.get(f.article) ?? 0) + delta)
    const isQc = f.origin.type === 'stock' && (f.origin as { subType?: string }).subType === 'qc'
    if (isQc) {
      hasQcStock = true
      continue
    }
    stockNetStrict.set(f.article, (stockNetStrict.get(f.article) ?? 0) + delta)
  }
  const engineOfs: RuptureOfInput[] = ofInputs.map((o) => {
    const iso = o.dateDebut ?? o.dateFin
    return {
      numOf: o.numOf,
      article: o.article,
      qteRestante: o.qteRestante,
      statutNum: o.statutNum,
      dateBesoin: iso ? new Date(iso) : null,
      materials: mfgMaterialsByOf?.get(o.numOf) ?? null,
    }
  })
  const engineMode = mode === 'sequential' ? 'contention' : 'photo'
  const ofSupply = buildOfSupply(engineOfs)
  const verdicts = evaluateRuptures(
    engineOfs,
    { articles, nomenclatures, stockNet, ofSupply },
    engineMode
  )
  // 2e passe SANS le CQ — uniquement si du stock Q existe dans le périmètre (sinon aucun
  // écart possible et on évite le coût). Pur calcul mémoire : zéro requête X3 en plus.
  const verdictsStrict = hasQcStock
    ? evaluateRuptures(
        engineOfs,
        {
          articles,
          nomenclatures,
          stockNet: stockNetStrict,
          ofSupply,
        },
        engineMode
      )
    : undefined
  // 3e passe SANS la production OF — révèle les sous-ensembles fabriqués dont la couverture
  // ne tient QUE grâce à un OF producteur (stock physique net insuffisant). Le verdict rendu
  // reste celui de `verdicts` (règle « dispo fabriqué = stock + OF producteurs » inchangée) ;
  // l'écart rend la dépendance EXPLICITE — sans lui un SE couvert par un OF est indiscernable
  // d'un SE réellement en stock, et n'apparaît nulle part dans les vues.
  // Même coût qu'une passe CQ (pur mémoire), sautée si aucun OF ne produit quoi que ce soit.
  const verdictsNoOfSupply =
    ofSupply.size > 0
      ? evaluateRuptures(engineOfs, { articles, nomenclatures, stockNet }, engineMode)
      : undefined
  /**
   * 4e passe : ni CQ, ni production. C'est le SEUL point de référence honnête pour un SE
   * fabriqué — le manque vs stock RÉELLEMENT disponible, celui que X3 affiche en SHTQTY.
   *
   * Sans elle, la part CQ d'un SE se mesurait avec la production créditée (`verdictsStrict`),
   * et une production ABONDANTE l'absorbait : les deux passes rendaient 0, `qcComponents`
   * valait 0, et la dépendance au contrôle réception disparaissait de l'écran. Prouvé sur
   * EAR1245EX / F126-49779 (02/09/2026) : besoin 1440 de EH4276, stock strict 0 (PHYSTO 1712
   * ENTIÈREMENT alloué : PHYALL 1301 + GLOALL 411), 865 en statut Q, production disponible
   * 23 615. Les passes rendaient parOf=849 et qc=0 — l'écran annonçait donc un manque de 849
   * là où X3 dit SHTQTY_0 = 1440, et taisait que 591 pièces dépendent du contrôle réception.
   * Avec cette passe : 849 + 591 = 1440, exactement le chiffre de X3.
   *
   * Le cas TENDU est inchangé (couverture juste) : la production n'absorbe rien, l'ancienne
   * et la nouvelle mesure coïncident — cf. test « SE1 : 35 production + 15 CQ = 50 ».
   * Pur calcul mémoire, sautée si l'un des deux leviers est absent : zéro requête X3 en plus.
   */
  const verdictsNoOfSupplyStrict =
    hasQcStock && ofSupply.size > 0
      ? evaluateRuptures(
          engineOfs,
          { articles, nomenclatures, stockNet: stockNetStrict },
          engineMode
        )
      : undefined

  /**
   * Écart de manquants entre la passe « sans production OF » et la passe retenue, restreint aux
   * SOUS-ENSEMBLES FABRIQUÉS directs → « ce SE n'est pas en stock, il dépend d'un OF qui doit
   * tourner ». Restreint à `fabricated && depth === 0` volontairement : la dispo d'un composant
   * ACHETÉ ne dépend pas d'`ofSupply`, tout écart le concernant serait un artefact de la
   * consommation virtuelle (un OF bloqué en plus dans la passe sans-supply ne consomme rien et
   * libère du stock pour les suivants).
   */
  const seDeltaCache = new Map<string, Record<string, number>>()
  const seDelta = (ofId: string): Record<string, number> => {
    const cached = seDeltaCache.get(ofId)
    if (cached) return cached
    const computed = computeSeDelta(ofId)
    seDeltaCache.set(ofId, computed)
    return computed
  }
  const computeSeDelta = (ofId: string): Record<string, number> => {
    const noSupply = verdictsNoOfSupply?.get(ofId)
    if (!noSupply) return {}
    const withSupply = verdicts.get(ofId)
    const missWithSupply = withSupply ? directMissing(withSupply) : {}
    const out: Record<string, number> = {}
    for (const m of noSupply.missingDetail) {
      if (m.depth !== 0 || !m.fabricated) continue
      const covered = m.shortage - (missWithSupply[m.article] ?? 0)
      if (covered > 0) out[m.article] = (out[m.article] ?? 0) + covered
    }
    return out
  }

  /**
   * Part CQ d'un SE couvert par production : écart entre la passe « sans CQ ni production » et
   * la passe « sans production ». Restreint aux articles que `seDelta` a retenus — ailleurs,
   * `qcDelta` (mesuré sur le verdict rendu) reste la bonne lentille.
   */
  // Mémoïsé sur le seul `ofId` : `seArticles` vaut toujours `seDelta(ofId)`, lui-même mémoïsé —
  // l'argument est donc une fonction de la clé, jamais une variable indépendante.
  const seQcDeltaCache = new Map<string, Record<string, number>>()
  const seQcDelta = (ofId: string, seArticles: Record<string, number>): Record<string, number> => {
    const cached = seQcDeltaCache.get(ofId)
    if (cached) return cached
    const computed = computeSeQcDelta(ofId, seArticles)
    seQcDeltaCache.set(ofId, computed)
    return computed
  }
  const computeSeQcDelta = (
    ofId: string,
    seArticles: Record<string, number>
  ): Record<string, number> => {
    const noSupplyStrict = verdictsNoOfSupplyStrict?.get(ofId)
    const noSupply = verdictsNoOfSupply?.get(ofId)
    if (!noSupplyStrict || !noSupply) return {}
    const missNoSupply = directMissing(noSupply)
    const out: Record<string, number> = {}
    for (const m of noSupplyStrict.missingDetail) {
      if (m.depth !== 0 || !m.fabricated) continue
      if (!(m.article in seArticles)) continue
      const qcPart = m.shortage - (missNoSupply[m.article] ?? 0)
      if (qcPart > 0) out[m.article] = (out[m.article] ?? 0) + qcPart
    }
    return out
  }

  /** Écart de manquants entre la passe « sans CQ » et la passe retenue → dette envers le CQ. */
  const qcDelta = (ofId: string): Record<string, number> => {
    const strict = verdictsStrict?.get(ofId)
    if (!strict) return {}
    const withQc = verdicts.get(ofId)
    const missWithQc = withQc ? directMissing(withQc) : {}
    const out: Record<string, number> = {}
    for (const [article, shortage] of Object.entries(directMissing(strict))) {
      const covered = shortage - (missWithQc[article] ?? 0)
      if (covered > 0) out[article] = covered
    }
    return out
  }

  /**
   * Les quatre lentilles d'un OF, mesurées sur l'OF ENTIER : manquants, dette CQ, SE couverts
   * par production, part CQ de ces SE. C'est la matière première des tranches — et le chemin
   * MFGMAT (verdict précalculé sur matières réelles) y est traité comme dans
   * `resolveFeasibility` : pas de production créditée, donc pas de lentille SE.
   */
  const ofLensCache = new Map<
    string,
    {
      missing: Record<string, number>
      qc: Record<string, number>
      se: Record<string, number>
      seQc: Record<string, number>
    }
  >()
  const ofLens = (ofId: string) => {
    const cached = ofLensCache.get(ofId)
    if (cached) return cached
    const pre = precomputedFeasibility?.get(ofId)
    const verdict = verdicts.get(ofId)
    const se = pre ? {} : seDelta(ofId)
    const computed = {
      missing: pre ? pre.missingComponents : verdict ? directMissing(verdict) : {},
      qc: pre ? (pre.qcComponents ?? {}) : qcDelta(ofId),
      se,
      seQc: pre ? {} : seQcDelta(ofId, se),
    }
    ofLensCache.set(ofId, computed)
    return computed
  }

  /**
   * ATTRIBUTION NOMINATIVE DE LA PRODUCTION, une fois pour toute la fenêtre.
   *
   * L'unité de consommation est la LIGNE DE COMMANDE, pas l'OF. Un OF qui sert deux lignes
   * (EAR201EX / SGAE10663223977 : 1 296 pièces réparties en 648 + 648) portait sinon son besoin
   * ENTIER sur chacune d'elles, avec la même liste d'OF couvrants : la colonne annonçait
   * 2 × 1 280 pièces de F126-49910, qui n'en produit que 1 700. Il n'y a pas de partage : la
   * première ligne consomme sa tranche EN TOTALITÉ, la suivante prend le reliquat.
   *
   * Ordre de service = la chronologie du moteur (`orderOfsForMode`) sur les OF, puis, à
   * l'intérieur d'un OF, ses lignes de commande au plus tôt d'abord. La part non rattachée à
   * une ligne consomme elle aussi : le moteur lui a crédité de la production, l'ignorer la
   * rendrait une seconde fois aux lignes visibles.
   *
   * Dans chaque tranche, le stock sous CQ passe AVANT la production — c'est l'ordre du moteur
   * (`VirtualStock.take` : stock d'abord, production ensuite). Les 15 pièces en statut Q d'un
   * SE reviennent donc entièrement à la première ligne servie, pas à toutes par prorata, et
   * le réservoir Q se décrémente comme celui de la production (cf. `qcPool`) : une pièce sous
   * contrôle réception ne peut pas être promise à deux commandes.
   */
  const RATIO_EPSILON = 1e-9
  /** Clé d'une tranche : identifie le couple (ligne de commande, OF) — cf. `matchingResults`. */
  const trancheKey = (matchIndex: number, ofId: string) => `${matchIndex}|${ofId}`

  const tranchesByOf = new Map<string, Array<{ key: string; ratio: number; ordre: string }>>()
  matchingResults.forEach((match, matchIndex) => {
    const demande = match.demandFlow
    // Au plus tôt d'abord, puis n° de commande : deux lignes de même date restent départagées
    // de façon déterministe (sinon l'attribution danserait d'un chargement à l'autre).
    const ordre = `${demande.date?.toISOString().slice(0, 10) ?? '9999-12-31'}|${(demande.origin as any).id ?? ''}`
    for (const alloc of match.ofAllocations) {
      const ofId = (alloc.ofFlow.origin as any).id ?? ''
      if (!ofId || alloc.ofFlow.quantity <= 0 || alloc.qteAllouee <= 0) continue
      const arr = tranchesByOf.get(ofId) ?? []
      arr.push({
        key: trancheKey(matchIndex, ofId),
        ratio: alloc.qteAllouee / alloc.ofFlow.quantity,
        ordre,
      })
      tranchesByOf.set(ofId, arr)
    }
  })
  for (const arr of tranchesByOf.values()) arr.sort((a, b) => a.ordre.localeCompare(b.ordre))

  /**
   * Réservoir de stock sous CQ par article, GLOBAL et décrémenté comme la production : les 15
   * pièces en statut Q d'un SE ne servent qu'UNE commande.
   *
   * Le moteur, lui, en crédite chaque OF séparément — `seQcDelta` mesure « sans le Q il te
   * manquerait tant de PLUS », vrai pour chaque OF pris seul, jamais sommable. La raison est
   * dans `checkOne` : un OF non ferme EN RUPTURE ne consomme rien, donc dans la passe sans
   * production (où tous les OF d'un SE tendu sont en rupture) le stock Q n'est jamais entamé
   * et reste intégralement disponible pour le suivant.
   */
  const qcPool = new Map<string, number>()
  for (const [art, net] of stockNet) {
    const q = net - (stockNetStrict.get(art) ?? 0)
    if (q > QTY_EPSILON) qcPool.set(art, q)
  }
  /** En photo, chaque OF est seul face aux poches : rien ne se décrémente (cf. règle #73). */
  const consommeLesPoches = engineMode === 'contention'

  /** OF porteur de chaque tranche — la vue OF de l'attribution recolle les tranches par là. */
  const ofIdByTranche = new Map<string, string>()
  /** Manquants RÉELS de la tranche (composants achetés et SE en rupture). */
  const missingByTranche = new Map<string, Record<string, number>>()
  /** Dette CQ de la tranche sur ces manquants — tirée de la poche globale, pas d'un prorata. */
  const qcByTranche = new Map<string, Record<string, number>>()
  /** Besoin de production par tranche (part CQ déjà retirée), dans l'ordre de service. */
  const seNeedByTranche = new Map<string, Record<string, number>>()
  /** Part CQ des SE couverts par production, même poche globale. */
  const seQcByTranche = new Map<string, Record<string, number>>()
  const seConsumers: Array<{ numOf: string; seComponents: Record<string, number> }> = []

  for (const of of orderOfsForMode(engineOfs, engineMode)) {
    const lens = ofLens(of.numOf)
    const articlesLentille = new Set([
      ...Object.keys(lens.missing),
      ...Object.keys(lens.qc),
      ...Object.keys(lens.se),
      ...Object.keys(lens.seQc),
    ])
    if (articlesLentille.size === 0) continue

    const tranches = [...(tranchesByOf.get(of.numOf) ?? [])]
    const couvert = tranches.reduce((somme, t) => somme + t.ratio, 0)
    if (couvert < 1 - RATIO_EPSILON) {
      tranches.push({ key: `${of.numOf}|__reste__`, ratio: 1 - couvert, ordre: '' })
    }

    // Plafond par OF : ce que le moteur crédite au CQ pour LUI. La poche globale (`qcPool`)
    // retire en plus ce qui a déjà été promis ailleurs — les deux sont nécessaires.
    const qcResteOf: Record<string, number> = { ...lens.qc }
    const seQcResteOf: Record<string, number> = { ...lens.seQc }

    for (const tranche of tranches) {
      const manquants: Record<string, number> = {}
      const qcPris: Record<string, number> = {}
      const besoinsSe: Record<string, number> = {}
      const seQcPris: Record<string, number> = {}

      for (const art of articlesLentille) {
        // Une seule lentille par article, la même règle que l'écran : un composant réellement
        // manquant porte sa dette CQ sur `qc` ; ailleurs, un SE couvert par production porte
        // la sienne sur `seQc`. Sans ce choix, l'article puiserait DEUX fois dans la poche.
        const surManque = (lens.missing[art] ?? 0) > QTY_EPSILON

        const manque = (lens.missing[art] ?? 0) * tranche.ratio
        if (manque > QTY_EPSILON) manquants[art] = Math.round(manque * 100) / 100

        const resteOf = surManque ? qcResteOf : seQcResteOf
        const qcVoulu = (surManque ? (lens.qc[art] ?? 0) : (lens.seQc[art] ?? 0)) * tranche.ratio
        const dispoQc = consommeLesPoches ? (qcPool.get(art) ?? 0) : Number.POSITIVE_INFINITY
        const qc = Math.max(0, Math.min(resteOf[art] ?? 0, qcVoulu, dispoQc))
        if (qc > QTY_EPSILON) {
          resteOf[art] = (resteOf[art] ?? 0) - qc
          if (consommeLesPoches) qcPool.set(art, (qcPool.get(art) ?? 0) - qc)
          if (surManque) qcPris[art] = Math.round(qc * 100) / 100
          else seQcPris[art] = Math.round(qc * 100) / 100
        }

        if (!surManque) {
          // Le besoin du SE vs stock strict = part production + part CQ. Ce que la poche CQ
          // n'a pas donné bascule sur la production : le manque total de la tranche ne bouge
          // pas, seule sa décomposition change.
          const besoin = ((lens.se[art] ?? 0) + (lens.seQc[art] ?? 0)) * tranche.ratio - qc
          if (besoin > QTY_EPSILON) besoinsSe[art] = besoin
        }
      }

      ofIdByTranche.set(tranche.key, of.numOf)
      missingByTranche.set(tranche.key, manquants)
      qcByTranche.set(tranche.key, qcPris)
      seNeedByTranche.set(tranche.key, besoinsSe)
      seQcByTranche.set(tranche.key, seQcPris)
      seConsumers.push({ numOf: tranche.key, seComponents: besoinsSe })
    }
  }

  const seCoveringByTranche = allocateSeCoveringOfs(ofInputs, seConsumers, {
    consume: consommeLesPoches,
  })

  /**
   * Vue OF de l'attribution : union des tranches d'un même OF, cumulée par producteur — c'est
   * ce que rend `result.ofs[]`, qui parle de l'OF entier et non d'une ligne de commande.
   */
  const seCoveringByOf = new Map<string, Record<string, CoveringOfPart[]>>()
  for (const [key, parArticle] of seCoveringByTranche) {
    const ofId = ofIdByTranche.get(key)
    if (!ofId) continue
    const cumulOf = seCoveringByOf.get(ofId) ?? {}
    for (const [art, parts] of Object.entries(parArticle)) {
      const cumul = new Map((cumulOf[art] ?? []).map((p) => [p.numOf, { ...p }]))
      for (const part of parts) {
        const deja = cumul.get(part.numOf)
        if (deja) deja.qty = Math.round((deja.qty + part.qty) * 100) / 100
        else cumul.set(part.numOf, { ...part })
      }
      cumulOf[art] = [...cumul.values()]
    }
    seCoveringByOf.set(ofId, cumulOf)
  }

  // Résout le verdict d'un OF : MFGMAT (précalculé) s'il existe, sinon le moteur.
  // Vues : manquants DIRECTS (depth 0) — même forme photo/contention (parité #73).
  const resolveFeasibility = (
    ofId: string
  ): {
    feasible: boolean | null
    missingComponents: Record<string, number>
    qcComponents: Record<string, number>
    seComponents: Record<string, number>
    seQcComponents: Record<string, number>
    seCoveringOfs: Record<string, CoveringOfPart[]>
  } => {
    const pre = precomputedFeasibility?.get(ofId)
    if (pre) {
      // Chemin MFGMAT (engagement réel, sans ofSupply) : la notion « couvert par un OF » n'a
      // pas de sens ici, le verdict ne crédite aucune production.
      return {
        feasible: pre.feasible,
        missingComponents: pre.missingComponents,
        qcComponents: pre.qcComponents ?? {},
        seComponents: {},
        seQcComponents: {},
        seCoveringOfs: {},
      }
    }
    const verdict = verdicts.get(ofId)
    const seComponents = seDelta(ofId)
    return {
      feasible: verdict?.feasible ?? null,
      missingComponents: verdict ? directMissing(verdict) : {},
      qcComponents: qcDelta(ofId),
      seComponents,
      seQcComponents: seQcDelta(ofId, seComponents),
      seCoveringOfs: seCoveringByOf.get(ofId) ?? {},
    }
  }

  // 4. Cross matching × feasibility × dates → status per commande
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: OrderImpactRow[] = matchingResults.map((result, matchIndex) => {
    const demand = result.demandFlow
    const origin = demand.origin as any

    const ofRows: OrderImpactRow['ofs'] = []
    let blocked = false
    // Pire retard (en jours) parmi les OF alloués — cf boucle ci-dessous.
    let ofLatenessDays = 0

    // Buffer logistique J-2 (issue #41) : l'OF doit être terminé 2 jours avant l'expédition
    // (contrôle, conditionnement, quai).
    const LOGISTICS_BUFFER_MS = 2 * 86_400_000
    const expedBornee = demand.date ? new Date(demand.date.getTime() - LOGISTICS_BUFFER_MS) : null

    for (const alloc of result.ofAllocations) {
      const ofId = (alloc.ofFlow.origin as any).id ?? ''
      const effFin = effectiveDateFin(ofId, overrides, alloc.ofFlow.date)
      const resolved = resolveFeasibility(ofId)
      const ofFeasible = resolved.feasible

      if (ofFeasible === false) blocked = true

      // Retard par OF : une date posée à la main sur le board/un scénario (override) est une
      // décision humaine ou une simulation explicite, toujours respectée telle quelle.
      // Sinon, DEUX modes selon que l'appelant fournit `fabricationDaysByOf` :
      //  - fourni (pipelines live via order_impacts_loader.ts) : on ignore le jalonnement CBN
      //    (STRDAT/ENDDAT — dérive facilement, cf. shortages.ts "jamais consulté, jugé non
      //    fiable") et on calcule la charge RÉELLE (cadence gamme × reste à produire) décomptée
      //    à rebours depuis l'expé bufferisée — si la date de démarrage requise est déjà
      //    passée, retard.
      //  - absent (evaluatePlanDiff / scénarios / tests appelant le moteur directement) :
      //    repli sur l'ancien comportement, `effFin` (ENDDAT ou override) vs expé bufferisée —
      //    ces appelants pilotent volontairement une date simulée via le flow lui-même.
      if (expedBornee) {
        const ov = overrides.get(ofId)
        let lateness = 0
        if (ov?.dateFin) {
          const overrideDate = safeDate(ov.dateFin)
          if (overrideDate && overrideDate > expedBornee) {
            lateness = Math.round((overrideDate.getTime() - expedBornee.getTime()) / 86_400_000)
          }
        } else if (fabricationDaysByOf) {
          const fabDays = Math.max(1, fabricationDaysByOf.get(ofId) ?? 1)
          const requiredStart = new Date(expedBornee.getTime() - fabDays * 86_400_000)
          if (requiredStart < today) {
            lateness = Math.round((today.getTime() - requiredStart.getTime()) / 86_400_000)
          }
        } else if (effFin && effFin > expedBornee) {
          lateness = Math.round((effFin.getTime() - expedBornee.getTime()) / 86_400_000)
        }
        if (lateness > ofLatenessDays) ofLatenessDays = lateness
      }

      // Lentilles ramenées à CETTE ligne de commande : sa tranche des manquants, de la dette
      // CQ et du besoin de production de l'OF, servies en séquence (cf. l'attribution
      // nominative plus haut). L'OF entier reste lisible dans `result.ofs[]` — ici, deux
      // lignes servies par le même OF ne racontent plus deux fois le même manque, la même
      // production ni les mêmes pièces sous contrôle réception.
      // Repli sur la mesure OF si la tranche n'existe pas (OF hors chronologie moteur).
      const tranche = trancheKey(matchIndex, ofId)

      ofRows.push({
        numOf: ofId,
        article: alloc.ofFlow.article,
        qteAllouee: alloc.qteAllouee,
        // Informatif seulement (jalonnement X3 brut) — n'entre plus dans le calcul de retard.
        dateFin: effFin?.toISOString().slice(0, 10) ?? '',
        feasible: ofFeasible,
        missingComponents: missingByTranche.get(tranche) ?? resolved.missingComponents,
        qcComponents: qcByTranche.get(tranche) ?? resolved.qcComponents,
        seComponents: roundQties(seNeedByTranche.get(tranche) ?? {}),
        seQcComponents: seQcByTranche.get(tranche) ?? {},
        seCoveringOfs: seCoveringByTranche.get(tranche) ?? {},
        modified: overrides.has(ofId),
        statutNum: overrides.get(ofId)?.status ?? (alloc.ofFlow.origin as any).status ?? 3,
        estDebuté: avancementByOf?.get(ofId)?.estDebuté,
        piecesFaites: avancementByOf?.get(ofId)?.qtyRealisee,
        // EXTQTY (lancée d'origine) — total STABLE, contrairement à qteRestante (RMNEXTQTY) qui
        // se nette de façon incohérente selon l'historique de déclaration de l'OF (vérifié sur
        // X3 : deux OF réels avec le même pattern de pointage se comportent différemment).
        // Repli sur quantity si launched absent (anciens producteurs de flow, cf flow.ts).
        piecesTotalOf: Math.round(
          (alloc.ofFlow.origin as { launched?: number }).launched ?? alloc.ofFlow.quantity
        ),
      })
    }

    let joursRetard = ofLatenessDays
    if (joursRetard === 0 && demand.date && demand.date < today) {
      // date d'expé dépassée sans retard OF → retard calendaire depuis aujourd'hui
      joursRetard = Math.round((today.getTime() - demand.date.getTime()) / 86400000)
    }

    let statut: OrderImpactRow['statut']
    if (
      result.remainingUncoveredQty > 0 ||
      (result.ofAllocations.length === 0 && result.matchingMethod !== 'stock_complete')
    ) {
      statut = 'sans_couverture'
    } else if (blocked) {
      statut = 'bloquee'
    } else if (joursRetard > 0 || (demand.date !== null && demand.date < today)) {
      statut = 'retard'
    } else if (result.ofAllocations.length === 0) {
      statut = 'stock'
    } else {
      statut = 'on_time'
    }

    return {
      numCommande: origin.id ?? '',
      ligne: origin.ligne ?? null,
      client: origin.customer ?? '',
      article: demand.article,
      description: articles.get(demand.article)?.description ?? '',
      qteRestante: demand.quantity,
      qteAllouee: origin.qteAllouee ?? 0,
      dateExpedition: demand.date?.toISOString().slice(0, 10) ?? '',
      dejaEnRetard: demand.date ? demand.date < today : false,
      nature: origin.type === 'order' ? 'commande' : 'prevision',
      typeCommande: origin.orderType ?? 'NOR',
      refCommandeClient: origin.refCommandeClient ?? null,
      refArticleClient: origin.refArticleClient ?? null,
      matchingMethod: result.matchingMethod,
      reliquat: result.remainingUncoveredQty,
      statut,
      joursRetard,
      ofs: ofRows,
    }
  })

  rows.sort((a, b) => {
    if (a.dateExpedition !== b.dateExpedition) return a.dateExpedition < b.dateExpedition ? -1 : 1
    return a.numCommande.localeCompare(b.numCommande)
  })

  const statutCounts = { on_time: 0, retard: 0, bloquee: 0, sans_couverture: 0, stock: 0 }
  for (const row of rows) {
    statutCounts[row.statut]++
  }

  return {
    orders: rows,
    ofs: ofInputs.map((o) => {
      const resolved = resolveFeasibility(o.numOf)
      return {
        numOf: o.numOf,
        article: o.article,
        qteRestante: o.qteRestante,
        feasible: resolved.feasible,
        statutNum: o.statutNum,
        missingComponents: resolved.missingComponents,
        qcComponents: resolved.qcComponents,
        seComponents: resolved.seComponents,
        seQcComponents: resolved.seQcComponents,
        seCoveringOfs: resolved.seCoveringOfs,
        estDebuté: avancementByOf?.get(o.numOf)?.estDebuté,
      }
    }),
    window: {
      from: window.from.toISOString().slice(0, 10),
      to: window.to.toISOString().slice(0, 10),
    },
    stats: {
      nbCommandes: rows.length,
      nbOnTime: statutCounts.on_time + statutCounts.stock,
      nbRetard: statutCounts.retard,
      nbBloquees: statutCounts.bloquee,
      nbSansCouverture: statutCounts.sans_couverture,
    },
  }
}

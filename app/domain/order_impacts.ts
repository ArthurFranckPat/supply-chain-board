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
     * Optionnel dans le TYPE seulement (fixtures de tests) — toujours produit par le moteur.
     */
    seComponents?: Record<string, number>
    /**
     * Part d'un SE de `seComponents` qui ne tient que grâce au stock sous CQ, mesurée SANS
     * crédit de production — c'est la seule mesure juste quand la production est abondante
     * (cf. `seQcDelta`). `seComponents[a] + seQcComponents[a]` = manque de `a` vs stock STRICT
     * et sans production, la décomposition que les vues annoncent.
     * Optionnel dans le TYPE seulement (fixtures de tests).
     */
    seQcComponents?: Record<string, number>
    /**
     * OF producteurs NOMMÉS pour chaque article de `seComponents`, avec la part prise sur
     * chacun (cf. `allocateSeCoveringOfs`). La capacité d'un producteur est décrémentée au fil
     * des consommateurs : le même OF ne peut pas être annoncé couvrant partout.
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
    /** SE couverts uniquement par un OF producteur (cf. `orders[].ofs[].seComponents`). */
    seComponents?: Record<string, number>
    /** Part CQ de ces SE, mesurée sans production (cf. `orders[].ofs[].seQcComponents`). */
    seQcComponents?: Record<string, number>
    /** OF producteurs nommés pour ces SE (cf. `orders[].ofs[].seCoveringOfs`). */
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
  const seDelta = (ofId: string): Record<string, number> => {
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
  const seQcDelta = (ofId: string, seArticles: Record<string, number>): Record<string, number> => {
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

  /**
   * Attribution nominative de la production aux SE couverts, une fois pour toute la fenêtre.
   * Rejouée dans la chronologie du moteur (`orderOfsForMode`) sur les MÊMES entrées, capacité
   * de chaque producteur décrémentée — cf. `allocateSeCoveringOfs`. Sautée quand aucune
   * production n'est créditée (`verdictsNoOfSupply` absent) : `seDelta` rend {} partout.
   */
  const seCoveringByOf = verdictsNoOfSupply
    ? allocateSeCoveringOfs(
        ofInputs,
        orderOfsForMode(engineOfs, engineMode).map((o) => ({
          numOf: o.numOf,
          seComponents: seDelta(o.numOf),
        })),
        { consume: engineMode === 'contention' }
      )
    : new Map<string, Record<string, CoveringOfPart[]>>()

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

  const rows: OrderImpactRow[] = matchingResults.map((result) => {
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

      ofRows.push({
        numOf: ofId,
        article: alloc.ofFlow.article,
        qteAllouee: alloc.qteAllouee,
        // Informatif seulement (jalonnement X3 brut) — n'entre plus dans le calcul de retard.
        dateFin: effFin?.toISOString().slice(0, 10) ?? '',
        feasible: ofFeasible,
        missingComponents: resolved.missingComponents,
        qcComponents: resolved.qcComponents,
        seComponents: resolved.seComponents,
        seQcComponents: resolved.seQcComponents,
        seCoveringOfs: resolved.seCoveringOfs,
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

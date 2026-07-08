/**
 * Diagnostic récursif de disponibilité composants (issue #25).
 *
 * Contrairement au mode direct (MFGMAT, 1 niveau) et au board-window (RecursiveChecker,
 * nomenclature théorique en masse), ce checker descend la **chaîne réelle des OF**, OF par OF,
 * pour désigner le vrai composant qui bloque un OF — ou conclure qu'il n'y a qu'un OF de
 * sous-ensemble à lancer.
 *
 * Source de descente à chaque nœud = « meilleure disponible » (data-driven) :
 *  - OF avec MFGMAT (ferme/planifié éclaté) → `evaluateMfgFeasibility` (réel, MFGMAT).
 *  - OF sans MFGMAT (suggéré / non éclaté) → nomenclature théorique (repli).
 *
 * Catch-22 (cf. spec) : un sous-ensemble est souvent un OF suggéré, qui ne peut être fermé
 * que s'il a ses composants → s'il est bloqué, jamais fermé, jamais de MFGMAT. Il faut donc
 * descendre dans les suggestions (via théorique) pour retrouver le composant acheté bloquant.
 *
 * Réutilise : `evaluateMfgFeasibility`, les helpers `isPhantom`/`isSubcontracted` et le
 * `RecursiveCheckerLoader` (étendu de `getMfgmat`). Ne touche pas au chemin rapide
 * (`evaluateWindow`, `FeasibilityService.check`).
 */
import { evaluateMfgFeasibility, type MfgMaterialInput } from './of-feasibility.js'
import { isPhantom, isSubcontracted } from './recursive-checker.js'
import type { OfRecord, StockRecord, ReceptionRecord } from './recursive-checker.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import type { ErpAllocation } from './allocation.js'

export type NodeStatus =
  | 'ok' // pas de manque
  | 'qc_a_controler' // stock présent en site mais sous contrôle qualité → faisable dès CQ levé
  | 'rupture_matiere' // un composant acheté/feuille réellement manquant (ici ou en dessous)
  | 'sous_ensemble_a_lancer' // manque couvert uniquement par un sous-ensemble fabriqué à produire
  | 'indetermine' // garde déclenchée (profondeur/cycle) : non classable

/** Source du verdict d'un nœud : réel (MFGMAT éclatée) vs théorique (nomenclature). */
export type NodeSource = 'MFGMAT' | 'NOMENCLATURE'

/** OF/suggestion qui couvre un composant fabriqué manquant — descendu récursivement. */
export interface CoveringOf {
  numOf: string
  statut: number // 1 ferme/lancé, 2 planifié, 3 suggéré
  quantity: number // qteRestante de l'OF couvrant
  node: DiagnosticNode
}

/** Un composant en manque sous un OF. */
export interface ShortComponentNode {
  article: string
  description: string
  quantityNeeded: number
  /** Stock disponible (strict uniquement, hors QC). null = inconnu. */
  available: number | null
  /** Stock sous contrôle qualité (non utilisable tant que le CQ n'est pas levé). */
  stockQc?: number
  quantityMissing: number
  earliestReception: string | null
  /** Fournisseur de la prochaine réception attendue (BPSNAM_0). */
  receptionSupplier?: string
  /** Numéro de commande d'achat de la prochaine réception (POHNUM_0). */
  receptionOrderId?: string
  fabricated: boolean
  /** Pour un composant fabriqué : les OF/suggestions couvrants, descendus. */
  covering: CoveringOf[]
  status: NodeStatus
}

/** Un nœud de l'arbre = un OF (de tête ou couvrant). */
export interface DiagnosticNode {
  numOf: string
  article: string
  description: string
  statut: number
  quantityNeeded: number
  source: NodeSource
  feasible: boolean // lançable maintenant = aucun composant en manque
  status: NodeStatus
  shorts: ShortComponentNode[]
  alerts: string[]
}

export interface RecursiveDiagnosticResult {
  numOf: string
  article: string
  feasible: boolean // = arbre racine sans manque
  /** Diagnostic global : le vrai blocage (rupture matière vs sous-ensemble à lancer). */
  rootCause: NodeStatus
  tree: DiagnosticNode
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
}

export interface DiagnosticLoader {
  // Données statiques (référentiel), déjà en cache → synchrones et bon marché.
  getArticle(article: string): Article | undefined
  getNomenclature(article: string): Nomenclature | undefined
  getAllocationsOf(numDoc: string): ErpAllocation[]
  getOfsByArticle(article: string, statut?: number, dateBesoin?: Date): OfRecord[]
  // Données X3 vivantes (coûteuses) → asynchrones et chargées paresseusement
  // (seulement pour les nœuds réellement visités, memoïsées côté adapter).
  getStock(article: string): Promise<StockRecord | undefined>
  /** Stock de PLUSIEURS articles en une requête (batch) — clé perf : 1 requête/nœud. */
  getStocks(articles: string[]): Promise<Map<string, StockRecord | undefined>>
  getReceptions(article: string): Promise<ReceptionRecord[]>
  /** Matières réelles (MFGMAT) d'un OF — source réelle de descente. */
  getMfgmat(numOf: string): Promise<MfgMaterialInput[]>
}

export interface DiagnosticOptions {
  maxDepth?: number
  checkDate?: Date
  useReceptions?: boolean
}

interface RawShort {
  article: string
  description: string
  quantityNeeded: number
  available: number | null // strict uniquement (hors QC)
  qcAvailable: number // stock sous CQ (non dispo immédiatement)
  qtyMissing: number
  earliestReception: string | null
  receptionSupplier?: string
  receptionOrderId?: string
}

const DEFAULT_MAX_DEPTH = 10
/**
 * Marge amont pour les réceptions « en retard » : une ligne attendue jusqu'à 7 jours
 * dans le passé est encore considérée comme la prochaine arrivée (retards transporteur,
 * réceptions non pointées). En deçà, on l'ignore (info trop ancienne, peu fiable).
 */
const RECEPTION_GRACE_DAYS = 7
const PHANTOM_DEPTH_CAP = 5

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export class RecursiveDiagnosticChecker {
  private maxDepth: number
  private checkDate: Date

  constructor(private loader: DiagnosticLoader, options: DiagnosticOptions = {}) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
    this.checkDate = options.checkDate ?? new Date()
  }

  private nodeCount = 0
  private maxDepthSeen = 0
  /** Cache stock inter-nœuds : un article n'est lu qu'une fois sur tout le diagnostic. */
  private stockCache = new Map<string, StockRecord | undefined>()
  /**
   * Mémo diagnostic par OF (collapse du DAG). Sans lui, un composant fabriqué partagé
   * par plusieurs parents — ou couvert par de nombreux OF suggérés (pool #32) — est
   * re-descendu à chaque rencontre : le nombre de nœuds explose en `branching^depth`,
   * chacun coûtant des appels SOAP → le diagnostic « tourne dans le vide ». Avec le mémo,
   * chaque OF est diagnostiqué UNE fois (la dispo d'un OF ne dépend pas de qui le demande).
   * Le résultat résolu est stocké (pas la promesse) : la descente est séquentielle, donc
   * pas de course ; et un OF encore `inProgress` re-rencontré = vrai cycle → sentinelle.
   */
  private nodeMemo = new Map<string, DiagnosticNode>()
  private inProgress = new Set<string>()

  /** Pré-charge en UNE requête le stock des articles non encore en cache. */
  private async prefetchStocks(articles: string[]): Promise<void> {
    const missing = [...new Set(articles)].filter((a) => a && !this.stockCache.has(a))
    if (missing.length === 0) return
    const fetched = await this.loader.getStocks(missing)
    for (const a of missing) this.stockCache.set(a, fetched.get(a))
  }

  /** Point d'entrée : diagnostic complet d'un OF (arbre). */
  async diagnoseOf(of: OfRecord): Promise<RecursiveDiagnosticResult> {
    this.nodeCount = 0
    this.maxDepthSeen = 0
    this.nodeMemo.clear()
    this.inProgress.clear()
    const tree = await this.diagnoseNode(of, new Set(), 0)
    const allAlerts = this.collectAlerts(tree)
    return {
      numOf: of.numOf,
      article: of.article,
      feasible: tree.status === 'ok',
      rootCause: tree.status,
      tree,
      componentsChecked: this.nodeCount,
      maxDepthReached: this.maxDepthSeen,
      alerts: allAlerts,
    }
  }

  /**
   * Enveloppe mémoïsée : chaque OF n'est diagnostiqué qu'une fois (collapse du DAG,
   * cf. {@link nodeMemo}). Un OF déjà `inProgress` re-rencontré = cycle par la chaîne
   * des OF → sentinelle `indetermine` (non mémoïsée : dépend du contexte d'appel).
   */
  private async diagnoseNode(of: OfRecord, ancestors: Set<string>, depth: number): Promise<DiagnosticNode> {
    this.maxDepthSeen = Math.max(this.maxDepthSeen, depth)
    const article = of.article
    const base = {
      numOf: of.numOf,
      article,
      description: this.loader.getArticle(article)?.description ?? '',
      statut: of.statutNum,
      quantityNeeded: of.qteRestante,
    }

    // Gardes DÉPENDANTES DU CONTEXTE (ancestors/depth) → jamais mémoïsées, sinon la
    // première rencontre (profonde) figerait un verdict faux pour une rencontre ultérieure
    // plus haute dans l'arbre.
    // Garde : cycle par article.
    if (ancestors.has(article)) {
      return { ...base, source: 'NOMENCLATURE', feasible: false, status: 'indetermine', shorts: [], alerts: [`Cycle detecte: ${article}`] }
    }
    // Garde : profondeur max.
    if (depth > this.maxDepth) {
      return { ...base, source: 'NOMENCLATURE', feasible: false, status: 'indetermine', shorts: [], alerts: [`Profondeur max atteinte sur ${article}`] }
    }
    // Garde : cycle par chaîne d'OF (OF déjà en cours de calcul plus haut) → non mémoïsé.
    if (this.inProgress.has(of.numOf)) {
      return { ...base, source: 'NOMENCLATURE', feasible: false, status: 'indetermine', shorts: [], alerts: [`Cycle detecte (OF): ${of.numOf}`] }
    }

    // Mémo : la dispo d'un OF ne dépend pas de qui le demande → 1 calcul par OF (collapse DAG).
    const cached = this.nodeMemo.get(of.numOf)
    if (cached) return cached

    this.inProgress.add(of.numOf)
    const node = await this.computeNode(of, ancestors, depth)
    this.inProgress.delete(of.numOf)
    this.nodeMemo.set(of.numOf, node)
    return node
  }

  private async computeNode(of: OfRecord, ancestors: Set<string>, depth: number): Promise<DiagnosticNode> {
    const article = of.article
    const description = this.loader.getArticle(article)?.description ?? ''
    const base = {
      numOf: of.numOf,
      article,
      description,
      statut: of.statutNum,
      quantityNeeded: of.qteRestante,
    }

    const date = this.dateBesoin(of)
    const materials = await this.loader.getMfgmat(of.numOf)
    const useMfgmat = materials.length > 0
    const source: NodeSource = useMfgmat ? 'MFGMAT' : 'NOMENCLATURE'

    // Perf : pré-charge le stock de tous les composants de ce nœud en UNE requête
    // (au lieu d'une requête X3 par article — 34 matières = 34 allers-retours).
    await this.prefetchStocks(useMfgmat ? materials.map((m) => m.article) : this.nomenclatureArticles(article))

    const rawShorts = useMfgmat
      ? await this.shortsFromMfgmat(materials)
      : await this.collectNomenclatureShorts(article, of.qteRestante, 0)

    const alerts: string[] = []
    const childAncestors = new Set(ancestors).add(article)
    const shorts: ShortComponentNode[] = []

    for (const s of rawShorts) {
      this.nodeCount++
      if (this.isAlreadyAllocated(s.article, of.numOf)) {
        alerts.push(`${s.article} deja alloue a ${of.numOf}, ignore`)
        continue
      }

      const fabricated = this.isFabricated(s.article)
      if (!fabricated) {
        // Feuille / acheté :
        //  - stock strict insuffisant ET stock CQ couvre le besoin → qc_a_controler
        //  - sinon → rupture matière réelle
        const strictAvailable = s.available ?? 0
        const coveredByQc = s.qcAvailable > 0 && strictAvailable + s.qcAvailable >= s.quantityNeeded
        const status: NodeStatus = coveredByQc ? 'qc_a_controler' : 'rupture_matiere'
        shorts.push({
          article: s.article,
          description: s.description,
          quantityNeeded: s.quantityNeeded,
          available: s.available,
          ...(s.qcAvailable > 0 ? { stockQc: s.qcAvailable } : {}),
          quantityMissing: s.qtyMissing,
          earliestReception: s.earliestReception,
          ...(s.receptionSupplier ? { receptionSupplier: s.receptionSupplier } : {}),
          ...(s.receptionOrderId ? { receptionOrderId: s.receptionOrderId } : {}),
          fabricated: false,
          covering: [],
          status,
        })
        continue
      }

      // Composant fabriqué → on liste les OF/suggestions couvrants et on les descend.
      const coveringOfs = this.loader.getOfsByArticle(s.article, undefined, date)
      const covering: CoveringOf[] = []
      for (const covOf of coveringOfs) {
        const node = await this.diagnoseNode(covOf, childAncestors, depth + 1)
        covering.push({ numOf: covOf.numOf, statut: covOf.statutNum, quantity: covOf.qteRestante, node })
      }

      shorts.push({
        article: s.article,
        description: s.description,
        quantityNeeded: s.quantityNeeded,
        available: s.available,
        quantityMissing: s.qtyMissing,
        earliestReception: s.earliestReception,
        ...(s.receptionSupplier ? { receptionSupplier: s.receptionSupplier } : {}),
        ...(s.receptionOrderId ? { receptionOrderId: s.receptionOrderId } : {}),
        fabricated: true,
        covering,
        status: this.classifyFabricated(s, covering),
      })
    }

    const status = this.rollUp(shorts)
    return { ...base, source, feasible: status === 'ok', status, shorts, alerts }
  }

  /**
   * Statut d'un composant fabriqué en manque, selon ses OF couvrants :
   *  - aucun couvrant → sous_ensemble_a_lancer (rien de prévu).
   *  - un couvrant FERME/LANCÉ (statut 1) & faisable → ok (sera produit, matière OK).
   *  - couvrants présents mais tous suggérés/planifiés non lancés → on regarde DESSOUS :
   *      rupture matière en dessous → rupture_matiere (vrai blocage profond) ;
   *      tous bloqués sur CQ → qc_a_controler (déblocable dès CQ levé) ;
   *      sinon → sous_ensemble_a_lancer (il suffit de lancer la suggestion).
   */
  private classifyFabricated(s: RawShort, covering: CoveringOf[]): NodeStatus {
    if (covering.length === 0) return 'sous_ensemble_a_lancer'

    // Couverture réelle = OF déjà lancé (statut 1) ET faisable, en quantité suffisante.
    const firmFeasible = covering
      .filter((c) => c.statut === 1 && c.node.status === 'ok')
      .reduce((sum, c) => sum + c.quantity, 0)
    if (firmFeasible >= s.qtyMissing) return 'ok'

    // Sinon, le vrai blocage est ce qui empêche de lancer les couvrants.
    if (covering.some((c) => c.node.status === 'rupture_matiere')) return 'rupture_matiere'
    if (covering.some((c) => c.node.status === 'indetermine')) return 'indetermine'
    if (covering.some((c) => c.node.status === 'qc_a_controler')) return 'qc_a_controler'
    return 'sous_ensemble_a_lancer'
  }

  /** Roll-up d'un nœud : ok si aucun manque non couvert, sinon rupture > indetermine > à lancer > qc. */
  private rollUp(shorts: ShortComponentNode[]): NodeStatus {
    const unmet = shorts.filter((s) => s.status !== 'ok')
    if (unmet.length === 0) return 'ok'
    if (unmet.some((s) => s.status === 'rupture_matiere')) return 'rupture_matiere'
    if (unmet.some((s) => s.status === 'indetermine')) return 'indetermine'
    if (unmet.some((s) => s.status === 'sous_ensemble_a_lancer')) return 'sous_ensemble_a_lancer'
    return 'qc_a_controler'
  }

  private collectAlerts(node: DiagnosticNode): string[] {
    const out = [...node.alerts]
    for (const s of node.shorts) for (const c of s.covering) out.push(...this.collectAlerts(c.node))
    return out
  }

  /** Shortages d'un OF éclaté, via la MFGMAT réelle (moteur partagé du mode direct). */
  private async shortsFromMfgmat(materials: MfgMaterialInput[]): Promise<RawShort[]> {
    const stockByArticle = new Map<string, number>()
    for (const m of materials) stockByArticle.set(m.article, this.availableStock(m.article))
    const verdict = evaluateMfgFeasibility(materials, stockByArticle, false)
    const out: RawShort[] = []
    for (const m of verdict.materials.filter((x) => x.feasible === false)) {
      out.push({
        article: m.article,
        description: m.description,
        quantityNeeded: m.remaining,
        available: m.available,
        qcAvailable: this.qcForArticle(m.article),
        qtyMissing: m.missing,
        ...await this.receptionFields(m.article),
      })
    }
    return out
  }

  /**
   * Shortages d'un OF non éclaté (suggéré), via la nomenclature théorique — un niveau,
   * avec aplatissement des fantômes (AFANT). On n'explose pas les sous-ensembles fabriqués
   * ici : ils seront routés vers leur OF couvrant par diagnoseNode (repli = 1 niveau).
   */
  private async collectNomenclatureShorts(
    article: string,
    qteBesoin: number,
    phantomDepth: number,
  ): Promise<RawShort[]> {
    const bom = this.loader.getNomenclature(article)
    if (!bom || bom.components.length === 0) {
      // Feuille (achat) → son propre besoin est le shortage.
      const available = this.availableStock(article)
      return [
        {
          article,
          description: this.loader.getArticle(article)?.description ?? '',
          quantityNeeded: qteBesoin,
          available,
          qcAvailable: this.qcForArticle(article),
          qtyMissing: Math.max(0, qteBesoin - available),
          ...await this.receptionFields(article),
        },
      ]
    }
    // Pré-charge le stock des composants de ce sous-niveau en une requête.
    await this.prefetchStocks(bom.components.map((c) => c.componentArticle))
    const out: RawShort[] = []
    for (const entry of bom.components) {
      const besoin = requiredQuantity(entry, qteBesoin)
      const info = this.loader.getArticle(entry.componentArticle)

      if (isPhantom(info) && phantomDepth < PHANTOM_DEPTH_CAP) {
        out.push(...(await this.collectNomenclatureShorts(entry.componentArticle, besoin, phantomDepth + 1)))
        continue
      }

      const available = this.availableStock(entry.componentArticle)
      const qcAvailable = this.qcForArticle(entry.componentArticle)
      const missing = Math.max(0, besoin - available)
      // Inclure aussi les articles dont seul le stock CQ couvre le besoin (qc_a_controler).
      if (missing > 0) {
        out.push({
          article: entry.componentArticle,
          description: info?.description ?? '',
          quantityNeeded: besoin,
          available,
          qcAvailable,
          qtyMissing: missing,
          ...await this.receptionFields(entry.componentArticle),
        })
      }
    }
    return out
  }

  /** Un article est « fabriqué » s'il a une nomenclature (et n'est pas sous-traité). */
  private isFabricated(article: string): boolean {
    if (isSubcontracted(this.loader.getArticle(article))) return false
    const bom = this.loader.getNomenclature(article)
    return !!bom && bom.components.length > 0
  }

  private isAlreadyAllocated(article: string, numOf: string): boolean {
    return this.loader.getAllocationsOf(numOf).some((a) => a.article === article && a.qteAllouee > 0)
  }

  /** Articles directs de la nomenclature d'un parent (pour pré-charger leur stock). */
  private nomenclatureArticles(article: string): string[] {
    return this.loader.getNomenclature(article)?.components.map((c) => c.componentArticle) ?? []
  }

  /**
   * Stock DISPONIBLE pour décider de la faisabilité « maintenant » : strict uniquement
   * (hors CQ), moins l'alloué. Le stock sous contrôle qualité n'est PAS comptabilisé ici
   * car il n'est pas utilisable tant que le CQ n'est pas levé (cf. qcForArticle).
   * Lit le cache pré-chargé par lot (prefetchStocks) — pas de requête par article.
   */
  private availableStock(article: string): number {
    const stock = this.stockCache.get(article)
    if (!stock) return 0
    const qc = stock.stockQc ?? 0
    return stock.stockPhysique - qc - stock.stockAlloue
  }

  /** Quantité sous contrôle qualité pour un article (non disponible immédiatement). */
  private qcForArticle(article: string): number {
    return this.stockCache.get(article)?.stockQc ?? 0
  }

  /**
   * Réception au plus tôt pertinente. On ne se limite PAS aux réceptions strictement
   * futures : une réception attendue il y a peu (transporteur en retard, réception non
   * pointée) reste la prochaine arrivée réelle. Fenêtre = [aujourd'hui − GRACE_DAYS, +∞[.
   */
  private async receptionFields(
    article: string,
  ): Promise<{ earliestReception: string | null; receptionSupplier?: string; receptionOrderId?: string }> {
    const floor = new Date(this.checkDate)
    floor.setDate(floor.getDate() - RECEPTION_GRACE_DAYS)
    const candidates = (await this.loader.getReceptions(article))
      .filter((r) => r.date >= floor)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    const r = candidates[0]
    if (!r) return { earliestReception: null }
    return {
      earliestReception: formatDate(r.date),
      receptionSupplier: r.supplier || undefined,
      receptionOrderId: r.id || undefined,
    }
  }

  private dateBesoin(of: OfRecord): Date {
    return of.dateDebut ?? of.dateFin ?? this.checkDate
  }
}

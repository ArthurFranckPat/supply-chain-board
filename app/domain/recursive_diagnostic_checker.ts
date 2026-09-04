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
import type { MfgMaterialInput } from './of_feasibility.js'
import {
  evaluateRuptures,
  resolveOfRequirements,
  PHANTOM_DEPTH_CAP,
  type RuptureDataset,
  type RuptureOfInput,
  type RuptureVerdict,
} from './rupture_engine.js'
import { isPhantom, isSubcontracted } from './recursive_checker.js'
import type { OfRecord, StockRecord, ReceptionRecord } from './recursive_checker.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import type { ErpAllocation } from './allocation.js'

export type NodeStatus =
  | 'ok' // pas de manque
  | 'qc_a_controler' // stock présent en site mais sous contrôle qualité → faisable dès CQ levé
  | 'rupture_matiere' // un composant acheté/feuille réellement manquant (ici ou en dessous)
  | 'couverture_insuffisante' // production réelle existante, mais pas en quantité suffisante
  | 'sous_ensemble_a_lancer' // manque couvert uniquement par un sous-ensemble fabriqué à produire
  | 'indetermine' // garde déclenchée (profondeur/cycle) : non classable

/** Source du verdict d'un nœud : réel (MFGMAT éclatée) vs théorique (nomenclature). */
export type NodeSource = 'MFGMAT' | 'NOMENCLATURE'

/** OF/suggestion qui couvre un composant fabriqué manquant — descendu récursivement. */
export interface CoveringOf {
  numOf: string
  statut: number // 1 ferme/lancé, 2 planifié, 3 suggéré
  quantity: number // qteRestante de l'OF couvrant (sa taille, PAS ce qu'il nous cède)
  /**
   * Part de `quantity` réellement promise À CE parent, après le registre des promesses
   * ({@link RecursiveDiagnosticChecker.claims}). C'est le SEUL chiffre qui compte pour le
   * verdict : `quantity` est la taille de l'OF, partagée entre tous ses demandeurs.
   */
  credited: number
  node: DiagnosticNode
}

/**
 * Ce que d'AUTRES OF du pool réclament du même composant, à besoin antérieur.
 * Information d'affichage PURE : jamais déduite du verdict (cf. `classifyFabricated`).
 */
export interface CompetingDemand {
  quantity: number
  ofCount: number
}

/** Un composant en manque sous un OF. */
export interface ShortComponentNode {
  article: string
  description: string
  quantityNeeded: number
  /** Stock disponible (strict uniquement, hors QC). */
  available: number
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
  /** Σ des parts réellement promises à CE parent (Σ `covering[].credited`). */
  coveredQuantity: number
  /**
   * Concurrence sur ce composant : ce que d'autres OF réclament plus tôt. Affichage seul —
   * absent quand aucun OF couvrant n'est descendu, ou quand le loader ne sait pas le calculer.
   */
  sharedDemand?: CompetingDemand
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
  /**
   * Demande concurrente sur un composant : ce que d'AUTRES OF du pool (hors `excludeOfs`)
   * réclament du même article à une date de besoin ANTÉRIEURE. Optionnel : sans lui le
   * diagnostic est identique, il n'affiche simplement pas la concurrence.
   *
   * Volontairement NON déduit du verdict — ces OF concurrents peuvent être servis par du
   * stock ou par d'autres OF, et trancher demanderait le mode contention, que ce diagnostic
   * refuse par construction (photo, un OF vu seul). On DIVULGUE le conflit, on ne l'arbitre pas.
   */
  getCompetingDemand?(article: string, before: Date, excludeOfs: string[]): CompetingDemand
}

export interface DiagnosticOptions {
  maxDepth?: number
  checkDate?: Date
  /**
   * Budget dur : nombre max d'OF réellement diagnostiqués (appels SOAP MFGMAT/stock).
   * Garde-fou anti « tourne dans le vide » : un composant très partagé peut avoir des
   * centaines d'OF couvrants sur une fenêtre d'un an, chacun coûtant un appel SOAP
   * séquentiel. Au-delà du budget, la descente s'arrête (sentinelle `indetermine`).
   */
  maxNodes?: number
}

interface RawShort {
  article: string
  description: string
  quantityNeeded: number
  available: number // strict uniquement (hors QC)
  qcAvailable: number // stock sous CQ (non dispo immédiatement)
  qtyMissing: number
  earliestReception: string | null
  receptionSupplier?: string
  receptionOrderId?: string
}

/**
 * Profondeur max de descente. La nomenclature réelle Aldes ne dépasse pas ~4 niveaux
 * (PF → sous-ensemble → sous-sous-ensemble → composant acheté). On garde une marge à 6
 * pour absorber un fantôme ou un maillon inattendu, sans laisser filer une descente folle.
 */
const DEFAULT_MAX_DEPTH = 6
/** Budget d'OF diagnostiqués par défaut (borne les appels SOAP séquentiels). */
const DEFAULT_MAX_NODES = 300
/**
 * Nombre max d'OF couvrants descendus par composant fabriqué en manque. On trie
 * ferme→planifié→suggéré (puis date au plus tôt) et on s'arrête dès que la quantité
 * manquante est couverte ; ce cap borne le cas pathologique (composant partagé avec des
 * centaines de suggestions) même quand la quantité n'est jamais atteinte.
 */
const MAX_COVERING_PER_COMPONENT = 6
/**
 * Marge amont pour les réceptions « en retard » : une ligne attendue jusqu'à 7 jours
 * dans le passé est encore considérée comme la prochaine arrivée (retards transporteur,
 * réceptions non pointées). En deçà, on l'ignore (info trop ancienne, peu fiable).
 */
const RECEPTION_GRACE_DAYS = 7

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export class RecursiveDiagnosticChecker {
  private maxDepth: number
  private maxNodes: number
  private checkDate: Date

  constructor(
    private loader: DiagnosticLoader,
    options: DiagnosticOptions = {}
  ) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
    this.maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES
    this.checkDate = options.checkDate ?? new Date()
  }

  /** Nombre d'OF réellement diagnostiqués (computeNode) — borné par maxNodes. */
  private diagnosedOfs = 0
  private budgetHit = false

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
  /**
   * Registre des promesses : reliquat de production NON encore promis de chaque OF couvrant.
   *
   * Sans lui, la `qteRestante` ENTIÈRE d'un OF couvrant était créditée à chacun de ses
   * demandeurs : deux parents réclamant le même sous-ensemble se voyaient tous deux couverts
   * par le même OF, et le diagnostic promettait deux fois la même production. C'est la règle
   * « une ressource partagée nommée doit être décrémentée » — l'OF couvrant est une ressource
   * partagée, et le diagnostic le nomme.
   *
   * Décrémenté UNIQUEMENT par une couverture réelle (OF ferme ET nœud `ok`) : un OF qui ne
   * tournera pas ne promet rien, et le retirer du registre priverait à tort les autres
   * demandeurs de l'explication « couvert par un OF, lui-même bloqué ».
   *
   * Premier servi = ordre de descente (profondeur d'abord), déterministe pour un pool donné.
   * Portée = UN diagnostic : deux OF ouverts séparément ne partagent pas ce registre (c'est
   * le mode photo assumé) — la concurrence entre eux est divulguée par `sharedDemand`.
   */
  private claims = new Map<string, number>()

  /** Reliquat de production non encore promis d'un OF couvrant (registre {@link claims}). */
  private remainingOutput(of: OfRecord): number {
    const known = this.claims.get(of.numOf)
    if (known !== undefined) return known
    const initial = Math.max(0, of.qteRestante)
    this.claims.set(of.numOf, initial)
    return initial
  }

  /** Promet `qty` de la production d'un OF couvrant — irréversible sur ce diagnostic. */
  private consumeOutput(numOf: string, qty: number): void {
    this.claims.set(numOf, Math.max(0, (this.claims.get(numOf) ?? 0) - qty))
  }

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
    this.diagnosedOfs = 0
    this.budgetHit = false
    this.nodeMemo.clear()
    this.inProgress.clear()
    this.claims.clear()
    const tree = await this.diagnoseNode(of, new Set(), 0)
    const allAlerts = this.collectAlerts(tree)
    if (this.budgetHit) {
      allAlerts.unshift(
        `Diagnostic partiel : budget de ${this.maxNodes} OF atteint (arbre tronqué).`
      )
    }
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
  private async diagnoseNode(
    of: OfRecord,
    ancestors: Set<string>,
    depth: number
  ): Promise<DiagnosticNode> {
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
      return {
        ...base,
        source: 'NOMENCLATURE',
        feasible: false,
        status: 'indetermine',
        shorts: [],
        alerts: [`Cycle detecte: ${article}`],
      }
    }
    // Garde : profondeur max.
    if (depth > this.maxDepth) {
      return {
        ...base,
        source: 'NOMENCLATURE',
        feasible: false,
        status: 'indetermine',
        shorts: [],
        alerts: [`Profondeur max atteinte sur ${article}`],
      }
    }
    // Garde : cycle par chaîne d'OF (OF déjà en cours de calcul plus haut) → non mémoïsé.
    if (this.inProgress.has(of.numOf)) {
      return {
        ...base,
        source: 'NOMENCLATURE',
        feasible: false,
        status: 'indetermine',
        shorts: [],
        alerts: [`Cycle detecte (OF): ${of.numOf}`],
      }
    }

    // Mémo : la dispo d'un OF ne dépend pas de qui le demande → 1 calcul par OF (collapse DAG).
    const cached = this.nodeMemo.get(of.numOf)
    if (cached) return cached

    // Budget dur : au-delà de maxNodes OF diagnostiqués, on arrête la descente (sentinelle
    // non mémoïsée). Empêche le « tourne dans le vide » sur un composant à fan-out énorme.
    if (this.diagnosedOfs >= this.maxNodes) {
      this.budgetHit = true
      return {
        ...base,
        source: 'NOMENCLATURE',
        feasible: false,
        status: 'indetermine',
        shorts: [],
        alerts: [`Budget de nœuds atteint (${this.maxNodes}) sur ${of.numOf}`],
      }
    }

    this.diagnosedOfs++
    this.inProgress.add(of.numOf)
    const node = await this.computeNode(of, ancestors, depth)
    this.inProgress.delete(of.numOf)
    this.nodeMemo.set(of.numOf, node)
    return node
  }

  private async computeNode(
    of: OfRecord,
    ancestors: Set<string>,
    depth: number
  ): Promise<DiagnosticNode> {
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

    // Shortages du nœud via le moteur unique (#73, étape 2.4) — MFGMAT si éclaté, repli
    // nomenclature sinon. La descente de la chaîne des OF (covering) reste au checker.
    const rawShorts = useMfgmat
      ? await this.shortsFromMfgmat(of, materials)
      : await this.shortsFromNomenclature(of)

    const alerts: string[] = []
    const childAncestors = new Set(ancestors).add(article)
    const shorts: ShortComponentNode[] = []

    for (const s of rawShorts) {
      this.nodeCount++
      const fabricated = this.isFabricated(s.article)
      if (!fabricated) {
        // Feuille / acheté :
        //  - stock strict insuffisant ET stock CQ couvre le besoin → qc_a_controler
        //  - sinon → rupture matière réelle
        const strictAvailable = s.available
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
          coveredQuantity: 0,
          status,
        })
        continue
      }

      // Composant fabriqué → on descend les OF couvrants PERTINENTS uniquement.
      // Un composant très partagé peut avoir des centaines d'OF couvrants (surtout des
      // suggestions statut 3 sur la fenêtre +1 an) : les descendre TOUS explose la largeur
      // (la nomenclature réelle ne fait pourtant que ≤ 4 niveaux). On sélectionne le
      // sous-ensemble minimal qui couvre la quantité manquante, ferme→planifié→suggéré.
      const coveringOfs = this.selectCovering(
        this.loader.getOfsByArticle(s.article, undefined, date),
        s.qtyMissing
      )
      const covering: CoveringOf[] = []
      let credited = 0
      for (const covOf of coveringOfs) {
        const node = await this.diagnoseNode(covOf, childAncestors, depth + 1)
        // Seule une production RÉELLE (OF ferme et lui-même faisable) est promise, et elle
        // est prélevée sur le registre : ce que cet OF a déjà cédé ailleurs dans l'arbre ne
        // peut pas nous être promis une seconde fois.
        let part = 0
        if (covOf.statutNum === 1 && node.status === 'ok') {
          part = Math.min(this.remainingOutput(covOf), Math.max(0, s.qtyMissing - credited))
          if (part > 0) this.consumeOutput(covOf.numOf, part)
          credited += part
        }
        covering.push({
          numOf: covOf.numOf,
          statut: covOf.statutNum,
          quantity: covOf.qteRestante,
          credited: part,
          node,
        })
      }

      const sharedDemand =
        covering.length > 0
          ? this.loader.getCompetingDemand?.(s.article, date, [of.numOf])
          : undefined

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
        coveredQuantity: credited,
        ...(sharedDemand && sharedDemand.ofCount > 0 ? { sharedDemand } : {}),
        status: this.classifyFabricated(s, covering, credited),
      })
    }

    const status = this.rollUp(shorts)
    return { ...base, source, feasible: status === 'ok', status, shorts, alerts }
  }

  /**
   * Sélectionne les OF couvrants à descendre pour un composant fabriqué en manque.
   * Priorité ferme (1) → planifié (2) → suggéré (3), puis date de fin au plus tôt.
   * On accumule jusqu'à couvrir `qtyMissing`, borné par MAX_COVERING_PER_COMPONENT.
   * Objectif : décision de faisabilité fiable sans exploser la largeur (un composant
   * partagé peut avoir des centaines d'OF couvrants sur la fenêtre d'un an).
   *
   * L'accumulation se fait sur le RELIQUAT du registre, pas sur la taille de l'OF : un OF
   * déjà promis ailleurs dans l'arbre n'arrête pas la sélection, sinon on s'arrêterait sur
   * une couverture illusoire au lieu de continuer à chercher de vrais couvrants.
   */
  private selectCovering(ofs: OfRecord[], qtyMissing: number): OfRecord[] {
    const sorted = [...ofs].sort((a, b) => {
      if (a.statutNum !== b.statutNum) return a.statutNum - b.statutNum
      const da = (a.dateFin ?? a.dateDebut)?.getTime() ?? Number.POSITIVE_INFINITY
      const db = (b.dateFin ?? b.dateDebut)?.getTime() ?? Number.POSITIVE_INFINITY
      return da - db
    })
    const picked: OfRecord[] = []
    let covered = 0
    for (const of of sorted) {
      if (picked.length >= MAX_COVERING_PER_COMPONENT) break
      picked.push(of)
      covered += this.remainingOutput(of)
      if (covered >= qtyMissing) break
    }
    return picked
  }

  /**
   * Statut d'un composant fabriqué en manque, selon ses OF couvrants :
   *  - aucun couvrant → sous_ensemble_a_lancer (rien de prévu).
   *  - production réelle promise (`credited`) suffisante → ok (sera produit, matière OK).
   *  - production réelle promise mais INSUFFISANTE → couverture_insuffisante. Cas distinct :
   *    l'OF couvrant est déjà lancé et faisable, il est seulement trop petit (ou déjà promis
   *    ailleurs). Dire « à lancer » ici envoie créer un OF là où le problème est une quantité.
   *  - couvrants présents mais tous suggérés/planifiés non lancés → on regarde DESSOUS :
   *      rupture matière en dessous → rupture_matiere (vrai blocage profond) ;
   *      tous bloqués sur CQ → qc_a_controler (déblocable dès CQ levé) ;
   *      sinon → sous_ensemble_a_lancer (il suffit de lancer la suggestion).
   *
   * `credited` vient du registre des promesses ({@link claims}), JAMAIS de la taille des OF
   * couvrants : c'est ce qui empêche de promettre deux fois la même production.
   */
  private classifyFabricated(s: RawShort, covering: CoveringOf[], credited: number): NodeStatus {
    if (covering.length === 0) return 'sous_ensemble_a_lancer'

    if (credited >= s.qtyMissing) return 'ok'
    // Une production réelle existe mais ne suffit pas : ce n'est ni « ok », ni « à lancer ».
    if (covering.some((c) => c.statut === 1 && c.node.status === 'ok')) {
      return 'couverture_insuffisante'
    }

    // Sinon, le vrai blocage est ce qui empêche de lancer les couvrants.
    if (covering.some((c) => c.node.status === 'rupture_matiere')) return 'rupture_matiere'
    // Un couvrant lui-même en couverture insuffisante propage la cause : sinon un OF bloqué
    // faute de production suffisante remontait en « à lancer », qui n'est pas le geste utile.
    if (covering.some((c) => c.node.status === 'couverture_insuffisante')) {
      return 'couverture_insuffisante'
    }
    if (covering.some((c) => c.node.status === 'indetermine')) return 'indetermine'
    if (covering.some((c) => c.node.status === 'qc_a_controler')) return 'qc_a_controler'
    return 'sous_ensemble_a_lancer'
  }

  /**
   * Roll-up d'un nœud : ok si aucun manque non couvert, sinon
   * rupture > indetermine > couverture insuffisante > à lancer > qc.
   *
   * `couverture_insuffisante` passe AVANT `sous_ensemble_a_lancer` : lancer une suggestion est
   * une action simple, combler un déficit de production sur un OF déjà lancé ne l'est pas.
   */
  private rollUp(shorts: ShortComponentNode[]): NodeStatus {
    const unmet = shorts.filter((s) => s.status !== 'ok')
    if (unmet.length === 0) return 'ok'
    if (unmet.some((s) => s.status === 'rupture_matiere')) return 'rupture_matiere'
    if (unmet.some((s) => s.status === 'indetermine')) return 'indetermine'
    if (unmet.some((s) => s.status === 'couverture_insuffisante')) return 'couverture_insuffisante'
    if (unmet.some((s) => s.status === 'sous_ensemble_a_lancer')) return 'sous_ensemble_a_lancer'
    return 'qc_a_controler'
  }

  private collectAlerts(node: DiagnosticNode): string[] {
    const out = [...node.alerts]
    for (const s of node.shorts) for (const c of s.covering) out.push(...this.collectAlerts(c.node))
    return out
  }

  /**
   * Shortages d'un OF éclaté, via la MFGMAT réelle — verdict du moteur unique (photo).
   * Nomenclature vide : pas de descente ici, les sous-ensembles en manque sont routés vers
   * leurs OF couvrants par diagnoseNode. ALLQTY netté par le moteur (déduction partielle,
   * règle 3 — remplace l'ancien skip tout-ou-rien isAlreadyAllocated).
   */
  private async shortsFromMfgmat(of: OfRecord, materials: MfgMaterialInput[]): Promise<RawShort[]> {
    // Perf : pré-charge le stock de toutes les matières en UNE requête.
    await this.prefetchStocks(materials.map((m) => m.article))
    const stockNet = new Map<string, number>()
    for (const m of materials) stockNet.set(m.article, this.availableStock(m.article))

    const verdict = evaluateRuptures(
      [this.toEngineOf(of, materials)],
      {
        articles: { get: (a: string) => this.loader.getArticle(a) },
        nomenclatures: { get: () => undefined },
        stockNet,
      },
      'photo'
    ).get(of.numOf)
    const describe = (a: string) =>
      materials.find((m) => m.article === a)?.description ??
      this.loader.getArticle(a)?.description ??
      ''
    return this.shortsFromVerdict(verdict, describe)
  }

  /**
   * Shortages d'un OF non éclaté (suggéré), via la nomenclature théorique — besoins DIRECTS
   * du moteur unique : fantômes AFANT aplatis (stock d'abord, reliquat sur les composants
   * réels), allocations ERP de l'OF créditées en déduction partielle (règle 3). Un niveau :
   * les sous-ensembles fabriqués en manque sont routés vers leur OF couvrant par diagnoseNode.
   */
  private async shortsFromNomenclature(of: OfRecord): Promise<RawShort[]> {
    // Pré-charge le stock des composants directs + fermeture des fantômes (seuls
    // descendus à la résolution) en une requête.
    const reachable = this.phantomReachable(of.article)
    await this.prefetchStocks(reachable)
    const stockNet = new Map<string, number>()
    for (const a of reachable) stockNet.set(a, this.availableStock(a))

    const allocations = new Map<string, number>()
    for (const alloc of this.loader.getAllocationsOf(of.numOf)) {
      allocations.set(alloc.article, (allocations.get(alloc.article) ?? 0) + alloc.qteAllouee)
    }

    const dataset: RuptureDataset = {
      articles: { get: (a: string) => this.loader.getArticle(a) },
      nomenclatures: { get: (a: string) => this.loader.getNomenclature(a) },
      stockNet,
      allocationsByOf: allocations.size > 0 ? new Map([[of.numOf, allocations]]) : undefined,
    }
    const requirements = resolveOfRequirements(this.toEngineOf(of), dataset)

    const out: RawShort[] = []
    for (const r of requirements) {
      if (r.need <= 0) continue
      const available = this.availableStock(r.article)
      const missing = Math.max(0, r.need - Math.max(0, available))
      if (missing <= 0) continue
      out.push({
        article: r.article,
        description: this.loader.getArticle(r.article)?.description ?? '',
        quantityNeeded: r.need,
        available,
        qcAvailable: this.qcForArticle(r.article),
        qtyMissing: missing,
        ...(await this.receptionFields(r.article)),
      })
    }
    return out
  }

  private toEngineOf(of: OfRecord, materials?: MfgMaterialInput[]): RuptureOfInput {
    return {
      numOf: of.numOf,
      article: of.article,
      qteRestante: of.qteRestante,
      statutNum: of.statutNum,
      dateBesoin: null,
      ...(materials ? { materials } : {}),
    }
  }

  /** RawShorts depuis les manquants DIRECTS (depth 0) d'un verdict moteur. */
  private async shortsFromVerdict(
    verdict: RuptureVerdict | undefined,
    describe: (article: string) => string
  ): Promise<RawShort[]> {
    if (!verdict) return []
    const out: RawShort[] = []
    for (const m of verdict.missingDetail) {
      if (m.depth !== 0 || m.shortage <= 0) continue
      out.push({
        article: m.article,
        description: describe(m.article),
        quantityNeeded: m.needed,
        available: m.available,
        qcAvailable: this.qcForArticle(m.article),
        qtyMissing: m.shortage,
        ...(await this.receptionFields(m.article)),
      })
    }
    return out
  }

  /**
   * Composants dont le stock doit être connu avant résolution : directs + fermeture des
   * fantômes (le moteur ne descend que les fantômes au moment de résoudre les besoins).
   */
  private phantomReachable(article: string): string[] {
    const out = new Set<string>()
    const walk = (art: string, depth: number) => {
      for (const c of this.loader.getNomenclature(art)?.components ?? []) {
        if (out.has(c.componentArticle)) continue
        out.add(c.componentArticle)
        const info = this.loader.getArticle(c.componentArticle)
        if (isPhantom(info) && depth < PHANTOM_DEPTH_CAP) walk(c.componentArticle, depth + 1)
      }
    }
    walk(article, 0)
    return [...out]
  }

  /** Un article est « fabriqué » s'il a une nomenclature (et n'est pas sous-traité). */
  private isFabricated(article: string): boolean {
    if (isSubcontracted(this.loader.getArticle(article))) return false
    const bom = this.loader.getNomenclature(article)
    return !!bom && bom.components.length > 0
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
  private async receptionFields(article: string): Promise<{
    earliestReception: string | null
    receptionSupplier?: string
    receptionOrderId?: string
  }> {
    const floor = new Date(this.checkDate)
    floor.setDate(floor.getDate() - RECEPTION_GRACE_DAYS)
    const receptions = await this.loader.getReceptions(article)
    const candidates = receptions
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

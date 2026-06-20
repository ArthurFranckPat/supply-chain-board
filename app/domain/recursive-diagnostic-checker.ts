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

export interface ChainStep {
  article: string
  quantityNeeded: number
  /** numOf de l'OF couvrant qui fabrique cet article (présent si on a recursé via un OF). */
  coveringOf?: string
  /** Source du verdict à cette étape : réel (MFGMAT) vs théorique (nomenclature). */
  source: 'MFGMAT' | 'NOMENCLATURE'
}

export type BlockerKind =
  | 'rupture_matiere' // composant acheté/feuille réellement manquant
  | 'of_sous_ensemble_a_lancer' // aucun blocage matière en dessous, juste un OF à lancer
  | 'indetermine' // garde déclenchée (profondeur/cycle) : non classable

export interface BlockingItem {
  kind: BlockerKind
  article: string
  quantityMissing: number
  /** Pour rupture_matiere : réception couvrante au plus tôt ; null sinon. */
  earliestReception: string | null
  chain: ChainStep[]
}

export interface RecursiveDiagnosticResult {
  numOf: string
  article: string
  feasible: boolean // = blockers.length === 0
  blockers: BlockingItem[]
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
}

export interface DiagnosticLoader {
  getArticle(article: string): Article | undefined
  getNomenclature(article: string): Nomenclature | undefined
  getStock(article: string): StockRecord | undefined
  getReceptions(article: string): ReceptionRecord[]
  getAllocationsOf(numDoc: string): ErpAllocation[]
  getOfsByArticle(article: string, statut?: number, dateBesoin?: Date): OfRecord[]
  /** Matières réelles (MFGMAT) d'un OF — source réelle de descente. */
  getMfgmat(numOf: string): MfgMaterialInput[]
}

export interface DiagnosticOptions {
  maxDepth?: number
  checkDate?: Date
  useReceptions?: boolean
}

interface ShortComponent {
  article: string
  qtyMissing: number
  earliestReception: string | null
}

interface NodeResult {
  blockers: BlockingItem[]
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
}

const DEFAULT_MAX_DEPTH = 10
const PHANTOM_DEPTH_CAP = 5

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export class RecursiveDiagnosticChecker {
  private maxDepth: number
  private checkDate: Date
  private useReceptions: boolean

  constructor(private loader: DiagnosticLoader, options: DiagnosticOptions = {}) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
    this.checkDate = options.checkDate ?? new Date()
    this.useReceptions = options.useReceptions ?? true
  }

  /** Point d'entrée : diagnostic complet d'un OF. */
  diagnoseOf(of: OfRecord): RecursiveDiagnosticResult {
    const res = this.diagnoseNode(of, [], new Set(), 0)
    return {
      numOf: of.numOf,
      article: of.article,
      feasible: res.blockers.length === 0,
      blockers: res.blockers,
      componentsChecked: res.componentsChecked,
      maxDepthReached: res.maxDepthReached,
      alerts: res.alerts,
    }
  }

  private diagnoseNode(of: OfRecord, chain: ChainStep[], ancestors: Set<string>, depth: number): NodeResult {
    // Garde : cycle (article déjà présent dans le chemin courant).
    if (ancestors.has(of.article)) {
      return this.indetermine(of.article, chain, `Cycle detecte: ${of.article}`, depth)
    }
    // Garde : profondeur max.
    if (depth > this.maxDepth) {
      return this.indetermine(of.article, chain, `Profondeur max atteinte sur ${of.article}`, depth)
    }

    const date = this.dateBesoin(of)
    const materials = this.loader.getMfgmat(of.numOf)
    const useMfgmat = materials.length > 0
    const source: ChainStep['source'] = useMfgmat ? 'MFGMAT' : 'NOMENCLATURE'
    const myChain: ChainStep[] = [
      ...chain,
      { article: of.article, quantityNeeded: of.qteRestante, source },
    ]

    const shorts = useMfgmat
      ? this.shortsFromMfgmat(materials, date)
      : this.collectNomenclatureShorts(of.article, of.qteRestante, date, 0)

    const blockers: BlockingItem[] = []
    const alerts: string[] = []
    let componentsChecked = shorts.length
    let maxDepthReached = depth

    for (const s of shorts) {
      const compStep: ChainStep = { article: s.article, quantityNeeded: s.qtyMissing, source }

      // Déjà alloué en ERP sur cet OF → on ne recompte pas (MFGMAT le reflète déjà ; sécurité).
      if (this.isAlreadyAllocated(s.article, of.numOf)) {
        alerts.push(`${s.article} deja alloue a ${of.numOf}, ignore`)
        continue
      }

      if (!this.isFabricated(s.article)) {
        // Composant acheté / feuille → rupture matière réelle.
        blockers.push({
          kind: 'rupture_matiere',
          article: s.article,
          quantityMissing: s.qtyMissing,
          earliestReception: s.earliestReception,
          chain: [...myChain, compStep],
        })
        continue
      }

      // Composant fabriqué → on cherche l'OF couvrant et on le re-vérifie récursivement.
      const coveringOfs = this.loader.getOfsByArticle(s.article, undefined, date)
      if (coveringOfs.length === 0) {
        blockers.push({
          kind: 'of_sous_ensemble_a_lancer',
          article: s.article,
          quantityMissing: s.qtyMissing,
          earliestReception: null,
          chain: [...myChain, compStep],
        })
        alerts.push(`Sous-ensemble ${s.article}: aucun OF couvrant — a lancer`)
        continue
      }

      const childAncestors = new Set(ancestors).add(of.article)
      let feasibleCover = 0
      const subBlockers: BlockingItem[] = []
      for (const covOf of coveringOfs) {
        const covChain: ChainStep[] = [
          ...myChain,
          { ...compStep, coveringOf: covOf.numOf },
        ]
        const sub = this.diagnoseNode(covOf, covChain, childAncestors, depth + 1)
        componentsChecked += sub.componentsChecked
        maxDepthReached = Math.max(maxDepthReached, sub.maxDepthReached)
        alerts.push(...sub.alerts)
        if (sub.blockers.length === 0) feasibleCover += covOf.qteRestante
        else subBlockers.push(...sub.blockers)
      }

      if (feasibleCover >= s.qtyMissing) continue // couvert par les OF faisables

      const shortfall = s.qtyMissing - feasibleCover
      const hasMaterialRupture = subBlockers.some((b) => b.kind === 'rupture_matiere')
      const hasIndetermine = subBlockers.some((b) => b.kind === 'indetermine')
      if (hasMaterialRupture) {
        // On bulle les feuilles réellement bloquantes trouvées en dessous.
        blockers.push(...subBlockers.filter((b) => b.kind === 'rupture_matiere'))
        alerts.push(`Sous-ensemble ${s.article}: rupture matiere en dessous`)
      } else if (hasIndetermine) {
        // Garde déclenchée en dessous (profondeur/cycle) → on ne masque pas en « OF à lancer ».
        blockers.push(...subBlockers.filter((b) => b.kind === 'indetermine'))
        alerts.push(`Sous-ensemble ${s.article}: non resolu (garde) en dessous`)
      } else {
        // Rien ne bloque en matière en dessous → OF du sous-ensemble à lancer/compléter.
        blockers.push({
          kind: 'of_sous_ensemble_a_lancer',
          article: s.article,
          quantityMissing: shortfall,
          earliestReception: null,
          chain: [...myChain, compStep],
        })
      }
    }

    return { blockers, componentsChecked, maxDepthReached, alerts }
  }

  /** Shortages d'un OF éclaté, via la MFGMAT réelle (moteur partagé du mode direct). */
  private shortsFromMfgmat(materials: MfgMaterialInput[], date: Date): ShortComponent[] {
    const stockByArticle = new Map<string, number>()
    for (const m of materials) stockByArticle.set(m.article, this.availableStock(m.article, date))
    const verdict = evaluateMfgFeasibility(materials, stockByArticle, false)
    return verdict.materials
      .filter((m) => m.feasible === false)
      .map((m) => ({
        article: m.article,
        qtyMissing: m.missing,
        earliestReception: this.earliestReception(m.article, date),
      }))
  }

  /**
   * Shortages d'un OF non éclaté (suggéré), via la nomenclature théorique — un niveau,
   * avec aplatissement des fantômes (AFANT). On n'explose pas les sous-ensembles fabriqués
   * ici : ils seront routés vers leur OF couvrant par diagnoseNode (repli = 1 niveau).
   */
  private collectNomenclatureShorts(
    article: string,
    qteBesoin: number,
    date: Date,
    phantomDepth: number,
  ): ShortComponent[] {
    const bom = this.loader.getNomenclature(article)
    if (!bom || bom.components.length === 0) {
      // Feuille (achat) → son propre besoin est le shortage.
      return [
        {
          article,
          qtyMissing: qteBesoin,
          earliestReception: this.earliestReception(article, date),
        },
      ]
    }
    const out: ShortComponent[] = []
    for (const entry of bom.components) {
      const besoin = requiredQuantity(entry, qteBesoin)
      const info = this.loader.getArticle(entry.componentArticle)

      if (isPhantom(info) && phantomDepth < PHANTOM_DEPTH_CAP) {
        out.push(...this.collectNomenclatureShorts(entry.componentArticle, besoin, date, phantomDepth + 1))
        continue
      }

      const available = this.availableStock(entry.componentArticle, date)
      const missing = Math.max(0, besoin - available)
      if (missing > 0) {
        out.push({
          article: entry.componentArticle,
          qtyMissing: missing,
          earliestReception: this.earliestReception(entry.componentArticle, date),
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

  private availableStock(article: string, date: Date): number {
    const stock = this.loader.getStock(article)
    let available = stock ? stock.stockPhysique - stock.stockAlloue : 0
    if (this.useReceptions) {
      for (const rec of this.loader.getReceptions(article)) {
        if (rec.date <= date) available += rec.quantity
      }
    }
    return available
  }

  private earliestReception(article: string, date: Date): string | null {
    const future = this.loader
      .getReceptions(article)
      .filter((r) => r.date > date)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    return future[0] ? formatDate(future[0].date) : null
  }

  private dateBesoin(of: OfRecord): Date {
    return of.dateDebut ?? of.dateFin ?? this.checkDate
  }

  private indetermine(article: string, chain: ChainStep[], alert: string, depth: number): NodeResult {
    return {
      blockers: [
        { kind: 'indetermine', article, quantityMissing: 0, earliestReception: null, chain },
      ],
      componentsChecked: 0,
      maxDepthReached: depth,
      alerts: [alert],
    }
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import boardDataset from '#services/board_dataset'
import staticSync from '#services/static_sync_service'
import { OverrideStore } from '#services/override_store'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import { evaluateMfgFeasibility, buildStrictQcStock } from '#app/domain/of-feasibility'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { timeStage } from '#services/perf_metrics'
import { loadOrderBoardData } from '#controllers/order_planning_controller'
import { buildShortageRows, type ShortageRow } from '#app/domain/shortages'
import { groupReceptionsByArticle } from '#repositories/reception_repository'
import type { Flow } from '#app/domain/models/flow'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'


// ---------------------------------------------------------------------------
type CardStatus = 'termine' | 'ferme' | 'cours' | 'planifie' | 'suggere' | 'bloque'

interface Field {
  icon: string
  val: string
}

interface CardFooter {
  left: string
  chip: string
  chipClass: string
}

interface Card {
  id: string
  title: string
  article: string | null
  status: CardStatus
  href: string
  fields: Field[]
  alert: string | null
  progress: number | null
  footer: CardFooter | null
  metric: string | null
  hours: number
  consommeBouche?: boolean
  /** Typologie fine X3 (TSICOD_4) du PF — ex: ESH10=AUTO, ESH30=HYGRO. Issue #42. */
  typologie?: string
  /** Forme produit : KIT (consomme accessoires/bouches) vs GPE (équipement seul). Issue #42. */
  kitGpe?: 'KIT' | 'GPE'
}

interface DayCol {
  short: string
  hours: string
  pct: number
  loadClass: string
  valClass: string
  today: boolean
  headerTone: string
  pctClass: string
}

interface DayCell {
  cellClass: string
  cards: Card[]
  iso: string
}

interface LineRow {
  name: string
  code: string
  dot: string
  meta: { k: string; v: string }[]
  dayCells: DayCell[]
  weekLoads: { week: number; hours: number; pct: number; barClass: string }[]
}

interface BomRow {
  id: string
  name: string
  stock: string
  need: string
  unit: string
  ok: boolean
  shortage: string | null
}

interface StatItem {
  label: string
  value: string
  sub: string | null
  valueClass: string
  trend: string | null
  trendClass: string
}

interface DetailPayload {
  num: string
  title: string
  article: string
  statusLabel: string
  context: string
  stats: StatItem[]
  progressPct: number
  operator: { initials: string; name: string }
  cycle: { start: string; end: string }
  bomCount: number
  bomBlocked: number
  bom: BomRow[]
  events: { label: string; time: string; desc: string | null; dot: string }[]
}

// ---------------------------------------------------------------------------
// Presentation presets (status → CSS classes)
// ---------------------------------------------------------------------------

function makeCard(p: {
  id: string
  title: string
  article?: string | null
  status: CardStatus
  fields?: Field[]
  alert?: string | null
  progress?: number | null
  footer?: CardFooter | null
  metric?: string | null
  hours?: number
  consommeBouche?: boolean
  typologie?: string
  kitGpe?: 'KIT' | 'GPE'
}): Card {
  // Présentation = data seule (statut, article, qté…) — le frontend (board-card)
  // dérive tout le styling du `status` (TONE_BORDER/TONE_FILL). Plus de classes
  // CSS baked côté serveur : màj optimiste = changer status → recoloration directe.
  return {
    id: p.id,
    title: p.title,
    article: p.article ?? null,
    status: p.status,
    href: `/api/v1/planning/ofs/${p.id.replace('#', '')}/detail`,
    fields: p.fields ?? [],
    alert: p.alert ?? null,
    progress: p.progress ?? null,
    footer: p.footer ?? null,
    metric: p.metric ?? null,
    hours: p.hours ?? 0,
    consommeBouche: p.consommeBouche,
    typologie: p.typologie,
    kitGpe: p.kitGpe,
  }
}

// ---------------------------------------------------------------------------
// Date helpers (mirrors PlanningBoardController logic)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** TSICOD_4 → libellé court pour le header de ligne PP_830 (issue #42). */
const PP_TYPO_SHORT: Record<string, string> = {
  ESH10: 'AUTO', ESH20: 'DHU', ESH30: 'HYGRO', ESH40: 'PURAIR', ESH60: 'AUTOSENS',
}

const isoDay = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const atMidnight = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

/** Formatte une qté : entier si rond, sinon 2 décimales. */
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Formatte une date ISO (YYYY-MM-DD) en JJ/MM/AA — '' si absente. */
function fmtFrShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

/** Map OF planning status (1=Ferme, 2=Planifié, 3=Suggéré) → scheduler CardStatus. */
function moStatusToCard(status: number): CardStatus {
  switch (status) {
    case 1:
      return 'ferme'
    case 2:
      return 'planifie'
    case 3:
      return 'suggere'
    default:
      return 'planifie'
  }
}

/** Détecte la forme produit (KIT vs GPE) depuis la désignation X3 — ex: « ESHKIT … », « ESHGPE … ». */
function detectKitGpe(designation: string | null): 'KIT' | 'GPE' | undefined {
  if (!designation) return undefined
  const m = /^(ESH)?(KIT|GPE)\b/i.exec(designation.trim())
  return m ? (m[2].toUpperCase() as 'KIT' | 'GPE') : undefined
}

/** Build a Card from a ManufacturingOrder + optional progress info. */
function moToCard(
  mo: ManufacturingOrder,
  rate: number,
  workstationLabel: string | null,
  bdhParents: Set<string>,
  typologieByArticle: Map<string, string>,
): Card {
  const status = moStatusToCard(mo.status)
  const hours = rate > 0 ? Math.round((mo.quantity / rate) * 10) / 10 : 0
  const progress =
    mo.quantityLaunched > 0
      ? Math.min(100, Math.round((mo.quantityDone / mo.quantityLaunched) * 100))
      : null

  const fields: Field[] = [{ icon: 'package_2', val: `${mo.quantityDone}/${mo.quantityLaunched}` }]
  if (hours > 0) fields.push({ icon: 'timer', val: `${hours}h` })
  if (workstationLabel) fields.push({ icon: 'precision_manufacturing', val: workstationLabel })

  return makeCard({
    id: mo.numOf,
    title: mo.designation ?? mo.article,
    article: mo.article,
    status,
    fields,
    progress,
    metric: `${mo.quantityDone}/${mo.quantityLaunched}`,
    hours,
    consommeBouche: bdhParents.has(mo.article),
    typologie: typologieByArticle.get(mo.article),
    kitGpe: detectKitGpe(mo.designation),
  })
}

// ---------------------------------------------------------------------------
// Issue #21 — Vision unifiée OF ↔ commandes. Le board est IDENTIQUE à
// /ordonnancement (réutilise loadBoardData + <BoardGrid>) ; vision n'ajoute que
// les marqueurs commande (date d'expédition) et les liens OF→commande en overlay.
// ---------------------------------------------------------------------------

interface VisionCommande {
  /** Identité LIGNE (numCommande#ligne) — clé des liens. */
  id: string
  numCommande: string
  /** N° de ligne de commande (X3 VCRLIN_0) ; null pour les prévisions. */
  ligne: string | null
  client: string | null
  dateExpeditionIso: string | null
  /** Type de commande (MTS / MTO / NOR). */
  type: string | null
  /** Index de colonne (date d'expédition) dans la fenêtre. */
  col: number
}

interface VisionLink {
  ofId: string
  posteCode: string
  /** Colonne de la carte OF (date de début). */
  ofCol: number
  commandeId: string
  /** Colonne du marqueur commande (date d'expédition). */
  cmdCol: number
  /** OF suggéré (CBN non affermi) → lien en pointillé côté client. */
  suggere: boolean
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export default class SchedulerController {
  private get store() {
    return new OverrideStore()
  }

  /** GET /ordonnancement — board d'ordonnancement OF, vue experte haute densité. */
  async expertBoard(ctx: HttpContext) {
    const data = await this.loadBoardData(ctx)
    return ctx.inertia.render('scheduler/scheduling', {
      board: data.board,
      windowFrom: data.windowFrom,
      windowTo: data.windowTo,
      horizon: data.horizon,
      dateRange: data.dateRange,
      weekLabel: data.weekLabel,
      prevHref: data.prevHref,
      nextHref: data.nextHref,
      todayHref: data.todayHref,
      totalOf: data.totalOf,
      lineCount: data.lineCount,
      x3Error: data.x3Error,
      cached: data.cached,
    })
  }

  /** GET /programme — vue unifiée OF ↔ commandes (issue #21, #22). */
  async programme(ctx: HttpContext) {
    const rawMode = ctx.request.input('mode') as string | undefined
    const mode: 'combined' | 'ordonnancement' | 'planification' =
      rawMode === 'ordonnancement' ? 'ordonnancement'
      : rawMode === 'planification' ? 'planification'
      : 'combined'

    // Les 3 modes (Combiné / OF / Cmdes) dérivent du MÊME payload (board OF + orderBoard
    // lignes) → le switch se fait côté client (toggle UI, zéro round-trip). `mode` n'est lu
    // qu'au chargement initial (deep-link / redirection /planification) pour le mode d'affichage.
    const data = await this.loadProgrammeData(ctx, '/programme', mode)
    return ctx.inertia.render('scheduler/programme', {
      mode,
      board: data.board,
      commandes: data.commandes,
      links: data.links,
      orderBoard: data.orderBoard,
      windowFrom: data.windowFrom,
      windowTo: data.windowTo,
      horizon: data.horizon,
      dateRange: data.dateRange,
      weekLabel: data.weekLabel,
      prevHref: data.prevHref,
      nextHref: data.nextHref,
      todayHref: data.todayHref,
      totalOf: data.totalOf,
      lineCount: data.lineCount,
      x3Error: data.x3Error,
      cached: data.cached,
    })
  }

  /**
   * Payload de la vue unifiée OF ↔ commandes.
   *
   * Réutilise la même logique de placement que loadBoardData (OF posés en date de
   * début sur les postes de charge), puis rattache chaque commande à ses OF via
   * l'algorithme de matching existant (`loadOrderImpacts` → CommandeOFMatcher,
   * source de vérité partagée board/ruptures). Chaque commande est posée sur la
   * rangée du poste de l'OF qui la couvre, à sa date d'expédition ; un lien
   * horizontal matérialise le rattachement. Échec non-fatal (board sans liens).
   */
  private async loadProgrammeData(ctx: HttpContext, basePath = '/programme', mode: 'combined' | 'ordonnancement' | 'planification' = 'combined') {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const force = !!ctx.request.input('refresh')

    const windowStart = startParam ? new Date(startParam) : new Date()
    windowStart.setHours(0, 0, 0, 0)

    // Cache du payload calculé (matcher + faisabilité = partie coûteuse). Clé GLOBALE,
    // pas par utilisateur (issue #39, C2) : le payload dépend des données usine (ORDERS
    // + matching), identiques pour tous → un namespace par user faisait repayer le cold
    // start (~20 s) à chacun. TTL court : sources X3 vivantes. ?refresh=1 invalide la clé.
    const programmeCache = () => cache.namespace('programme')
    const cacheKey = `payload:${basePath}:${isoDay(windowStart)}:${horizon}`
    if (force) await programmeCache().delete({ key: cacheKey })

    return programmeCache().getOrSet({
      key: cacheKey,
      ttl: 2 * 60 * 1000,
      // SWR (issue #33) : le payload programme (board + matching) coûte ~20 s cold. Timeout par
      // défaut (0) = vrai stale-while-revalidate : si une valeur en grace existe elle est servie
      // INSTANTANÉMENT, le recalcul part en arrière-plan (isBackground → erreurs avalées). Mur froid
      // limité au tout premier chargement. NE PAS mettre > 0 : refresh hors background → à son rejet
      // la promesse orpheline → unhandled rejection → crash serveur (cf. board_dataset / suivi).
      factory: async () => {
        // loadBoardData (getOrders + référentiel) et loadOrderImpacts (getLive + MFGMAT + stock)
        // sont indépendants → parallélisés. Les maps placedByOf/colIdx sont construites APRÈS
        // les deux, depuis les résultats assemblés.
        const windowTo = new Date(windowStart)
        windowTo.setDate(windowTo.getDate() + horizon)
        windowTo.setHours(23, 59, 59, 999)

        const [data, impactsCtx, orderBoardData] = await Promise.all([
          timeStage('programme.loadBoardData', () => this.loadBoardData(ctx, basePath)),
          timeStage('programme.loadOrderImpacts', () =>
            loadOrderImpacts({
              from: windowStart,
              to: windowTo,
              force,
              preferEngineFeasibility: true,
              // OFs scopés par STRDAT (fenêtre board) + demande WIPTYP=1+2 sans OFs.
              // getOrdersForWindow coalescé avec loadBoardData → 1 SOAP pour les deux.
              useWindowOfs: true,
            }).catch(() => null)
          ),
          // orderBoard (vue Cmdes) dérivé des MÊMES demands (getDemandAndReception coalescé
          // avec loadOrderImpacts) + référentiel (coalescé avec loadBoardData) → 0 SOAP
          // supplémentaire. Les 2 boards vivent dans le payload → switch client instantané.
          timeStage('programme.loadOrderBoardData', () =>
            loadOrderBoardData(ctx, basePath).catch(() => null)
          ),
        ])
        let x3Error = data.x3Error

        const placedByOf = new Map<string, { posteCode: string; col: number }>()
        const colIdx = new Map<string, number>()
        data.board.lines[0]?.dayCells.forEach((dc, i) => colIdx.set(dc.iso, i))
        for (const line of data.board.lines) {
          line.dayCells.forEach((dc, col) => {
            for (const card of dc.cards) placedByOf.set(card.id, { posteCode: line.code, col })
          })
        }

        const commandeByLine = new Map<string, VisionCommande>()
        const links: VisionLink[] = []
        try {
          if (!impactsCtx) throw new Error('loadOrderImpacts failed')
          const { result } = impactsCtx
          result.orders.forEach((order, i) => {
            const col = colIdx.get(order.dateExpedition)
            if (col === undefined) return
            const ligne = order.ligne ?? null
            // Clé unique de ligne ; repli indexé si pas de n° de ligne (prévision).
            const lineId = `${order.numCommande}#${ligne ?? `i${i}`}`
            let linked = false
            for (const of of order.ofs) {
              const placedOf = placedByOf.get(of.numOf)
              if (!placedOf) continue // OF non posé sur le board (hors fenêtre / sans poste)
              links.push({
                ofId: of.numOf,
                posteCode: placedOf.posteCode,
                ofCol: placedOf.col,
                commandeId: lineId,
                cmdCol: col,
                suggere: of.statutNum === 3,
              })
              linked = true
            }
            // Marqueur posé seulement si au moins un OF la relie (sinon bruit : ligne couverte stock).
            if (linked && !commandeByLine.has(lineId)) {
              commandeByLine.set(lineId, {
                id: lineId,
                numCommande: order.numCommande,
                ligne,
                client: order.client || null,
                dateExpeditionIso: order.dateExpedition,
                col,
                type: order.typeCommande || null,
              })
            }
          })
        } catch (e) {
          if (!x3Error) x3Error = (e as Error).message
        }
        const commandes = [...commandeByLine.values()]

        return {
          board: data.board,
          commandes,
          links,
          orderBoard: orderBoardData
            ? {
                days: orderBoardData.days,
                lines: orderBoardData.lines,
                weekSpans: orderBoardData.weekSpans,
                cols: orderBoardData.cols,
                colWeek: orderBoardData.colWeek,
                weekCaps: orderBoardData.weekCaps,
                totalLines: orderBoardData.totalLines,
                lineCount: orderBoardData.lineCount,
                x3Error: orderBoardData.x3Error,
                horizon: orderBoardData.horizon,
                windowFrom: orderBoardData.windowFrom,
                windowTo: orderBoardData.windowTo,
                dateRange: orderBoardData.dateRange,
                weekLabel: orderBoardData.weekLabel,
                prevHref: orderBoardData.prevHref,
                nextHref: orderBoardData.nextHref,
                todayHref: orderBoardData.todayHref,
              }
            : null,
          horizon: data.horizon,
          windowFrom: data.windowFrom,
          windowTo: data.windowTo,
          weekLabel: data.weekLabel,
          dateRange: data.dateRange,
          prevHref: data.prevHref + (mode === 'ordonnancement' ? '&mode=ordonnancement' : ''),
          nextHref: data.nextHref + (mode === 'ordonnancement' ? '&mode=ordonnancement' : ''),
          todayHref: data.todayHref + (mode === 'ordonnancement' ? '&mode=ordonnancement' : ''),
          totalOf: data.totalOf,
          lineCount: data.lineCount,
          x3Error,
          cached: data.cached,
        }
      },
    })
  }

  /**
   * GET /api/v1/planning/ofs/:of/detail — payload JSON du détail OF (Focus Productivité
   * Technique). Consommé par le drawer Solid (<OfDetailSheet>) au clic sur une
   * carte du board. Plus de page dédiée ni d'injection du board.
   */
  async ofDetail(ctx: HttpContext) {
    const num = ctx.params.of as string
    return ctx.response.send(await this.loadOfDetail(num))
  }

  /**
   * GET /ruptures — coquille (shell) Inertia du suivi des ruptures (issue #15/#16).
   * Rendu INSTANTANÉ : aucun calcul X3 ici. Le tableau (calcul lourd) est chargé en différé
   * côté client (fetch JSON) depuis `/api/v1/planning/shortages/rows` → page réactive Solid.
   */
  async shortageTracker(ctx: HttpContext) {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const force = !!ctx.request.input('refresh')

    const windowFrom = startParam ? new Date(startParam) : new Date()
    windowFrom.setHours(0, 0, 0, 0)

    const navIso = (deltaDays: number) => {
      const d = new Date(windowFrom)
      d.setDate(d.getDate() + deltaDays)
      return isoDay(d)
    }
    const startIso = isoDay(windowFrom)
    const now = atMidnight(new Date())
    const navQuery = (start: string) =>
      `?start=${start}&days=${horizon}` + (force ? '&refresh=1' : '')

    return ctx.inertia.render('scheduler/shortages', {
      horizon,
      windowStart: startIso,
      // URL du fragment différé (calcul lourd côté serveur).
      rowsHref: `/api/v1/planning/shortages/rows${navQuery(startIso)}`,
      dateRange: `${fmtFrShort(startIso)} — ${fmtFrShort(navIso(horizon))}`,
      prevHref: `/ruptures${navQuery(navIso(-horizon))}`,
      nextHref: `/ruptures${navQuery(navIso(horizon))}`,
      todayHref: `/ruptures${navQuery(isoDay(now))}`,
    })
  }

  /**
   * GET /api/v1/planning/shortages/rows — endpoint JSON (calcul lourd).
   * Charge le pipeline de faisabilité + réceptions, pivote en lignes, renvoie les lignes
   * pré-formatées + stats + erreur X3 (consommé en fetch par la page Solid `scheduler/shortages`).
   */
  async shortageRows(ctx: HttpContext) {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const force = !!ctx.request.input('refresh')

    const windowFrom = startParam ? new Date(startParam) : new Date()
    windowFrom.setHours(0, 0, 0, 0)
    const windowTo = new Date(windowFrom)
    windowTo.setDate(windowTo.getDate() + horizon)
    windowTo.setHours(23, 59, 59, 999)

    // Cache du payload (calcul lourd : faisabilité + réceptions + pivot) + SWR (soft
    // timeout 1 s) comme /programme et /suivi (issue #33). Clé GLOBALE, pas par
    // utilisateur (issue #39, C2) : payload dérivé des données usine, identique pour
    // tous → plus de cold start (~18 s) répété par user. ?refresh=1 invalide la clé.
    const ruptCache = () => cache.namespace('ruptures')
    const cacheKey = `payload:${isoDay(windowFrom)}:${horizon}`
    if (force) await ruptCache().delete({ key: cacheKey })

    const cached = await ruptCache().getOrSet({
      key: cacheKey,
      ttl: 2 * 60 * 1000,
      // SWR : timeout par défaut (0) = vrai stale-while-revalidate (cf. board_dataset / suivi).
      // NE PAS mettre > 0 → refresh hors background, rejet orphelin → unhandled rejection → crash.
      factory: async () => {
        let rows: ShortageRow[] = []
        let stats = { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 }
        let x3Error: string | null = null

        try {
          // useWindowOfs : OFs scopés par STRDAT (date de DÉBUT). Métier : « on ne peut
          // pas COMMENCER un OF si un composant est en rupture » → l'OF actionnable est
          // celui qui va démarrer dans la fenêtre, pas celui qui finit (déjà lancé =
          // trop tard). En bonus : fenêtre STRDAT courte (~25× moins de lignes que le
          // lookback ENDDAT) + getDemandAndReception sans WIPTYP=5 (cf. /programme).
          //
          // Réceptions couvrantes = ORDERS WIPTYP=2 WIPSTA=1 (POs fermes) déjà chargées
          // par loadOrderImpacts (receptionFlows). On ne GARDE que les fermes (origin.firm)
          // → fini le SOAP PORDERQ séparé (même donnée, source unique = ORDERS).
          // Limit : réceptions au-delà de windowTo non incluses (getDemandAndReception
          // borne WIPTYP=2 à ENDDAT <= to) → un PO très en retard peut apparaître
          // « sans couverture » au lieu de « retard » (acceptable sur fenêtre 14j action).
          const { result, articles, ofPegs, receptionFlows } = await loadOrderImpacts({
            from: windowFrom,
            to: windowTo,
            force,
            useWindowOfs: true,
          })
          // OfCommandePeg (Date) → ShortageOfPeg (ISO) pour le pivot pur.
          const pegsIso = new Map(
            [...ofPegs].map(([ofNum, p]) => [
              ofNum,
              {
                numCommande: p.numCommande,
                client: p.client,
                dateExpedition: p.dateExpedition?.toISOString().slice(0, 10) ?? null,
              },
            ])
          )
          const firmReceptions = receptionFlows.filter(
            (f) => f.origin.type === 'reception' && (f.origin as { firm?: boolean }).firm,
          )
          const receptionsByArticle = groupReceptionsByArticle(firmReceptions, windowFrom)
          const built = buildShortageRows(result, receptionsByArticle, articles, pegsIso)
          rows = built.rows
          stats = built.stats
        } catch (e) {
          x3Error = (e as Error).message
        }

        return { rows, stats, x3Error }
      },
    })

    const { rows, stats, x3Error } = cached

    // Présentation (badges verdict + dates FR). Lecture seule, pas de Solid.
    const VERDICT_PRESET: Record<
      ShortageRow['verdict'],
      { label: string; cls: string; icon: string }
    > = {
      couvert: {
        label: 'Couvert',
        cls: 'text-emerald-700 bg-emerald-50 border-emerald-100',
        icon: 'check_circle',
      },
      retard: {
        label: 'Retard',
        cls: 'text-amber-700 bg-amber-50 border-amber-100',
        icon: 'schedule',
      },
      sans_couverture: {
        label: 'Sans couverture',
        cls: 'text-error bg-error/10 border-error/20',
        icon: 'error',
      },
    }

    const displayRows = rows.map((r) => {
      const preset = VERDICT_PRESET[r.verdict]
      return {
        component: r.component,
        componentDesc: r.componentDesc,
        qteManquante: fmtQty(r.qteManquante),
        numOf: r.numOf,
        ofHref: `/api/v1/planning/ofs/${r.numOf}/detail`,
        articleParent: r.articleParent,
        articleParentDesc: r.articleParentDesc,
        numCommande: r.numCommande ?? '—',
        client: r.client ?? '',
        hasCommande: r.numCommande !== null,
        dateExpedition: fmtFrShort(r.dateExpedition),
        reception: r.reception
          ? {
              id: r.reception.id,
              supplier: r.reception.supplier,
              qty: fmtQty(r.reception.qty),
              dateArrivee: fmtFrShort(r.reception.dateArrivee),
            }
          : null,
        // Colonne dédiée date d'arrivée (rouge si la réception arrive après l'expédition).
        dateArrivee: r.reception ? fmtFrShort(r.reception.dateArrivee) : '',
        arriveeLate: r.joursRetardReception > 0,
        verdictKey: r.verdict,
        verdictLabel: (() => {
          // Affiche le pire retard : commande (stock) vs arrivée réception trop tardive.
          const j = Math.max(r.joursRetard, r.joursRetardReception)
          return r.verdict === 'retard' && j > 0 ? `Retard +${j}j` : preset.label
        })(),
        verdictCls: preset.cls,
        verdictIcon: preset.icon,
        // ── Données pour la vue « Couverture » (frise temporelle R3) ──
        // ISO (YYYY-MM-DD) pour positionner les marqueurs ; jours de retard d'arrivée
        // pour le sous-libellé « +N j » du marqueur réception.
        dateExpeditionIso: r.dateExpedition,
        receptionIso: r.reception?.dateArrivee ?? null,
        joursRetardReception: r.joursRetardReception,
        // Champ texte concaténé pour le filtre client (composant / commande / fournisseur).
        filter:
          `${r.component} ${r.componentDesc} ${r.numCommande ?? ''} ${r.client ?? ''} ${r.reception?.supplier ?? ''} ${r.numOf} ${r.articleParent}`.toLowerCase(),
      }
    })

    return { rows: displayRows, stats, x3Error }
  }

  // -------------------------------------------------------------------------
  // Board data — same X3 sources as the planning-board API (boardDataset)
  // -------------------------------------------------------------------------

  private async loadBoardData(ctx: HttpContext, basePath = '/ordonnancement') {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const force = !!ctx.request.input('refresh')

    const windowStart = startParam ? new Date(startParam) : new Date()
    windowStart.setHours(0, 0, 0, 0)
    // Borne haute de la fenêtre board (utilisée par getOrdersForWindow + loadOrderImpacts).
    const windowEnd = new Date(windowStart)
    windowEnd.setDate(windowEnd.getDate() + horizon)
    windowEnd.setHours(23, 59, 59, 999)

    let mos: ManufacturingOrder[] = []
    let gammeOps: GammeOperation[] = []
    let x3Error: string | null = null
    let bdhParents: Set<string> = new Set()
    let typologieByArticle = new Map<string, string>()
    let stockBouchesHygro: number | null = null

    try {
      const [ref, ord, bdh, articlesList, bouchesHygro] = await timeStage('loadBoardData.datasets', () =>
        Promise.all([
          timeStage('loadBoardData.referential', () => boardDataset.getReferential(force)),
          // Filtre STRDAT (fenêtre courte) au lieu de lookback 90j ENDDAT → ~25× moins de lignes ZSOAPSQL O(n²).
          // Coalescé avec getOrdersForWindow dans loadOrderImpacts → 1 seul SOAP pour les deux.
          timeStage('loadBoardData.orders', () => boardDataset.getOrdersForWindow(windowStart, windowEnd, force)),
          staticSync.readBdhParents().catch(() => new Set<string>()),
          // Typologie (TSICOD_4) par article — expose ESH10-60 sur les cartes OF (issue #42).
          boardDataset.getArticles(),
          // Bouches hygro (BDH60 équipées module) — stock affiché dans le header PP_830 (issue #42).
          staticSync.readBouchesHygroSet().catch(() => new Set<string>()),
        ])
      )
      gammeOps = ref.gamme
      mos = [...ord.mos]
      bdhParents = bdh
      for (const a of articlesList) if (a.typologie) typologieByArticle.set(a.code, a.typologie)
      // Stock (strict+qc) des bouches hygro — 1 SOAP scopé, caché 2 min. Null si indispo.
      const bouches = [...bouchesHygro]
      if (bouches.length > 0) {
        stockBouchesHygro = 0
        const flows = await boardDataset.getStock(bouches).catch(() => [] as Flow[])
        for (const f of flows) {
          if (f.origin.type !== 'stock') continue
          const sub = (f.origin as { subType?: string }).subType
          if (sub === 'strict' || sub === 'qc') stockBouchesHygro += f.quantity
        }
      }
    } catch (e) {
      x3Error = (e as Error).message
    }

    const overrides = await this.store.getAll()
    const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))
    const gammeMap = new Map(gammeOps.map((g) => [g.article, g]))

    const wstLabels = new Map<string, string>()
    for (const g of gammeOps) {
      if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
    }

    // Business days (Mon–Fri) within horizon.
    const colDates: Date[] = []
    for (let i = 0; i < horizon; i++) {
      const d = atMidnight(windowStart)
      d.setDate(windowStart.getDate() + i)
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) colDates.push(d)
    }

    const colIdx = new Map<string, number>()
    colDates.forEach((d, i) => colIdx.set(isoDay(d), i))

    const dayHours = new Array<number>(colDates.length).fill(0)
    const now = atMidnight(new Date())

    // Build DayCol[] (display shape).
    const days: DayCol[] = colDates.map((d) => {
      const wd = d.toLocaleDateString('fr-FR', { weekday: 'short' })
      const dn = d.toLocaleDateString('fr-FR', { day: '2-digit' })
      return {
        short: `${wd} ${dn}`,
        hours: '0h',
        pct: 0,
        loadClass: 'bg-gray-400',
        valClass: 'text-gray-600',
        today: atMidnight(d).getTime() === now.getTime(),
        headerTone: '',
        pctClass: 'text-gray-500',
      }
    })

    // Group MOs by workstation, place cards on start-day cells.
    const cardsByLineDay = new Map<string, Card[][]>()
    const lineMeta = new Map<string, { ofCount: number; totalHours: number; dayHours: number[]; byTypo: Map<string, number> }>()

    for (const mo of mos) {
      const ov = overrideMap.get(mo.numOf) ?? null
      const wst = ov?.workstation ?? gammeMap.get(mo.article)?.workstation ?? null
      if (!wst) continue
      if (!wstLabels.has(wst)) wstLabels.set(wst, wst)

      const start = ov?.dateDebut ? new Date(ov.dateDebut) : mo.startDate
      if (!start) continue
      const startIso = isoDay(start)
      const idx = colIdx.get(startIso)
      if (idx === undefined) continue

      const rate = gammeMap.get(mo.article)?.rate ?? 0
      const hours = rate > 0 ? mo.quantity / rate : 0
      dayHours[idx] += hours

      const wstLabel = wstLabels.get(wst) ?? wst
      const cardObj = moToCard(mo, rate, wstLabel, bdhParents, typologieByArticle)

      if (!cardsByLineDay.has(wst)) {
        cardsByLineDay.set(
          wst,
          Array.from({ length: colDates.length }, () => [])
        )
        lineMeta.set(wst, {
          ofCount: 0,
          totalHours: 0,
          dayHours: new Array<number>(colDates.length).fill(0),
          byTypo: new Map<string, number>(),
        })
      }
      cardsByLineDay.get(wst)![idx].push(cardObj)
      const m = lineMeta.get(wst)!
      m.ofCount++
      m.totalHours += hours
      m.dayHours[idx] += hours
      // Charge par typologie (TSICOD_4) — sert au header de ligne PP_830 (issue #42).
      const typo = typologieByArticle.get(mo.article)
      if (typo) m.byTypo.set(typo, (m.byTypo.get(typo) ?? 0) + hours)
    }

    // Finalize day columns with hours/pct.
    days.forEach((day, i) => {
      const h = Math.round(dayHours[i] * 10) / 10
      const pct = Math.round((h / 8) * 100)
      day.hours = `${h}h`
      day.pct = pct
      if (pct > 100) {
        day.loadClass = 'bg-error'
        day.valClass = 'text-error'
        day.pctClass = 'text-error'
      } else if (pct >= 90) {
        day.loadClass = 'bg-blue-500'
        day.valClass = 'text-blue-600'
      } else if (pct > 0) {
        day.loadClass = 'bg-emerald-500'
        day.valClass = 'text-emerald-600'
      }
      if (day.today) day.headerTone = 'bg-blue-50/30'
      else if (i % 2 === 0) day.headerTone = 'bg-white/50'
    })

    // Column → ISO week index, and business-days-per-week (for per-line capacity).
    const colWeek = colDates.map((d) => isoWeek(d))
    const weekOrder: number[] = []
    const weekDayCount = new Map<number, number>()
    colWeek.forEach((wk) => {
      if (!weekOrder.includes(wk)) weekOrder.push(wk)
      weekDayCount.set(wk, (weekDayCount.get(wk) ?? 0) + 1)
    })
    // Week header spans (label cell + N day columns grouped per ISO week).
    const weekSpans = weekOrder.map((wk) => ({ week: wk, span: weekDayCount.get(wk) ?? 0 }))
    // ISO week → capacity hours (business days × 8h), for live histogram recompute.
    const weekCaps = Object.fromEntries(
      weekOrder.map((wk) => [wk, (weekDayCount.get(wk) ?? 0) * 8])
    )

    /** Build per-line weekly load: sum line.dayHours by week vs days×8h capacity. */
    const buildWeekLoads = (lineDayHours: number[]) =>
      weekOrder.map((week) => {
        let hours = 0
        colWeek.forEach((wk, i) => {
          if (wk === week) hours += lineDayHours[i]
        })
        const capacity = (weekDayCount.get(week) ?? 0) * 8
        const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
        return {
          week,
          hours: Math.round(hours),
          pct,
          barClass: pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500',
        }
      })

    // Build line rows sorted by workstation code.
    const lines: LineRow[] = [...cardsByLineDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, dayCardArrays]) => {
        const meta = lineMeta.get(code)!
        return {
          name: wstLabels.get(code) ?? code,
          code,
          dot: 'bg-emerald-500',
          meta:
            code === 'PP_830'
              ? [
                  // Header PP_830 (issue #42) : charge par typologie + stock bouches hygro (goulot).
                  ...[...meta.byTypo.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([typo, h]) => ({ k: PP_TYPO_SHORT[typo] ?? typo, v: `${Math.round(h)}h` })),
                  ...(stockBouchesHygro !== null
                    ? [{ k: 'bouches', v: String(stockBouchesHygro) }]
                    : []),
                ]
              : [
                  { k: 'OF', v: String(meta.ofCount) },
                  { k: 'CHG', v: `${Math.round(meta.totalHours)}h` },
                  { k: 'WST', v: code },
                ],
          dayCells: dayCardArrays.map((cards, i) => ({
            cellClass: days[i].today ? 'bg-blue-50/10' : '',
            cards,
            iso: isoDay(colDates[i]),
          })),
          weekLoads: buildWeekLoads(meta.dayHours),
        }
      })

    const firstDay = colDates[0] ?? windowStart
    const lastDay = colDates[colDates.length - 1] ?? windowStart
    const fmtFr = (d: Date) =>
      d
        .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase()

    // Navigation entre fenêtres (Préc./Suiv./Aujourd'hui) — préserve le contexte
    // (board ou détail OF) via basePath, et le forçage du cache via ?refresh=1.
    const navIso = (deltaDays: number) => {
      const d = atMidnight(windowStart)
      d.setDate(d.getDate() + deltaDays)
      return isoDay(d)
    }
    const navQuery = (start: string) =>
      `?start=${start}&days=${horizon}` + (force ? '&refresh=1' : '')
    const prevHref = `${basePath}${navQuery(navIso(-horizon))}`
    const nextHref = `${basePath}${navQuery(navIso(horizon))}`
    const todayHref = `${basePath}${navQuery(isoDay(now))}`

    return {
      days,
      lines,
      cols: days.length,
      horizon,
      windowFrom: colDates.length ? isoDay(firstDay) : '',
      windowTo: colDates.length ? isoDay(lastDay) : '',
      weekSpans,
      // Client-side recompute of the weekly histogram after a drag&drop:
      // col index → ISO week, and per-week capacity (business days × 8h).
      colWeekJson: JSON.stringify(colWeek),
      weekCapsJson: JSON.stringify(weekCaps),
      // Objet board brut consommé par la page Inertia (props.board).
      board: { days, lines, weekSpans, cols: days.length, colWeek, weekCaps },
      weekLabel: colDates.length ? `S${isoWeek(colDates[0])}` : '',
      dateRange: `${fmtFr(firstDay)} — ${fmtFr(lastDay)}`,
      prevHref,
      nextHref,
      todayHref,
      totalOf: mos.length,
      lineCount: lines.length,
      x3Error,
      cached: boardDataset.status().ordersAt
        ? new Date(boardDataset.status().ordersAt!).toLocaleTimeString('fr-FR')
        : null,
    }
  }

  // -------------------------------------------------------------------------
  // OF detail — MO info + BOM from MFGMAT (same as ofMaterials())
  // -------------------------------------------------------------------------

  private async loadOfDetail(num: string): Promise<DetailPayload> {
    // getReferential (cachée) + getManufacturingOrderByNum (1 ligne ZSOAPSQL) +
    // getMaterials (MFGMAT filtrée par 1 OF) + overrides (SQLite) → tous indépendants → parallèle.
    // Remplace getOrders() (500-2000 lignes, 90j lookback) qui était le goulot d'étranglement.
    let mo: ManufacturingOrder | null = null
    let gammeOps: GammeOperation[] = []
    const ofSupplyFlows: Flow[] = [] // non utilisé dans le chemin MFGMAT ; vide pour fallback BOM
    let materials: import('#repositories/mfgmat_repository').OfMaterial[] = []
    let overrides: Awaited<ReturnType<typeof this.store.getAll>> = []

    try {
      ;[{ gamme: gammeOps }, mo, materials, overrides] = await Promise.all([
        boardDataset.getReferential(),
        new X3OfRepository().getManufacturingOrderByNum(num),
        new X3MfgmatRepository().getMaterials(num),
        this.store.getAll(),
      ])
    } catch {
      // serve empty detail
    }

    const gammeMap = new Map(gammeOps.map((g) => [g.article, g]))
    const ov = overrides.find((o) => o.numOf === num) ?? null
    const wst = ov?.workstation ?? (mo ? (gammeMap.get(mo.article)?.workstation ?? null) : null)
    const wstLabel = wst
      ? (gammeOps.find((g) => g.workstation === wst)?.workstationLabel ?? wst)
      : null

    const status = ov?.status ?? mo?.status ?? 1
    const statusLabel =
      mo?.statutLabel ??
      (status === 1 ? 'Ferme' : status === 2 ? 'Planifié' : status === 3 ? 'Suggéré' : 'Planifié')

    const rate = mo ? (gammeMap.get(mo.article)?.rate ?? 0) : 0
    const hours = mo && rate > 0 ? Math.round((mo.quantity / rate) * 10) / 10 : 0

    const qtyLaunched = mo?.quantityLaunched ?? 0
    const qtyDone = mo?.quantityDone ?? 0
    const qtyRemaining = mo?.quantity ?? 0

    const perf = qtyLaunched > 0 ? Math.round((qtyDone / qtyLaunched) * 100) : null

    const fmtDate = (d: Date | null) =>
      d
        ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
          ', ' +
          d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '—'

    const startDate = ov?.dateDebut ? new Date(ov.dateDebut) : (mo?.startDate ?? null)
    const endDate = ov?.dateFin ? new Date(ov.dateFin) : (mo?.endDate ?? null)

    // Load BOM from MFGMAT (real OF data), fallback to nomenclature for
    // suggestions without MFGMAT (issue #30).
    let bom: BomRow[] = []
    let bomCount = 0
    try {
      // materials déjà chargés en parallèle ci-dessus

      if (materials.length === 0 && mo) {
        // OF sans MFGMAT (suggéré / non éclaté) → nomenclature théorique.
        bom = await this.loadBomFromNomenclature(mo.article, mo.quantity, status === 1, ofSupplyFlows)
        bomCount = bom.length
      } else {
        // Stock availability per component.
        const articles = [...new Set(materials.map((m) => m.article).filter(Boolean))]
        const stockFlows =
          articles.length > 0 ? await boardDataset.getStock(articles).catch(() => []) : []
        const stockByArticle = buildStrictQcStock(stockFlows)

        // Faisabilité via le calcul partagé — même source/verdict que le board (issue #11).
        const verdict = evaluateMfgFeasibility(materials, stockByArticle, status === 1)
        bomCount = verdict.materials.length
        bom = verdict.materials.map((m) => ({
          id: m.article,
          name: m.description || m.article,
          stock: m.available !== null ? m.available.toFixed(0) : '—',
          need: m.remaining.toFixed(m.remaining % 1 === 0 ? 0 : 2),
          unit: m.unit ?? '',
          ok: m.feasible !== false,
          shortage: m.feasible === false && m.missing > 0 ? `−${m.missing.toFixed(0)}` : null,
        }))
      }
    } catch {
      // BOM unavailable — empty table
    }

    // Derive events from MO lifecycle.
    const events: DetailPayload['events'] = []
    if (status >= 2 && startDate) {
      events.push({
        label: 'Début production',
        time: fmtDate(startDate).split(', ')[1] ?? '—',
        desc: `Lancement sur ${wstLabel ?? 'poste non assigné'}`,
        dot: 'bg-blue-500',
      })
    }
    if (status === 3 && endDate) {
      events.push({
        label: 'Fin de production',
        time: fmtDate(endDate).split(', ')[1] ?? '—',
        desc: `${qtyDone} ${mo?.unit ?? ''} produites`,
        dot: 'bg-emerald-500',
      })
    }
    if (ov) {
      events.push({
        label: 'Réordonnancé',
        time: '',
        desc: ov.note ?? 'Override manuel appliqué',
        dot: 'bg-amber-500',
      })
    }

    return {
      num,
      title: mo?.designation ?? mo?.article ?? num,
      article: mo?.article ?? '',
      statusLabel,
      context: [wstLabel, status === 2 ? 'En cours' : ''].filter(Boolean).join(' • '),
      progressPct: Math.max(0, Math.min(100, perf ?? 0)),
      stats: [
        {
          label: 'Quantité',
          value: String(qtyRemaining),
          sub: `/ ${qtyLaunched}`,
          valueClass: 'text-primary',
          trend: null,
          trendClass: '',
        },
        {
          label: 'Réalisé',
          value: perf !== null ? `${perf}%` : '—',
          sub: `${qtyDone} ${mo?.unit ?? ''}`,
          valueClass: perf !== null && perf >= 95 ? 'text-emerald-600' : 'text-primary',
          trend: perf !== null && perf >= 95 ? 'trending_up' : null,
          trendClass: 'text-emerald-500',
        },
        {
          label: 'Temps',
          value: hours > 0 ? String(hours) : '—',
          sub: 'heures',
          valueClass: 'text-primary',
          trend: null,
          trendClass: '',
        },
      ],
      operator: { initials: '—', name: 'Non assigné' },
      cycle: { start: fmtDate(startDate), end: fmtDate(endDate) },
      bomCount,
      bomBlocked: bom.filter((b) => !b.ok).length,
      bom,
      events:
        events.length > 0
          ? events
          : [{ label: 'Aucun événement', time: '', desc: null, dot: 'bg-gray-300' }],
    }
  }

  /**
   * Fallback BOMD — nomenclature théorique pour les OF sans MFGMAT (suggérés,
   * non éclatés). Même règle de faisabilité que checkFeasibility() (badge) :
   * - ACHETE → stock + réceptions
   * - FABRIQUE avec OF → non bloquant pour l'OF parent (traité par le sous-OF)
   * - FABRIQUE sans OF → descente récursive jusqu'aux composants achetés
   *
   * Le stock affiché est le stock RÉEL (strict/qc), pas une valeur fabriquée.
   */
  private async loadBomFromNomenclature(
    article: string,
    parentQty: number,
    isFirm: boolean,
    ofSupplyFlows: Flow[],
  ): Promise<BomRow[]> {
    const nomEntries = await boardDataset.getNomenclature().catch(() => [])

    // Index nomenclature
    const nomenclatures = new Map<string, { description: string; components: NomenclatureEntry[] }>()
    for (const e of nomEntries) {
      const existing = nomenclatures.get(e.parentArticle)
      if (existing) {
        existing.components.push(e)
      } else {
        nomenclatures.set(e.parentArticle, { description: e.parentDescription, components: [e] })
      }
    }

    // Collecte tous les articles atteignables par descente récursive → 1 round-trip stock.
    const reachable = new Set<string>([article])
    const collectReachable = (art: string, seen: Set<string>) => {
      if (seen.has(art)) return
      seen.add(art)
      const bom = nomenclatures.get(art)
      if (!bom) return
      for (const c of bom.components) {
        reachable.add(c.componentArticle)
        if (c.componentType === 'FABRIQUE') collectReachable(c.componentArticle, seen)
      }
    }
    collectReachable(article, new Set())

    const rawStockFlows = await boardDataset.getStock([...reachable]).catch(() => [])
    const stockByArticle = buildStrictQcStock(rawStockFlows)

    // NB : on n'additionne PAS les réceptions fournisseurs au stock affiché.
    // Avant, ce code sommait les BA non reçues datées dans le passé (donc EN RETARD)
    // comme du stock dispo → CE2204 affichait 61 (BA CG2501715 en retard de 3 mois,
    // jamais reçue) tandis que la faisabilité disait rupture (stock strict 0).
    // Source de vérité unique : stock strict seul (aligné sur RecursiveDiagnosticChecker
    // et evaluateMfgFeasibility). Les réceptions restent visibles dans l'onglet Diagnostic.

    const hasSupplyOf = (compArticle: string): boolean =>
      ofSupplyFlows.some((f) => f.article === compArticle && f.quantity > 0)

    const nFr = (n: number) => Math.round(n * 100) / 100
    const rows: BomRow[] = []

    // Descente récursive alignée sur checkFeasibility().
    const descend = (art: string, qty: number, visited: Set<string>) => {
      if (visited.has(art)) return
      visited.add(art)
      const bom = nomenclatures.get(art)
      if (!bom || bom.components.length === 0) return

      for (const comp of bom.components) {
        const needed = comp.consumptionNature === 'FORFAIT' ? comp.linkQuantity : comp.linkQuantity * qty

        if (comp.componentType === 'ACHETE') {
          const stockTotal = stockByArticle.get(comp.componentArticle) ?? 0
          const ok = isFirm || stockTotal >= needed
          rows.push({
            id: comp.componentArticle,
            name: comp.componentDescription || comp.componentArticle,
            stock: nFr(stockTotal).toFixed(0),
            need: needed.toFixed(needed % 1 === 0 ? 0 : 2),
            unit: '',
            ok,
            shortage: !ok ? `−${nFr(needed - stockTotal).toFixed(0)}` : null,
          })
        } else if (hasSupplyOf(comp.componentArticle)) {
          // FABRIQUE avec OF → non bloquant. Stock = 0 (réel, pas fabriqué).
          rows.push({
            id: comp.componentArticle,
            name: comp.componentDescription || comp.componentArticle,
            stock: nFr(stockByArticle.get(comp.componentArticle) ?? 0).toFixed(0),
            need: needed.toFixed(needed % 1 === 0 ? 0 : 2),
            unit: '',
            ok: true,
            shortage: null,
          })
        } else {
          // FABRIQUE sans OF → descente récursive dans sa nomenclature.
          descend(comp.componentArticle, needed, new Set(visited))
        }
      }
    }

    descend(article, parentQty, new Set())
    return rows
  }
}

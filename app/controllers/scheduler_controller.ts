import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import { evaluateMfgFeasibility, buildStrictQcStock } from '#app/domain/of-feasibility'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { loadPosteEngagement } from '#services/poste_engagement_loader'
import { loadBoardData } from '#services/board_payload_loader'
import { loadShortageRows } from '#services/shortage_payload_loader'
import { timeStage } from '#services/perf_metrics'
import { loadOrderBoardData } from '#controllers/order_planning_controller'
import type { Flow } from '#app/domain/models/flow'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Date helpers (mirrors PlanningBoardController logic)
// ---------------------------------------------------------------------------

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

/** Formatte une date ISO (YYYY-MM-DD) en JJ/MM/AA — '' si absente. */
function fmtFrShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
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
    const data = await loadBoardData(ctx)
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
      rawMode === 'ordonnancement'
        ? 'ordonnancement'
        : rawMode === 'planification'
          ? 'planification'
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
  private async loadProgrammeData(
    ctx: HttpContext,
    basePath = '/programme',
    mode: 'combined' | 'ordonnancement' | 'planification' = 'combined'
  ) {
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
          timeStage('programme.loadBoardData', () => loadBoardData(ctx, basePath)),
          timeStage('programme.loadOrderImpacts', () =>
            loadOrderImpacts({
              from: windowStart,
              to: windowTo,
              force,
              // OFs scopés par STRDAT (fenêtre board) + demande WIPTYP=1+2 sans OFs.
              // getOrdersForWindow coalescé avec loadBoardData → 1 SOAP pour les deux.
              pipeline: 'programme',
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
                ateliers: orderBoardData.ateliers,
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
   * GET /api/v1/planning/postes/:poste/engagement — panneau « Engagement » (#46).
   * TOUS les OF fermes du poste (hors limite fenêtre board) + commandes liées via
   * le MÊME matching que le board (CommandeOFMatcher + repli peg contremarque).
   * Cf. loadPosteEngagement.
   */
  async posteEngagement(ctx: HttpContext) {
    const poste = (ctx.params.poste as string).trim()
    const force = !!ctx.request.input('refresh')
    return ctx.response.send(await loadPosteEngagement(poste, force))
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
    // refresh=1 volontairement ABSENT des liens de navigation : sinon un clic « Actualiser »
    // le propage à chaque Préc./Suiv. → purge du cache global à chaque navigation.
    const navQuery = (start: string) => `?start=${start}&days=${horizon}`

    return ctx.inertia.render('scheduler/shortages', {
      horizon,
      windowStart: startIso,
      // URL du fragment différé (calcul lourd côté serveur). Seul endroit où refresh survit.
      rowsHref: `/api/v1/planning/shortages/rows${navQuery(startIso)}${force ? '&refresh=1' : ''}`,
      dateRange: `${fmtFrShort(startIso)} — ${fmtFrShort(navIso(horizon))}`,
      prevHref: `/ruptures${navQuery(navIso(-horizon))}`,
      nextHref: `/ruptures${navQuery(navIso(horizon))}`,
      todayHref: `/ruptures${navQuery(isoDay(now))}`,
    })
  }

  /** GET /api/v1/planning/shortages/rows — endpoint JSON (calcul lourd). Cf. loadShortageRows. */
  async shortageRows(ctx: HttpContext) {
    return loadShortageRows(ctx)
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
        bom = await this.loadBomFromNomenclature(
          mo.article,
          mo.quantity,
          status === 1,
          ofSupplyFlows
        )
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
    ofSupplyFlows: Flow[]
  ): Promise<BomRow[]> {
    const nomEntries = await boardDataset.getNomenclature().catch(() => [])

    // Index nomenclature
    const nomenclatures = new Map<
      string,
      { description: string; components: NomenclatureEntry[] }
    >()
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
        const needed =
          comp.consumptionNature === 'FORFAIT' ? comp.linkQuantity : comp.linkQuantity * qty

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

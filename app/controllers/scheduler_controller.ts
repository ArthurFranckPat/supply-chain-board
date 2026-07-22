import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import { buildStrictQcStock } from '#app/domain/of-feasibility'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { loadPosteEngagement } from '#services/poste_engagement_loader'
import { loadBoardData } from '#services/board_payload_loader'
import { loadShortageRows } from '#services/shortage_payload_loader'
import { timeStage } from '#services/perf_metrics'
import { loadOrderBoardData } from '#controllers/order_planning_controller'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { buildNomenclatureMap } from '#services/feasibility-loader-adapter'
import { buildArticleCatalog, expandArticleSetWithBom } from '#app/domain/order-impacts-assembly'
import {
  evaluateRuptures,
  resolveOfRequirements,
  directMissing,
  type RuptureDataset,
  type RuptureOfInput,
} from '#app/domain/rupture-engine'

// ---------------------------------------------------------------------------

interface BomRow {
  id: string
  name: string
  stock: string
  need: string
  unit: string
  ok: boolean
  shortage: string | null
  /**
   * Quantité de ce composant qui ne tient QUE grâce au stock sous contrôle qualité
   * (statut Q). Non nul → la ligne est « ok » mais l'OF n'est pas lançable tant que le
   * contrôle réception n'a pas libéré le stock. null = aucune dépendance au CQ.
   */
  qc: string | null
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
  /** Date de création de l'OF (ORDERS.CREDAT_0), formatée FR — '—' si absente. */
  createdAt: string
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
  /** Date de fin EFFECTIVE de l'OF (override incluse), ISO — null si inconnue.
   *  Issue #23 : le client en dérive le verdict d'impact (delta vs date de besoin). */
  ofDateFinIso: string | null
  /** Date de besoin EFFECTIVE de la ligne (= dateExpedition), ISO — null si inconnue.
   *  Issue #23 : borne aval du verdict d'impact. */
  cmdDateBesoinIso: string | null
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export default class SchedulerController {
  private get store() {
    return new OverrideStore()
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
                // #23 : dates effectives (overrides inclus côté moteur) — le client en
                // dérive le verdict d'impact (of.dateFin vient d'effectiveDateFin).
                ofDateFinIso: of.dateFin || null,
                cmdDateBesoinIso: order.dateExpedition || null,
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
    // refresh=1 volontairement ABSENT du choix de fenêtre : sinon un clic « Actualiser »
    // se propagerait à chaque changement de plage → purge du cache global à chaque navigation.
    return ctx.inertia.render('scheduler/shortages', {
      horizon,
      windowStart: startIso,
      // URL du fragment différé (calcul lourd côté serveur). Seul endroit où refresh survit.
      rowsHref: `/api/v1/planning/shortages/rows?start=${startIso}&days=${horizon}${force ? '&refresh=1' : ''}`,
      dateRange: `${fmtFrShort(startIso)} — ${fmtFrShort(navIso(horizon))}`,
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

    // BOM : besoins directs via le moteur unique (#73, étape 2.3). MFGMAT si l'OF est
    // éclaté, repli nomenclature théorique sinon (suggestions, issue #30). Même verdict
    // que le badge (précalcul MFGMAT du pipeline board) — parité #11 conservée.
    // OF ferme : le manque résiduel reste VISIBLE (règle 3 — fini le « tout ok » d'office).
    let bom: BomRow[] = []
    let bomCount = 0
    try {
      // materials déjà chargés en parallèle ci-dessus

      if (materials.length === 0 && mo) {
        // OF sans MFGMAT (suggéré / non éclaté) → nomenclature théorique.
        bom = await this.loadBomRowsFromNomenclature(num, mo, status)
      } else {
        // Stock availability per component.
        const articleCodes = [...new Set(materials.map((m) => m.article).filter(Boolean))]
        const stockFlows =
          articleCodes.length > 0 ? await boardDataset.getStock(articleCodes).catch(() => []) : []
        const stockByArticle = buildStrictQcStock(stockFlows)
        // Même dispo hors stock sous CQ : l'écart de manquants révèle les composants qui ne
        // tiennent QUE grâce au statut Q (verdict inchangé, cf. badge board).
        const stockStrictByArticle = buildStrictQcStock(
          stockFlows.filter((f) => (f.origin as { subType?: string }).subType !== 'qc')
        )

        const engineOf = {
          numOf: num,
          article: mo?.article ?? '',
          qteRestante: mo?.quantity ?? 0,
          statutNum: status,
          dateBesoin: null,
          materials,
        }
        const verdicts = evaluateRuptures(
          [engineOf],
          { articles: new Map(), nomenclatures: new Map(), stockNet: stockByArticle },
          'photo'
        )
        const verdictsStrict = evaluateRuptures(
          [engineOf],
          { articles: new Map(), nomenclatures: new Map(), stockNet: stockStrictByArticle },
          'photo'
        )
        const missing = verdicts.get(num) ? directMissing(verdicts.get(num)!) : {}
        const missingStrict = verdictsStrict.get(num) ? directMissing(verdictsStrict.get(num)!) : {}
        bom = materials.map((m) => {
          const available = stockByArticle.get(m.article) ?? 0
          const short = missing[m.article] ?? 0
          const qcCovered = (missingStrict[m.article] ?? 0) - short
          return {
            id: m.article,
            name: m.description || m.article,
            stock: available.toFixed(0),
            need: m.remaining.toFixed(m.remaining % 1 === 0 ? 0 : 2),
            unit: m.unit ?? '',
            ok: short <= 0,
            shortage: short > 0 ? `−${short.toFixed(0)}` : null,
            qc: qcCovered > 0 ? qcCovered.toFixed(0) : null,
          }
        })
      }
      bomCount = bom.length
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
      operator: mo?.createdBy
        ? { initials: mo.createdBy.slice(0, 2).toUpperCase(), name: mo.createdBy }
        : { initials: '—', name: 'Non assigné' },
      createdAt: fmtDate(mo?.createdDate ?? null),
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
   * Composants d'un OF non éclaté (suggéré, sans MFGMAT) : besoins DIRECTS nets via le
   * moteur unique (#73, étape 2.3) — remplace la descente privée loadBomFromNomenclature.
   * Fantômes AFANT aplatis (stock d'abord, reliquat sur les composants réels) ; un
   * sous-ensemble fabriqué est UNE ligne avec son verdict de couverture (stock strict/qc),
   * plus une explosion de ses feuilles. Stock affiché = strict/qc réel — jamais les
   * réceptions (invariant #43).
   */
  private async loadBomRowsFromNomenclature(
    numOf: string,
    mo: ManufacturingOrder,
    status: number
  ): Promise<BomRow[]> {
    const [nomEntries, articlesList] = await Promise.all([
      boardDataset.getNomenclature().catch(() => [] as NomenclatureEntry[]),
      boardDataset.getArticles().catch(() => []),
    ])
    const nomenclatures = buildNomenclatureMap(nomEntries)
    const articles = buildArticleCatalog(articlesList, nomEntries)

    // Périmètre stock = tous les articles atteignables depuis l'OF (fantômes/SE descendus)
    // → 1 seule requête stock.
    const reachable = expandArticleSetWithBom([mo.article], nomEntries)
    const stockFlows = await boardDataset.getStock([...reachable]).catch(() => [])
    const stockNet = buildStrictQcStock(stockFlows)
    // Dispo hors CQ : révèle les composants tenant uniquement sur du stock statut Q.
    const stockNetStrict = buildStrictQcStock(
      stockFlows.filter((f) => (f.origin as { subType?: string }).subType !== 'qc')
    )

    const of: RuptureOfInput = {
      numOf,
      article: mo.article,
      qteRestante: mo.quantity,
      statutNum: status,
      dateBesoin: null,
    }
    const dataset: RuptureDataset = { articles, nomenclatures, stockNet }
    const requirements = resolveOfRequirements(of, dataset)
    const verdict = evaluateRuptures([of], dataset, 'photo').get(numOf)
    const missing = verdict ? directMissing(verdict) : {}
    const verdictStrict = evaluateRuptures(
      [of],
      { articles, nomenclatures, stockNet: stockNetStrict },
      'photo'
    ).get(numOf)
    const missingStrict = verdictStrict ? directMissing(verdictStrict) : {}

    const nFr = (n: number) => Math.round(n * 100) / 100
    return requirements.map((r) => {
      const available = stockNet.get(r.article) ?? 0
      const short = missing[r.article] ?? 0
      const qcCovered = (missingStrict[r.article] ?? 0) - short
      const need = r.need + r.coveredByPhantomStock
      return {
        id: r.article,
        name: articles.get(r.article)?.description || r.article,
        stock: nFr(available).toFixed(0),
        need: need.toFixed(need % 1 === 0 ? 0 : 2),
        unit: '',
        ok: short <= 0,
        shortage: short > 0 ? `−${nFr(short).toFixed(0)}` : null,
        qc: qcCovered > 0 ? nFr(qcCovered).toFixed(0) : null,
      }
    })
  }
}

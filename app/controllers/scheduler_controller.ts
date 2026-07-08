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
import { timeStage } from '#services/perf_metrics'
import { loadOrderBoardData } from '#controllers/order_planning_controller'
import {
  buildShortageRows,
  fabricationDaysFromHours,
  DEFAULT_HOURS_PER_DAY,
  type ShortageRow,
} from '#app/domain/shortages'
import {
  groupReceptionsByArticle,
  RECEPTION_LOOKBACK_DAYS,
  RECEPTION_OVERDUE_MIN_QTY,
} from '#repositories/reception_repository'
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

/**
 * Date ISO → relatif actionnable : « auj. », « demain », « +5j », « −3j ».
 * Le planificateur n'a pas à soustraire mentalement la date du jour. '' si absente.
 * Utilisé dans les colonnes Expé/Commande et les libellés de frise.
 */
function fmtRelatif(iso: string | null | undefined): string {
  if (!iso) return ''
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const a = Date.parse(`${todayIso}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(b)) return ''
  const days = Math.round((b - a) / 86_400_000)
  if (days === 0) return 'auj.'
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  return days > 0 ? `+${days}j` : `${days}j`
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

  /**
   * GET /api/v1/planning/shortages/rows — endpoint JSON (calcul lourd).
   * Charge le pipeline de faisabilité + réceptions, pivote en lignes, renvoie les lignes
   * pré-formatées + stats + erreur X3 (consommé en fetch par la page Solid `scheduler/shortages`).
   *
   * Limite assumée : le verdict de faisabilité par OF vient de l'override MFGMAT (snapshot
   * PLAT, sans consommation virtuelle entre OFs — contrat badge==détail, issue #11). Deux OF
   * partageant le stock d'un même composant peuvent donc être jugés faisables chacun → rupture
   * de contention invisible ici. La vue proactive /suivi (preferEngineFeasibility, moteur
   * séquentiel) couvre ce cas. Ne pas « corriger » ici sans casser la parité badge board.
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

    // Le catch est AUTOUR du getOrSet, pas dans la factory : une erreur X3 transiente ne
    // doit jamais être mise en cache (sinon payload vide servi à tous pendant le TTL).
    // Factory qui throw → bentocache sert le stale s'il existe, sinon l'erreur remonte ici.
    let rows: ShortageRow[] = []
    let stats = { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 }
    let x3Error: string | null = null
    try {
      const cached = await ruptCache().getOrSet({
        key: cacheKey,
        ttl: 2 * 60 * 1000,
        // SWR : timeout par défaut (0) = vrai stale-while-revalidate (cf. board_dataset / suivi).
        // NE PAS mettre > 0 → refresh hors background, rejet orphelin → unhandled rejection → crash.
        factory: async () => {
          // useWindowOfs : OFs scopés par STRDAT (date de DÉBUT). Métier : « on ne peut
          // pas COMMENCER un OF si un composant est en rupture » → l'OF actionnable est
          // celui qui va démarrer dans la fenêtre, pas celui qui finit (déjà lancé =
          // trop tard). En bonus : fenêtre STRDAT courte (~25× moins de lignes que le
          // lookback ENDDAT) + getDemandAndReception sans WIPTYP=5 (cf. /programme).
          //
          const { result, articles, ofPegs, receptionFlows } = await loadOrderImpacts({
            from: windowFrom,
            to: windowTo,
            force,
            pipeline: 'ruptures',
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
          // Réceptions COUVRANTES = PORDERQ complet (getReceptions, cache SWR global déjà
          // partagé avec le détail OF / diagnostic), NON borné à windowTo : un PO arrivant
          // après la fenêtre doit donner « retard », pas un faux « sans couverture » qui
          // fait commander en double. Le MOTEUR de faisabilité garde ses receptionFlows
          // bornés (loadOrderImpacts) — le matcher les compte comme stock sans regarder la
          // date, élargir sa fenêtre fausserait les statuts commande.
          // Repli si le SOAP échoue : fermes ORDERS de la fenêtre (couverture partielle).
          const coverageReceptions = await boardDataset
            .getReceptions()
            .catch(() =>
              receptionFlows.filter(
                (f) => f.origin.type === 'reception' && (f.origin as { firm?: boolean }).firm
              )
            )
          // Lookback des retards de livraison : on garde les PO en retard (attendues dans le
          // passé) jusqu'à RECEPTION_LOOKBACK_DAYS pour capter les livraisons en retard.
          const receptionFrom = new Date()
          receptionFrom.setDate(receptionFrom.getDate() - RECEPTION_LOOKBACK_DAYS)
          receptionFrom.setHours(0, 0, 0, 0)
          const receptionsByArticle = groupReceptionsByArticle(coverageReceptions, receptionFrom)

          // Jours de fabrication par OF depuis la charge gamme : Σ (qté restante / cadence)
          // sur toutes les opérations de l'article, convertie en jours (7,5 h/j, plancher
          // 1 j — décision métier : « charge < 1 journée → 1 journée »). Gamme absente ou
          // référentiel indisponible → plancher 1 j (map vide/entrée manquante).
          const hoursPerDay = Number(process.env.RUPTURES_HOURS_PER_DAY) || DEFAULT_HOURS_PER_DAY
          const fabricationDaysByOf = new Map<string, number>()
          try {
            const { gamme } = await boardDataset.getReferential()
            const opsByArticle = new Map<string, { rate: number }[]>()
            for (const g of gamme) {
              if (!g.article || g.rate <= 0) continue
              const arr = opsByArticle.get(g.article) ?? []
              arr.push(g)
              opsByArticle.set(g.article, arr)
            }
            for (const of of result.ofs) {
              const ops = opsByArticle.get(of.article)
              if (!ops || !of.qteRestante) continue
              let hours = 0
              for (const op of ops) hours += of.qteRestante / op.rate
              fabricationDaysByOf.set(of.numOf, fabricationDaysFromHours(hours, hoursPerDay))
            }
          } catch {
            // Référentiel injoignable → tous les OF au plancher 1 j de fabrication.
          }

          return buildShortageRows(result, receptionsByArticle, articles, pegsIso, {
            overdueMinQty: RECEPTION_OVERDUE_MIN_QTY,
            // Date de besoin = expédition − logistique (2 j) − fabrication (charge gamme).
            // Jalonnement OF (STRDAT/ENDDAT) jamais consulté : jugé non fiable (métier).
            logisticsBufferDays: Number(process.env.RUPTURES_LOGISTICS_BUFFER_DAYS) || undefined,
            fabricationDaysByOf,
          })
        },
      })
      rows = cached.rows
      stats = cached.stats
    } catch (e) {
      x3Error = (e as Error).message
    }

    // Présentation (badges verdict + dates FR). Lecture seule, pas de Solid.
    // Teintes alignées sur les tokens du design system (suggere = ambre, ferme = vert,
    // planifie = bleu, destructive = rouge). Une seule source de vérité pour le cls,
    // consommée telle quelle par le Registre (pas de recalcul côté composant).
    const VERDICT_PRESET: Record<ShortageRow['verdict'], { label: string; cls: string }> = {
      couvert: {
        label: 'Couvert',
        // Effacé par intention : « couvert » = rien à faire, passe ton chemin. Pas de
        // badge vert voyant — juste un texte gris qui se fond, pour que l'œil aille aux
        // vraies alertes (retard / sans couverture).
        cls: 'text-muted-foreground/50',
      },
      a_risque: {
        label: 'À risque',
        cls: 'text-suggere bg-suggere/15',
      },
      retard: {
        label: 'Retard',
        cls: 'text-destructive bg-destructive/10',
      },
      sans_couverture: {
        label: 'Sans couverture',
        // Rouge PLEIN (pas /10) : impasse totale, aucune action en cours — l'alerte la
        // plus forte, au-dessus du retard (qui a au moins une réception en route).
        cls: 'text-destructive bg-destructive/20',
      },
      sous_ensemble: {
        label: 'S/E à lancer',
        cls: 'text-planifie bg-planifie/15',
      },
    }

    const displayRows = rows.map((r) => {
      const preset = VERDICT_PRESET[r.verdict]
      return {
        component: r.component,
        componentDesc: r.componentDesc,
        qteManquante: fmtQty(r.qteManquante),
        // Brut numérique pour les agrégations client (vue « Par composant »).
        qteManquanteNum: r.qteManquante,
        numOf: r.numOf,
        ofHref: `/api/v1/planning/ofs/${r.numOf}/detail`,
        articleParent: r.articleParent,
        articleParentDesc: r.articleParentDesc,
        numCommande: r.numCommande ?? '—',
        client: r.client ?? '',
        hasCommande: r.numCommande !== null,
        // Autres commandes allouées au même OF (au-delà de la plus urgente affichée).
        autresCommandes: r.autresCommandes,
        // Expé en relatif actionnable (« +5j », « auj. ») — l'ISO absolu reste dans
        // dateExpeditionIso pour le tooltip et la frise.
        dateExpedition: fmtRelatif(r.dateExpedition),
        reception: r.reception
          ? {
              id: r.reception.id,
              supplier: r.reception.supplier,
              qty: fmtQty(r.reception.qty),
              dateArrivee: fmtRelatif(r.reception.dateArrivee),
            }
          : null,
        // Arrivée en relatif — sert uniquement à la frise (le badge verdict porte la lateness).
        dateArrivee: r.reception ? fmtRelatif(r.reception.dateArrivee) : '',
        arriveeLate: r.verdict === 'retard',
        overdue: r.overdue,
        // OFs fils produisant le composant (verdict sous_ensemble) — pour la colonne Réception.
        sousEnsembleOfs: r.sousEnsembleOfs,
        verdictKey: r.verdict,
        verdictLabel: (() => {
          // Sous-ensemble : distinguer « OF fils déjà présent » de « à lancer ».
          if (r.verdict === 'sous_ensemble')
            return r.sousEnsembleOfs.length > 0 ? 'S/E — OF fils existant' : 'S/E à lancer'
          if (r.verdict === 'sans_couverture') return preset.label
          // a_risque : pas un retard client. Deux lectures :
          //  - non-overdue : « Marge +Nj » = expé − arrivée (marge logistique restante).
          //  - overdue     : « Fourn. +Nj » = aujourd'hui − attendue (retard fournisseur,
          //    client encore tenable). Le planificateur sait que le fournisseur a manqué.
          if (r.verdict === 'a_risque')
            return r.overdue ? `Fourn. +${r.joursRetardReception}j` : `Marge +${r.joursMarge}j`
          // retard : vrai retard client projeté. overdue = retard déjà cumulé (le plus
          // urgent) ; non-overdue = arrivée après expé, retard projeté.
          if (r.verdict === 'retard') {
            if (r.overdue) return `Retard +${r.joursRetardReception}j`
            return `Retard ${r.joursMarge}j` // joursMarge ≤ 0 (« Retard −Nj »)
          }
          return preset.label
        })(),
        verdictCls: preset.cls,
        // ── Données pour la vue « Couverture » (frise temporelle R3) ──
        // ISO (YYYY-MM-DD) pour positionner les marqueurs ; jours de retard d'arrivée
        // pour le sous-libellé « +N j » du marqueur réception.
        dateExpeditionIso: r.dateExpedition,
        receptionIso: r.reception?.dateArrivee ?? null,
        joursRetardReception: r.joursRetardReception,
        joursMarge: r.joursMarge,
        // Champ texte concaténé pour le filtre client (composant / commande / fournisseur).
        filter:
          `${r.component} ${r.componentDesc} ${r.numCommande ?? ''} ${r.client ?? ''} ${r.reception?.supplier ?? ''} ${r.numOf} ${r.articleParent}`.toLowerCase(),
      }
    })

    return { rows: displayRows, stats, x3Error }
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

import type { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import staticSync from '#services/static_sync_service'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { OverrideStore } from '#services/override_store'
import { loadOrderLineDetail } from '#services/order_line_detail_loader'
import { explodeCharge } from '#app/domain/charge_explosion'
import {
  groupGammeByArticle,
  hoursForQuantity,
  type GammeOperation,
} from '#app/domain/models/gamme'
import type { Article } from '#app/domain/models/article'
import type { Flow } from '#app/domain/models/flow'
import { isManufactured, type NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { Workstation } from '#app/domain/models/workstation'
import { resteAFabriquer } from '#app/domain/models/orders_qty'
import { atelierLabel } from '#app/domain/atelier'
import { CommandeOFMatcher } from '#app/domain/of_conso'
import { remapDemandDates } from '#app/domain/order_impacts_assembly'
import { atMidnight, isoDay, isoWeek } from '#app/utils/dates'

/** Opération « porteuse » pour placer une carte PF : 1ʳᵉ op (OPENUM), pas last-wins. */
function primaryOp(ops: GammeOperation[] | undefined): GammeOperation | undefined {
  return ops?.[0]
}

/** Statut OF (WIPSTA) → ton carte. Source = OF alloué par le matcher, pas la contremarque. */
type OfCardStatus = 'ferme' | 'planifie' | 'suggere'

function ofStatusFromNum(n: number | null | undefined): OfCardStatus {
  if (n === 1) return 'ferme'
  if (n === 2) return 'planifie'
  return 'suggere'
}

/** Clé carte planification (`numCommande#ligne`) depuis un flow demande. */
function demandCardId(f: Flow): string | null {
  const o = f.origin
  if (o.type === 'order') return `${o.id}#${o.ligne ?? ''}`
  if (o.type === 'forecast') return `${o.id}#`
  return null
}

// ---------------------------------------------------------------------------
// Issue #10 — Mode planification (lignes de commande ouvertes).
// Grille : colonnes = JOURS ouvrés (livraison), bande semaine en en-tête,
// lignes = postes de charge (gamme). Drag en temps seul (autre jour, même poste).
// Override local SQLite (lecture seule X3). Horizon en jours, nav via Unpoly.
// ---------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

interface Card {
  id: string
  title: string
  article: string | null
  href: string
  fields: { icon: string; val: string }[]
  metric: string | null
  hours: number
  hasOverride: boolean
  /** Type commande (MTS/MTO/NOR) — pour filtre. */
  orderType: string | null
  /** Nature besoin : COMMANDE (ARxxxx) / PREVISION (SGAxxxx) / INDUIT (ghost). */
  nature: string
  /** Client pour recherche scope. */
  customer: string | null
  /** Article dont la nomenclature contient un composant BDH (issue #28). */
  consommeBouche?: boolean
  /** Typologie X3 (TSICOD_4) du PF (issue #42). */
  typologie?: string
  /** Quantité (reste à livrer). */
  qty?: number
  /** Carte induite (besoin brut depth-1) : ghost, non-draggable, hors filtres. */
  induit?: boolean
  /** Contremarque X3 (FMINUM_0 = peg officiel) — distinct de l'OF alloué par le matcher. */
  contremarque?: string | null
  /**
   * Statut de l'OF alloué (CommandeOFMatcher), pas le peg contremarque.
   * null = aucun OF alloué (stock / achat / sans couverture).
   */
  ofStatus?: OfCardStatus | null
}

interface DayCol {
  short: string
  iso: string
  today: boolean
  headerTone: string
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
  /** Atelier (STOLOC du poste) — filtre atelier (#36). */
  atelier: string
  meta: { k: string; v: string }[]
  dayCells: DayCell[]
  weekLoads: { week: number; hours: number; pct: number; barClass: string }[]
  pp830?: {
    chargeByTypo: { typo: string; sans: number; bouche: number }[]
    stockBouchesHygro: number | null
  }
}

interface OrderBoardData {
  days: DayCol[]
  lines: LineRow[]
  /** Options du filtre atelier (STOLOC distincts), issue #36. */
  ateliers: { code: string; label: string }[]
  weekSpans: { week: number; span: number }[]
  cols: number
  colWeek: number[]
  weekCaps: Record<string, number>
  totalLines: number
  lineCount: number
  x3Error: string | null
  horizon: number
  windowFrom: string
  windowTo: string
  weekLabel: string
  dateRange: string
  prevHref: string
  nextHref: string
  todayHref: string
}

// --- Card factory ---

function makeOrderCard(p: {
  numCommande: string
  ligne: string
  article: string
  designation: string | null
  client: string | null
  quantite: number
  hours: number
  hasOverride: boolean
  orderType: string | null
  nature: string
  consommeBouche: boolean
  typologie?: string
  contremarque?: string | null
  ofStatus?: OfCardStatus | null
}): Card {
  const id = `${p.numCommande}#${p.ligne}`
  const fields = [
    { icon: 'package_2', val: `${p.quantite}` },
    ...(p.client ? [{ icon: 'person', val: p.client }] : []),
  ]
  if (p.orderType) fields.push({ icon: 'sell', val: p.orderType })
  if (p.hours > 0) fields.push({ icon: 'timer', val: `${Math.round(p.hours * 10) / 10}h` })
  return {
    id,
    title: p.designation ?? p.article,
    article: p.article,
    href: `/api/v1/planning/ofs/${p.numCommande}/detail`,
    fields,
    metric: `${p.numCommande} · L${p.ligne}`,
    hours: p.hours,
    hasOverride: p.hasOverride,
    orderType: p.orderType,
    nature: p.nature,
    customer: p.client,
    consommeBouche: p.consommeBouche,
    typologie: p.typologie,
    qty: p.quantite,
    contremarque: p.contremarque ?? null,
    ofStatus: p.ofStatus ?? null,
  }
}

/**
 * Carte induite (ghost) — besoin brut depth-1 via `explodeCharge`, REGROUPÉE
 * par poste × jour × composant : un composant FABRIQUÉ (ex. BDH) à produire sur
 * son poste, agrégeant tous les besoins induits par les commandes du jour.
 * Non-draggable, toujours visible (exclue des filtres via le flag `induit`).
 *
 * • header (card.article, via CardView) = code composant (le BDH à produire).
 * • customer = libellé de source : « pour {PF} » (1 parent) ou « pour N commandes ».
 * • footer = qté + heures (sommées sur le groupe).
 */
function makeInduitCard(p: {
  id: string
  componentArticle: string
  componentDesignation: string | null
  quantite: number
  hours: number
  typologie?: string
  sourceLabel: string
}): Card {
  return {
    id: p.id,
    title: p.componentDesignation ?? p.componentArticle,
    article: p.componentArticle,
    href: '',
    fields: [],
    metric: null,
    hours: p.hours,
    hasOverride: false,
    orderType: null,
    nature: 'INDUIT',
    customer: p.sourceLabel,
    consommeBouche: false,
    typologie: p.typologie,
    qty: p.quantite,
    induit: true,
  }
}

export default class OrderPlanningController {
  private get overrideStore() {
    return new OrderLineOverrideStore()
  }

  /** GET /api/v1/planning/order-lines — JSON (debug / clients externes). */
  async index(ctx: HttpContext) {
    const from = (ctx.request.input('from') as string | undefined) ?? undefined
    const to = (ctx.request.input('to') as string | undefined) ?? undefined
    try {
      const rows = await boardDataset.getOpenOrderLines(from as string, to as string)
      return ctx.response.ok({ orderLines: rows })
    } catch (e) {
      return ctx.response.status(502).json({ error: (e as Error).message })
    }
  }

  /** PATCH /api/v1/planning/order-lines/:order/:line — override date. */
  async update(ctx: HttpContext) {
    const num = ctx.params.order as string
    const ligne = ctx.params.line as string
    const dateLivraison = ctx.request.input('dateLivraison') as string | null | undefined
    if (!dateLivraison || !ISO_RE.test(dateLivraison)) {
      return ctx.response.badRequest({ error: 'dateLivraison (YYYY-MM-DD) requis' })
    }
    try {
      const row = await this.overrideStore.save(num, ligne, { dateLivraison })
      return ctx.response.ok({
        numCommande: row.numCommande,
        ligne: row.ligne,
        dateLivraison: row.dateLivraison,
      })
    } catch (e) {
      return ctx.response.status(500).json({ error: (e as Error).message })
    }
  }

  /** DELETE /api/v1/planning/order-lines/:order/:line/override — supprime override. */
  async resetOverride(ctx: HttpContext) {
    const num = ctx.params.order as string
    const ligne = ctx.params.line as string
    try {
      const ok = await this.overrideStore.delete(num, ligne)
      return ok
        ? ctx.response.ok({ deleted: true })
        : ctx.response.notFound({ error: 'no override' })
    } catch (e) {
      return ctx.response.status(500).json({ error: (e as Error).message })
    }
  }

  /**
   * GET /api/v1/planning/order-lines/:order/:line — détail d'une ligne de commande.
   * Cf. loadOrderLineDetail.
   */
  async lineDetail(ctx: HttpContext) {
    const num = ctx.params.order as string
    const ligne = ctx.params.line as string
    try {
      const detail = await loadOrderLineDetail(num, ligne)
      if (!detail) return ctx.response.notFound({ error: 'Ligne de commande introuvable' })
      return detail
    } catch (e) {
      return ctx.response.status(502).json({ error: (e as Error).message })
    }
  }
}

/**
 * Charge le board planification (lignes de commande ouvertes).
 * Extrait de OrderPlanningController pour être réutilisé par SchedulerController
 * en mode planification de la vue unifiée (/programme?mode=planification, #22).
 *
 * @param base   Base URL pour les liens de navigation (prevHref/nextHref/todayHref).
 * @param modeParam  Param supplémentaire à injecter dans le navQuery (ex. "mode=planification").
 */
export async function loadOrderBoardData(
  ctx: HttpContext,
  base = '/planification',
  modeParam = ''
): Promise<OrderBoardData> {
  const startParam = ctx.request.input('start') as string | undefined
  const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
  const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
  const force = !!ctx.request.input('refresh')

  const today = atMidnight(new Date())
  const windowStart = startParam ? atMidnight(new Date(startParam)) : today

  // --- Jours ouvrés (Lun–Ven) dans l'horizon. ---
  const colDates: Date[] = []
  for (let i = 0; i < horizon; i++) {
    const d = atMidnight(windowStart)
    d.setDate(windowStart.getDate() + i)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) colDates.push(d)
  }
  const colIdx = new Map<string, number>()
  colDates.forEach((d, i) => colIdx.set(isoDay(d), i))
  const windowEnd = colDates.length ? colDates[colDates.length - 1] : windowStart

  // Ligne de commande pour le board planification. Dérivée des demands (ORDERS WIPTYP=1,
  // déjà chargées+cachées via getDemandAndReception, partagées avec loadOrderImpacts) —
  // remplace le SOAP fat getOpenOrderLines (même donnée, source unique ORDERS).
  type BoardOrderLine = {
    numCommande: string
    ligne: string
    article: string
    designation: string | null
    client: string | null
    quantite: number
    dateLivraison: Date
    orderType: string | null
    nature: string
    /** Contremarque X3 (FMINUM_0 = n° OF rattaché) — ouvre le drawer OF au clic carte. */
    contremarque: string | null
  }
  let ordreLignes: BoardOrderLine[] = []
  let gammeOps: GammeOperation[] = []
  let workstations: Workstation[] = []
  let x3Error: string | null = null
  let bdhParents: Set<string> = new Set()
  let typologieByArticle = new Map<string, string>()
  let stockBouchesHygro: number | null = null
  // BOM (composants FABRIQUÉS) pour explodeCharge — achetés exclus (pas de poste).
  let bomByParent = new Map<string, NomenclatureEntry[]>()
  /** Libellé composant pour cartes induites (absent de ChargeRaw). */
  const componentDesc = new Map<string, string>()
  // Entrées matcher commande→OF (statut pastille) — hoistés hors try pour matching post-override.
  let matchDemand: Flow[] = []
  let matchSupply: Flow[] = []
  let matchArticles = new Map<string, Article>()

  try {
    const [ref, demandRecep, bdh, articlesList, bouchesHygro, nomEntries, ordWindow] =
      await Promise.all([
        boardDataset.getReferential(force),
        boardDataset.getDemandAndReception(isoDay(windowStart), isoDay(windowEnd), force),
        staticSync.readBdhParents().catch(() => new Set<string>()),
        boardDataset.getArticles(),
        staticSync.readBouchesHygroSet().catch(() => new Set<string>()),
        staticSync.readNomenclatures().catch(() => [] as NomenclatureEntry[]),
        // OFs fenêtre (STRDAT) — même scope que board-feasibility / programme OF.
        // Échec soft : pastille absente, board commandes reste utilisable.
        boardDataset
          .getOrdersForWindow(windowStart, windowEnd, force)
          .catch(() => ({ mos: [], supply: [] as Flow[], at: 0 })),
      ])
    gammeOps = ref.gamme
    workstations = ref.workstations
    bdhParents = bdh
    matchDemand = demandRecep.demand
    matchSupply = ordWindow.supply
    matchArticles = new Map(articlesList.map((a) => [a.code, a]))
    for (const e of nomEntries) {
      if (!isManufactured(e)) continue // acheté → pas de poste, pas de charge induite
      const arr = bomByParent.get(e.parentArticle)
      if (arr) arr.push(e)
      else bomByParent.set(e.parentArticle, [e])
      if (e.componentDescription) componentDesc.set(e.componentArticle, e.componentDescription)
    }
    for (const a of articlesList) if (a.typologie) typologieByArticle.set(a.code, a.typologie)
    // Stock des bouches hygro (strict+qc) pour le header PP_830 (issue #42).
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
    ordreLignes = demandRecep.demand
      .filter((f): f is Flow & { date: Date } => {
        if (f.date === null) return false
        const t = f.origin.type
        return t === 'order' || t === 'forecast'
      })
      .map((f) => {
        const o = f.origin as Extract<Flow['origin'], { type: 'order' | 'forecast' }>
        const isOrder = o.type === 'order'
        // Besoin net = reste à livrer − déjà alloué (réservé en stock). Une commande
        // entièrement allouée (besoinNet = 0) est A_EXPEDIER — plus rien à fabriquer →
        // elle n'a pas sa place sur le board planification (qui montre la charge à
        // produire). On calcule donc la quantité réellement à fabriquer ici.
        const besoinNet = resteAFabriquer(f.quantity, o.qteAllouee)
        return {
          numCommande: o.id,
          ligne: isOrder ? ((o as { ligne?: string | null }).ligne ?? '') : '',
          article: f.article,
          designation: o.designation ?? null,
          client: o.customer || null,
          quantite: besoinNet,
          dateLivraison: f.date,
          orderType: o.orderType,
          nature: isOrder ? 'COMMANDE' : 'PREVISION',
          contremarque: o.contremarque ?? null,
        }
      })
      // Filtre post-map : ne garde que les lignes avec un reste à fabriquer > 0.
      // Les A_EXPEDIER (besoinNet = 0, entièrement alloués) sont exclus du board —
      // parité avec la vision commande_a_fabriquer du suivi (issue #21).
      .filter((l) => l.quantite > 0)
  } catch (e) {
    x3Error = (e as Error).message
  }

  const overrideMap = await new OrderLineOverrideStore().getMap()
  const opsByArticle = groupGammeByArticle(gammeOps)
  const wstByCode = new Map(workstations.map((w) => [w.code, w]))
  const wstLabels = new Map<string, string>()
  for (const g of gammeOps) {
    if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
  }

  // Statut OF alloué par ligne (matcher — pas contremarque). Pastille card commande.
  const ofStatusByLine = new Map<string, OfCardStatus>()
  if (matchDemand.length > 0 && matchSupply.length > 0) {
    const remapped = remapDemandDates(matchDemand, overrideMap)
    const matcher = new CommandeOFMatcher(matchSupply, matchArticles, new Map())
    const ofOverrideRows = await new OverrideStore().getAll()
    const ofOverrideByNum = new Map(ofOverrideRows.map((o) => [o.numOf, o]))
    for (const r of matcher.matchCommandes(remapped)) {
      const primary = r.ofAllocations[0]
      if (!primary || primary.ofFlow.origin.type !== 'of') continue
      const ofId = primary.ofFlow.origin.id
      const statutNum = ofOverrideByNum.get(ofId)?.status ?? primary.ofFlow.origin.status
      const cardId = demandCardId(r.demandFlow)
      if (cardId) ofStatusByLine.set(cardId, ofStatusFromNum(statutNum))
    }
  }

  // --- Colonne → ISO week + jours ouvrés par semaine (pour capacité hebdo). ---
  const colWeek = colDates.map((d) => isoWeek(d))
  const weekOrder: number[] = []
  const weekDayCount = new Map<number, number>()
  colWeek.forEach((wk) => {
    if (!weekOrder.includes(wk)) weekOrder.push(wk)
    weekDayCount.set(wk, (weekDayCount.get(wk) ?? 0) + 1)
  })
  const weekSpans = weekOrder.map((wk) => ({ week: wk, span: weekDayCount.get(wk) ?? 0 }))
  const weekCaps: Record<string, number> = Object.fromEntries(
    weekOrder.map((wk) => [wk, (weekDayCount.get(wk) ?? 0) * 8])
  )

  interface Bucket {
    dayCards: Card[][]
    totalHours: number
    dayHours: number[]
    lineCount: number
    byTypo: Map<string, { sans: number; bouche: number }>
  }
  const buckets = new Map<string, Bucket>()
  const newBucket = (): Bucket => ({
    dayCards: Array.from({ length: colDates.length }, () => []),
    totalHours: 0,
    dayHours: new Array<number>(colDates.length).fill(0),
    lineCount: 0,
    byTypo: new Map<string, { sans: number; bouche: number }>(),
  })

  // Regroupement des cartes induites par (poste, jour, composant) : si le même
  // composant est induit par plusieurs commandes le même jour, on fusionne en
  // une seule carte (qté/heures sommées) pour ne pas surcharger le board.
  interface InduitGroup {
    poste: string
    idx: number
    componentArticle: string
    componentDesignation: string | null
    totalQty: number
    totalHours: number
    /** commande#ligne → parentArticle (pour le compte + libellé de source). */
    parents: Map<string, string>
  }
  const induitGroups = new Map<string, InduitGroup>()

  for (const line of ordreLignes) {
    const op = primaryOp(opsByArticle.get(line.article))
    const workstation = op?.workstation ?? null
    if (!workstation) continue
    if (!wstLabels.has(workstation)) wstLabels.set(workstation, workstation)

    const hours = hoursForQuantity(op, line.quantite)
    const overrideKey = `${line.numCommande}#${line.ligne}`
    const dateStr = overrideMap.get(overrideKey) ?? isoDay(line.dateLivraison)
    const idx = colIdx.get(dateStr)
    if (idx === undefined) continue

    const card = makeOrderCard({
      numCommande: line.numCommande,
      ligne: line.ligne,
      article: line.article,
      designation: line.designation,
      client: line.client,
      quantite: line.quantite,
      hours,
      hasOverride: overrideMap.has(overrideKey),
      orderType: line.orderType,
      nature: line.nature,
      consommeBouche: bdhParents.has(line.article),
      typologie: typologieByArticle.get(line.article),
      contremarque: line.contremarque,
      ofStatus: ofStatusByLine.get(overrideKey) ?? null,
    })

    if (!buckets.has(workstation)) buckets.set(workstation, newBucket())
    const b = buckets.get(workstation)!
    b.dayCards[idx].push(card)
    b.totalHours += hours
    b.dayHours[idx] += hours
    b.lineCount++
    // Charge par typo (split bouche) — header PP_830 (issue #42).
    const typo = typologieByArticle.get(line.article)
    if (typo) {
      const cur = b.byTypo.get(typo) ?? { sans: 0, bouche: 0 }
      if (bdhParents.has(line.article)) cur.bouche += hours
      else cur.sans += hours
      b.byTypo.set(typo, cur)
    }
  }

  // ── Charge induite via explodeCharge (maxDepth=1, issue #96) ──
  // Même moteur que /charge ; profondeur 1 = comportement historique du board
  // (cartes ghost composants FABRIQUÉS uniquement). Brut : ni netting ni lead time.
  const induitRaws = explodeCharge(
    ordreLignes.map((line) => {
      const overrideKey = `${line.numCommande}#${line.ligne}`
      const dateStr = overrideMap.get(overrideKey) ?? isoDay(line.dateLivraison)
      return {
        article: line.article,
        quantite: line.quantite,
        date: atMidnight(new Date(dateStr)),
        nature: (line.nature === 'PREVISION' ? 'prevision' : 'ferme') as 'prevision' | 'ferme',
        source: {
          numCommande: line.numCommande,
          ligne: line.ligne,
          client: line.client,
          pfArticle: line.article,
        },
      }
    }),
    bomByParent,
    opsByArticle,
    1
  )
  for (const r of induitRaws) {
    if (r.depth === 0) continue
    const idx = colIdx.get(isoDay(r.date))
    if (idx === undefined) continue
    const hours = hoursForQuantity(r, r.qty)
    if (hours <= 0) continue
    if (!wstLabels.has(r.wst)) wstLabels.set(r.wst, r.wst)
    const key = `${r.wst}|${idx}|${r.article}`
    let g = induitGroups.get(key)
    if (!g) {
      g = {
        poste: r.wst,
        idx,
        componentArticle: r.article,
        componentDesignation: componentDesc.get(r.article) ?? null,
        totalQty: 0,
        totalHours: 0,
        parents: new Map(),
      }
      induitGroups.set(key, g)
    }
    g.totalQty += r.qty
    g.totalHours += hours
    if (r.source?.numCommande != null) {
      g.parents.set(`${r.source.numCommande}#${r.source.ligne ?? ''}`, r.source.pfArticle)
    }
  }

  // Émission des cartes induites regroupées : une par poste × jour × composant.
  for (const g of induitGroups.values()) {
    let cb = buckets.get(g.poste)
    if (!cb) {
      cb = newBucket()
      buckets.set(g.poste, cb)
    }
    const parentCount = g.parents.size
    const sourceLabel =
      parentCount <= 1
        ? `pour ${[...g.parents.values()][0] ?? ''}`
        : `pour ${parentCount} commandes`
    cb.dayCards[g.idx].push(
      makeInduitCard({
        id: `INDUIT~${g.poste}~${g.idx}~${g.componentArticle}`,
        componentArticle: g.componentArticle,
        componentDesignation: g.componentDesignation,
        quantite: g.totalQty,
        hours: g.totalHours,
        typologie: typologieByArticle.get(g.componentArticle),
        sourceLabel,
      })
    )
    cb.totalHours += g.totalHours
    cb.dayHours[g.idx] += g.totalHours
  }

  const now = atMidnight(new Date())
  const days: DayCol[] = colDates.map((d, i) => {
    const wd = d.toLocaleDateString('fr-FR', { weekday: 'short' })
    const dn = d.toLocaleDateString('fr-FR', { day: '2-digit' })
    const isToday = d.getTime() === now.getTime()
    return {
      short: `${wd} ${dn}`,
      iso: isoDay(d),
      today: isToday,
      headerTone: isToday ? 'bg-blue-50/30' : i % 2 === 0 ? 'bg-white/50' : '',
    }
  })

  const buildWeekLoads = (lineDayHours: number[]) =>
    weekOrder.map((week) => {
      let hours = 0
      colWeek.forEach((wk, i) => {
        if (wk === week) hours += lineDayHours[i]
      })
      const cap = (weekDayCount.get(week) ?? 0) * 8
      const pct = cap > 0 ? Math.round((hours / cap) * 100) : 0
      return {
        week,
        hours: Math.round(hours * 10) / 10,
        pct,
        barClass: pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500',
      }
    })

  const lines: LineRow[] = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, bucket]) => {
      const stoloc = wstByCode.get(code)?.stockLocation ?? ''
      return {
        name: wstLabels.get(code) ?? code,
        code,
        dot: 'bg-primary',
        // Atelier (STOLOC du poste) — filtre atelier (#36), parité /charge.
        atelier: stoloc,
        meta: [
          { k: 'LIGNES', v: String(bucket.lineCount) },
          { k: 'CHG', v: `${Math.round(bucket.totalHours)}h` },
          { k: 'WST', v: code },
        ],
        // Header PP_830 (issue #42) : charge par typo (split bouche) + stock bouches hygro.
        ...(code === 'PP_830'
          ? {
              pp830: {
                chargeByTypo: [...bucket.byTypo.entries()]
                  .map(([typo, v]) => ({
                    typo,
                    sans: Math.round(v.sans),
                    bouche: Math.round(v.bouche),
                  }))
                  .sort((a, b) => b.sans + b.bouche - (a.sans + a.bouche)),
                stockBouchesHygro,
              },
            }
          : {}),
        dayCells: bucket.dayCards.map((cards, i) => ({
          cellClass: days[i].today ? 'bg-blue-50/10' : '',
          cards,
          iso: isoDay(colDates[i]),
        })),
        weekLoads: buildWeekLoads(bucket.dayHours),
      }
    })

  // Liste des ateliers (STOLOC distincts parmi les lignes) — filtre atelier (#36).
  const ateliers = [...new Set(lines.map((l) => l.atelier).filter(Boolean))]
    .map((code) => ({ code, label: atelierLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const fmtFr = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
  const firstDay = colDates[0] ?? windowStart
  const lastDay = colDates[colDates.length - 1] ?? windowStart
  const navIso = (deltaDays: number) => {
    const d = atMidnight(windowStart)
    d.setDate(d.getDate() + deltaDays)
    return isoDay(d)
  }
  const navQuery = (start: string) =>
    `?start=${start}&days=${horizon}${force ? '&refresh=1' : ''}${modeParam ? `&${modeParam}` : ''}`
  const prevHref = `${base}${navQuery(navIso(-horizon))}`
  const nextHref = `${base}${navQuery(navIso(horizon))}`
  const todayHref = `${base}${navQuery(isoDay(now))}`

  return {
    days,
    lines,
    ateliers,
    weekSpans,
    cols: days.length,
    colWeek,
    weekCaps,
    totalLines: ordreLignes.length,
    lineCount: lines.length,
    x3Error,
    horizon,
    windowFrom: colDates.length ? isoDay(firstDay) : '',
    windowTo: colDates.length ? isoDay(lastDay) : '',
    weekLabel: colDates.length ? `S${isoWeek(firstDay)}` : '',
    dateRange: `${fmtFr(firstDay)} — ${fmtFr(lastDay)}`,
    prevHref,
    nextHref,
    todayHref,
  }
}

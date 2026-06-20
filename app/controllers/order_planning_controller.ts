import type { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import cache from '@adonisjs/cache/services/main'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { X3OrderLineRepository, type OrderLineRow } from '#repositories/order_line_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { hoursForQuantity, type GammeOperation } from '#app/domain/models/gamme'

// ---------------------------------------------------------------------------
// Issue #10 — Mode planification (lignes de commande ouvertes).
// Grille : colonnes = JOURS ouvrés (livraison), bande semaine en en-tête,
// lignes = postes de charge (gamme). Drag en temps seul (autre jour, même poste).
// Override local SQLite (lecture seule X3). Horizon en jours, nav via Unpoly.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

interface Card {
  id: string
  title: string
  article: string | null
  href: string
  accentClass: string
  cardClass: string
  textTone: string
  idTone: string
  fieldValTone: string
  fields: { icon: string; val: string }[]
  metric: string | null
  hours: number
  hasOverride: boolean
  /** Type commande (MTS/MTO/NOR) — pour filtre. */
  orderType: string | null
  /** Nature besoin : COMMANDE (ARxxxx) ou PREVISION (SGAxxxx) — pour filtre. */
  nature: string
  /** Client pour recherche scope. */
  customer: string | null
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
  meta: { k: string; v: string }[]
  dayCells: DayCell[]
  weekLoads: { week: number; hours: number; pct: number; barClass: string }[]
}

interface OrderBoardData {
  days: DayCol[]
  lines: LineRow[]
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

// --- Date helpers (mirror scheduler_controller) ---

const atMidnight = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const isoDay = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
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
    accentClass: p.hasOverride ? 'border-l-amber-500' : 'border-l-primary',
    cardClass: p.hasOverride ? 'bg-amber-50/40' : '',
    textTone: 'text-gray-800',
    idTone: p.hasOverride ? 'text-amber-700' : 'text-gray-500',
    fieldValTone: 'text-gray-600',
    fields,
    metric: `${p.numCommande} · L${p.ligne}`,
    hours: p.hours,
    hasOverride: p.hasOverride,
    orderType: p.orderType,
    nature: p.nature,
    customer: p.client,
  }
}

// --- Controller ---

export default class OrderPlanningController {
  private get overrideStore() {
    return new OrderLineOverrideStore()
  }

  /** GET /planification — board planification. */
  async board(ctx: HttpContext) {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const force = !!ctx.request.input('refresh')
    const windowStart = startParam ? atMidnight(new Date(startParam)) : atMidnight(new Date())

    // Cache du payload calculé, namespacé par utilisateur comme board/vision/suivi
    // (issue #20). Sans cela, getOpenOrderLines interroge X3 à CHAQUE visite du
    // board. TTL court (sources X3 vivantes) ; ?refresh=1 invalide la clé.
    // Sérialisable via superjson (cf. config/cache.ts).
    const planCache = () => {
      const userId = ctx.auth?.user?.id
      return cache.namespace(userId ? `planification:user_${userId}` : 'planification')
    }
    const cacheKey = `payload:${isoDay(windowStart)}:${horizon}`
    if (force) await planCache().delete({ key: cacheKey })
    const data = await planCache().getOrSet({
      key: cacheKey,
      ttl: 2 * 60 * 1000,
      factory: () => this.loadBoardData(ctx),
    })
    return ctx.inertia.render('scheduler/order-board', {
      board: {
        days: data.days,
        lines: data.lines,
        weekSpans: data.weekSpans,
        cols: data.cols,
        colWeek: data.colWeek,
        weekCaps: data.weekCaps,
      },
      totalLines: data.totalLines,
      lineCount: data.lineCount,
      horizon: data.horizon,
      windowFrom: data.windowFrom,
      windowTo: data.windowTo,
      dateRange: data.dateRange,
      weekLabel: data.weekLabel,
      prevHref: data.prevHref,
      nextHref: data.nextHref,
      todayHref: data.todayHref,
      x3Error: data.x3Error,
    })
  }

  /** GET /api/v1/planning/order-lines — JSON (debug / clients externes). */
  async index(ctx: HttpContext) {
    const from = (ctx.request.input('from') as string | undefined) ?? undefined
    const to = (ctx.request.input('to') as string | undefined) ?? undefined
    try {
      const rows = await new X3OrderLineRepository().getOpenOrderLines({ from, to })
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
      return ctx.response.ok({ numCommande: row.numCommande, ligne: row.ligne, dateLivraison: row.dateLivraison })
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
   * GET /api/v1/planning/order-lines/:order/:line — détail d'une ligne de commande
   * (panneau au clic dans la vue planification) : infos commande/ligne + poste/charge +
   * override + faisabilité BOM direct (composants × qté, stock strict/qc + réceptions arrivées).
   */
  async lineDetail(ctx: HttpContext) {
    const num = ctx.params.order as string
    const ligne = ctx.params.line as string
    const nFr = (n: number) => Math.round(n * 100) / 100
    const fmtFr = (d: Date) =>
      d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

    try {
      const line = await new X3OrderLineRepository().getOrderLine(num, ligne)
      if (!line) return ctx.response.notFound({ error: 'Ligne de commande introuvable' })

      // Poste + charge (gamme figée par article).
      const ref = await boardDataset.getReferential()
      const op = ref.gamme.find((g) => g.article === line.article)
      const workstation = op?.workstation ?? null
      const workstationLabel = op?.workstationLabel || workstation
      const hours = op ? hoursForQuantity(op, line.quantite) : 0

      // Override local (date X3 surchargée).
      const overrideMap = await this.overrideStore.getMap()
      const overrideKey = `${line.numCommande}#${line.ligne}`
      const overrideDate = overrideMap.get(overrideKey) ?? null

      // BOM direct + faisabilité (composants × qté ligne, stock + réceptions arrivées).
      const nomEntries = await boardDataset.getNomenclature().catch(() => [])
      const components = nomEntries.filter((e) => e.parentArticle === line.article)
      const compArticles = [...new Set(components.map((c) => c.componentArticle))]
      const stockFlows = compArticles.length ? await boardDataset.getStock(compArticles).catch(() => []) : []
      const stockByArticle = new Map<string, number>()
      for (const f of stockFlows) {
        const sub = (f.origin as { subType?: string })?.subType
        if (sub === 'strict' || sub === 'qc') {
          stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
        }
      }
      const receptionFlows = await new X3ReceptionRepository().getReceptionFlows().catch(() => [])
      const now = new Date()

      const bom = components.map((comp) => {
        const need = comp.linkQuantity * line.quantite
        let available = stockByArticle.get(comp.componentArticle) ?? 0
        for (const rec of receptionFlows) {
          if (rec.article === comp.componentArticle && rec.date && rec.date <= now) available += rec.quantity
        }
        const ok = available >= need
        return {
          article: comp.componentArticle,
          description: comp.componentDescription,
          need: String(nFr(need)),
          available: String(nFr(available)),
          unit: '',
          ok,
          shortage: ok ? null : String(nFr(need - available)),
        }
      })
      const bomBlocked = bom.filter((b) => !b.ok).length

      return {
        numCommande: line.numCommande,
        ligne: line.ligne,
        article: line.article,
        designation: line.designation,
        client: line.client,
        quantite: nFr(line.quantite),
        unite: line.unite,
        dateLivraison: fmtFr(overrideDate ? new Date(overrideDate) : line.dateLivraison),
        contremarque: line.contremarque,
        orderType: line.orderType,
        nature: line.nature,
        hasOverride: overrideMap.has(overrideKey),
        workstation,
        workstationLabel,
        hours: nFr(hours),
        bom,
        bomCount: bom.length,
        bomBlocked,
        x3Error: null as string | null,
      }
    } catch (e) {
      return ctx.response.status(502).json({ error: (e as Error).message })
    }
  }

  // -------------------------------------------------------------------------
  // Board data
  // -------------------------------------------------------------------------

  private async loadBoardData(ctx: HttpContext): Promise<OrderBoardData> {
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

    let ordreLignes: OrderLineRow[] = []
    let gammeOps: GammeOperation[] = []
    let x3Error: string | null = null

    try {
      const [ref, lines] = await Promise.all([
        boardDataset.getReferential(force),
        new X3OrderLineRepository().getOpenOrderLines({
          from: isoDay(windowStart),
          to: isoDay(windowEnd),
        }),
      ])
      gammeOps = ref.gamme
      ordreLignes = lines
    } catch (e) {
      x3Error = (e as Error).message
    }

    const overrideMap = await this.overrideStore.getMap()
    const gammeMap = new Map(gammeOps.map((g) => [g.article, g]))
    const wstLabels = new Map<string, string>()
    for (const g of gammeOps) {
      if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
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

    // --- Grouping : une carte par ligne, rangée = poste (gamme figé),
    //     colonne = JOUR d'échéance (override > X3). ---
    interface Bucket {
      dayCards: Card[][]
      totalHours: number
      dayHours: number[]
      lineCount: number
    }
    const buckets = new Map<string, Bucket>()

    for (const line of ordreLignes) {
      const op = gammeMap.get(line.article)
      const workstation = op?.workstation ?? null
      if (!workstation) continue
      if (!wstLabels.has(workstation)) wstLabels.set(workstation, workstation)

      const rate = op?.rate ?? 0
      const hours = rate > 0 ? line.quantite / rate : 0
      const overrideKey = `${line.numCommande}#${line.ligne}`
      const dateStr = overrideMap.get(overrideKey) ?? isoDay(line.dateLivraison)
      const idx = colIdx.get(dateStr)
      if (idx === undefined) continue // hors fenêtre / week-end

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
      })

      if (!buckets.has(workstation)) {
        buckets.set(workstation, {
          dayCards: Array.from({ length: colDates.length }, () => []),
          totalHours: 0,
          dayHours: new Array<number>(colDates.length).fill(0),
          lineCount: 0,
        })
      }
      const b = buckets.get(workstation)!
      b.dayCards[idx].push(card)
      b.totalHours += hours
      b.dayHours[idx] += hours
      b.lineCount++
    }

    // --- Colonnes jour. ---
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

    // --- Histogramme hebdo par ligne (somme dayHours par semaine vs jours×8h). ---
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
      .map(([code, bucket]) => ({
        name: wstLabels.get(code) ?? code,
        code,
        dot: 'bg-primary',
        meta: [
          { k: 'LIGNES', v: String(bucket.lineCount) },
          { k: 'CHG', v: `${Math.round(bucket.totalHours)}h` },
          { k: 'WST', v: code },
        ],
        dayCells: bucket.dayCards.map((cards, i) => ({
          cellClass: days[i].today ? 'bg-blue-50/10' : '',
          cards,
          iso: isoDay(colDates[i]),
        })),
        weekLoads: buildWeekLoads(bucket.dayHours),
      }))

    // --- Nav horizon (Préc./Suiv./Aujourd'hui), pas = horizon jours. ---
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
      `?start=${start}&days=${horizon}` + (force ? '&refresh=1' : '')
    const base = '/planification'
    const prevHref = `${base}${navQuery(navIso(-horizon))}`
    const nextHref = `${base}${navQuery(navIso(horizon))}`
    const todayHref = `${base}${navQuery(isoDay(now))}`

    return {
      days,
      lines,
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
}

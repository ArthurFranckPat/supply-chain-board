import type { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { X3OrderLineRepository, type OrderLineRow } from '#repositories/order_line_repository'
import type { GammeOperation } from '#app/domain/models/gamme'

// ---------------------------------------------------------------------------
// Issue #10 — Mode planification (lignes de commande ouvertes).
// Grille : colonnes = semaines (livraison), lignes = postes de charge (gamme).
// Drag en temps seul (autre semaine, dans la rangée du poste).
// Override local SQLite (lecture seule X3).
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
}

interface WeekCol {
  week: number
  iso: string
  short: string
  loadHours: number
  cap: number
  pct: number
  barClass: string
  headerTone: string
  labelClass: string
}

interface WeekCell {
  cellClass: string
  cards: Card[]
  iso: string
}

interface LineRow {
  name: string
  code: string
  dot: string
  meta: { k: string; v: string }[]
  weekCells: WeekCell[]
  weekLoads: { week: number; hours: number; pct: number; barClass: string }[]
}

interface OrderBoardData {
  weeks: WeekCol[]
  lines: LineRow[]
  weekSpans: { week: number; span: number }[]
  cols: number
  colWeek: number[]
  weekCaps: Record<string, number>
  totalLines: number
  lineCount: number
  x3Error: string | null
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

const startOfIsoWeek = (d: Date) => {
  const t = atMidnight(d)
  const dow = t.getDay() || 7
  t.setDate(t.getDate() - (dow - 1))
  return t
}

const addWeeks = (d: Date, n: number) => {
  const t = atMidnight(d)
  t.setDate(t.getDate() + n * 7)
  return t
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
}): Card {
  const id = `${p.numCommande}#${p.ligne}`
  const fields = [
    { icon: 'package_2', val: `${p.quantite}` },
    ...(p.client ? [{ icon: 'person', val: p.client }] : []),
  ]
  if (p.hours > 0) fields.push({ icon: 'timer', val: `${Math.round(p.hours * 10) / 10}h` })
  return {
    id,
    title: p.designation ?? p.article,
    article: p.article,
    href: `/scheduler/of/${p.numCommande}`,
    accentClass: p.hasOverride ? 'border-l-amber-500' : 'border-l-primary',
    cardClass: p.hasOverride ? 'bg-amber-50/40' : '',
    textTone: 'text-gray-800',
    idTone: p.hasOverride ? 'text-amber-700' : 'text-gray-500',
    fieldValTone: 'text-gray-600',
    fields,
    metric: `${p.numCommande} · L${p.ligne}`,
    hours: p.hours,
    hasOverride: p.hasOverride,
  }
}

// --- Controller ---

export default class OrderPlanningController {
  private get overrideStore() {
    return new OrderLineOverrideStore()
  }

  /** GET /scheduler/planning-board — board planification. */
  async board(ctx: HttpContext) {
    const data = await this.loadBoardData(ctx)
    return ctx.view.render('pages/scheduler/order_board', {
      title: 'Planification — Lignes de commande',
      ...data,
    })
  }

  /** GET /api/v1/order-planning/order-lines — JSON (debug / clients externes). */
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

  /** PATCH /api/v1/order-planning/order-lines/:num/:ligne — override date. */
  async update(ctx: HttpContext) {
    const num = ctx.params.num as string
    const ligne = ctx.params.ligne as string
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

  /** DELETE /api/v1/order-planning/order-lines/:num/:ligne/override — supprime override. */
  async resetOverride(ctx: HttpContext) {
    const num = ctx.params.num as string
    const ligne = ctx.params.ligne as string
    try {
      const ok = await this.overrideStore.delete(num, ligne)
      return ok
        ? ctx.response.ok({ deleted: true })
        : ctx.response.notFound({ error: 'no override' })
    } catch (e) {
      return ctx.response.status(500).json({ error: (e as Error).message })
    }
  }

  // -------------------------------------------------------------------------
  // Board data
  // -------------------------------------------------------------------------

  private async loadBoardData(ctx: HttpContext): Promise<OrderBoardData> {
    const startParam = ctx.request.input('start') as string | undefined
    const weeksParam = Number.parseInt(ctx.request.input('weeks', '8'), 10)
    const horizon = Number.isFinite(weeksParam) && weeksParam > 0 && weeksParam <= 26 ? weeksParam : 8
    const force = !!ctx.request.input('refresh')

    const today = atMidnight(new Date())
    const windowStart = startParam ? atMidnight(new Date(startParam)) : startOfIsoWeek(today)
    const windowEnd = addWeeks(windowStart, horizon)

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

    // --- N semaines : génère liste ISO week (windowStart → windowStart+horizon). ---
    const weekOrder: number[] = []
    const weekStart = new Map<number, Date>()
    for (let w = 0; w < horizon; w++) {
      const ws = addWeeks(windowStart, w)
      const wk = isoWeek(ws)
      if (!weekOrder.includes(wk)) {
        weekOrder.push(wk)
        weekStart.set(wk, ws)
      }
    }

    // Capacités : jours ouvrés dans la fenêtre × 8h (identique board OF).
    // Calcul par index de semaine (0..horizon-1) pour rester aligné sur les colonnes.
    const weekCapHours = (idx: number) => {
      const ws = addWeeks(windowStart, idx)
      let days = 0
      for (let d = 0; d < 7; d++) {
        const dd = new Date(ws)
        dd.setDate(ws.getDate() + d)
        const dow = dd.getDay()
        if (dow !== 0 && dow !== 6) days++
      }
      return days * 8
    }

    // --- Grouping : une carte par ligne, rangée = poste (gamme figé),
    //     colonne = semaine d'échéance (override > X3). ---
    interface Bucket {
      cards: (Card & { weekIdx: number })[]
      totalHours: number
      weekHours: number[]
    }
    const buckets = new Map<string, Bucket>()

    for (const line of ordreLignes) {
      const op = gammeMap.get(line.article)
      const workstation = op?.workstation ?? null
      if (!workstation) continue
      if (!wstLabels.has(workstation)) wstLabels.set(workstation, workstation)

      const rate = op?.rate ?? 0
      const hours = rate > 0 ? (line.quantite / rate) : 0
      const overrideKey = `${line.numCommande}#${line.ligne}`
      const dateStr = overrideMap.get(overrideKey) ?? isoDay(line.dateLivraison)
      const date = new Date(dateStr)
      if (Number.isNaN(date.getTime())) continue

      const wk = isoWeek(date)
      const weekIdx = weekOrder.indexOf(wk)
      if (weekIdx === -1) continue // hors fenêtre

      const card = makeOrderCard({
        numCommande: line.numCommande,
        ligne: line.ligne,
        article: line.article,
        designation: line.designation,
        client: line.client,
        quantite: line.quantite,
        hours,
        hasOverride: overrideMap.has(overrideKey),
      })

      if (!buckets.has(workstation)) {
        buckets.set(workstation, {
          cards: [],
          totalHours: 0,
          weekHours: new Array<number>(horizon).fill(0),
        })
      }
      const b = buckets.get(workstation)!
      b.cards.push({ ...card, weekIdx })
      b.totalHours += hours
      b.weekHours[weekIdx] += hours
    }

    // --- Construit colonnes + rangées pour le client. ---
    const weeks: WeekCol[] = weekOrder.map((wk, idx) => {
      const cap = weekCapHours(idx)
      const totalLoad = [...buckets.values()].reduce((s, b) => s + b.weekHours[idx], 0)
      const pct = cap > 0 ? Math.round((totalLoad / cap) * 100) : 0
      const ws = weekStart.get(wk)!
      return {
        week: wk,
        iso: isoDay(ws),
        short: `S${wk}`,
        loadHours: Math.round(totalLoad * 10) / 10,
        cap,
        pct,
        barClass: pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : pct > 0 ? 'bg-emerald-500' : 'bg-gray-300',
        headerTone: idx % 2 === 0 ? 'bg-white/50' : 'bg-gray-50/30',
        labelClass: pct > 100 ? 'text-error' : pct >= 90 ? 'text-blue-600' : 'text-gray-500',
      }
    })

    const weekCaps: Record<string, number> = Object.fromEntries(
      weekOrder.map((wk, idx) => [wk, weekCapHours(idx)])
    )

    const lines: LineRow[] = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, bucket]) => {
        const cells: WeekCell[] = weekOrder.map((_, ci) => {
          const cardsInWeek = bucket.cards
            .filter((c) => c.weekIdx === ci)
            .map(({ weekIdx: _wi, ...rest }) => rest)
          return {
            cellClass: ci % 2 === 0 ? 'bg-white/30' : 'bg-gray-50/30',
            cards: cardsInWeek,
            iso: isoDay(weekStart.get(weekOrder[ci]!)!),
          }
        })
        const weekLoads = weekOrder.map((wk, ci) => {
          const cap = weekCaps[String(wk)] ?? 0
          const h = bucket.weekHours[ci]
          const pct = cap > 0 ? Math.round((h / cap) * 100) : 0
          return {
            week: wk,
            hours: Math.round(h * 10) / 10,
            pct,
            barClass: pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500',
          }
        })
        return {
          name: wstLabels.get(code) ?? code,
          code,
          dot: 'bg-primary',
          meta: [
            { k: 'LIGNES', v: String(bucket.cards.length) },
            { k: 'CHG', v: `${Math.round(bucket.totalHours)}h` },
            { k: 'WST', v: code },
          ],
          weekCells: cells,
          weekLoads,
        }
      })

    const colWeek = weekOrder.slice()

    return {
      weeks,
      lines,
      weekSpans: weekOrder.map((wk) => ({ week: wk, span: 1 })),
      cols: weekOrder.length,
      colWeek,
      weekCaps,
      totalLines: ordreLignes.length,
      lineCount: lines.length,
      x3Error,
    }
  }
}

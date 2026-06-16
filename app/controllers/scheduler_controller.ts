import type { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { X3MfgmatRepository } from '#repositories/mfgmat_repository'
import { evaluateMfgFeasibility, buildStrictQcStock } from '#app/domain/of-feasibility'
import { type ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { buildShortageRows, type ShortageRow } from '#app/domain/shortages'
import { buildReceptionsMap } from '#services/feasibility-loader-adapter'
import { X3ReceptionRepository } from '#repositories/reception_repository'

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
  badgeLabel: string
  badgeIcon: string | null
  badgeClass: string
  accentClass: string
  cardClass: string
  textTone: string
  idTone: string
  fieldIconTone: string
  fieldValTone: string
  fields: Field[]
  alert: string | null
  progress: number | null
  footer: CardFooter | null
  metric: string | null
  hours: number
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
  statusIcon: string
  statusClass: string
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

const PRESETS: Record<CardStatus, Partial<Card>> = {
  termine: {
    badgeLabel: 'Terminé',
    badgeIcon: 'check_circle',
    badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    accentClass: 'border-l-emerald-500',
  },
  ferme: {
    badgeLabel: 'Ferme',
    badgeIcon: null,
    badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    accentClass: 'border-l-emerald-500',
  },
  cours: {
    badgeLabel: 'En Cours',
    badgeIcon: 'schedule',
    badgeClass: 'text-blue-700 bg-blue-50 border-blue-100',
    accentClass: 'border-l-blue-500',
  },
  planifie: {
    badgeLabel: 'Planifié',
    badgeIcon: 'schedule',
    badgeClass: 'text-blue-700 bg-blue-50 border-blue-100',
    accentClass: 'border-l-blue-500',
  },
  suggere: {
    badgeLabel: 'Suggéré',
    badgeIcon: 'lightbulb',
    badgeClass: 'text-amber-700 bg-amber-50 border-amber-100',
    accentClass: 'border-l-amber-500',
  },
  bloque: {
    badgeLabel: 'Bloqué',
    badgeIcon: 'warning',
    badgeClass: 'text-white bg-error',
    accentClass: 'border-l-error',
    cardClass: 'bg-red-50/50 border-red-200',
    textTone: 'text-gray-900',
    idTone: 'text-error',
    fieldIconTone: 'text-red-300',
    fieldValTone: 'text-red-700',
  },
}

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
}): Card {
  const base: Card = {
    id: p.id,
    title: p.title,
    article: p.article ?? null,
    status: p.status,
    href: `/scheduler/of/${p.id.replace('#', '')}`,
    badgeLabel: '',
    badgeIcon: null,
    badgeClass: '',
    accentClass: '',
    cardClass: '',
    textTone: 'text-gray-800',
    idTone: 'text-gray-400',
    fieldIconTone: 'text-gray-400',
    fieldValTone: 'text-gray-600',
    fields: p.fields ?? [],
    alert: p.alert ?? null,
    progress: p.progress ?? null,
    footer: p.footer ?? null,
    metric: p.metric ?? null,
    hours: p.hours ?? 0,
  }
  return { ...base, ...PRESETS[p.status] } as Card
}

// ---------------------------------------------------------------------------
// Date helpers (mirrors PlanningBoardController logic)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

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

/** Build a Card from a ManufacturingOrder + optional progress info. */
function moToCard(mo: ManufacturingOrder, rate: number, workstationLabel: string | null): Card {
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
  })
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export default class SchedulerController {
  private get store() {
    return new OverrideStore()
  }

  /** GET /scheduler/board — expert high-density scheduling board. */
  async expertBoard(ctx: HttpContext) {
    const data = await this.loadBoardData(ctx)
    return ctx.inertia.render('scheduler/expert-board', {
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

  /** GET /scheduler/of/:num — OF detail panel (Focus Productivité Technique). */
  async ofDetail(ctx: HttpContext) {
    const num = ctx.params.num as string
    const [board, detail] = await Promise.all([this.loadBoardData(ctx, `/scheduler/of/${num}`), this.loadOfDetail(num)])
    return ctx.view.render('pages/scheduler/of_detail', {
      title: `${num} — Détail OF`,
      num,
      detail,
      ...board,
    })
  }

  /**
   * GET /scheduler/shortages — coquille (shell) du suivi des ruptures (issue #15/#16).
   * Rendu INSTANTANÉ : aucun calcul X3 ici. Le tableau (calcul lourd) est chargé en
   * différé via Unpoly `[up-defer]` depuis `/scheduler/shortages/rows` → page réactive.
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
    const navQuery = (start: string) => `?start=${start}&days=${horizon}` + (force ? '&refresh=1' : '')

    return ctx.view.render('pages/scheduler/shortage_tracker', {
      title: 'Ruptures — Suivi',
      horizon,
      windowStart: startIso,
      // URL du fragment différé (calcul lourd côté serveur).
      rowsHref: `/scheduler/shortages/rows${navQuery(startIso)}`,
      dateRange: `${fmtFrShort(startIso)} — ${fmtFrShort(navIso(horizon))}`,
      prevHref: `/scheduler/shortages${navQuery(navIso(-horizon))}`,
      nextHref: `/scheduler/shortages${navQuery(navIso(horizon))}`,
      todayHref: `/scheduler/shortages${navQuery(isoDay(now))}`,
    })
  }

  /**
   * GET /scheduler/shortages/rows — fragment Unpoly (calcul lourd).
   * Charge le pipeline de faisabilité + réceptions, pivote en lignes, rend le partial
   * `shortage_table` (racine `#shortages-content`).
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

    let rows: ShortageRow[] = []
    let stats = { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 }
    let x3Error: string | null = null

    try {
      const { result, articles, ofPegs } = await loadOrderImpacts({ from: windowFrom, to: windowTo, force })
      // OfCommandePeg (Date) → ShortageOfPeg (ISO) pour le pivot pur.
      const pegsIso = new Map(
        [...ofPegs].map(([ofNum, p]) => [
          ofNum,
          { numCommande: p.numCommande, client: p.client, dateExpedition: p.dateExpedition?.toISOString().slice(0, 10) ?? null },
        ]),
      )
      const receptionFlows = await new X3ReceptionRepository().getReceptionFlows()
      // N'agréger que les réceptions encore à venir (≥ début de fenêtre) : une réception déjà
      // arrivée est consommée dans le stock et fausserait la couverture. Pas de borne haute —
      // une réception au-delà de la fenêtre reste utile pour détecter un retard d'arrivée.
      const receptionsByArticle = buildReceptionsMap(
        receptionFlows
          .filter((f) => f.date !== null && f.date >= windowFrom)
          .map((f) => ({
          article: f.article,
          id: (f.origin as { id?: string }).id,
          supplier: (f.origin as { supplier?: string }).supplier,
          quantity: f.quantity,
          date: f.date,
        })),
      )
      const built = buildShortageRows(result, receptionsByArticle, articles, pegsIso)
      rows = built.rows
      stats = built.stats
    } catch (e) {
      x3Error = (e as Error).message
    }

    // Présentation (badges verdict + dates FR). Lecture seule, pas de Solid.
    const VERDICT_PRESET: Record<ShortageRow['verdict'], { label: string; cls: string; icon: string }> = {
      couvert: { label: 'Couvert', cls: 'text-emerald-700 bg-emerald-50 border-emerald-100', icon: 'check_circle' },
      retard: { label: 'Retard', cls: 'text-amber-700 bg-amber-50 border-amber-100', icon: 'schedule' },
      sans_couverture: { label: 'Sans couverture', cls: 'text-error bg-error/10 border-error/20', icon: 'error' },
    }

    const displayRows = rows.map((r) => {
      const preset = VERDICT_PRESET[r.verdict]
      return {
        component: r.component,
        componentDesc: r.componentDesc,
        qteManquante: fmtQty(r.qteManquante),
        numOf: r.numOf,
        ofHref: `/scheduler/of/${r.numOf}`,
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
        verdictLabel: (() => {
          // Affiche le pire retard : commande (stock) vs arrivée réception trop tardive.
          const j = Math.max(r.joursRetard, r.joursRetardReception)
          return r.verdict === 'retard' && j > 0 ? `Retard +${j}j` : preset.label
        })(),
        verdictCls: preset.cls,
        verdictIcon: preset.icon,
        // Champ texte concaténé pour le filtre client (composant / commande / fournisseur).
        filter: `${r.component} ${r.componentDesc} ${r.numCommande ?? ''} ${r.client ?? ''} ${r.reception?.supplier ?? ''} ${r.numOf} ${r.articleParent}`.toLowerCase(),
      }
    })

    return ctx.view.render('pages/scheduler/shortage_table', {
      rows: displayRows,
      stats,
      x3Error,
    })
  }

  // -------------------------------------------------------------------------
  // Board data — same X3 sources as the planning-board API (boardDataset)
  // -------------------------------------------------------------------------

  private async loadBoardData(ctx: HttpContext, basePath = '/scheduler/board') {
    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
    const force = !!ctx.request.input('refresh')

    const windowStart = startParam ? new Date(startParam) : new Date()
    windowStart.setHours(0, 0, 0, 0)

    let mos: ManufacturingOrder[] = []
    let gammeOps: GammeOperation[] = []
    let x3Error: string | null = null

    try {
      const [ref, ord] = await Promise.all([
        boardDataset.getReferential(force),
        boardDataset.getOrders(force),
      ])
      gammeOps = ref.gamme
      mos = ord.mos
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
    const lineMeta = new Map<
      string,
      { ofCount: number; totalHours: number; dayHours: number[] }
    >()

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
      const cardObj = moToCard(mo, rate, wstLabel)

      if (!cardsByLineDay.has(wst)) {
        cardsByLineDay.set(
          wst,
          Array.from({ length: colDates.length }, () => [])
        )
        lineMeta.set(wst, {
          ofCount: 0,
          totalHours: 0,
          dayHours: new Array<number>(colDates.length).fill(0),
        })
      }
      cardsByLineDay.get(wst)![idx].push(cardObj)
      const m = lineMeta.get(wst)!
      m.ofCount++
      m.totalHours += hours
      m.dayHours[idx] += hours
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
    const weekCaps = Object.fromEntries(weekOrder.map((wk) => [wk, (weekDayCount.get(wk) ?? 0) * 8]))

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
          meta: [
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
      // Objet board brut (props Inertia) + forme sérialisée (îlot Solid #board-data
      // encore utilisé par of_detail.edge). Les deux reflètent le même payload.
      board: { days, lines, weekSpans, cols: days.length, colWeek, weekCaps },
      boardJson: JSON.stringify({ days, lines, weekSpans, cols: days.length, colWeek, weekCaps }),
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
    // Find the MO.
    let mos: ManufacturingOrder[] = []
    let gammeOps: GammeOperation[] = []
    try {
      const [ref, ord] = await Promise.all([
        boardDataset.getReferential(),
        boardDataset.getOrders(),
      ])
      gammeOps = ref.gamme
      mos = ord.mos
    } catch {
      // serve empty detail
    }

    const mo = mos.find((m) => m.numOf === num)
    const gammeMap = new Map(gammeOps.map((g) => [g.article, g]))
    const overrides = await this.store.getAll()
    const ov = overrides.find((o) => o.numOf === num) ?? null
    const wst = ov?.workstation ?? (mo ? (gammeMap.get(mo.article)?.workstation ?? null) : null)
    const wstLabel = wst
      ? (gammeOps.find((g) => g.workstation === wst)?.workstationLabel ?? wst)
      : null

    const status = ov?.status ?? mo?.status ?? 1
    const statusLabel =
      mo?.statutLabel ?? (status === 1 ? 'Ferme' : status === 2 ? 'Planifié' : status === 3 ? 'Suggéré' : 'Planifié')

    const cardStatus = moStatusToCard(status)
    const preset = PRESETS[cardStatus]
    const statusIcon = preset.badgeIcon ?? 'circle'

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

    // Load BOM from MFGMAT (real OF data).
    let bom: BomRow[] = []
    let bomCount = 0
    try {
      const materials = await new X3MfgmatRepository().getMaterials(num)
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
      statusIcon,
      statusClass: preset.badgeClass ?? '',
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
}

/**
 * Assemblage du payload board d'ordonnancement (OF posés sur postes de charge,
 * fenêtre de jours ouvrés, cartes, charge/semaine).
 *
 * Extrait de `SchedulerController.loadBoardData` (issue #49) : plus gros offender du
 * controller (277 l.), réutilisé par 3 endpoints (`/ordonnancement`, `/programme` via
 * loadProgrammeData, et transitivement le détail OF). Découpage incrémental — seul
 * `loadBoardData` est sorti dans ce lot ; shortageTracker/shortageRows/loadOfDetail
 * restent dans le controller (cf. commentaire issue #49).
 */

import type { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import staticSync from '#services/static_sync_service'
import { OverrideStore } from '#services/override_store'
import { timeStage } from '#services/perf_metrics'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { Flow } from '#app/domain/models/flow'
import { type ManufacturingOrder } from '#repositories/of_repository'

// ---------------------------------------------------------------------------
// Display types
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

export interface BoardPayload {
  days: DayCol[]
  lines: LineRow[]
  cols: number
  horizon: number
  windowFrom: string
  windowTo: string
  weekSpans: { week: number; span: number }[]
  colWeekJson: string
  weekCapsJson: string
  board: {
    days: DayCol[]
    lines: LineRow[]
    weekSpans: { week: number; span: number }[]
    cols: number
    colWeek: number[]
    weekCaps: Record<number, number>
  }
  weekLabel: string
  dateRange: string
  prevHref: string
  nextHref: string
  todayHref: string
  totalOf: number
  lineCount: number
  x3Error: string | null
  cached: string | null
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
// Date helpers
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
  typologieByArticle: Map<string, string>
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
// Board data — same X3 sources as the planning-board API (boardDataset)
// ---------------------------------------------------------------------------

/** GET /ordonnancement, /programme — board OF posés sur postes de charge. */
export async function loadBoardData(
  ctx: HttpContext,
  basePath = '/ordonnancement'
): Promise<BoardPayload> {
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
    const [ref, ord, bdh, articlesList, bouchesHygro] = await timeStage(
      'loadBoardData.datasets',
      () =>
        Promise.all([
          timeStage('loadBoardData.referential', () => boardDataset.getReferential(force)),
          // Filtre STRDAT (fenêtre courte) au lieu de lookback 90j ENDDAT → ~25× moins de lignes ZSOAPSQL O(n²).
          // Coalescé avec getOrdersForWindow dans loadOrderImpacts → 1 seul SOAP pour les deux.
          timeStage('loadBoardData.orders', () =>
            boardDataset.getOrdersForWindow(windowStart, windowEnd, force)
          ),
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

  const overrides = await new OverrideStore().getAll()
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
    {
      ofCount: number
      totalHours: number
      dayHours: number[]
      byTypo: Map<string, { sans: number; bouche: number }>
    }
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
        byTypo: new Map<string, { sans: number; bouche: number }>(),
      })
    }
    cardsByLineDay.get(wst)![idx].push(cardObj)
    const m = lineMeta.get(wst)!
    m.ofCount++
    m.totalHours += hours
    m.dayHours[idx] += hours
    // Charge par typologie (TSICOD_4), splittée bouche-consommatrice vs non — header PP_830 (#42).
    const typo = typologieByArticle.get(mo.article)
    if (typo) {
      const cur = m.byTypo.get(typo) ?? { sans: 0, bouche: 0 }
      const isBouche = bdhParents.has(mo.article)
      if (isBouche) cur.bouche += hours
      else cur.sans += hours
      m.byTypo.set(typo, cur)
    }
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
        meta: [],
        // Header PP_830 (issue #42) : charge par typologie + stock bouches hygro (goulot).
        ...(code === 'PP_830'
          ? {
              pp830: {
                chargeByTypo: [...meta.byTypo.entries()]
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
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

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

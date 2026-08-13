/**
 * Assemble la prévision de file d'expédition (issue #104).
 *
 * Le loader ne fabrique pas de nouvelle logique de faisabilité : il consomme le
 * pipeline canonique `loadOrderImpacts`, puis ne garde que les lignes ouvertes du
 * client 80001. Les dates de disponibilité sont des dates de sources (stock, OF,
 * réception, CTP), jamais la date de livraison client.
 */

import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import capacityCalendarService from '#services/capacity_calendar_service'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { buildStrictQcStock } from '#app/domain/of_feasibility'
import {
  computePromesseDate,
  type DatedSupply,
  type PromesseDataset,
} from '#app/domain/promesse_engine'
import type { Flow } from '#app/domain/models/flow'
import {
  buildExpeditionForecast,
  type AvailabilitySegment,
  type ExpeditionForecast,
  type ExpeditionOrderLine,
  type LoadedShuttleObservation,
  type PlantClosureRange,
  type QueueStockObservation,
} from '#app/domain/expedition_forecast'
import {
  CAMION_CAPACITE_PALETTES,
  CAPACITE_JOUR_PALETTES,
  CAPACITE_JOUR_TASSEE,
  ExpeditionRepository,
  NB_DEPARTS_QUOTIDIENS,
} from '#repositories/expedition_repository'

export const EXPEDITION_CUSTOMER = '80001'

/** Préavis transport : la première bande couvre J à J+3. */
export const EXPEDITION_DECISION_DAYS = 4

/** La deuxième bande couvre J+4 à J+7. */
export const EXPEDITION_DAILY_HORIZON = 8

export const EXPEDITION_WEEKLY_HORIZON = 6

/** Lookback nécessaire pour les commandes ouvertes et les OF déjà lancés. */
export const FORECAST_LOOKBACK_DAYS = Number(process.env.EXPEDITION_FORECAST_LOOKBACK) || 30

/**
 * Cadence de sortie atelier, en équivalent-palettes par jour ouvré.
 *
 * C'est le portillon de production : sans lui, tout OF ferme du carnet entrait
 * dans la file le premier jour ouvré et la reprise après congès annonçait 26
 * camions spot sur une seule journée.
 *
 * La valeur par défaut est l'hypothèse équilibrée — l'atelier sort ce que les
 * deux navettes emportent. Elle est affichée à l'écran pour être contestée, et
 * se cale au déploiement une fois le rétroviseur (#44) confronté au réel.
 */
export const EXPEDITION_PRODUCTION_DAILY_CAPACITY =
  Number(process.env.EXPEDITION_PRODUCTION_DAILY_CAPACITY) || CAPACITE_JOUR_PALETTES

/** Capacité de production hebdomadaire, cohérente avec la cadence journalière. */
export const EXPEDITION_PRODUCTION_WEEKLY_CAPACITY =
  Number(process.env.EXPEDITION_PRODUCTION_WEEKLY_CAPACITY) ||
  EXPEDITION_PRODUCTION_DAILY_CAPACITY * 5

/**
 * Camions spot affrétables en une journée. Le transporteur n'en sort pas 26 :
 * au-delà, le chiffre décrit un arriéré de production, pas une commande.
 */
export const EXPEDITION_MAX_SPOT_TRUCKS = Number(process.env.EXPEDITION_MAX_SPOT_TRUCKS) || 3

/**
 * Surplus minimal, en palettes, pour qu'un camion spot se justifie.
 *
 * Affréter un camion de 33 palettes pour en emporter 4 n'a pas de sens : ces
 * palettes partent le lendemain, et si l'arriéré grossit vraiment, la file le
 * fait remonter d'elle-même. Défaut : un tiers de camion.
 */
export const EXPEDITION_SPOT_MIN_PALETTES =
  Number(process.env.EXPEDITION_SPOT_MIN_PALETTES) || Math.ceil(CAMION_CAPACITE_PALETTES / 3)

/** Alias conservé pour le contrôleur et les liens générés côté page. */
export const FORECAST_DEFAULT_HORIZON = EXPEDITION_DAILY_HORIZON

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function localIsoDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(date: Date, count: number): Date {
  const out = new Date(date)
  out.setDate(out.getDate() + count)
  out.setHours(0, 0, 0, 0)
  return out
}

function toDay(date: Date | null | undefined): string | null {
  return date ? isoDay(date) : null
}

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function lineKey(
  numCommande: string,
  ligne: string | null,
  article: string,
  vcrseq?: string | null
): string {
  return `${numCommande}|${ligne ?? ''}|${vcrseq ?? ''}|${article}`
}

function sourceOfOrder(
  of: {
    numOf: string
    statutNum: number
    feasible: boolean | null
    estDebuté?: boolean
    missingComponents: Record<string, number>
    seComponents?: Record<string, number>
  },
  releaseDate: string | null,
  today: string,
  sequence?: number
): AvailabilitySegment | null {
  // Un OF planifié/suggéré actuellement en rupture peut entrer dans la bande
  // pré-alerte si ses composants ont une arrivée datée. Sans cette date, il est
  // sauté et le reliquat passe au CTP faible : la file n'est jamais bloquée.
  if (of.feasible === false && (!releaseDate || of.statutNum === 1)) return null

  if (of.estDebuté) {
    return {
      quantity: 0,
      date: today,
      source: 'of_lance',
      confidence: 'haute',
      cause: 'OF lancé : reste réel après pointages atelier',
      ofNum: of.numOf,
      sequence,
    }
  }

  if (of.statutNum === 1) {
    return {
      quantity: 0,
      date: today,
      source: 'of_ferme',
      confidence: 'haute',
      cause: 'OF ferme, séquencé par date de livraison puis ancienneté commande',
      ofNum: of.numOf,
      sequence,
    }
  }

  const source = of.statutNum === 2 ? 'of_planifie' : 'of_suggere'
  if (releaseDate) {
    return {
      quantity: 0,
      date: releaseDate,
      source,
      confidence: 'moyenne',
      cause: 'Déblocage = arrivée du dernier composant manquant',
      ofNum: of.numOf,
      sequence,
    }
  }

  // Un OF non faisable ou sans réception couvrante ne bloque pas la séquence :
  // l'appelant pourra basculer le reliquat sur le CTP faible.
  if (
    Object.keys(of.missingComponents).length > 0 ||
    Object.keys(of.seComponents ?? {}).length > 0
  ) {
    return null
  }
  return {
    quantity: 0,
    date: today,
    source,
    confidence: 'moyenne',
    cause: 'OF planifié sans composant manquant',
    ofNum: of.numOf,
    sequence,
  }
}

function flowSuppliesByArticle(
  flows: Flow[],
  originType: 'reception' | 'of'
): Map<string, DatedSupply[]> {
  const out = new Map<string, DatedSupply[]>()
  for (const flow of flows) {
    if (flow.direction !== 'supply' || !flow.date) continue
    if (originType === 'of' && (flow.origin.type !== 'of' || flow.origin.status === 3)) continue
    if (originType === 'reception' && flow.origin.type !== 'reception') continue
    const list = out.get(flow.article) ?? []
    const origin = flow.origin
    if (origin.type !== originType) continue
    list.push({
      date: flow.date,
      quantity: flow.quantity,
      source: originType,
      id: origin.id,
    })
    out.set(flow.article, list)
  }
  return out
}

function buildPromesseDataset(
  context: Awaited<ReturnType<typeof loadOrderImpacts>>,
  closedDays: Set<string>,
  supplierLatency: Map<string, number>
): PromesseDataset {
  const supplyFlows = context.planInputs.supplyFlows
  return {
    articles: context.articles,
    nomenclatures: context.nomenclatures,
    stockNet: buildStrictQcStock(supplyFlows),
    receptions: flowSuppliesByArticle(supplyFlows, 'reception'),
    // ENDDAT des OF est un jalon CBN, pas une date de mise à disposition fiable.
    // Les lignes sans OF restent donc sur BOM + réceptions + délai CTP.
    ofSupply: undefined,
    closedDays,
    supplierLatency,
  }
}

/** Date de couverture d'une quantité manquante par les réceptions attendues. */
function componentReleaseDate(
  missing: Record<string, number>,
  promiseData: PromesseDataset,
  today: string,
  stockLedger: Map<string, number>,
  receptionLedger: Map<string, DatedSupply[]>
): string | null {
  let latest: string | null = null
  for (const [article, quantity] of Object.entries(missing)) {
    let remaining = quantity
    const stock = Math.min(remaining, Math.max(0, stockLedger.get(article) ?? 0))
    if (stock > 0) {
      stockLedger.set(article, (stockLedger.get(article) ?? 0) - stock)
      remaining -= stock
      if (!latest || latest < today) latest = today
    }
    const supplies = receptionLedger.get(article)
    if (remaining > 0 && supplies && supplies.length > 0) {
      let missingSupply = remaining
      const planned: Array<{ supply: DatedSupply; taken: number }> = []
      for (const supply of [...supplies].sort((a, b) => a.date.getTime() - b.date.getTime())) {
        if (missingSupply <= 0) break
        const taken = Math.min(missingSupply, Math.max(0, supply.quantity))
        if (taken <= 0) continue
        planned.push({ supply, taken })
        missingSupply -= taken
        const date = isoDay(supply.date) < today ? today : isoDay(supply.date)
        if (!latest || date > latest) latest = date
      }
      if (missingSupply > 0) {
        // Ne pas consommer une couverture partielle si elle ne suffit pas à l'OF.
        if (stock > 0) stockLedger.set(article, (stockLedger.get(article) ?? 0) + stock)
        return null
      }
      for (const { supply, taken } of planned) supply.quantity -= taken
      remaining = 0
    }
    if (remaining <= 0) continue

    // Sous-ensemble fabriqué : le CTP descend sa BOM. Les réceptions directes
    // restent consommées par le ledger ci-dessus ; ce fallback ne touche pas aux
    // dates CBN des OF.
    const scopedPromiseData: PromesseDataset = {
      ...promiseData,
      stockNet: stockLedger,
      receptions: receptionLedger,
    }
    const result = computePromesseDate(
      { article, quantity, from: parseDay(today) ?? new Date(), mode: 'optimiste' },
      scopedPromiseData
    )
    if (result.infeasible) return null
    const date = isoDay(result.promiseDate)
    if (!latest || date > latest) latest = date
  }
  return latest
}

function promiseCause(result: ReturnType<typeof computePromesseDate>): string {
  const factor = result.limitingFactor
  switch (factor.reason.kind) {
    case 'reception':
      return `CTP : réception ${factor.reason.poId} le ${isoDay(factor.date)}`
    case 'of':
      return `CTP : OF ${factor.reason.ofId} le ${isoDay(factor.date)}`
    case 'appro':
      return `CTP : approvisionnement (${factor.reason.leadTime} j)`
    case 'fabrication':
      return `CTP : fabrication (${factor.reason.leadTime} j)`
    case 'stock':
      return 'CTP : stock disponible'
    case 'infeasible':
      return `CTP : ${factor.reason.detail}`
  }
}

function ctpSegment(
  quantity: number,
  article: string,
  today: string,
  data: PromesseDataset
): AvailabilitySegment {
  const result = computePromesseDate(
    { article, quantity, from: parseDay(today) ?? new Date(), mode: 'optimiste' },
    data
  )
  return {
    quantity,
    date: result.infeasible ? null : isoDay(result.promiseDate),
    source: 'ctp',
    confidence: 'faible',
    cause: promiseCause(result),
    weeklyOnly: true,
  }
}

function buildSegments(
  raw: Flow,
  impact: Awaited<ReturnType<typeof loadOrderImpacts>>['result']['orders'][number] | undefined,
  today: string,
  promiseData: PromesseDataset,
  firmSequence: Map<string, number>,
  allowedByAllocation: Map<string, number>,
  stockLedger: Map<string, number>,
  receptionLedger: Map<string, DatedSupply[]>
): AvailabilitySegment[] {
  if (raw.origin.type !== 'order') return []
  const rawQuantity = Math.max(0, raw.quantity)
  if (rawQuantity <= 0) return []

  const total = Math.min(
    rawQuantity,
    impact ? Math.max(0, impact.qteRestante + (impact.qteAllouee ?? 0)) : rawQuantity
  )
  let remaining = total
  const segments: AvailabilitySegment[] = []
  const allocated = Math.min(remaining, Math.max(0, raw.origin.qteAllouee ?? 0))
  if (allocated > 0) {
    segments.push({
      quantity: allocated,
      date: today,
      source: 'stock',
      confidence: 'constatee',
      cause: 'Allocation ERP déjà posée sur la ligne',
    })
    remaining -= allocated
  }

  if (impact) {
    const orderKeyValue = lineKey(
      impact.numCommande,
      impact.ligne ?? null,
      impact.article,
      impact.vcrseq
    )
    for (const of of impact.ofs) {
      if (remaining <= 0) break
      const quantity = Math.min(
        remaining,
        allowedByAllocation.get(ofAllocationKey(orderKeyValue, of.numOf)) ?? 0
      )
      if (quantity <= 0) continue
      const dependencies = { ...of.missingComponents, ...of.seComponents }
      const releaseDate = componentReleaseDate(
        dependencies,
        promiseData,
        today,
        stockLedger,
        receptionLedger
      )
      const segment = sourceOfOrder(of, releaseDate, today, firmSequence.get(of.numOf))
      if (!segment) continue
      segment.quantity = quantity
      segments.push(segment)
      remaining -= quantity
    }
  }

  if (remaining > 0) segments.push(ctpSegment(remaining, raw.article, today, promiseData))
  return segments
}

function rankFirmOfs(
  impacts: Awaited<ReturnType<typeof loadOrderImpacts>>['result']['orders'],
  rawByKey: Map<string, Flow>
): Map<string, number> {
  const candidates: Array<{
    numOf: string
    dateLivraison: string
    dateCommande: string
    lineKey: string
  }> = []
  for (const impact of impacts) {
    const raw = rawByKey.get(
      lineKey(impact.numCommande, impact.ligne ?? null, impact.article, impact.vcrseq)
    )
    const dateCommande =
      raw?.origin.type === 'order' ? (toDay(raw.origin.dateCommande) ?? '9999-12-31') : '9999-12-31'
    for (const of of impact.ofs) {
      if (of.statutNum !== 1 || of.estDebuté || candidates.some((c) => c.numOf === of.numOf))
        continue
      candidates.push({
        numOf: of.numOf,
        dateLivraison: impact.dateExpedition || '9999-12-31',
        dateCommande,
        lineKey: lineKey(impact.numCommande, impact.ligne ?? null, impact.article, impact.vcrseq),
      })
    }
  }
  candidates.sort(
    (a, b) =>
      a.dateLivraison.localeCompare(b.dateLivraison) ||
      a.dateCommande.localeCompare(b.dateCommande) ||
      a.lineKey.localeCompare(b.lineKey) ||
      a.numOf.localeCompare(b.numOf)
  )
  return new Map(candidates.map((candidate, index) => [candidate.numOf, index]))
}

function ofAllocationKey(orderKeyValue: string, ofNum: string): string {
  return `${orderKeyValue}|${ofNum}`
}

/** Plafond OF partagé, après application du reste réel pointé. */
function buildOfAllocationLedger(
  impacts: Awaited<ReturnType<typeof loadOrderImpacts>>['result']['orders']
): Map<string, number> {
  const remainingByOf = new Map<string, number>()
  const allowedByAllocation = new Map<string, number>()
  for (const impact of impacts) {
    const orderKeyValue = lineKey(
      impact.numCommande,
      impact.ligne ?? null,
      impact.article,
      impact.vcrseq
    )
    for (const of of impact.ofs) {
      const knownRemaining = remainingByOf.get(of.numOf) ?? of.qteRestante ?? of.qteAllouee
      const allowed = Math.min(Math.max(0, of.qteAllouee), Math.max(0, knownRemaining))
      allowedByAllocation.set(ofAllocationKey(orderKeyValue, of.numOf), allowed)
      remainingByOf.set(of.numOf, Math.max(0, knownRemaining - allowed))
    }
  }
  return allowedByAllocation
}

function emptyForecast(today: string, dailyHorizonDays: number): ExpeditionForecast {
  return buildExpeditionForecast({
    lines: [],
    initialQueue: [],
    volumes: new Map(),
    today,
    decisionDays: EXPEDITION_DECISION_DAYS,
    dailyHorizonDays,
    weeklyHorizonWeeks: EXPEDITION_WEEKLY_HORIZON,
    capaciteJour: CAPACITE_JOUR_PALETTES,
    nbDepartsQuotidiens: NB_DEPARTS_QUOTIDIENS,
    camionCapacitePalettes: CAMION_CAPACITE_PALETTES,
    productionWeeklyCapacity: EXPEDITION_PRODUCTION_WEEKLY_CAPACITY,
    productionDailyCapacity: EXPEDITION_PRODUCTION_DAILY_CAPACITY,
    maxSpotTrucks: EXPEDITION_MAX_SPOT_TRUCKS,
    capaciteJourTassee: CAPACITE_JOUR_TASSEE,
    spotMinPalettes: EXPEDITION_SPOT_MIN_PALETTES,
  })
}

export interface LoadExpeditionForecastOptions {
  start?: Date
  /** Horizon de la bande jour ; la bande décision reste toujours J→J+3. */
  days?: number
  force?: boolean
}

export async function loadExpeditionForecast(
  opts: LoadExpeditionForecastOptions = {}
): Promise<{ forecast: ExpeditionForecast; x3Error: string | null }> {
  const dailyHorizonDays =
    Number.isFinite(opts.days) &&
    (opts.days as number) >= EXPEDITION_DECISION_DAYS &&
    (opts.days as number) <= 30
      ? (opts.days as number)
      : EXPEDITION_DAILY_HORIZON
  const requested = opts.start ? new Date(opts.start) : null
  const today = requested && !Number.isNaN(requested.getTime()) ? requested : new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = localIsoDay(today)
  const dataTo = addDays(today, EXPEDITION_WEEKLY_HORIZON * 7 + 7)
  const defaultDataFrom = addDays(today, -FORECAST_LOOKBACK_DAYS)
  const force = !!opts.force

  try {
    const year = today.getFullYear()
    const [rawDemands, closedDays, supplierLatency, plantClosures] = await Promise.all([
      boardDataset.getOpenExpeditionDemands(EXPEDITION_CUSTOMER, localIsoDay(dataTo), force),
      capacityCalendarService.globalClosedDays(year, year + 1).catch(() => new Set<string>()),
      boardDataset.getSupplierLatency().catch(() => new Map<string, number>()),
      capacityCalendarService
        .closures()
        .then((rows) =>
          rows
            .filter((row) => row.scope === 'global' && row.factor <= 0)
            .map((row): PlantClosureRange => ({
              from: row.from,
              to: row.to,
              motif: row.motif || 'fermeture',
            }))
        )
        .catch(() => [] as PlantClosureRange[]),
    ])

    const targetDemands = rawDemands.filter(
      (flow): flow is Flow & { origin: Extract<Flow['origin'], { type: 'order' }> } =>
        flow.direction === 'demand' &&
        flow.origin.type === 'order' &&
        // Déjà scopé SQL sur 80001 ; le code tiers sert de filet si présent.
        (flow.origin.customerCode == null || flow.origin.customerCode === EXPEDITION_CUSTOMER)
    )
    // Le carnet n'a pas de borne basse. On élargit le pipeline de matching à la
    // plus ancienne échéance encore ouverte, sinon un OF réel d'une commande
    // ancienne serait remplacé silencieusement par un CTP.
    const oldestDemand = targetDemands.reduce<string | null>((oldest, flow) => {
      const date = toDay(flow.date)
      return date && (!oldest || date < oldest) ? date : oldest
    }, null)
    const oldestDate = oldestDemand ? parseDay(oldestDemand) : null
    const dataFrom = oldestDate && oldestDate < defaultDataFrom ? oldestDate : defaultDataFrom
    const { result, ...context } = await loadOrderImpacts({
      from: dataFrom,
      to: dataTo,
      pipeline: 'programme',
      force,
    })
    const impactByKey = new Map(
      result.orders.map((impact) => [
        lineKey(impact.numCommande, impact.ligne ?? null, impact.article, impact.vcrseq),
        impact,
      ])
    )
    const rawByKey = new Map(
      targetDemands.map(
        (flow) =>
          [
            lineKey(flow.origin.id, flow.origin.ligne ?? null, flow.article, flow.origin.vcrseq),
            flow,
          ] as const
      )
    )
    const firmSequence = rankFirmOfs(result.orders, rawByKey)
    const allowedByAllocation = buildOfAllocationLedger(result.orders)
    const promiseData = buildPromesseDataset({ result, ...context }, closedDays, supplierLatency)
    const stockLedger = new Map(promiseData.stockNet)
    const receptionLedger = new Map(
      [...promiseData.receptions.entries()].map(([article, supplies]) => [
        article,
        supplies.map((supply) => ({ ...supply })),
      ])
    )

    const lines: ExpeditionOrderLine[] = targetDemands.map((raw) => {
      const impact = impactByKey.get(
        lineKey(raw.origin.id, raw.origin.ligne ?? null, raw.article, raw.origin.vcrseq)
      )
      return {
        numCommande: raw.origin.id,
        ligne: raw.origin.ligne ?? null,
        vcrseq: raw.origin.vcrseq ?? null,
        client: raw.origin.customer,
        article: raw.article,
        description: raw.origin.designation ?? '',
        orderedOpenQuantity: raw.quantity,
        dateLivraison: toDay(raw.date),
        dateCommande: toDay(raw.origin.dateCommande),
        segments: buildSegments(
          raw,
          impact,
          todayIso,
          promiseData,
          firmSequence,
          allowedByAllocation,
          stockLedger,
          receptionLedger
        ),
      }
    })

    const articles = [...new Set(lines.map((line) => line.article))]
    const repository = new ExpeditionRepository()
    const [coefs, estimator, stockRows, loadedRows] = await Promise.all([
      repository.getVolumeCoefs(articles),
      boardDataset.getConditionnementEstimator().catch(() => new Map()),
      repository.getExpeditionQueueStock(articles),
      repository.getLoadedShuttleRows(today, today),
    ])
    for (const article of articles) {
      const direct = coefs.get(article)
      if (direct?.ucParPal && direct.ucParPal > 0) continue
      const pair = estimator.get(article)
      const estimate = pair?.stock ?? pair?.stojou
      if (!estimate || estimate.usParPalette <= 0) continue
      coefs.set(article, {
        ...(direct ?? { article, pcuStuCoe: null, yfamstat7: null }),
        ucParPal: estimate.usParPalette,
        estimationSource: estimate.source,
      })
    }

    const initialQueue: QueueStockObservation[] = stockRows.map((row) => ({
      article: row.article,
      location: row.location,
      quantityUs: row.quantityUs,
      source: /^QUAI\d+$/i.test(row.location) ? 'quai' : 'stock_production',
    }))
    const commandIds = new Set(lines.map((line) => line.numCommande))
    const loadedShuttle: LoadedShuttleObservation[] = loadedRows
      .filter((row) => row.sohnum !== null && commandIds.has(row.sohnum))
      .map((row) => ({ article: row.article, palettes: 1 }))

    const forecast = buildExpeditionForecast({
      lines,
      initialQueue,
      loadedShuttle,
      volumes: coefs,
      today: todayIso,
      decisionDays: EXPEDITION_DECISION_DAYS,
      dailyHorizonDays,
      weeklyHorizonWeeks: EXPEDITION_WEEKLY_HORIZON,
      capaciteJour: CAPACITE_JOUR_PALETTES,
      nbDepartsQuotidiens: NB_DEPARTS_QUOTIDIENS,
      camionCapacitePalettes: CAMION_CAPACITE_PALETTES,
      closedDays,
      productionWeeklyCapacity: EXPEDITION_PRODUCTION_WEEKLY_CAPACITY,
      productionDailyCapacity: EXPEDITION_PRODUCTION_DAILY_CAPACITY,
      maxSpotTrucks: EXPEDITION_MAX_SPOT_TRUCKS,
      capaciteJourTassee: CAPACITE_JOUR_TASSEE,
      spotMinPalettes: EXPEDITION_SPOT_MIN_PALETTES,
      plantClosures: plantClosures.filter((closure) => closure.to >= todayIso),
    })
    return { forecast, x3Error: null }
  } catch (error) {
    logger.error({ err: error }, '[expeditions] forecast — échec chargement')
    return {
      forecast: emptyForecast(todayIso, dailyHorizonDays),
      x3Error: 'Données X3 indisponibles — prévision momentanément incalculable.',
    }
  }
}

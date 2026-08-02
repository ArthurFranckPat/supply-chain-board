/**
 * Prévision de file d'expédition pour la navette dédiée au client 80001.
 *
 * Ce module est volontairement pur. Il ne connaît ni ORDERS ni STOCK : le loader
 * transforme les sources ERP en lignes de commande et en entrées de file, puis ce
 * moteur simule la vidange FIFO par journées ouvrées.
 */

import { calcVolumes, type VolumeCoef } from '#repositories/expedition_repository'

export type ForecastBand = 'decision' | 'prealert'

export type AvailabilitySource =
  | 'stock'
  | 'quai'
  | 'stock_production'
  | 'of_lance'
  | 'of_ferme'
  | 'of_planifie'
  | 'of_suggere'
  | 'ctp'

export type AvailabilityConfidence = 'constatee' | 'haute' | 'moyenne' | 'faible'

/** Une source de quantité affectée à une ligne de commande. */
export interface AvailabilitySegment {
  /** Quantité en unité de stock, jamais supérieure au reliquat de la ligne. */
  quantity: number
  /** Date à laquelle la quantité entre dans la file, ISO, ou null si inconnue. */
  date: string | null
  source: AvailabilitySource
  confidence: AvailabilityConfidence
  cause: string
  ofNum?: string | null
  /** CTP : visible dans la bande semaine mais pas dans la décision jour. */
  weeklyOnly?: boolean
  /** Rang de séquencement stable pour les OF fermes. */
  sequence?: number
}

/** Ligne de commande ouverte entrant dans la prévision. */
export interface ExpeditionOrderLine {
  numCommande: string
  ligne: string | null
  vcrseq?: string | null
  client: string
  article: string
  description: string
  /** RMNEXTQTY : reliquat commandé, allocations comprises. */
  orderedOpenQuantity: number
  dateLivraison: string | null
  dateCommande: string | null
  segments: AvailabilitySegment[]
}

/** Stock physique déjà dans la file avant le premier jour simulé. */
export interface QueueStockObservation {
  article: string
  location: string
  quantityUs: number
  /** Origine de la zone, pour le drill-down. */
  source: 'quai' | 'stock_production'
}

/** Palette déjà enregistrée dans une navette du jour. */
export interface LoadedShuttleObservation {
  article?: string | null
  palettes: number
}

export interface ForecastLine {
  numCommande: string
  ligne: string | null
  vcrseq?: string | null
  client: string
  article: string
  description: string
  /** Quantité de cette portion chargée, en unité de stock. */
  qte: number
  /** Reliquat commandé total de la ligne, pour vérifier le plafond. */
  qteCommandee: number
  /** Équivalent-palettes de cette portion, null si non chiffrable. */
  palTheo: number | null
  dateLivraison: string | null
  dateCommande: string | null
  dateMiseADispo: string | null
  dateChargement: string | null
  source: AvailabilitySource
  confidence: AvailabilityConfidence
  cause: string
  ofNum: string | null
  coefficientSource: 'référencé' | 'STOCK' | 'STOJOU' | 'inconnu'
  nonChiffrable: boolean
}

export interface DayCharge {
  date: string
  band: ForecastBand
  /** Décalage calendaire depuis J. */
  offset: number
  /** File héritée de la veille, après les chargements précédents. */
  fileBefore: number
  /** Entrées nouvelles dans la file ce jour. */
  entries: number
  /** Volume disponible avant les deux départs du jour. */
  available: number
  /** Volume effectivement chargé par les navettes régulières. */
  loaded: number
  /** File reportée au jour ouvré suivant. */
  fileAfter: number
  capaciteJour: number
  deltaVsCapacite: number
  spot: boolean
  /** Nombre entier de camions spot à demander, jamais un simple delta. */
  nbCamionsSpot: number
  /** Équivalent-palettes au-delà des deux navettes. */
  spotPalettes: number
  lignes: ForecastLine[]
}

export interface WeekCharge {
  key: string
  from: string
  to: string
  /** Carnet 80001 réparti selon la date de livraison, uniquement à cette maille. */
  carnetPalettes: number
  /** Capacité de départs sur les jours ouvrés de la semaine. */
  capaciteTransport: number
  /** Plafond de production fourni par le loader/configuration. */
  capaciteProduction: number
  /** Plafond transport ∩ production. */
  capacite: number
  /** Volume retenu par le plafond hebdomadaire. */
  chargePlafonnee: number
  deltaVsCapacite: number
  spot: boolean
  nbCamionsSpot: number
  lignes: ForecastLine[]
  nonQuantifiableLines: number
}

export interface ExpeditionForecast {
  from: string
  to: string
  decisionTo: string
  prealertTo: string
  dailyHorizonDays: number
  weeklyHorizonWeeks: number
  capaciteJour: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  initialQueuePalettes: number
  loadedTodayPalettes: number
  days: DayCharge[]
  weeks: WeekCharge[]
  /** Portions sans date exploitable ou non visibles à la maille jour. */
  deferred: ForecastLine[]
  deferredPalettes: number
  /** Lignes dont le coef direct et l'estimateur sont tous deux absents. */
  nonQuantifiableLines: number
}

export interface BuildForecastOptions {
  lines: ExpeditionOrderLine[]
  initialQueue: QueueStockObservation[]
  loadedShuttle?: LoadedShuttleObservation[]
  volumes: Map<string, VolumeCoef>
  today: string
  /** J inclus, J+3 inclus par défaut. */
  decisionDays?: number
  /** J inclus, J+7 inclus par défaut. */
  dailyHorizonDays?: number
  weeklyHorizonWeeks?: number
  capaciteJour: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  closedDays?: Set<string>
  /** Capacité production hebdomadaire déjà normalisée en équivalent-palettes. */
  productionWeeklyCapacity?: number
}

interface MaterializedLine {
  key: string
  priority: number
  source: ExpeditionOrderLine
  segments: AvailabilitySegment[]
  totalPalettes: number | null
  nonQuantifiable: boolean
}

interface QueueToken {
  line: MaterializedLine
  segment: AvailabilitySegment
  quantity: number
  palettes: number
  availabilityDate: string
  priority: number
}

const EPSILON = 1e-9

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(iso: string, count: number): string {
  const date = parseIso(iso)
  date.setUTCDate(date.getUTCDate() + count)
  return isoDay(date)
}

function dayOffset(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000)
}

function isWorkingDay(iso: string, closedDays: Set<string>): boolean {
  const day = parseIso(iso).getUTCDay()
  return day !== 0 && day !== 6 && !closedDays.has(iso)
}

function workingDates(from: string, calendarDays: number, closedDays: Set<string>): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.max(1, calendarDays); i++) {
    const date = addDays(from, i)
    if (isWorkingDay(date, closedDays)) out.push(date)
  }
  return out
}

function monday(iso: string): string {
  const date = parseIso(iso)
  const day = date.getUTCDay()
  const distance = day === 0 ? 6 : day - 1
  date.setUTCDate(date.getUTCDate() - distance)
  return isoDay(date)
}

function nextMonday(iso: string): string {
  const current = monday(iso)
  return addDays(current, 7)
}

function weekKey(iso: string): string {
  const date = parseIso(iso)
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function sourceRank(source: AvailabilitySource): number {
  switch (source) {
    case 'stock':
    case 'quai':
    case 'stock_production':
      return 0
    case 'of_lance':
      return 1
    case 'of_ferme':
      return 2
    case 'of_planifie':
      return 3
    case 'of_suggere':
      return 4
    case 'ctp':
      return 5
  }
}

/** Conversion unique, utilisée par les entrées stock et les portions de commande. */
export function equivalentPalettes(
  quantityUs: number,
  volume: VolumeCoef | undefined
): number | null {
  if (!Number.isFinite(quantityUs) || quantityUs <= 0 || !volume) return null
  const result = calcVolumes(
    [
      {
        qteUc: quantityUs,
        ucParPal: volume.ucParPal,
        yfamstat7: volume.yfamstat7,
      },
    ],
    0
  )
  return result.palTheo >= 0 ? result.palTheo : null
}

function lineKey(line: ExpeditionOrderLine): string {
  return `${line.numCommande}|${line.ligne ?? ''}|${line.vcrseq ?? ''}|${line.article}`
}

function segmentDateRank(segment: AvailabilitySegment): number {
  return segment.date ? parseIso(segment.date).getTime() : Number.MAX_SAFE_INTEGER
}

function capSegments(line: ExpeditionOrderLine): AvailabilitySegment[] {
  let remaining = Math.max(0, line.orderedOpenQuantity)
  return [...line.segments]
    .filter((s) => Number.isFinite(s.quantity) && s.quantity > 0)
    .sort(
      (a, b) =>
        segmentDateRank(a) - segmentDateRank(b) ||
        sourceRank(a.source) - sourceRank(b.source) ||
        (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER)
    )
    .flatMap((segment) => {
      if (remaining <= EPSILON) return []
      const quantity = Math.min(remaining, segment.quantity)
      remaining -= quantity
      return [{ ...segment, quantity }]
    })
}

function volumeFor(
  quantity: number,
  article: string,
  volumes: Map<string, VolumeCoef>
): number | null {
  return equivalentPalettes(quantity, volumes.get(article))
}

function makeLine(
  line: ExpeditionOrderLine,
  segment: AvailabilitySegment,
  quantity: number,
  palettes: number | null,
  dateChargement: string | null,
  volumes: Map<string, VolumeCoef>
): ForecastLine {
  const volume = volumes.get(line.article)
  return {
    numCommande: line.numCommande,
    ligne: line.ligne,
    vcrseq: line.vcrseq ?? null,
    client: line.client,
    article: line.article,
    description: line.description,
    qte: quantity,
    qteCommandee: Math.max(0, line.orderedOpenQuantity),
    palTheo: palettes,
    dateLivraison: line.dateLivraison,
    dateCommande: line.dateCommande,
    dateMiseADispo: segment.date,
    dateChargement,
    source: segment.source,
    confidence: segment.confidence,
    cause: segment.cause,
    ofNum: segment.ofNum ?? null,
    coefficientSource: volume?.estimationSource ?? (volume?.ucParPal ? 'référencé' : 'inconnu'),
    nonChiffrable: palettes === null,
  }
}

function materializeLines(
  lines: ExpeditionOrderLine[],
  volumes: Map<string, VolumeCoef>,
  initialQueue: QueueStockObservation[],
  loadedShuttle: LoadedShuttleObservation[],
  firstDay: string
): { lines: MaterializedLine[]; initialQueuePalettes: number; loadedTodayPalettes: number } {
  const materialized: MaterializedLine[] = lines
    .filter((line) => line.orderedOpenQuantity > 0 && line.article.trim())
    .map((line) => {
      const segments = capSegments(line)
      const totalPalettes = volumeFor(line.orderedOpenQuantity, line.article, volumes)
      return {
        key: lineKey(line),
        priority: 0,
        source: line,
        segments,
        totalPalettes,
        nonQuantifiable: totalPalettes === null,
      }
    })

  materialized.sort(
    (a, b) =>
      (a.source.dateLivraison ?? '9999-12-31').localeCompare(
        b.source.dateLivraison ?? '9999-12-31'
      ) ||
      (a.source.dateCommande ?? '9999-12-31').localeCompare(
        b.source.dateCommande ?? '9999-12-31'
      ) ||
      a.key.localeCompare(b.key)
  )
  materialized.forEach((line, index) => {
    line.priority = index
  })

  const stockByArticle = new Map<
    string,
    { palettes: number; source: 'quai' | 'stock_production' }
  >()
  for (const row of initialQueue) {
    const palettes = equivalentPalettes(row.quantityUs, volumes.get(row.article))
    if (palettes === null || palettes <= 0) continue
    const current = stockByArticle.get(row.article)
    if (current) {
      current.palettes += palettes
      if (row.source === 'quai') current.source = 'quai'
    } else {
      stockByArticle.set(row.article, { palettes, source: row.source })
    }
  }

  const loadedTodayPalettes = loadedShuttle.reduce((sum, row) => sum + Math.max(0, row.palettes), 0)
  let unknownLoaded = loadedShuttle
    .filter((row) => !row.article)
    .reduce((sum, row) => sum + Math.max(0, row.palettes), 0)

  // Déduire les palettes dont l'article est connu. Une palette connue mais
  // absente du stock courant ne doit surtout pas être retirée d'un autre article.
  for (const row of loadedShuttle) {
    if (!row.article) continue
    const stock = stockByArticle.get(row.article)
    if (!stock) continue
    const taken = Math.min(stock.palettes, Math.max(0, row.palettes))
    stock.palettes -= taken
  }
  // Seules les palettes YNAVETTE sans article peuvent être déduites globalement.
  if (unknownLoaded > 0) {
    for (const stock of stockByArticle.values()) {
      if (unknownLoaded <= 0) break
      const taken = Math.min(stock.palettes, unknownLoaded)
      stock.palettes -= taken
      unknownLoaded -= taken
    }
  }

  const initialQueuePalettes = [...stockByArticle.values()].reduce(
    (sum, stock) => sum + stock.palettes,
    0
  )

  const remainingByArticle = new Map<string, MaterializedLine[]>()
  for (const line of materialized) {
    const explicitQuantity = line.segments.reduce((sum, segment) => sum + segment.quantity, 0)
    const remainingQuantity = Math.max(0, line.source.orderedOpenQuantity - explicitQuantity)
    if (remainingQuantity <= EPSILON) continue
    const list = remainingByArticle.get(line.source.article) ?? []
    list.push(line)
    remainingByArticle.set(line.source.article, list)
  }
  for (const list of remainingByArticle.values()) {
    list.sort(
      (a, b) =>
        (a.source.dateLivraison ?? '9999-12-31').localeCompare(
          b.source.dateLivraison ?? '9999-12-31'
        ) ||
        (a.source.dateCommande ?? '9999-12-31').localeCompare(
          b.source.dateCommande ?? '9999-12-31'
        ) ||
        a.key.localeCompare(b.key)
    )
  }

  for (const [article, list] of remainingByArticle) {
    const stock = stockByArticle.get(article)
    if (!stock || stock.palettes <= EPSILON) continue
    for (const line of list) {
      if (stock.palettes <= EPSILON) break
      const explicitQuantity = line.segments.reduce((sum, segment) => sum + segment.quantity, 0)
      const remainingQuantity = Math.max(0, line.source.orderedOpenQuantity - explicitQuantity)
      const remainingPalettes = volumeFor(remainingQuantity, article, volumes)
      if (remainingPalettes === null || remainingPalettes <= EPSILON) continue
      const palettes = Math.min(stock.palettes, remainingPalettes)
      const quantity = remainingQuantity * (palettes / remainingPalettes)
      line.segments.push({
        quantity,
        date: firstDay,
        source: stock.source,
        confidence: 'constatee',
        cause:
          stock.source === 'quai' ? 'Stock prêt sur le quai' : 'Production présente en atelier',
      })
      stock.palettes -= palettes
    }
  }

  return { lines: materialized, initialQueuePalettes, loadedTodayPalettes }
}

function normalizeEntryDate(date: string, dates: string[]): string | null {
  if (dates.includes(date)) return date
  for (const candidate of dates) if (candidate >= date) return candidate
  return null
}

function buildToken(
  line: MaterializedLine,
  segment: AvailabilitySegment,
  firstDay: string,
  dailyDates: string[],
  volumes: Map<string, VolumeCoef>
): QueueToken | null {
  if (segment.weeklyOnly || !segment.date) return null
  const availabilityDate = normalizeEntryDate(segment.date, dailyDates)
  if (!availabilityDate) return null
  const palettes = volumeFor(segment.quantity, line.source.article, volumes)
  if (palettes === null || palettes <= EPSILON) return null
  return {
    line,
    segment,
    quantity: segment.quantity,
    palettes,
    availabilityDate: availabilityDate < firstDay ? firstDay : availabilityDate,
    priority: line.priority,
  }
}

function makeWeekLine(line: MaterializedLine, volumes: Map<string, VolumeCoef>): ForecastLine {
  const segment = line.segments.find((candidate) => candidate.source === 'ctp') ??
    line.segments.find((candidate) => !candidate.weeklyOnly) ??
    line.segments[0] ?? {
      quantity: line.source.orderedOpenQuantity,
      date: null,
      source: 'ctp' as const,
      confidence: 'faible' as const,
      cause: 'Aucune source de disponibilité datée',
      weeklyOnly: true,
    }
  return makeLine(
    line.source,
    segment,
    line.source.orderedOpenQuantity,
    line.totalPalettes,
    null,
    volumes
  )
}

function weekDates(
  from: string,
  closedDays: Set<string>
): { from: string; to: string; capacityDays: number } {
  const to = addDays(from, 6)
  let capacityDays = 0
  for (let i = 0; i < 7; i++) if (isWorkingDay(addDays(from, i), closedDays)) capacityDays++
  return { from, to, capacityDays }
}

/**
 * Construit les trois bandes de prévision : file journalière, pré-alerte et carnet
 * hebdomadaire. Toutes les quantités sont plafonnées au reliquat de leur ligne.
 */
export function buildExpeditionForecast(opts: BuildForecastOptions): ExpeditionForecast {
  const decisionDays = Math.max(1, opts.decisionDays ?? 4)
  const dailyHorizonDays = Math.max(decisionDays, opts.dailyHorizonDays ?? 8)
  const weeklyHorizonWeeks = Math.max(1, opts.weeklyHorizonWeeks ?? 6)
  const closedDays = opts.closedDays ?? new Set<string>()
  const dailyDates = workingDates(opts.today, dailyHorizonDays, closedDays)
  const firstDay = dailyDates[0] ?? opts.today
  const { lines, initialQueuePalettes, loadedTodayPalettes } = materializeLines(
    opts.lines,
    opts.volumes,
    opts.initialQueue,
    opts.loadedShuttle ?? [],
    firstDay
  )

  const byDate = new Map<string, QueueToken[]>()
  for (const line of lines) {
    for (const segment of line.segments) {
      const token = buildToken(line, segment, firstDay, dailyDates, opts.volumes)
      if (!token) continue
      const list = byDate.get(token.availabilityDate) ?? []
      list.push(token)
      byDate.set(token.availabilityDate, list)
    }
  }

  const queue: QueueToken[] = []
  const consumedByLine = new Map<string, number>()
  const days: DayCharge[] = []
  for (const date of dailyDates) {
    const entries = byDate.get(date) ?? []
    entries.sort(
      (a, b) =>
        sourceRank(a.segment.source) - sourceRank(b.segment.source) ||
        (a.segment.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.segment.sequence ?? Number.MAX_SAFE_INTEGER) ||
        a.priority - b.priority ||
        a.line.key.localeCompare(b.line.key)
    )
    const fileBefore = queue.reduce((sum, token) => sum + token.palettes, 0)
    queue.push(...entries)
    const entriesPalettes = entries.reduce((sum, token) => sum + token.palettes, 0)
    const available = fileBefore + entriesPalettes
    let capacityLeft = Math.max(0, opts.capaciteJour)
    const loadedLines: ForecastLine[] = []

    while (capacityLeft > EPSILON && queue.length > 0) {
      const token = queue[0]!
      const take = Math.min(capacityLeft, token.palettes)
      const ratio = token.palettes > EPSILON ? take / token.palettes : 0
      const quantity = token.quantity * ratio
      loadedLines.push(
        makeLine(token.line.source, token.segment, quantity, take, date, opts.volumes)
      )
      consumedByLine.set(token.line.key, (consumedByLine.get(token.line.key) ?? 0) + take)
      token.palettes -= take
      token.quantity -= quantity
      capacityLeft -= take
      if (token.palettes <= EPSILON) queue.shift()
    }

    const loaded = loadedLines.reduce((sum, line) => sum + (line.palTheo ?? 0), 0)
    const fileAfter = queue.reduce((sum, token) => sum + token.palettes, 0)
    const deltaVsCapacite = available - opts.capaciteJour
    const spotPalettes = Math.max(0, deltaVsCapacite)
    const nbCamionsSpot =
      spotPalettes > EPSILON && opts.camionCapacitePalettes > 0
        ? Math.ceil(spotPalettes / opts.camionCapacitePalettes)
        : 0
    const offset = dayOffset(opts.today, date)
    days.push({
      date,
      band: offset < decisionDays ? 'decision' : 'prealert',
      offset,
      fileBefore,
      entries: entriesPalettes,
      available,
      loaded,
      fileAfter,
      capaciteJour: opts.capaciteJour,
      deltaVsCapacite,
      spot: spotPalettes > EPSILON,
      nbCamionsSpot,
      spotPalettes,
      lignes: loadedLines,
    })
  }

  const deferred: ForecastLine[] = []
  let deferredPalettes = 0
  for (const line of lines) {
    const consumed = consumedByLine.get(line.key) ?? 0
    if (line.totalPalettes !== null && line.totalPalettes - consumed > EPSILON) {
      const residual = line.totalPalettes - consumed
      const segment = line.segments.find((candidate) => candidate.source === 'ctp') ??
        line.segments[line.segments.length - 1] ?? {
          quantity: line.source.orderedOpenQuantity,
          date: null,
          source: 'ctp' as const,
          confidence: 'faible' as const,
          cause: 'Aucune source de disponibilité datée',
          weeklyOnly: true,
        }
      const totalQuantity = volumeFor(
        line.source.orderedOpenQuantity,
        line.source.article,
        opts.volumes
      )
      const quantity =
        totalQuantity && totalQuantity > EPSILON
          ? line.source.orderedOpenQuantity * (residual / totalQuantity)
          : line.source.orderedOpenQuantity
      deferred.push(makeLine(line.source, segment, quantity, residual, null, opts.volumes))
      deferredPalettes += residual
    } else if (line.totalPalettes === null) {
      const segment = line.segments[0] ?? {
        quantity: line.source.orderedOpenQuantity,
        date: null,
        source: 'ctp' as const,
        confidence: 'faible' as const,
        cause: 'Coefficient de palettisation absent et non estimable',
        weeklyOnly: true,
      }
      deferred.push(
        makeLine(line.source, segment, line.source.orderedOpenQuantity, null, null, opts.volumes)
      )
    }
  }

  const weeklyFrom = nextMonday(opts.today)
  const weeks: WeekCharge[] = []
  for (let index = 0; index < weeklyHorizonWeeks; index++) {
    const from = addDays(weeklyFrom, index * 7)
    const period = weekDates(from, closedDays)
    const weekLines = lines.filter((line) => {
      const date = line.source.dateLivraison ?? opts.today
      return date >= period.from && date <= period.to
    })
    const quantifiable = weekLines.filter((line) => line.totalPalettes !== null)
    const carnetPalettes = quantifiable.reduce((sum, line) => sum + (line.totalPalettes ?? 0), 0)
    const capaciteTransport = period.capacityDays * opts.capaciteJour
    const capaciteProduction = opts.productionWeeklyCapacity ?? Number.POSITIVE_INFINITY
    const capacite = Math.min(capaciteTransport, capaciteProduction)
    const deltaVsCapacite = carnetPalettes - capacite
    const spotPalettes = Math.max(0, deltaVsCapacite)
    weeks.push({
      key: weekKey(period.from),
      from: period.from,
      to: period.to,
      carnetPalettes,
      capaciteTransport,
      capaciteProduction,
      capacite,
      chargePlafonnee: Math.min(carnetPalettes, capacite),
      deltaVsCapacite,
      spot: spotPalettes > EPSILON,
      nbCamionsSpot:
        spotPalettes > EPSILON && opts.camionCapacitePalettes > 0
          ? Math.ceil(spotPalettes / opts.camionCapacitePalettes)
          : 0,
      lignes: weekLines.map((line) => makeWeekLine(line, opts.volumes)),
      nonQuantifiableLines: weekLines.length - quantifiable.length,
    })
  }

  const decisionTo = addDays(opts.today, decisionDays - 1)
  const prealertTo = addDays(opts.today, dailyHorizonDays - 1)
  return {
    from: opts.today,
    to: prealertTo,
    decisionTo,
    prealertTo,
    dailyHorizonDays,
    weeklyHorizonWeeks,
    capaciteJour: opts.capaciteJour,
    nbDepartsQuotidiens: opts.nbDepartsQuotidiens,
    camionCapacitePalettes: opts.camionCapacitePalettes,
    initialQueuePalettes,
    loadedTodayPalettes,
    days,
    weeks,
    deferred,
    deferredPalettes,
    nonQuantifiableLines: lines.filter((line) => line.nonQuantifiable).length,
  }
}

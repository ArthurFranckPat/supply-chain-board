/**
 * Prévision de file d'expédition pour la navette dédiée au client 80001.
 *
 * Ce module est volontairement pur. Il ne connaît ni ORDERS ni STOCK : le loader
 * transforme les sources ERP en lignes de commande et en entrées de file, puis ce
 * moteur simule la vidange FIFO par journées ouvrées.
 *
 * Le modèle a DEUX étages, pas un :
 *
 *   1. le portillon de production — un OF n'entre pas dans la file du quai à la
 *      date où on le regarde, mais à la date où l'atelier peut l'avoir fabriqué.
 *      Le rang de séquencement (`sequence`) devient une date en drainant une
 *      cadence journalière ;
 *   2. la file du quai — vidée par les deux navettes, puis par les camions spot
 *      réellement affrétables.
 *
 * Sans le premier étage, tout OF ferme du carnet devenait disponible le jour 1 :
 * 898 pal et 26 camions spot sur une seule journée de reprise après les congès.
 */

import {
  calcVolumes,
  ESH_SURFACE_RATIO,
  type VolumeCoef,
} from '#repositories/expedition_repository'

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
  /**
   * Statut dans la charge du jour. Absent hors bande jour (semaine / deferred).
   * `overflow` = portion qui compose le spot / la file reportée.
   */
  chargeStatus?: 'loaded' | 'overflow'
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
  /** Part des entrées sortie de l'atelier ce jour (portillon de production). */
  entriesProduites: number
  /** Volume disponible avant les deux départs du jour. */
  available: number
  /** Volume chargé par les navettes, tassage compris. */
  loaded: number
  /** Part de `loaded` qui n'entre que parce que le quai tasse (33 → 35/camion). */
  loadedTasse: number
  /** Volume emporté par les camions spot réellement affrétables. */
  loadedSpot: number
  /** Surplus trop petit pour justifier un spot : reporté au jour ouvré suivant. */
  reportePalettes: number
  /** File reportée au jour ouvré suivant. */
  fileAfter: number
  capaciteJour: number
  /** Capacité des mêmes navettes en tassant — c'est elle qui déclenche le spot. */
  capaciteJourTassee: number
  deltaVsCapacite: number
  spot: boolean
  /** Camions spot à demander, plafonnés par ce qui est affrétable en un jour. */
  nbCamionsSpot: number
  /** Camions qu'il faudrait sans plafond — mesure de l'arriéré, pas une commande. */
  nbCamionsSpotTheorique: number
  /** Le besoin dépasse le nombre de spots affrétables : c'est un arriéré. */
  spotSature: boolean
  /** Équivalent-palettes au-delà des deux navettes. */
  spotPalettes: number
  /**
   * Lignes composant la charge du jour = portions chargées + overflow
   * (ce qui force le spot / report). Jamais seulement le chargé.
   */
  lignes: ForecastLine[]
}

export interface WeekCharge {
  key: string
  from: string
  to: string
  /**
   * Carnet 80001 réparti selon la date de livraison, uniquement à cette maille,
   * NET de ce que la bande jour a déjà chargé — sinon les deux bandes comptent
   * deux fois les mêmes palettes sur leur période commune.
   */
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
  /** Tous les jours ouvrés de la semaine sont fermés (congès, férié…). */
  usineFermee: boolean
}

/** Fermeture usine (scope global, facteur 0) chevauchant l'horizon. */
export interface PlantClosureRange {
  from: string
  to: string
  motif: string
}

export interface ExpeditionForecast {
  from: string
  to: string
  decisionTo: string
  prealertTo: string
  dailyHorizonDays: number
  weeklyHorizonWeeks: number
  capaciteJour: number
  /** Capacité des navettes en tassant — seuil réel de déclenchement du spot. */
  capaciteJourTassee: number
  /** Surplus minimal pour qu'un camion spot se justifie. */
  spotMinPalettes: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  /** Cadence de sortie atelier retenue, en équivalent-palettes par jour ouvré. */
  productionDailyCapacity: number
  /** Plafond de camions spot affrétables en une journée. */
  maxSpotTrucks: number
  initialQueuePalettes: number
  loadedTodayPalettes: number
  days: DayCharge[]
  weeks: WeekCharge[]
  /**
   * Carnet dont la date de livraison est déjà passée et que la bande jour n'a pas
   * absorbé. Sans ce seau, ces lignes n'appartenaient à aucune semaine et le
   * retard disparaissait de l'écran.
   */
  retardPalettes: number
  retardLines: ForecastLine[]
  /** Portions sans date exploitable ou non visibles à la maille jour. */
  deferred: ForecastLine[]
  deferredPalettes: number
  /** Lignes dont le coef direct et l'estimateur sont tous deux absents. */
  nonQuantifiableLines: number
  /** Fermetures usine dans ou juste avant l'horizon (bandeau UI). */
  plantClosures: PlantClosureRange[]
  /** Premier jour ouvré réellement simulé, null si aucun. */
  firstWorkingDay: string | null
}

export interface BuildForecastOptions {
  lines: ExpeditionOrderLine[]
  initialQueue: QueueStockObservation[]
  loadedShuttle?: LoadedShuttleObservation[]
  volumes: Map<string, VolumeCoef>
  today: string
  /** Nombre de jours ouvrés de la bande décision (défaut 4). */
  decisionDays?: number
  /** Nombre de jours ouvrés de la bande jour (défaut 8). */
  dailyHorizonDays?: number
  weeklyHorizonWeeks?: number
  capaciteJour: number
  /**
   * Capacité des mêmes navettes en tassant (défaut : `capaciteJour`). C'est le
   * vrai seuil de déclenchement du spot — un dépassement que le quai absorbe en
   * poussant les palettes n'est pas un besoin de camion.
   */
  capaciteJourTassee?: number
  /**
   * Surplus en dessous duquel on ne demande pas de spot : les palettes partent
   * le lendemain. Affréter un camion pour 4 palettes n'a pas de sens, et la file
   * se charge de déclencher quand l'arriéré devient réel.
   */
  spotMinPalettes?: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  closedDays?: Set<string>
  /** Capacité production hebdomadaire déjà normalisée en équivalent-palettes. */
  productionWeeklyCapacity?: number
  /**
   * Cadence de sortie atelier par jour ouvré, en équivalent-palettes. C'est le
   * portillon : un OF ferme n'entre dans la file qu'une fois fabriqué. Absente
   * ou nulle, la production est réputée infinie et la file redevient un tas.
   */
  productionDailyCapacity?: number
  /**
   * Camions spot affrétables en une journée. Au-delà, annoncer « 26 camions »
   * n'est pas une commande transport mais un arriéré de production : le surplus
   * reste dans la file et le jour est marqué saturé.
   */
  maxSpotTrucks?: number
  plantClosures?: PlantClosureRange[]
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
  /** Date d'entrée dans la file du quai, après passage du portillon production. */
  availabilityDate: string
  /** Date au plus tôt avant le portillon : stock présent, ou composant arrivé. */
  earliestDate: string
  /** Doit encore sortir de l'atelier : consomme la cadence journalière. */
  needsProduction: boolean
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

/**
 * Collecte `count` jours ouvrés à partir de `from` (inclus si ouvré).
 * Saute week-ends et fermetures usine — indispensable pendant les congès :
 * un horizon calendaire de 8 j tombant dans une fermeture de 2 semaines
 * produisait une prévision vide alors que la reprise doit être anticipée.
 */
function workingDates(from: string, count: number, closedDays: Set<string>): string[] {
  const need = Math.max(1, count)
  const out: string[] = []
  // Cap de sécurité : ~3 mois de calendrier pour trouver `need` jours ouvrés.
  for (let i = 0; out.length < need && i < need * 4 + 90; i++) {
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

/**
 * Une palette déjà fabriquée n'a pas à repasser par l'atelier. Tout le reste —
 * OF lancé compris, il lui reste des pointages — consomme la cadence du jour.
 */
/**
 * Répartit une quantité au prorata des palettes emportées, sans inventer de
 * décimales : un kit se compte en pièces entières, « 249,6 » n'existe pas.
 *
 * Le dernier morceau absorbe le reste, de sorte que la somme des portions reste
 * exactement la quantité d'origine — l'arrondi ne doit ni créer ni perdre de
 * pièce. Une quantité source déjà fractionnaire (articles vendus au mètre) est
 * respectée telle quelle : on ne corrige que ce que le prorata a fabriqué.
 */
function splitQuantity(totalQuantity: number, totalPalettes: number, take: number): number {
  if (take >= totalPalettes - EPSILON) return totalQuantity
  if (totalPalettes <= EPSILON) return 0
  const exact = totalQuantity * (take / totalPalettes)
  const value = Number.isInteger(totalQuantity) ? Math.round(exact) : exact
  return Math.min(totalQuantity, Math.max(0, value))
}

function isPhysical(source: AvailabilitySource): boolean {
  return source === 'stock' || source === 'quai' || source === 'stock_production'
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

/**
 * Conversion unique, utilisée par les entrées stock et les portions de commande.
 *
 * La **palette physique** est l'unité indivisible : on arrondit le NOMBRE de
 * palettes (ceil), puis on applique le facteur de surface. Une palette entamée
 * occupe un emplacement plein, et « 0,6 pal » ne décrit rien de chargeable —
 * mais c'est le compte de palettes qu'on arrondit, pas l'équivalent (revue
 * #104). Pour une palette ESH (×1,25), arrondir l'équivalent gonflait une
 * palette seule à 2 emplacements et sous-comptait une palette entamée à 1 :
 * 17 lignes d'1 palette ESH annonçaient 34 emplacements (1 camion spot
 * fantôme) pour 21,25 réels. L'équivalent reste fractionnaire — la file
 * travaille déjà en flottants (`drainQueue` compare à `EPSILON`).
 * `calcVolumes` garde l'équivalent fractionnaire pour le rétroviseur (#44).
 */
export function emplacementsPalette(
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
  if (result.palTheo < 0) return null
  // Même règle de facteur que calcVolumes (ESH = surface 1,25, sinon 1).
  const facteur = volume.yfamstat7 === 'ESH' && ESH_SURFACE_RATIO > 0 ? ESH_SURFACE_RATIO : 1
  return Math.ceil(result.palTheo / facteur - EPSILON) * facteur
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
  return emplacementsPalette(quantity, volumes.get(article))
}

function makeLine(
  line: ExpeditionOrderLine,
  segment: AvailabilitySegment,
  quantity: number,
  palettes: number | null,
  dateChargement: string | null,
  volumes: Map<string, VolumeCoef>,
  chargeStatus?: 'loaded' | 'overflow'
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
    ...(chargeStatus ? { chargeStatus } : {}),
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

  // Sommer les quantités AVANT de convertir : arrondir chaque emplacement puis
  // additionner inventerait une palette par ligne de stock détail.
  const stockQuantities = new Map<
    string,
    { quantityUs: number; source: 'quai' | 'stock_production' }
  >()
  for (const row of initialQueue) {
    if (!Number.isFinite(row.quantityUs) || row.quantityUs <= 0) continue
    const current = stockQuantities.get(row.article)
    if (current) {
      current.quantityUs += row.quantityUs
      if (row.source === 'quai') current.source = 'quai'
    } else {
      stockQuantities.set(row.article, { quantityUs: row.quantityUs, source: row.source })
    }
  }
  const stockByArticle = new Map<
    string,
    { palettes: number; source: 'quai' | 'stock_production' }
  >()
  for (const [article, row] of stockQuantities) {
    const palettes = emplacementsPalette(row.quantityUs, volumes.get(article))
    if (palettes === null || palettes <= 0) continue
    stockByArticle.set(article, { palettes, source: row.source })
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

  // Une allocation ERP porte déjà sur des palettes physiques — souvent celles du
  // quai. Sans cette déduction, le même stock servait deux fois : une fois via la
  // ligne allouée, une fois redistribué à une autre ligne du même article.
  for (const line of materialized) {
    for (const segment of line.segments) {
      if (segment.source !== 'stock') continue
      const stock = stockByArticle.get(line.source.article)
      if (!stock) continue
      const palettes = volumeFor(segment.quantity, line.source.article, volumes)
      if (palettes === null || palettes <= 0) continue
      stock.palettes = Math.max(0, stock.palettes - palettes)
    }
  }

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

  let initialQueuePalettes = 0
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
      const quantity = splitQuantity(remainingQuantity, remainingPalettes, palettes)
      line.segments.push({
        quantity,
        date: firstDay,
        source: stock.source,
        confidence: 'constatee',
        cause:
          stock.source === 'quai' ? 'Stock prêt sur le quai' : 'Production présente en atelier',
      })
      stock.palettes -= palettes
      initialQueuePalettes += palettes
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
  const normalized = normalizeEntryDate(segment.date, dailyDates)
  if (!normalized) return null
  const palettes = volumeFor(segment.quantity, line.source.article, volumes)
  if (palettes === null || palettes <= EPSILON) return null
  // Rien ne peut entrer avant la première journée ouvrée : ni une palette déjà
  // au quai, ni un OF. Le recalage sur `firstDay` est donc légitime — ce qui ne
  // l'était pas, c'était de s'y arrêter, sans faire passer les OF par l'atelier.
  const earliestDate = normalized < firstDay ? firstDay : normalized
  return {
    line,
    segment,
    quantity: segment.quantity,
    palettes,
    availabilityDate: earliestDate,
    earliestDate,
    needsProduction: !isPhysical(segment.source),
    priority: line.priority,
  }
}

/**
 * Portillon de production : transforme le rang de séquencement en date.
 *
 * Les tokens à fabriquer sont servis dans l'ordre du séquenceur (source, rang
 * ferme, ancienneté commande) contre une cadence journalière. Un token plus gros
 * que la cadence est fractionné sur plusieurs jours ; ce qui déborde de l'horizon
 * n'est pas planifié et retombe dans `deferred`.
 *
 * La file de production n'est pas bloquante (règle métier verrouillée) : un token
 * qui ne trouve pas de place un jour donné n'empêche pas le suivant d'en trouver
 * une, puisque chacun repart du premier jour ouvré où il reste de la capacité.
 */
function scheduleProduction(
  tokens: QueueToken[],
  dailyDates: string[],
  dailyCapacity: number
): QueueToken[] {
  if (!Number.isFinite(dailyCapacity) || dailyCapacity <= 0) return tokens
  const ordered = [...tokens].sort(
    (a, b) =>
      a.earliestDate.localeCompare(b.earliestDate) ||
      sourceRank(a.segment.source) - sourceRank(b.segment.source) ||
      (a.segment.sequence ?? Number.MAX_SAFE_INTEGER) -
        (b.segment.sequence ?? Number.MAX_SAFE_INTEGER) ||
      a.priority - b.priority ||
      a.line.key.localeCompare(b.line.key)
  )
  const capacityLeft = new Map(dailyDates.map((date) => [date, dailyCapacity]))
  const out: QueueToken[] = []
  for (const token of ordered) {
    let index = dailyDates.indexOf(token.earliestDate)
    if (index < 0) {
      out.push(token)
      continue
    }
    let remaining = token.palettes
    let quantityLeft = token.quantity
    while (remaining > EPSILON && index < dailyDates.length) {
      const date = dailyDates[index]!
      const left = capacityLeft.get(date) ?? 0
      if (left <= EPSILON) {
        index++
        continue
      }
      const take = Math.min(left, remaining)
      const quantity = Math.min(quantityLeft, splitQuantity(token.quantity, token.palettes, take))
      out.push({ ...token, palettes: take, quantity, availabilityDate: date })
      capacityLeft.set(date, left - take)
      remaining -= take
      quantityLeft -= quantity
      if (left - take <= EPSILON) index++
    }
  }
  return out
}

/**
 * Ligne à la maille semaine, ramenée au reliquat `palettes` restant après la
 * bande jour (`null` = ligne non chiffrable, affichée sans volume).
 */
function makeWeekLine(
  line: MaterializedLine,
  palettes: number | null,
  volumes: Map<string, VolumeCoef>
): ForecastLine {
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
  const ratio =
    palettes !== null && line.totalPalettes !== null && line.totalPalettes > EPSILON
      ? palettes / line.totalPalettes
      : 1
  return makeLine(
    line.source,
    segment,
    line.source.orderedOpenQuantity * ratio,
    palettes,
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

  const productionDailyCapacity =
    opts.productionDailyCapacity && opts.productionDailyCapacity > 0
      ? opts.productionDailyCapacity
      : Number.POSITIVE_INFINITY
  const maxSpotTrucks = Math.max(0, opts.maxSpotTrucks ?? Number.POSITIVE_INFINITY)
  const capaciteJourTassee = Math.max(opts.capaciteJour, opts.capaciteJourTassee ?? 0)
  const spotMinPalettes = Math.max(0, opts.spotMinPalettes ?? 0)

  const physicalTokens: QueueToken[] = []
  const productionTokens: QueueToken[] = []
  for (const line of lines) {
    for (const segment of line.segments) {
      const token = buildToken(line, segment, firstDay, dailyDates, opts.volumes)
      if (!token) continue
      ;(token.needsProduction ? productionTokens : physicalTokens).push(token)
    }
  }

  const byDate = new Map<string, QueueToken[]>()
  for (const token of [
    ...physicalTokens,
    ...scheduleProduction(productionTokens, dailyDates, productionDailyCapacity),
  ]) {
    const list = byDate.get(token.availabilityDate) ?? []
    list.push(token)
    byDate.set(token.availabilityDate, list)
  }

  const queue: QueueToken[] = []
  const consumedByLine = new Map<string, number>()
  const days: DayCharge[] = []
  dailyDates.forEach((date, workingIndex) => {
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
    const entriesProduites = entries.reduce(
      (sum, token) => sum + (token.needsProduction ? token.palettes : 0),
      0
    )
    const available = fileBefore + entriesPalettes
    // Le seuil de déclenchement, c'est la capacité EN TASSANT : ce que le quai
    // absorbe en poussant les palettes n'est pas un besoin de camion.
    const deltaVsCapacite = available - capaciteJourTassee
    const surplus = Math.max(0, deltaVsCapacite)
    // Sous le seuil, on n'affrète pas : les palettes partent le lendemain. La
    // file se charge de déclencher quand l'arriéré devient réel.
    const spotPalettes = surplus >= spotMinPalettes ? surplus : 0
    const nbCamionsSpotTheorique =
      spotPalettes > EPSILON && opts.camionCapacitePalettes > 0
        ? Math.ceil(spotPalettes / opts.camionCapacitePalettes)
        : 0
    // Au-delà du plafond, le chiffre n'est plus une commande transport : c'est
    // un arriéré. On affrète ce qui est affrétable, le reste reste dans la file
    // et le jour est marqué saturé — jamais absorbé en silence.
    const nbCamionsSpot = Math.min(nbCamionsSpotTheorique, maxSpotTrucks)
    const spotSature = nbCamionsSpotTheorique > nbCamionsSpot

    const drainQueue = (capacity: number, status: 'loaded' | 'overflow'): ForecastLine[] => {
      let capacityLeft = Math.max(0, capacity)
      const out: ForecastLine[] = []
      while (capacityLeft > EPSILON && queue.length > 0) {
        const token = queue[0]!
        const take = Math.min(capacityLeft, token.palettes)
        const quantity = splitQuantity(token.quantity, token.palettes, take)
        out.push(
          makeLine(token.line.source, token.segment, quantity, take, date, opts.volumes, status)
        )
        consumedByLine.set(token.line.key, (consumedByLine.get(token.line.key) ?? 0) + take)
        token.palettes -= take
        token.quantity -= quantity
        capacityLeft -= take
        if (token.palettes <= EPSILON) queue.shift()
      }
      return out
    }

    // Navettes (tassage compris) d'abord, puis les seuls camions spot réellement
    // affrétés — sinon le même tas reporte à J+1, J+2 et chaque jour
    // recomptabilise des spots déjà « demandés » la veille (26 + 24 + 22…).
    const loadedLines = drainQueue(capaciteJourTassee, 'loaded')
    const spotLines = drainQueue(nbCamionsSpot * opts.camionCapacitePalettes, 'overflow')

    const loaded = loadedLines.reduce((sum, line) => sum + (line.palTheo ?? 0), 0)
    const loadedTasse = Math.max(0, loaded - opts.capaciteJour)
    const loadedSpot = spotLines.reduce((sum, line) => sum + (line.palTheo ?? 0), 0)
    const fileAfter = queue.reduce((sum, token) => sum + token.palettes, 0)
    // Surplus qu'on a choisi de ne pas affréter : il part le lendemain.
    const reportePalettes = spotPalettes > EPSILON ? 0 : surplus
    days.push({
      date,
      // Bandes = rang dans la file des jours ouvrés, pas décalage calendaire :
      // pendant les congès, les 4 premiers jours de reprise restent « décision ».
      band: workingIndex < decisionDays ? 'decision' : 'prealert',
      offset: dayOffset(opts.today, date),
      fileBefore,
      entries: entriesPalettes,
      entriesProduites,
      available,
      loaded,
      loadedTasse,
      loadedSpot,
      reportePalettes,
      fileAfter,
      capaciteJour: opts.capaciteJour,
      capaciteJourTassee,
      deltaVsCapacite,
      spot: spotPalettes > EPSILON,
      nbCamionsSpot,
      nbCamionsSpotTheorique,
      spotSature,
      spotPalettes,
      lignes: [...loadedLines, ...spotLines],
    })
  })

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

  /**
   * Reliquat d'une ligne après la bande jour. Les deux bandes se recouvrent dans
   * le temps : sans ce net, une palette chargée le 18/08 était recomptée dans la
   * semaine de sa date de livraison.
   */
  const residualPalettes = (line: MaterializedLine): number | null =>
    line.totalPalettes === null
      ? null
      : Math.max(0, line.totalPalettes - (consumedByLine.get(line.key) ?? 0))

  const weeklyFrom = nextMonday(opts.today)

  // Carnet à échéance dépassée : il n'appartient à aucune semaine de l'horizon.
  // Le laisser tomber effaçait le retard de l'écran au lieu de le montrer.
  const retardLines: ForecastLine[] = []
  let retardPalettes = 0
  for (const line of lines) {
    const date = line.source.dateLivraison
    if (!date || date >= weeklyFrom) continue
    const residual = residualPalettes(line)
    if (residual === null || residual <= EPSILON) continue
    retardLines.push(makeWeekLine(line, residual, opts.volumes))
    retardPalettes += residual
  }

  const weeks: WeekCharge[] = []
  for (let index = 0; index < weeklyHorizonWeeks; index++) {
    const from = addDays(weeklyFrom, index * 7)
    const period = weekDates(from, closedDays)
    const weekLines = lines.filter((line) => {
      const date = line.source.dateLivraison
      if (!date) return false
      if (date < period.from || date > period.to) return false
      const residual = residualPalettes(line)
      return residual === null || residual > EPSILON
    })
    const quantifiable = weekLines.filter((line) => line.totalPalettes !== null)
    const carnetPalettes = quantifiable.reduce(
      (sum, line) => sum + (residualPalettes(line) ?? 0),
      0
    )
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
      lignes: weekLines.map((line) => makeWeekLine(line, residualPalettes(line), opts.volumes)),
      nonQuantifiableLines: weekLines.length - quantifiable.length,
      usineFermee: period.capacityDays === 0,
    })
  }

  const lastDaily = dailyDates[dailyDates.length - 1] ?? opts.today
  const decisionLast = dailyDates[Math.min(decisionDays, dailyDates.length) - 1] ?? lastDaily
  return {
    from: opts.today,
    to: lastDaily,
    decisionTo: decisionLast,
    prealertTo: lastDaily,
    dailyHorizonDays,
    weeklyHorizonWeeks,
    capaciteJour: opts.capaciteJour,
    capaciteJourTassee,
    spotMinPalettes,
    nbDepartsQuotidiens: opts.nbDepartsQuotidiens,
    camionCapacitePalettes: opts.camionCapacitePalettes,
    productionDailyCapacity,
    maxSpotTrucks,
    initialQueuePalettes,
    loadedTodayPalettes,
    days,
    weeks,
    retardPalettes,
    retardLines,
    deferred,
    deferredPalettes,
    nonQuantifiableLines: lines.filter((line) => line.nonQuantifiable).length,
    plantClosures: opts.plantClosures ?? [],
    firstWorkingDay: dailyDates[0] ?? null,
  }
}

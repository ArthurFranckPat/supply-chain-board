/**
 * Agrégation charge transport journalière anticipée (issue #104).
 *
 * Transforme des OrderImpactRow (+ commandes 100 % allouées réinjectées) en :
 *  - charge nominale par jour (dateExpedition)
 *  - charge réaliste (repositionnée selon statut ordonnancement)
 *  - volume différé (bloquée / sans couverture)
 *
 * Pur : pas d'I/O. Les coefs ITMMASTER et calcVolumes sont injectés.
 */

import type { OrderImpactRow } from '#app/domain/order_impacts'
import type { Flow } from '#app/domain/models/flow'
import { calcVolumes, type VolumeCoef } from '#repositories/expedition_repository'

export type ForecastStatut = OrderImpactRow['statut']

export interface ForecastLine {
  numCommande: string
  ligne: string | null
  client: string
  article: string
  description: string
  qte: number
  /** Éq-palettes (−1 si coef manquant). */
  palTheo: number
  statut: ForecastStatut
  dateExpedition: string
  /** Date retenue pour la charge réaliste (vide si différé). */
  dateRealiste: string | null
  /** Vrai si la date réaliste ≠ date nominale (volume glissé). */
  glisse: boolean
  ofNum: string | null
  ofDateFin: string | null
}

export interface DayCharge {
  date: string
  chargeNominale: number
  chargeRealiste: number
  /** Part de la charge réaliste issue d'un glissement (retard → dateFin). */
  partGlisse: number
  capaciteJour: number
  deltaVsCapacite: number
  spot: boolean
  lignesNominales: ForecastLine[]
  lignesRealistes: ForecastLine[]
}

export interface ExpeditionForecast {
  from: string
  to: string
  horizonDays: number
  capaciteJour: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  days: DayCharge[]
  deferred: ForecastLine[]
  /** Σ palettes différées (−1 si aucune ligne calculable). */
  deferredPalTheo: number
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIsoDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function addDays(iso: string, n: number): string {
  const d = parseIsoDay(iso)
  if (!d) return iso
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

function orderKey(numCommande: string, ligne: string | null | undefined, article: string): string {
  return `${numCommande}|${ligne ?? ''}|${article}`
}

function impactKey(row: Pick<OrderImpactRow, 'numCommande' | 'ligne' | 'article'>): string {
  return orderKey(row.numCommande, row.ligne ?? null, row.article)
}

function demandKey(f: Flow): string {
  const origin = f.origin as { id?: string; ligne?: string | null }
  return orderKey(origin.id ?? '', origin.ligne ?? null, f.article)
}

/** Quantité à livrer = reste netté + allocation ERP (stock déjà réservé). */
export function shipQty(row: Pick<OrderImpactRow, 'qteRestante' | 'qteAllouee'>): number {
  return Math.max(0, row.qteRestante + (row.qteAllouee ?? 0))
}

function palTheoOf(qty: number, article: string, coefs: Map<string, VolumeCoef>): number {
  const coef = coefs.get(article)
  const { palTheo } = calcVolumes(
    [{ qteUc: qty, ucParPal: coef?.ucParPal ?? null, yfamstat7: coef?.yfamstat7 ?? null }],
    0
  )
  return palTheo
}

/** Max dateFin des OF alloués ; null si aucune date utile. */
export function maxOfDateFin(ofs: OrderImpactRow['ofs']): string | null {
  let best: string | null = null
  for (const of of ofs) {
    if (!of.dateFin || !/^\d{4}-\d{2}-\d{2}$/.test(of.dateFin)) continue
    if (!best || of.dateFin > best) best = of.dateFin
  }
  return best
}

/**
 * Date de charge réaliste selon le statut ordonnancement.
 * `today` = jour J d'affichage (ISO) — clamp si date passée.
 * Retourne null → bucket différé.
 */
export function resolveRealisticDate(
  row: Pick<OrderImpactRow, 'statut' | 'dateExpedition' | 'ofs'>,
  today: string
): { date: string | null; ofNum: string | null; ofDateFin: string | null } {
  if (row.statut === 'bloquee' || row.statut === 'sans_couverture') {
    return { date: null, ofNum: null, ofDateFin: null }
  }

  if (row.statut === 'on_time' || row.statut === 'stock') {
    const d =
      row.dateExpedition && /^\d{4}-\d{2}-\d{2}$/.test(row.dateExpedition)
        ? row.dateExpedition
        : today
    return { date: d < today ? today : d, ofNum: null, ofDateFin: null }
  }

  // retard → dateFin OF (max), clamp ≥ today ; fallback today si vide
  const ofDateFin = maxOfDateFin(row.ofs)
  let ofNum: string | null = null
  if (ofDateFin) {
    for (const of of row.ofs) {
      if (of.dateFin === ofDateFin) {
        ofNum = of.numOf
        break
      }
    }
  }
  const raw = ofDateFin ?? today
  return { date: raw < today ? today : raw, ofNum, ofDateFin }
}

/**
 * Réinjecte les demandes 100 % allouées filtrées par `netDemandsByAllocation`
 * (absentes des impacts) comme lignes `stock` à leur dateExpedition.
 */
export function recoverFullyAllocatedDemands(
  rawDemands: Flow[],
  impacts: OrderImpactRow[]
): OrderImpactRow[] {
  const present = new Set(impacts.map(impactKey))
  const recovered: OrderImpactRow[] = []

  for (const f of rawDemands) {
    if (f.direction !== 'demand') continue
    if (f.origin.type !== 'order' && f.origin.type !== 'forecast') continue
    const key = demandKey(f)
    if (present.has(key)) continue

    const origin = f.origin as {
      id?: string
      ligne?: string | null
      customer?: string
      qteAllouee?: number
      type?: string
      orderType?: string
      designation?: string | null
    }
    const qteAllouee = origin.qteAllouee ?? 0
    // Seulement les lignes entièrement consommées par l'allocation ERP.
    if (qteAllouee <= 0 || f.quantity > qteAllouee) continue

    const dateExpedition = f.date ? isoDay(f.date) : ''
    recovered.push({
      numCommande: origin.id ?? '',
      ligne: origin.ligne ?? null,
      client: origin.customer ?? '',
      article: f.article,
      description: origin.designation ?? '',
      qteRestante: 0,
      // Volume à livrer = RMNEXTQTY (f.quantity), pas ALLQTY (peut diverger).
      qteAllouee: f.quantity,
      dateExpedition,
      dejaEnRetard: false,
      nature: origin.type === 'forecast' ? 'prevision' : 'commande',
      typeCommande: origin.orderType ?? 'NOR',
      matchingMethod: 'stock_complete',
      reliquat: 0,
      statut: 'stock',
      joursRetard: 0,
      ofs: [],
    })
  }
  return recovered
}

function toForecastLine(
  row: OrderImpactRow,
  coefs: Map<string, VolumeCoef>,
  today: string
): ForecastLine {
  const qty = shipQty(row)
  const pal = palTheoOf(qty, row.article, coefs)
  const resolved = resolveRealisticDate(row, today)
  const dateNom =
    row.dateExpedition && /^\d{4}-\d{2}-\d{2}$/.test(row.dateExpedition)
      ? row.dateExpedition
      : today
  const glisse = resolved.date !== null && resolved.date !== dateNom && row.statut === 'retard'

  return {
    numCommande: row.numCommande,
    ligne: row.ligne ?? null,
    client: row.client,
    article: row.article,
    description: row.description,
    qte: qty,
    palTheo: pal,
    statut: row.statut,
    dateExpedition: dateNom,
    dateRealiste: resolved.date,
    glisse,
    ofNum: resolved.ofNum,
    ofDateFin: resolved.ofDateFin,
  }
}

function sumPal(lines: ForecastLine[]): number {
  let sum = 0
  let any = false
  for (const l of lines) {
    if (l.palTheo < 0) continue
    sum += l.palTheo
    any = true
  }
  return any ? sum : lines.length === 0 ? 0 : -1
}

export interface BuildForecastOptions {
  impacts: OrderImpactRow[]
  /** Demandes brutes (pré-netting) pour récupérer les 100 % allouées. */
  rawDemands?: Flow[]
  coefs: Map<string, VolumeCoef>
  /** Jour J d'affichage (ISO YYYY-MM-DD). */
  today: string
  /** Nombre de jours affichés (J inclus → J+horizonDays-1, ou J→J+horizonDays selon convention). */
  horizonDays: number
  capaciteJour: number
  nbDepartsQuotidiens: number
  camionCapacitePalettes: number
  /** Si true, ignore les prévisions CBN (WIPSTA=3). Défaut true. */
  commandesOnly?: boolean
}

/**
 * Construit la prévision J → J+(horizonDays−1) inclus.
 * Horizon 7 → jours [J, J+1, …, J+6].
 */
export function buildExpeditionForecast(opts: BuildForecastOptions): ExpeditionForecast {
  const {
    impacts,
    rawDemands = [],
    coefs,
    today,
    horizonDays,
    capaciteJour,
    nbDepartsQuotidiens,
    camionCapacitePalettes,
    commandesOnly = true,
  } = opts

  const recovered = recoverFullyAllocatedDemands(rawDemands, impacts)
  let rows = [...impacts, ...recovered]
  if (commandesOnly) rows = rows.filter((r) => r.nature === 'commande')

  const displayEnd = addDays(today, Math.max(horizonDays, 1) - 1)
  const dayDates: string[] = []
  for (let i = 0; i < Math.max(horizonDays, 1); i++) dayDates.push(addDays(today, i))

  const nominalByDay = new Map<string, ForecastLine[]>()
  const realistByDay = new Map<string, ForecastLine[]>()
  for (const d of dayDates) {
    nominalByDay.set(d, [])
    realistByDay.set(d, [])
  }
  const deferred: ForecastLine[] = []

  for (const row of rows) {
    const line = toForecastLine(row, coefs, today)

    // Nominale : uniquement si dateExpedition dans la fenêtre d'affichage
    if (line.dateExpedition >= today && line.dateExpedition <= displayEnd) {
      nominalByDay.get(line.dateExpedition)?.push(line)
    }

    if (line.dateRealiste === null) {
      deferred.push(line)
      continue
    }
    if (line.dateRealiste >= today && line.dateRealiste <= displayEnd) {
      realistByDay.get(line.dateRealiste)?.push(line)
    }
  }

  const days: DayCharge[] = dayDates.map((date) => {
    const lignesNominales = nominalByDay.get(date) ?? []
    const lignesRealistes = realistByDay.get(date) ?? []
    const chargeNominale = Math.max(0, sumPal(lignesNominales))
    const chargeRealisteRaw = sumPal(lignesRealistes)
    const chargeRealiste = Math.max(0, chargeRealisteRaw < 0 ? 0 : chargeRealisteRaw)
    const partGlisse = Math.max(0, sumPal(lignesRealistes.filter((l) => l.glisse)))
    const deltaVsCapacite = chargeRealiste - capaciteJour
    return {
      date,
      chargeNominale,
      chargeRealiste,
      partGlisse,
      capaciteJour,
      deltaVsCapacite,
      spot: chargeRealiste > capaciteJour,
      lignesNominales,
      lignesRealistes,
    }
  })

  const deferredPal = sumPal(deferred)

  return {
    from: today,
    to: displayEnd,
    horizonDays: Math.max(horizonDays, 1),
    capaciteJour,
    nbDepartsQuotidiens,
    camionCapacitePalettes,
    days,
    deferred,
    deferredPalTheo: deferredPal < 0 ? 0 : deferredPal,
  }
}

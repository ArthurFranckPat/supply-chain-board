import { X3Database } from '#app/x3/client/x3_database'
import { CombinedOrdersRepository } from '#app/repositories/combined_orders_repository'
import { parseX3Date } from '#app/x3/utils/parse_date'
import boardDataset from '#services/board_dataset'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { cacheNs } from '#services/cache_ns'
import { isoDay } from '#app/utils/dates'

/**
 * Service d'explication article CBN — question A primaire (ticket 02) + cache TTL (ticket 05).
 *
 * Grille time-phased hybride + pegging natif WIPTYP=6.
 * Lecture ORDERS telle que le CBN vient de la produire, pas de recalcul MRP.
 * Contrainte ZSOAPSQL O(n²) : `fetchArticleFutureFlows` reste à 3 colonnes,
 * seconde requête étroite WIPTYP=6 (ITMREFORI_0, VCRNUM_0, WIPSTA_0, ENDDAT_0, RMNEXTQTY_0).
 *
 * Cache (05, Q14) : par (article, date de run CBN) clé stable via `cacheNs()`
 * jamais une clé qui bouge par requête. TTL = prochain run nocturne (04 h)
 * car ORDERS inchangé entre deux runs. Invalidation sur réécriture photo via
 * epochPhotos (même clé que demand_snapshot_service). Diff lit SQLite donc
 * non mis en cache CBN — le cache ne porte que la grille + pegging.
 *
 * Budget p95 < 3 s : 2 SOAP étroits/article max (fetchArticleFutureFlows 3 colonnes +
 * pegging 5 colonnes), message row 1 ligne indexée. Colonne étroite conservée.
 *
 * REPLICA_READS=true (05, Q14) : live assumé documenté — pas de voie réplique
 * ici, X3 direct volontaire (aucun `replicaGate.canRead` dans ce service).
 * Le drawer est le seul appel X3 live d'une page servie en ~209 ms en mode
 * réplique — c'est explicite et déclenché UNIQUEMENT au clic, pas au
 * chargement de la file. Le coût est amorti par le cache journalier (2ᵉ clic
 * = hit < 200 ms). 4ᵉ passe réplique WIPTYP=6 envisagée (étendre
 * WIPSTA_BY_WIPTYP Record<1|2|5|6> + syncOrdersFlux) mais différée : ~3 972
 * lignes, bénéfice marginal quand le cache absorbe 90 % des lectures, et la
 * réplique ne serait pas plus fraîche que le TTL (même run CBN). À réévaluer
 * si p95 live dépasse 3 s en prod.
 */

const SITE = 'AE1'
export const DAILY_DAYS = 21
export const HORIZON_DAYS = 90
export const SENTINEL_BEFORE = Date.UTC(2000, 0, 1)

export const DAY_MS = 86_400_000

/**
 * Cache article-explanation (05).
 * Partage l'epoch `appro:photo-epoch:v1` avec demand_snapshot_service
 * (`APPRO_PHOTO_EPOCH_KEY`) : toute réécriture photo (snapshot:run relancé le
 * même jour) invalide le cache dérivé. Les deux littéraux DOIVENT rester
 * identiques — importer l'un depuis l'autre créerait un cycle, donc la
 * synchronisation est contractuelle et vérifiée en revue.
 */
export const EXPLICATION_CACHE_VERSION = 'v1'
export const EXPLICATION_EPOCH_KEY = 'appro:photo-epoch:v1'

export function msUntilProchainRun(now: Date = new Date()): number {
  const next = new Date(now)
  next.setHours(4, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

export function buildExplicationCacheKey(article: string, jourRun: string, epoch: number): string {
  // Articles X3 ne contiennent pas ':' mais '_' est légal en ITMREF ; encoder
  // évite la collision `A:B` vs `A_B` qu'aurait `replace(':','_')` —
  // `encodeURIComponent` est idempotent et stable par requête.
  const safe = encodeURIComponent(article)
  return `appro:explication:${safe}:${jourRun}:e${epoch}:${EXPLICATION_CACHE_VERSION}`
}

export interface CleParsed {
  vcrnum: string
  vcrlin: number
  vcrseq: string
}

export interface GrillePeriode {
  index: number
  label: string
  dateDebut: string | null
  dateFin: string | null
  stockDebut: number
  stockFin: number
  demande: number
  besoinMatiere: number
  reception: number
  of: number
  estPenurie: boolean
  estRetard: boolean
  contientMessage: boolean
}

export interface LigneMessage {
  vcrnum: string
  vcrlin: number
  vcrseq: string
  article: string
  designation: string
  quantite: number
  echeance: string | null
  mrpdat: string | null
  mrpdatRaw: Date | null
  message: number
  vcrnumori: string | null
}

export interface PeggingParent {
  article: string
  of: string
  quantite: number
  echeance: string | null
}

export interface ExplanationRefus {
  supporte: false
  raison: string
}

export interface ExplanationSuccess {
  supporte: true
  article: string
  designation: string
  grille: {
    periodes: GrillePeriode[]
    ligneMessage: LigneMessage
    mrpdatCbn: string | null
    premierePenurie: string | null
    premierePenurieIndex: number | null
  }
  pegging: {
    parents: PeggingParent[]
    suggestionOrigine: { numero: string; convertieLe: string | null } | null
  }
}

export type ExplanationResult = ExplanationRefus | ExplanationSuccess

export class ArticleExplanationNotFound extends Error {}
export class ArticleExplanationBadRequest extends Error {}

export function parseCle(cle: string): CleParsed {
  const parts = cle.split(':')
  if (parts.length < 2 || parts.length > 3) {
    throw new ArticleExplanationBadRequest(
      `cle invalide : attendu VCRNUM:VCRLIN:VCRSEQ (reçu ${cle})`
    )
  }
  const vcrnum = parts[0].trim()
  const vcrlin = Number(parts[1].trim())
  const vcrseq = parts.length === 3 ? parts[2].trim() : ''
  if (!vcrnum || !Number.isFinite(vcrlin)) {
    throw new ArticleExplanationBadRequest(`cle invalide : ${cle}`)
  }
  return { vcrnum, vcrlin, vcrseq }
}

export function parseDateSentinelle(raw: string | null | undefined): Date | null {
  const d = parseX3Date(raw)
  if (d === null) return null
  return d.getTime() < SENTINEL_BEFORE ? null : d
}

export function atMidnightLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function fmtJjMm(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function mondayOf(d: Date): Date {
  const x = atMidnightLocal(d)
  const dow = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dow)
  return x
}

/**
 * Construit la définition des périodes : 0 = déjà en retard, 1..DAILY_DAYS = jours, puis semaines.
 */
export function buildPeriodDefs(refDate: Date, horizonDays: number = HORIZON_DAYS) {
  const refMid = atMidnightLocal(refDate)
  const defs: Array<{ label: string; start: Date | null; end: Date | null; isRetard: boolean }> = []

  // Période 0 : retards
  defs.push({ label: 'Déjà en retard', start: null, end: refMid, isRetard: true })

  // Jours
  for (let i = 0; i < DAILY_DAYS; i++) {
    const start = new Date(refMid.getTime() + i * DAY_MS)
    const end = new Date(start.getTime() + DAY_MS)
    defs.push({ label: fmtJjMm(start), start, end, isRetard: false })
  }

  // Semaines
  const firstWeekStart = new Date(refMid.getTime() + DAILY_DAYS * DAY_MS)
  // We'll generate weeks until horizon
  const horizonDate = new Date(refMid.getTime() + horizonDays * DAY_MS)
  // Generate weekly buckets whose monday >= firstWeekStart (clamped)
  let weekStart = mondayOf(firstWeekStart)
  // If firstWeekStart is mid-week, its monday is before firstWeekStart — we start from that monday but flows before firstWeekStart already bucketed daily, so they won't fall here except those >= firstWeekStart.
  while (weekStart.getTime() < horizonDate.getTime()) {
    const end = new Date(weekStart.getTime() + 7 * DAY_MS)
    // Only add if end > firstWeekStart
    if (end.getTime() > firstWeekStart.getTime()) {
      defs.push({
        label: `S ${fmtJjMm(weekStart)}`,
        start: weekStart,
        end,
        isRetard: false,
      })
    }
    weekStart = new Date(weekStart.getTime() + 7 * DAY_MS)
    if (defs.length > 100) break
  }

  return defs
}

/**
 * Bucketise les flux ORDERS par période.
 * - flows avec date null ou < refMid → période 0
 * - sinon jour puis semaine
 */
export function bucketize(
  flows: Array<{
    kind: 'demande' | 'composant' | 'reception' | 'of'
    date: Date | null
    qty: number
  }>,
  refDate: Date,
  defs: ReturnType<typeof buildPeriodDefs>
) {
  const refMid = atMidnightLocal(refDate)
  const buckets = defs.map(() => ({ demande: 0, besoinMatiere: 0, reception: 0, of: 0 }))

  // Helper to find bucket index for a date
  const indexOf = (d: Date | null): number => {
    if (d === null) return 0
    const mid = atMidnightLocal(d)
    if (mid.getTime() < refMid.getTime()) return 0
    // Daily phase
    const diffDays = Math.floor((mid.getTime() - refMid.getTime()) / DAY_MS)
    if (diffDays < DAILY_DAYS) {
      // defs[0] retard, defs[1] = J0, etc.
      return 1 + diffDays
    }
    // Weekly phase: find week bucket containing mid
    for (let i = 1 + DAILY_DAYS; i < defs.length; i++) {
      const s = defs[i].start!
      const e = defs[i].end!
      if (mid.getTime() >= s.getTime() && mid.getTime() < e.getTime()) return i
      // Also if week start is Monday before firstWeekStart, flows on those Mondays that are >= firstWeekStart but < next monday already handled
    }
    // Beyond horizon → outside
    return -1
  }

  for (const f of flows) {
    const idx = indexOf(f.date)
    if (idx < 0 || idx >= buckets.length) continue
    const b = buckets[idx]
    if (f.kind === 'demande') b.demande += f.qty
    else if (f.kind === 'composant') b.besoinMatiere += f.qty
    else if (f.kind === 'reception') b.reception += f.qty
    else if (f.kind === 'of') b.of += f.qty
  }

  return buckets
}

export function buildGrille(
  stockInitial: number,
  flows: Array<{
    kind: 'demande' | 'composant' | 'reception' | 'of'
    date: Date | null
    qty: number
  }>,
  refDate: Date,
  ligneMessage: LigneMessage | null,
  horizonDays: number = HORIZON_DAYS
): {
  periodes: GrillePeriode[]
  premierePenurie: string | null
  premierePenurieIndex: number | null
} {
  const defs = buildPeriodDefs(refDate, horizonDays)
  const buckets = bucketize(flows, refDate, defs)

  let running = stockInitial
  let premierePenurie: string | null = null
  let premierePenurieIndex: number | null = null

  // For message highlight: find bucket index containing message echeance
  let messageBucketIndex: number | null = null
  if (ligneMessage?.echeance) {
    const echeanceDate = new Date(`${ligneMessage.echeance}T00:00:00`)
    if (!Number.isNaN(echeanceDate.getTime())) {
      const mid = atMidnightLocal(echeanceDate)
      const refMid = atMidnightLocal(refDate)
      if (mid.getTime() < refMid.getTime()) messageBucketIndex = 0
      else {
        const diffDays = Math.floor((mid.getTime() - refMid.getTime()) / DAY_MS)
        if (diffDays < DAILY_DAYS) messageBucketIndex = 1 + diffDays
        else {
          for (let i = 1 + DAILY_DAYS; i < defs.length; i++) {
            const s = defs[i].start!
            const e = defs[i].end!
            if (mid.getTime() >= s.getTime() && mid.getTime() < e.getTime()) {
              messageBucketIndex = i
              break
            }
          }
        }
      }
    }
  }

  // Already overdue case: stockInitial <0 after retards? We'll detect after computing period 0
  const periodes: GrillePeriode[] = []

  for (const [i, def] of defs.entries()) {
    const b = buckets[i]
    const stockDebut = running
    const delta = b.reception + b.of - b.demande - b.besoinMatiere
    const stockFin = stockDebut + delta
    running = stockFin
    const estPenurie = stockFin < 0
    const contientMessage = messageBucketIndex !== null && messageBucketIndex === i

    if (estPenurie && premierePenurie === null) {
      premierePenurie = def.isRetard ? 'déjà en retard' : def.label
      premierePenurieIndex = i
    }

    periodes.push({
      index: i,
      label: def.label,
      dateDebut: def.start ? isoDay(def.start) : null,
      dateFin: def.end ? isoDay(def.end) : null,
      stockDebut,
      stockFin,
      demande: b.demande,
      besoinMatiere: b.besoinMatiere,
      reception: b.reception,
      of: b.of,
      estPenurie,
      estRetard: def.isRetard,
      contientMessage,
    })
  }

  // If stockInitial was already negative and we already have premierePenurie as retard, keep it.
  // If no penurie but stockInitial negative? Actually penurie detection already captures period 0.
  return { periodes, premierePenurie, premierePenurieIndex }
}

async function fetchMessageRow(article: string, cle: CleParsed): Promise<LigneMessage | null> {
  const itmr = article.replace(/'/g, "''")
  const vcrn = cle.vcrnum.replace(/'/g, "''")
  const vcrseqEsc = cle.vcrseq.replace(/'/g, "''")
  const vcrlin = cle.vcrlin

  // VCRSEQ may be empty → match either empty or actual; but ORDERS stores VCRSEQ_0 possibly empty or '1'
  // Use exact match if provided, otherwise search with VCRSEQ in ('', cle.vcrseq)
  const vcrseqCond = cle.vcrseq ? `AND O.VCRSEQ_0 = '${vcrseqEsc}'` : ''

  const sql = `
SELECT O.VCRNUM_0, O.VCRLIN_0, O.VCRSEQ_0, O.ITMREF_0, I.ITMDES1_0, O.ENDDAT_0, O.MRPDAT_0, O.MRPMES_0, O.RMNEXTQTY_0, O.BPRNUM_0, O.VCRNUMORI_0, O.VCRTYPORI_0
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
WHERE O.WIPTYP_0 = 2
  AND O.WIPSTA_0 = 1
  AND O.STOFCY_0 = '${SITE}'
  AND O.ITMREF_0 = '${itmr}'
  AND O.VCRNUM_0 = '${vcrn}'
  AND O.VCRLIN_0 = ${vcrlin}
  ${vcrseqCond}
  AND O.RMNEXTQTY_0 > 0
`

  const dbX = new X3Database()
  let rows: Record<string, string | null>[] = []
  try {
    rows = (await dbX.raw(sql)) as Record<string, string | null>[]
  } finally {
    await dbX.destroy()
  }

  if (rows.length === 0) return null
  const r = rows[0]
  const mrpmes = Number(r.MRPMES_0 ?? 0)
  return {
    vcrnum: (r.VCRNUM_0 ?? '').trim(),
    vcrlin: Number(r.VCRLIN_0 ?? '0') || cle.vcrlin,
    vcrseq: (r.VCRSEQ_0 ?? '').trim(),
    article: (r.ITMREF_0 ?? '').trim(),
    designation: (r.ITMDES1_0 ?? '').trim(),
    quantite: Number(r.RMNEXTQTY_0 ?? '0') || 0,
    echeance: (() => {
      const d = parseDateSentinelle(r.ENDDAT_0)
      return d ? isoDay(d) : null
    })(),
    mrpdat: (() => {
      const d = parseDateSentinelle(r.MRPDAT_0)
      return d ? isoDay(d) : null
    })(),
    mrpdatRaw: parseDateSentinelle(r.MRPDAT_0),
    message: mrpmes,
    vcrnumori: (r.VCRNUMORI_0 ?? '').trim() || null,
  }
}

async function fetchCurrentStock(article: string): Promise<number> {
  try {
    const flows = await boardDataset.getStock([article])
    // boardDataset returns Flow[] with quantity positive for supply
    // Sum all supplies for this article
    const total = flows.filter((f) => f.article === article).reduce((sum, f) => sum + f.quantity, 0)
    return total
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      '[article-explanation] stock indisponible'
    )
    return 0
  }
}

export function buildPeggingSql(article: string, toIso: string): string {
  const itmr = article.replace(/'/g, "''")
  const to = toIso.replace(/-/g, '')
  return `
SELECT O.ITMREFORI_0, O.VCRNUM_0, O.WIPSTA_0, O.ENDDAT_0, O.RMNEXTQTY_0
FROM ORDERS O
WHERE O.ITMREF_0 = '${itmr}'
  AND O.WIPTYP_0 = 6
  AND O.WIPSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND O.ENDDAT_0 <= TO_DATE('${to}','YYYYMMDD')`
}

async function fetchPeggingParents(article: string, toIso: string): Promise<PeggingParent[]> {
  const sql = buildPeggingSql(article, toIso)
  const dbX = new X3Database()
  let rows: Record<string, string | null>[] = []
  try {
    rows = (await dbX.raw(sql)) as Record<string, string | null>[]
  } finally {
    await dbX.destroy()
  }
  const parents: PeggingParent[] = []
  for (const r of rows) {
    const qty = Number(r.RMNEXTQTY_0 ?? '0') || 0
    if (qty <= 0) continue
    const parentArt = (r.ITMREFORI_0 ?? '').trim()
    if (!parentArt) continue
    const ofNum = (r.VCRNUM_0 ?? '').trim()
    const d = parseDateSentinelle(r.ENDDAT_0)
    parents.push({
      article: parentArt,
      of: ofNum,
      quantite: qty,
      echeance: d ? isoDay(d) : null,
    })
  }
  // Trier par échéance croissante (nulls en fin)
  parents.sort((a, b) => {
    if (a.echeance === null && b.echeance === null) return 0
    if (a.echeance === null) return 1
    if (b.echeance === null) return -1
    return a.echeance.localeCompare(b.echeance)
  })
  return parents
}

async function resolveSuggestionOrigine(
  vcrnumori: string | null
): Promise<{ numero: string; convertieLe: string | null } | null> {
  if (!vcrnumori) return null
  const numero = vcrnumori.trim()
  if (!numero) return null
  try {
    // Cherche la suggestion dans les photos demand_snapshots source appro_suggestion
    const row = await db
      .connection()
      .from('demand_snapshots')
      .where('source', 'appro_suggestion')
      .andWhere('vcrnum', numero)
      .orderBy('snapshot_date', 'asc')
      .first()
    if (row && row.snapshot_date) {
      const day = String(row.snapshot_date).slice(0, 10)
      return { numero, convertieLe: day }
    }
    return { numero, convertieLe: null }
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      '[article-explanation] suggestionOrigine lookup échoué'
    )
    return { numero, convertieLe: null }
  }
}

export class ArticleExplanationService {
  private async epochPhotos(): Promise<number> {
    const v = await cacheNs('appro').get<number>({ key: EXPLICATION_EPOCH_KEY })
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  // epochPhotos est lu HORS getOrSet pour construire la clé. Un bump entre la
  // lecture et l'écriture crée une entrée orpheline sous l'ancien `e` —
  // inoffensif (clé orpheline jamais relue, TTL 04h la purge), pas de
  // corruption.

  async explain(
    articleRaw: string,
    cleRaw: string,
    refDate: Date = new Date()
  ): Promise<ExplanationResult> {
    const article = articleRaw?.trim()
    if (!article) throw new ArticleExplanationBadRequest('article manquant')
    if (!cleRaw?.trim()) throw new ArticleExplanationBadRequest('cle manquante')
    const cle = parseCle(cleRaw.trim())

    // --- Cache par (article, date de run CBN) — Q14 ---
    // Clé stable jour + epoch, TTL = prochain run 04 h (absolu, pas de sliding :
    // un hit ne rafraîchit pas le TTL, l'expiry reste calée sur 04h). ORDERS
    // inchangé entre runs. Le diff (SQLite, lui-même getOrSetForever) n'est PAS
    // dans ce cache CBN — il est recomposé côté controller.
    const refMid = atMidnightLocal(refDate)
    const jourRun = isoDay(refMid)
    const epoch = await this.epochPhotos()
    const cacheKey = buildExplicationCacheKey(article, jourRun, epoch)
    const ttl = msUntilProchainRun(refDate)

    return cacheNs('appro').getOrSet({
      key: cacheKey,
      ttl,
      factory: async () => {
        const ligne = await fetchMessageRow(article, cle)
        if (!ligne)
          throw new ArticleExplanationNotFound(
            `message ${cleRaw} introuvable pour article ${article}`
          )

        // Périmètre V1 : seuls les « avancer » (MRPMES_0=2) sont expliqués
        if (ligne.message === 3 || ligne.message === 6) {
          return {
            supporte: false,
            raison: 'message retarder/inutile — hors périmètre V1',
          } as ExplanationResult
        }
        if (ligne.message !== 2) {
          return {
            supporte: false,
            raison: 'message retarder/inutile — hors périmètre V1',
          } as ExplanationResult
        }

        const toIso = isoDay(new Date(refMid.getTime() + HORIZON_DAYS * DAY_MS))

        // Stock + flux + pegging en parallèle (2 SOAP étroits max, budget p95 <3s)
        const [stockInitial, flows, parents] = await Promise.all([
          fetchCurrentStock(article),
          (async () => {
            const repo = new CombinedOrdersRepository()
            const raw = await repo.fetchArticleFutureFlows(article, isoDay(refMid), toIso)
            return raw
          })(),
          fetchPeggingParents(article, toIso),
        ])

        const { periodes, premierePenurie, premierePenurieIndex } = buildGrille(
          stockInitial,
          flows,
          refMid,
          ligne,
          HORIZON_DAYS
        )

        const suggestionOrigine = await resolveSuggestionOrigine(ligne.vcrnumori)

        return {
          supporte: true,
          article,
          designation: ligne.designation,
          grille: {
            periodes,
            ligneMessage: ligne,
            mrpdatCbn: ligne.mrpdat,
            premierePenurie,
            premierePenurieIndex,
          },
          pegging: {
            parents,
            suggestionOrigine,
          },
        } as ExplanationResult
      },
    })
  }
}

export default new ArticleExplanationService()

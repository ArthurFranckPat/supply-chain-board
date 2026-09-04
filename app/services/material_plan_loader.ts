/**
 * Plan d'approvisionnement — loader (lot 1, v1 « voici mon besoin »).
 *
 * Calcule, sur une fenêtre [from, to] et une maille (jour / semaine / mois), les
 * besoins matières ventilés ferme / prévision par article composant :
 * explosion quantité (arrêt sur acheté, fantômes aplatis) + netting à priorité
 * ferme (stock puis en-cours).
 *
 * Sources (caches SWR `boardDataset`, comme la charge) : lignes de demande
 * ORDERS WIPTYP=1 (`getOrderLinesForLoad`), nomenclature complète SQLite,
 * articles (types appro + catégories), OF fenêtre + pointages (en-cours),
 * stock strict+CQ.
 *
 * Divergences assumées avec /charge (écrites ici, pas subies) :
 * - les OVERRIDES de dates posés par les drags de /planification SONT appliqués
 *   (lignes COMMANDE seules) : le plan appro suit l'intention planificateur ;
 * - le netting PRIORISE LE FERME (cf. `netMaterial`), là où /charge nette en
 *   FIFO global — les deux mentions sont rappelées dans l'en-tête de page.
 *
 * Règles de lecture :
 * - lignes depth 0 exclues (la demande elle-même), SAUF racine achetée (négoce :
 *   le besoin d'achat du PF est réel) ;
 * - besoins hors buckets (override sorti de fenêtre) ignorés ;
 * - plafond 14 périodes → 400 explicite, jamais de tableau dégénéré.
 */
import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import boardDataset from '#services/board_dataset'
import staticSync from '#services/static_sync_service'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OperationRecord } from '#repositories/operation_repository'
import type { Flow } from '#app/domain/models/flow'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { atMidnight, DAY_MS, isoDay, isoWeek, mondayOf } from '#app/utils/dates'
import { computeAvancement } from '#app/domain/of_avancement'
import { buildEncoursByArticle } from '#services/load_payload_loader'
import { explodeMaterialNeeds, netMaterial } from '#app/domain/material_plan'
import type { ChargeNeed, ChargeOrderLine } from '#app/domain/charge_explosion'

export type MaterialGran = 'jour' | 'semaine' | 'mois'

/** Plafond de lisibilité : 14 périodes (×2 avec le double bucket ferme/prévision). */
export const MATERIAL_MAX_PERIODS = 14

export interface MaterialBucket {
  key: string
  label: string
}

export interface MaterialRow {
  article: string
  description: string
  supplyType: 'ACHAT' | 'FABRICATION'
  stock: number
  /**
   * Valorisation du stock (stock × PMP actuel ITMMVT, même convention que le
   * KPI stock dashboard), NULL si PMP inconnu — sert au tri « Valorisation ».
   */
  valeur: number | null
  brutFerme: number[]
  brutPrevi: number[]
  netFerme: number[]
  netPrevi: number[]
  resteFerme: number[]
  restePrevi: number[]
  /** Descendance incomplète (coupe profondeur) — à marquer à l'écran. */
  tronque: boolean
}

export interface MaterialPayload {
  buckets: MaterialBucket[]
  rows: MaterialRow[]
  /** Version du snapshot pinné — le détail d'un article la réclame. */
  version: string
  /** Branches coupées par le plafond de profondeur (diagnostic). */
  truncated: number
  x3Error: string | null
}

export interface MaterialDetailLine {
  numCommande: string | null
  ligne: string | null
  client: string | null
  pfArticle: string
  nature: 'ferme' | 'prevision'
  quantite: number
  path: string[]
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Paramètre invalide (maille, fenêtre, plafond) — le contrôleur répond 400
 * plutôt que de servir un tableau plausible mais faux. Cf. `ChargeDetailBadRequest`.
 */
export class MaterialBadRequest extends Error {}

const monthLabel = (d: Date): string => {
  const s = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
  return `${s.charAt(0).toUpperCase() + s.slice(1)} ${d.getFullYear()}`
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Buckets couvrant [from, to] (inclus) à la maille demandée. Pur, testable —
 * c'est ici que le plafond 14 périodes est appliqué, AVANT tout calcul lourd.
 */
export function materialBuckets(
  from: Date,
  to: Date,
  gran: MaterialGran
): { buckets: MaterialBucket[] } | { error: string } {
  const start = atMidnight(from)
  const end = atMidnight(to)
  if (start > end) return { error: 'from doit précéder to (YYYY-MM-DD)' }
  const buckets: MaterialBucket[] = []
  if (gran === 'jour') {
    for (let cur = new Date(start); cur <= end; cur = new Date(cur.getTime() + DAY_MS)) {
      const dd = String(cur.getDate()).padStart(2, '0')
      const mm = String(cur.getMonth() + 1).padStart(2, '0')
      buckets.push({ key: isoDay(cur), label: `${dd}/${mm}` })
    }
  } else if (gran === 'semaine') {
    for (let cur = mondayOf(start); cur <= end; cur = new Date(cur.getTime() + 7 * DAY_MS)) {
      const dd = String(cur.getDate()).padStart(2, '0')
      const mm = String(cur.getMonth() + 1).padStart(2, '0')
      buckets.push({ key: isoDay(cur), label: `S${isoWeek(cur)} · ${dd}/${mm}` })
    }
  } else {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cur <= last) {
      buckets.push({ key: `${cur.getFullYear()}-${cur.getMonth() + 1}`, label: monthLabel(cur) })
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  if (buckets.length > MATERIAL_MAX_PERIODS) {
    return {
      error: `${buckets.length} périodes à la maille ${gran} (plafond ${MATERIAL_MAX_PERIODS}) — élargissez la maille ou réduisez la fenêtre`,
    }
  }
  return { buckets }
}

/** Clé bucket d'un besoin daté — null si inconnu (ne devrait pas arriver). */
function needBucketKey(date: Date, gran: MaterialGran): string {
  const d = atMidnight(date)
  if (gran === 'jour') return isoDay(d)
  if (gran === 'semaine') return isoDay(mondayOf(d))
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

/** Entrées du calcul, partagées agrégat ↔ détail (même pattern que la charge). */
export interface MaterialInputs {
  orderLines: ChargeOrderLine[]
  entries: NomenclatureEntry[]
  /** Catégorie article (fantômes AFANT) — Record sérialisable pour le pinning. */
  catByArticle: Record<string, string>
  /** Type appro (arrêt sur acheté + racines négoce) — idem. */
  supplyByArticle: Record<string, string>
  descByArticle: Record<string, string>
  mos: ManufacturingOrder[]
  operations: OperationRecord[]
  x3Error: string | null
}

const toYYYYMMDD = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${da}`
}

/**
 * Lecture des sources sur [from, to]. Les overrides de dates (/planification)
 * sont appliqués aux lignes COMMANDE : le plan appro suit l'intention
 * planificateur, même quand elle a bougé depuis ENDDAT_0.
 */
export async function fetchMaterialInputs(
  from: Date,
  to: Date,
  force = false
): Promise<MaterialInputs> {
  const [olR, nomR, artR, ordR, ovMap] = await Promise.allSettled([
    boardDataset.getOrderLinesForLoad(toYYYYMMDD(from), toYYYYMMDD(to), force),
    staticSync.readNomenclatures(),
    boardDataset.getArticles(),
    boardDataset.getOrdersForWindow(from, to, force),
    new OrderLineOverrideStore().getMap(),
  ])

  let x3Error: string | null = null
  const rawLines = olR.status === 'fulfilled' ? olR.value : []
  if (olR.status !== 'fulfilled') x3Error = (olR.reason as Error).message
  const entries = nomR.status === 'fulfilled' ? nomR.value : []
  if (nomR.status !== 'fulfilled') x3Error = x3Error ?? (nomR.reason as Error).message
  const articles = artR.status === 'fulfilled' ? artR.value : []
  if (artR.status !== 'fulfilled') x3Error = x3Error ?? (artR.reason as Error).message
  const mos = ordR.status === 'fulfilled' ? ordR.value.mos : []
  if (ordR.status !== 'fulfilled') x3Error = x3Error ?? (ordR.reason as Error).message
  const overrides = ovMap.status === 'fulfilled' ? ovMap.value : new Map<string, string>()

  const orderLines: ChargeOrderLine[] = rawLines.map((l) => {
    let date = atMidnight(l.dateLivraison)
    // Override drag /planification : mêmes clé et garde que `remapDemandDates`
    // (lignes commande seules — une prévision n'a pas de drag).
    if (l.nature === 'COMMANDE' && l.numCommande) {
      const ov = overrides.get(`${l.numCommande}#${l.ligne ?? ''}`)
      if (ov && ISO_RE.test(ov)) date = atMidnight(new Date(ov))
    }
    return {
      article: l.article,
      quantite: l.quantite,
      date,
      nature: (l.nature === 'PREVISION' ? 'prevision' : 'ferme') as 'ferme' | 'prevision',
      source: {
        numCommande: l.numCommande,
        ligne: l.ligne,
        client: l.clientCode,
        pfArticle: l.article,
      },
    }
  })

  const catByArticle: Record<string, string> = {}
  const supplyByArticle: Record<string, string> = {}
  const descByArticle: Record<string, string> = {}
  for (const a of articles) {
    catByArticle[a.code] = a.category ?? ''
    supplyByArticle[a.code] = a.supplyType ?? ''
    if (a.description) descByArticle[a.code] = a.description
  }

  // Pointages atelier — même cadrage que la charge : OF fermes démarrés seuls.
  const today = atMidnight(new Date())
  const startedOfs = mos
    .filter((mo) => mo.status === 1 && mo.startDate && atMidnight(mo.startDate) <= today)
    .map((mo) => mo.numOf)
  const operations = await boardDataset.getOperations(startedOfs).catch(() => [])

  return {
    orderLines,
    entries,
    catByArticle,
    supplyByArticle,
    descByArticle,
    mos,
    operations,
    x3Error,
  }
}

const isPhantomCat = (cat: string | undefined): boolean => (cat ?? '').toUpperCase() === 'AFANT'

/**
 * Stock strict+CQ des articles explosés — seule lecture hors inputs (cf. charge).
 * Remonte aussi le PMP (déjà présent sur les flows, `AVC_0`) pour la valorisation :
 * zéro requête en plus.
 */
async function computeMaterialStock(
  explodedArticles: string[]
): Promise<{ stock: Map<string, number>; pmp: Map<string, number> }> {
  const stockByArticle = new Map<string, number>()
  const pmpByArticle = new Map<string, number>()
  if (explodedArticles.length === 0) return { stock: stockByArticle, pmp: pmpByArticle }
  const flows = await boardDataset.getStock(explodedArticles).catch(() => [] as Flow[])
  for (const f of flows) {
    if (f.origin.type !== 'stock') continue
    const sub = f.origin.subType
    if (sub === 'strict' || sub === 'qc') {
      stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
      // PMP par article (identique sur les deux flows) — premier non nul gagne.
      if (!pmpByArticle.has(f.article) && f.origin.pmp != null && f.origin.pmp > 0) {
        pmpByArticle.set(f.article, f.origin.pmp)
      }
    }
  }
  return { stock: stockByArticle, pmp: pmpByArticle }
}

interface Exploded {
  needs: ChargeNeed[]
  truncated: number
  cutParents: Set<string>
}

function explodeAndNet(inputs: MaterialInputs, stock: Map<string, number>): Exploded {
  const { catByArticle, supplyByArticle } = inputs
  const stats: { truncated: number; cutParents?: string[] } = { truncated: 0, cutParents: [] }
  const raws = explodeMaterialNeeds(inputs.orderLines, inputs.entries, {
    isPhantom: (a) => isPhantomCat(catByArticle[a]),
    isPurchased: (a) => supplyByArticle[a] === 'ACHAT',
    stats,
  })
  const encours = buildEncoursByArticle({
    mos: inputs.mos,
    avancementByOf: computeAvancement(inputs.operations),
  })
  return {
    needs: netMaterial(raws, stock, encours),
    truncated: stats.truncated,
    cutParents: new Set(stats.cutParents ?? []),
  }
}

/**
 * Ligne composant : depth ≥ 1, OU racine achetée (négoce — le besoin d'achat
 * du PF est réel). Les racines fabriquées sont la demande elle-même, déjà lue
 * dans /charge : pas une ligne appro.
 */
function keepRow(article: string, depth: number, supplyByArticle: Record<string, string>): boolean {
  if (depth > 0) return true
  return supplyByArticle[article] === 'ACHAT'
}

function emptyRow(
  article: string,
  buckets: number,
  descByArticle: Record<string, string>,
  supplyByArticle: Record<string, string>
): MaterialRow {
  const zeros = () => new Array<number>(buckets).fill(0)
  return {
    article,
    description: descByArticle[article] ?? '',
    supplyType: supplyByArticle[article] === 'ACHAT' ? 'ACHAT' : 'FABRICATION',
    stock: 0,
    valeur: null,
    brutFerme: zeros(),
    brutPrevi: zeros(),
    netFerme: zeros(),
    netPrevi: zeros(),
    resteFerme: zeros(),
    restePrevi: zeros(),
    tronque: false,
  }
}

/** Snapshot pinné d'une exécution — le détail rejoue EXACTEMENT la même matière. */
interface PinnedMaterialSnapshot {
  inputs: MaterialInputs
  stock: Array<[string, number]>
}

const PINNED_KEPT = 5
const PINNED_TTL = 12 * 60 * 60 * 1000

async function pinMaterialInputs(version: string, snapshot: PinnedMaterialSnapshot): Promise<void> {
  await cacheNs('material').set({
    key: `material:inputs:${version}`,
    value: snapshot,
    ttl: PINNED_TTL,
  })
  const indexEntry = await cacheNs('material')
    .get<{ v: string[] }>({ key: 'material:inputs:index' })
    .catch(() => null)
  const known = indexEntry?.v ?? []
  const kept = [version, ...known.filter((v) => v !== version)].slice(0, PINNED_KEPT)
  await cacheNs('material').set({
    key: 'material:inputs:index',
    value: { v: kept },
    ttl: PINNED_TTL,
  })
  for (const stale of known) {
    if (!kept.includes(stale))
      await cacheNs('material')
        .delete({ key: `material:inputs:${stale}` })
        .catch(() => {})
  }
}

async function getPinnedMaterialInputs(version: string): Promise<PinnedMaterialSnapshot | null> {
  return cacheNs('material')
    .get<PinnedMaterialSnapshot>({ key: `material:inputs:${version}` })
    .catch(() => null)
}

export interface MaterialParams {
  from: string
  to: string
  gran: string
  force?: boolean
}

function parseParams(
  params: MaterialParams
): { from: Date; to: Date; gran: MaterialGran } | { error: string } {
  if (!ISO_RE.test(params.from) || !ISO_RE.test(params.to)) {
    return { error: 'from/to au format YYYY-MM-DD requis' }
  }
  if (params.gran !== 'jour' && params.gran !== 'semaine' && params.gran !== 'mois') {
    return { error: 'gran doit valoir jour, semaine ou mois' }
  }
  return {
    from: atMidnight(new Date(params.from)),
    to: atMidnight(new Date(params.to)),
    gran: params.gran,
  }
}

/**
 * Cœur du payload — sans HttpContext (endpoint HTTP + futur tool agent).
 * Le tri par défaut est le net total décroissant : l'appro lit ses manques.
 */
export async function loadMaterialPayloadData(params: MaterialParams) {
  const parsed = parseParams(params)
  if ('error' in parsed) throw new MaterialBadRequest(parsed.error)
  const { from, to, gran } = parsed
  const force = !!params.force

  const bucketed = materialBuckets(from, to, gran)
  if ('error' in bucketed) throw new MaterialBadRequest(bucketed.error)
  const { buckets } = bucketed
  const idxByKey = new Map(buckets.map((bk, i) => [bk.key, i]))

  const cacheKey = `payload:material:${isoDay(from)}:${isoDay(to)}:${gran}`
  const materialCache = () => cacheNs('material')
  if (force) await materialCache().delete({ key: cacheKey })

  return materialCache().getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async (): Promise<MaterialPayload> => {
      const inputs = await fetchMaterialInputs(from, to, force)
      // Explosion d'abord (nomenclature complète), stock ensuite : le stock
      // n'est lu que pour les articles réellement appelés.
      const stats: { truncated: number; cutParents?: string[] } = { truncated: 0, cutParents: [] }
      const raws = explodeMaterialNeeds(inputs.orderLines, inputs.entries, {
        isPhantom: (a) => isPhantomCat(inputs.catByArticle[a]),
        isPurchased: (a) => inputs.supplyByArticle[a] === 'ACHAT',
        stats,
      })
      const explodedArticles = [...new Set(raws.map((r) => r.article))]
      const { stock, pmp } = await computeMaterialStock(explodedArticles)
      const encours = buildEncoursByArticle({
        mos: inputs.mos,
        avancementByOf: computeAvancement(inputs.operations),
      })
      const needs = netMaterial(raws, stock, encours)
      const cutParents = new Set(stats.cutParents ?? [])

      const rows = new Map<string, MaterialRow>()
      const rowFor = (article: string): MaterialRow => {
        let row = rows.get(article)
        if (!row) {
          row = emptyRow(article, buckets.length, inputs.descByArticle, inputs.supplyByArticle)
          const qty = stock.get(article) ?? 0
          const unit = pmp.get(article)
          row.stock = round2(qty)
          row.valeur = unit == null ? null : round2(qty * unit)
          row.tronque = cutParents.has(article)
          rows.set(article, row)
        }
        return row
      }
      for (const n of needs) {
        if (!keepRow(n.article, n.depth, inputs.supplyByArticle)) continue
        const idx = idxByKey.get(needBucketKey(n.date, gran))
        if (idx === undefined) continue // override sorti de fenêtre
        const row = rowFor(n.article)
        if (n.nature === 'ferme') {
          row.brutFerme[idx] = round2(row.brutFerme[idx] + n.brutQty)
          row.netFerme[idx] = round2(row.netFerme[idx] + n.netQty)
          row.resteFerme[idx] = round2(row.resteFerme[idx] + n.resteQty)
        } else {
          row.brutPrevi[idx] = round2(row.brutPrevi[idx] + n.brutQty)
          row.netPrevi[idx] = round2(row.netPrevi[idx] + n.netQty)
          row.restePrevi[idx] = round2(row.restePrevi[idx] + n.resteQty)
        }
      }
      const sorted = [...rows.values()].sort((a, b) => {
        const netA = a.netFerme.reduce((s, v) => s + v, 0) + a.netPrevi.reduce((s, v) => s + v, 0)
        const netB = b.netFerme.reduce((s, v) => s + v, 0) + b.netPrevi.reduce((s, v) => s + v, 0)
        return netB - netA
      })

      // Pinne les ENTRÉES (pas le résultat) : le détail rejoue le même calcul.
      await pinMaterialInputs(cacheKey, {
        inputs,
        stock: [...stock.entries()],
      })

      return {
        buckets,
        rows: sorted,
        version: cacheKey,
        truncated: stats.truncated,
        x3Error: inputs.x3Error,
      }
    }),
  })
}

/**
 * Détail « appelé par » d'un article — rejoué depuis le snapshot pinné de la
 * version affichée, jamais depuis des caches qui auraient tourné entre temps.
 * Regroupé par (commande, ligne, PF, nature, chemin) : deux appels par des
 * chemins différents restent deux lignes (traçabilité complète).
 */
export async function loadMaterialDetailData(
  version: string,
  article: string,
  from: string,
  to: string
): Promise<{ article: string; lignes: MaterialDetailLine[] } | null> {
  if (!ISO_RE.test(from) || !ISO_RE.test(to)) return null
  const pinned = await getPinnedMaterialInputs(version)
  if (!pinned) return null
  const { needs } = explodeAndNet(pinned.inputs, new Map(pinned.stock))
  const fromD = atMidnight(new Date(from))
  const toD = atMidnight(new Date(to))
  toD.setHours(23, 59, 59, 999)

  const grouped = new Map<string, MaterialDetailLine>()
  for (const n of needs) {
    if (n.article !== article) continue
    if (n.date < fromD || n.date > toD) continue
    if (!keepRow(n.article, n.depth, pinned.inputs.supplyByArticle)) continue
    const s = n.source
    const key = `${s?.numCommande ?? ''}#${s?.ligne ?? ''}#${s?.pfArticle ?? ''}#${n.nature}#${n.path.join('>')}`
    const line = grouped.get(key)
    if (line) {
      line.quantite = round2(line.quantite + n.brutQty)
    } else {
      grouped.set(key, {
        numCommande: s?.numCommande ?? null,
        ligne: s?.ligne ?? null,
        client: s?.client ?? null,
        pfArticle: s?.pfArticle ?? n.article,
        nature: n.nature === 'ferme' ? 'ferme' : 'prevision',
        quantite: round2(n.brutQty),
        path: n.path,
      })
    }
  }
  const lignes = [...grouped.values()].sort((a, b) => b.quantite - a.quantite)
  return { article, lignes }
}

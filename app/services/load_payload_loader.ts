/**
 * Projection de charge long terme (variante 3 « Charge par ligne »).
 *
 * Agrège les OF (ORDERS, tous statuts 1/2/3 via boardDataset, cache SWR partagé)
 * en charge horaire par poste de charge (workstation gamme) × période, ventilée
 * Ferme/Planifié/Suggéré. Deux mailles servies côte à côte : mensuelle et hebdo.
 * Calcul pur côté serveur ; la présentation (mini-graphes + détail) est cliente.
 *
 * Extrait de `LoadController.index` (issue #49) : seul offender du controller (249 l.
 * sur 360), assemblage capacité/charge inline.
 */

import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import boardDataset from '#services/board_dataset'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OrderLineForLoad } from '#repositories/order_line_repository'
import {
  hoursForQuantity,
  groupGammeByArticle,
  type GammeOperation,
} from '#app/domain/models/gamme'
import { atMidnight, DAY_MS, isoDay, isoWeek, mondayOf } from '#app/utils/dates'
import { computeAvancement, resteAProduire, type OfAvancement } from '#app/domain/of_avancement'
import type { Workstation } from '#app/domain/models/workstation'
import { capDay } from '#app/domain/capacity'
import {
  atelierLabel,
  atelierCategoryFromPosteNature,
  buildPosteNatureByWorkstation,
  type AtelierCategory,
} from '#app/domain/atelier'
import capacityCalendar from '#services/capacity_calendar_service'
import staticSync from '#services/static_sync_service'
import { isManufactured, type NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  chargeSegment,
  explodeCharge,
  netCharge,
  ofSegment,
  type ChargeNeed,
} from '#app/domain/charge_explosion'
import type { Flow } from '#app/domain/models/flow'

/**
 * Shapes émis vers la page Inertia. Miroir côté client : inertia-react/lib/load/types.ts
 * (même convention que SuiviController ↔ inertia-react/lib/suivi/types.ts).
 */
interface LoadPeriod {
  f: number
  p: number
  s: number
  /** Charge induite (besoin brut depth-1) depuis des commandes fermes — vue commande. */
  fi: number
  /** Charge induite (besoin brut depth-1) depuis des prévisions — vue commande. */
  si: number
}
interface LoadLine {
  code: string
  name: string
  color: string
  /** Articles produits sur le poste (« CODE désignation »), pour la recherche client. */
  articles: string[]
  monthly: LoadPeriod[]
  weekly: LoadPeriod[]
  /** Charge NETTE (besoin − stock strict/CQ), parallèle à monthly/weekly. */
  monthlyNet: LoadPeriod[]
  weeklyNet: LoadPeriod[]
  /** RESTE À PRODUIRE (net − en-cours non déclaré) — 3e cran de la bascule, défaut. */
  monthlyReste: LoadPeriod[]
  weeklyReste: LoadPeriod[]
  /** Capacité nette (heures) par bucket, alignée sur monthly/weekly (issue #35). */
  capacity: { monthly: number[]; weekly: number[] }
  /** Atelier (STOLOC) du poste + métadonnées de filtre (issue #36). */
  atelier: string
  atelierLabel: string
  workCenter: string
  category: AtelierCategory
}

const NB_MONTHS = 6

/** Libellé mensuel court capitalisé sans point : « Juil », « Août ». */
const monthLabel = (d: Date): string => {
  const s = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const monthKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}`

/** Palette de pastilles par poste (cyclique, parité avec les maquettes design). */
const PALETTE = [
  '#5b7d4e',
  '#2f4858',
  '#b8862c',
  '#8b5cf6',
  '#8c7d66',
  '#a8431f',
  '#3f7d7a',
  '#9a3320',
]

/**
 * Horizon canonique de la vue charge : N mois pleins depuis le 1er du mois de
 * `start`. Exporté pour que le détail d'un bucket vise EXACTEMENT la même
 * fenêtre que l'agrégat — recopier ce calcul, c'est se garantir un décalage le
 * jour où NB_MONTHS bouge.
 */
export function chargeHorizon(start?: string): { monthStart: Date; horizonEnd: Date } {
  const monthStart = atMidnight(start ? new Date(start) : new Date())
  monthStart.setDate(1)
  const horizonEnd = new Date(monthStart)
  horizonEnd.setMonth(monthStart.getMonth() + NB_MONTHS)
  horizonEnd.setDate(0)
  horizonEnd.setHours(23, 59, 59, 999)
  return { monthStart, horizonEnd }
}

/**
 * Bornes d'un bucket, depuis sa clé telle que produite par le payload :
 * `YYYY-M` en maille mensuelle, ISO du lundi en maille hebdo. Retourne null si
 * la clé est illisible (URL bricolée) — l'appelant répond 400 plutôt que de
 * servir un intervalle par défaut, qui afficherait une table plausible mais fausse.
 */
export function chargeBucketRange(
  gran: 'month' | 'week',
  key: string
): { from: Date; to: Date; label: string } | null {
  if (gran === 'month') {
    const m = /^(\d{4})-(\d{1,2})$/.exec(key)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    if (month < 0 || month > 11) return null
    const from = new Date(year, month, 1, 0, 0, 0, 0)
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999)
    return { from, to, label: `${monthLabel(from)} ${year}` }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const from = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  if (Number.isNaN(from.getTime())) return null
  const to = new Date(from.getTime() + 6 * DAY_MS)
  to.setHours(23, 59, 59, 999)
  const dd = String(from.getDate()).padStart(2, '0')
  const mm = String(from.getMonth() + 1).padStart(2, '0')
  return { from, to, label: `S${isoWeek(from)} · semaine du ${dd}/${mm}` }
}

const emptyPeriod = (): LoadPeriod => ({ f: 0, p: 0, s: 0, fi: 0, si: 0 })
const round = (p: LoadPeriod): LoadPeriod => ({
  f: Math.round(p.f),
  p: Math.round(p.p),
  s: Math.round(p.s),
  fi: Math.round(p.fi),
  si: Math.round(p.si),
})

/** Entrées brutes du calcul de charge, partagées agrégat ↔ détail. */
export interface ChargeInputs {
  mos: ManufacturingOrder[]
  orderLines: OrderLineForLoad[]
  gammeMap: Map<string, GammeOperation[]>
  workstations: Workstation[]
  wstLabels: Map<string, string>
  bomByParent: Map<string, NomenclatureEntry[]>
  /**
   * Avancement atelier des OF démarrés (pointages MFGOPE). Vit ICI et pas dans
   * chaque loader : l'agrégat et le détail doivent déduire les mêmes pièces, sinon
   * le total de la table cesse de retomber sur la hauteur de la barre.
   */
  avancementByOf: Map<string, OfAvancement>
  /** Catégorie article (préfixe PF / SF) — nature poste montage/fabrication. */
  categoryByArticle: Map<string, string>
  x3Error: string | null
}

/**
 * Heures de charge d'un OF, pièces déjà pointées déduites.
 *
 * Le commentaire historique de la vue OF (« déjà nets via le CBN → brut = net »)
 * était faux : X3 ne nette `RMNEXTQTY` qu'à la déclaration finale de stock sur une
 * large part des OF (mesuré en prod : 1313 OF fermes démarrés sur 1405 ont encore
 * EXTQTY === RMNEXTQTY). Sans déduction, un poste est facturé du travail qu'il a
 * déjà physiquement produit — sur le bucket courant et le retard, pas sur l'horizon
 * lointain (un OF démarré est à sa date de début ou en retard).
 *
 * Ce n'est PAS du netting par stock : la correction porte sur la quantité restante,
 * donc elle vaut pour `brut` comme pour `net` — la vue OF garde brut = net et n'a
 * toujours pas de bascule.
 */
export function ofResteAProduire(
  mo: ManufacturingOrder,
  avancementByOf: Map<string, OfAvancement>
): number {
  return resteAProduire(
    mo.quantity,
    mo.quantityLaunched,
    avancementByOf.get(mo.numOf)?.qtyRealisee ?? 0
  )
}

export function ofChargeHours(
  mo: ManufacturingOrder,
  gamme: GammeOperation | undefined,
  avancementByOf: Map<string, OfAvancement>
): number {
  return hoursForQuantity(gamme, ofResteAProduire(mo, avancementByOf))
}

/**
 * Lecture des sources du calcul de charge (OF, lignes de demande, référentiel,
 * nomenclature) sur [monthStart, horizonEnd].
 *
 * Extrait du factory de payload pour que le DÉTAIL d'un bucket reparte
 * exactement des mêmes entrées : une table de détail dont le total ne retombe
 * pas sur la hauteur de la barre est pire que pas de table du tout. Tous les
 * appels passent par les caches SWR de boardDataset — le détail ne déclenche
 * donc aucune requête X3 supplémentaire.
 */
export async function fetchChargeInputs(
  monthStart: Date,
  horizonEnd: Date,
  force = false
): Promise<ChargeInputs> {
  const toYYYYMMDD = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${da}`
  }

  let mos: ManufacturingOrder[] = []
  let orderLines: OrderLineForLoad[] = []
  let gammeOps: GammeOperation[] = []
  let workstations: Workstation[] = []
  const bomByParent = new Map<string, NomenclatureEntry[]>()
  let x3Error: string | null = null

  const categoryByArticle = new Map<string, string>()
  const [refR, ordR, olR, nomR, artR] = await Promise.allSettled([
    boardDataset.getReferential(force),
    boardDataset.getOrdersForWindow(monthStart, horizonEnd, force),
    boardDataset.getOrderLinesForLoad(toYYYYMMDD(monthStart), toYYYYMMDD(horizonEnd), force),
    staticSync.readNomenclatures(),
    boardDataset.getArticles(),
  ])
  if (artR.status === 'fulfilled') {
    for (const a of artR.value) categoryByArticle.set(a.code, a.category ?? '')
  }
  if (refR.status === 'fulfilled') {
    gammeOps = refR.value.gamme
    workstations = refR.value.workstations ?? []
  } else {
    x3Error = (refR.reason as Error).message
  }
  if (ordR.status === 'fulfilled') {
    mos = ordR.value.mos
  } else {
    x3Error = x3Error ?? (ordR.reason as Error).message
  }
  if (olR.status === 'fulfilled') {
    orderLines = olR.value
  } else {
    x3Error = x3Error ?? (olR.reason as Error).message
  }
  // BOM (composants FABRIQUÉS) pour la charge induite (vue commande).
  if (nomR.status === 'fulfilled') {
    for (const e of nomR.value) {
      if (!isManufactured(e)) continue
      const arr = bomByParent.get(e.parentArticle)
      if (arr) arr.push(e)
      else bomByParent.set(e.parentArticle, [e])
    }
  }

  const wstLabels = new Map<string, string>()
  for (const g of gammeOps) {
    if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
  }

  // Pointages atelier — restreints aux OF qui PEUVENT en avoir : fermes et dont la
  // date de début est passée. Un OF planifié/suggéré, ou qui démarre dans 3 mois,
  // n'a aucun pointage : l'inclure ne ferait que gonfler la requête MFGOPE sur tout
  // l'horizon 6 mois et fragmenter la clé de cache pour rien.
  const today = atMidnight(new Date())
  const startedOfs = mos
    .filter((mo) => mo.status === 1 && mo.startDate && atMidnight(mo.startDate) <= today)
    .map((mo) => mo.numOf)
  // Un échec MFGOPE ne doit pas vider la page : sans avancement on retombe sur le
  // comportement d'avant (charge pleine), pas sur une charge nulle.
  const operations = await boardDataset.getOperations(startedOfs).catch(() => [])
  const avancementByOf = computeAvancement(operations)

  return {
    mos,
    orderLines,
    gammeMap: groupGammeByArticle(gammeOps),
    workstations,
    wstLabels,
    bomByParent,
    avancementByOf,
    categoryByArticle,
    x3Error,
  }
}

/**
 * Vue commande : explosion depth-4 + netting stock (suite issue #42).
 * ponytail: snapshot stock « maintenant » étalé sur l'horizon, FIFO/article.
 * Pas de réceptions/OF en cours, pas d'offset lead time (choix métier).
 */
export async function computeChargeNeeds(inputs: ChargeInputs): Promise<ChargeNeed[]> {
  const chargeRaws = explodeCharge(
    inputs.orderLines.map((l) => ({
      article: l.article,
      quantite: l.quantite,
      date: atMidnight(l.dateLivraison),
      nature: (l.nature === 'PREVISION' ? 'prevision' : 'ferme') as 'prevision' | 'ferme',
      source: {
        numCommande: l.numCommande,
        ligne: l.ligne,
        client: l.clientCode,
        pfArticle: l.article,
      },
    })),
    inputs.bomByParent,
    inputs.gammeMap
  )
  const chargeArticles = [...new Set(chargeRaws.map((r) => r.article))]
  const stockByArticle = new Map<string, number>()
  if (chargeArticles.length > 0) {
    const flows = await boardDataset.getStock(chargeArticles).catch(() => [] as Flow[])
    for (const f of flows) {
      if (f.origin.type !== 'stock') continue
      if (f.origin.subType === 'strict' || f.origin.subType === 'qc') {
        stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
      }
    }
  }
  return netCharge(chargeRaws, stockByArticle, buildEncoursByArticle(inputs))
}

/**
 * En-cours de fabrication INVISIBLE du stock, par article : les pièces déjà
 * produites sur un OF démarré mais pas encore déclarées en stock.
 *
 * Ces pièces n'existent nulle part pour le calcul : ni en stock (pas déclarées),
 * ni dans aucun flux que le netting regarde. La vue commande annonçait donc
 * comme « à produire » du travail physiquement fait — cas AR2602603 L1000 :
 * 640 demandés alors que 390 étaient sorties de l'opération 10 de F326-02020.
 *
 * `mo.quantity − resteAProduire(...)` et non `qtyRealisee` brut : c'est le même
 * garde `EXTQTY === RMNEXTQTY` que la vue OF. Dès qu'un OF déclare, X3 nette
 * RMNEXTQTY et les pièces entrent en stock — la différence retombe alors à 0 et
 * la passe stock les compte, sans double déduction. Vérifié sur les deux
 * branches : F326-02020 → 640−250 = 390 (non déclaré, à déduire ici) ;
 * F326-02036 → 1236−1236 = 0 (480 déclarées, déjà dans le pool stock).
 */
function buildEncoursByArticle(inputs: ChargeInputs): Map<string, number> {
  const out = new Map<string, number>()
  for (const mo of inputs.mos) {
    const encours = mo.quantity - ofResteAProduire(mo, inputs.avancementByOf)
    if (encours > 0) out.set(mo.article, (out.get(mo.article) ?? 0) + encours)
  }
  return out
}

/**
 * Cœur du payload charge — sans HttpContext (consommé par l'endpoint HTTP ET le
 * tool agent `getCharge`).
 */
export async function loadChargePayloadData(params: { start?: string; force?: boolean }) {
  const startParam = params.start
  const force = !!params.force

  // Horizon : N mois pleins à partir du 1er du mois de `start` (par défaut mois courant).
  const { monthStart, horizonEnd } = chargeHorizon(startParam)
  const cacheKey = `payload:charge:${isoDay(monthStart)}:${NB_MONTHS}`
  const chargeCache = () => cache.namespace('charge')
  if (force) await chargeCache().delete({ key: cacheKey })

  // Tout le calcul dans le factory : cache miss = 1 exécution, hits suivants = instant (SWR).
  return chargeCache().getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: async () => {
      // Buckets mensuels.
      const monthBuckets: { key: string; label: string }[] = []
      const monthIdxByKey = new Map<string, number>()
      for (let i = 0; i < NB_MONTHS; i++) {
        const d = new Date(monthStart)
        d.setMonth(monthStart.getMonth() + i)
        monthIdxByKey.set(monthKey(d), i)
        monthBuckets.push({ key: monthKey(d), label: monthLabel(d) })
      }

      // Buckets hebdo : lundis de l'horizon.
      const weekBuckets: { key: string; label: string }[] = []
      const weekIdxByKey = new Map<string, number>()
      for (
        let cur = mondayOf(monthStart);
        cur <= horizonEnd;
        cur = new Date(cur.getTime() + 7 * DAY_MS)
      ) {
        const key = isoDay(cur)
        weekIdxByKey.set(key, weekBuckets.length)
        const dd = String(cur.getDate()).padStart(2, '0')
        const mm = String(cur.getMonth() + 1).padStart(2, '0')
        weekBuckets.push({ key, label: `${dd}/${mm}\nS${isoWeek(cur)}` })
      }

      const inputs = await fetchChargeInputs(monthStart, horizonEnd, force)
      const { mos, gammeMap, workstations, wstLabels, categoryByArticle, x3Error } = inputs
      const posteNatureByWst = buildPosteNatureByWorkstation(
        [...gammeMap.values()].flat(),
        categoryByArticle
      )

      const calendar = await capacityCalendar
        .buildCalendar(monthStart.getFullYear(), horizonEnd.getFullYear())
        .catch(() => null)

      const wstByCode = new Map(workstations.map((w) => [w.code, w]))
      const capacityByWst = new Map<string, { monthly: number[]; weekly: number[] }>()
      for (const w of workstations) {
        const monthly = monthBuckets.map(() => 0)
        const weekly = weekBuckets.map(() => 0)
        for (let t = monthStart.getTime(); t <= horizonEnd.getTime(); t += DAY_MS) {
          const d = new Date(t)
          const factor = calendar ? calendar.factor(w, isoDay(d)) : 1
          if (factor <= 0) continue
          const c = capDay(w, d) * factor
          if (c <= 0) continue
          const mi = monthIdxByKey.get(monthKey(d))
          if (mi !== undefined) monthly[mi] += c
          const wi = weekIdxByKey.get(isoDay(mondayOf(d)))
          if (wi !== undefined) weekly[wi] += c
        }
        capacityByWst.set(w.code, {
          monthly: monthly.map(Math.round),
          weekly: weekly.map(Math.round),
        })
      }
      const emptyCap = () => ({
        monthly: monthBuckets.map(() => 0),
        weekly: weekBuckets.map(() => 0),
      })

      type AggRecord = {
        wst: string
        date: Date
        brutHours: number
        netHours: number
        resteHours: number
        field: keyof LoadPeriod
        article: string
      }
      type Acc = {
        monthly: LoadPeriod[]
        monthlyNet: LoadPeriod[]
        monthlyReste: LoadPeriod[]
        weekly: LoadPeriod[]
        weeklyNet: LoadPeriod[]
        weeklyReste: LoadPeriod[]
        articles: Set<string>
      }

      const buildLines = (records: AggRecord[]): LoadLine[] => {
        const byLine = new Map<string, Acc>()
        for (const r of records) {
          if (r.brutHours <= 0 || r.date < monthStart || r.date > horizonEnd) continue
          const mi = monthIdxByKey.get(monthKey(r.date))
          if (mi === undefined) continue
          const wi = weekIdxByKey.get(isoDay(mondayOf(r.date)))
          let acc = byLine.get(r.wst)
          if (!acc) {
            acc = {
              monthly: monthBuckets.map(emptyPeriod),
              monthlyNet: monthBuckets.map(emptyPeriod),
              monthlyReste: monthBuckets.map(emptyPeriod),
              weekly: weekBuckets.map(emptyPeriod),
              weeklyNet: weekBuckets.map(emptyPeriod),
              weeklyReste: weekBuckets.map(emptyPeriod),
              articles: new Set(),
            }
            byLine.set(r.wst, acc)
          }
          acc.monthly[mi][r.field] += r.brutHours
          acc.monthlyNet[mi][r.field] += r.netHours
          acc.monthlyReste[mi][r.field] += r.resteHours
          if (wi !== undefined) {
            acc.weekly[wi][r.field] += r.brutHours
            acc.weeklyNet[wi][r.field] += r.netHours
            acc.weeklyReste[wi][r.field] += r.resteHours
          }
          if (r.article) acc.articles.add(r.article)
        }
        return [...byLine.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([code, acc], i) => {
            const w = wstByCode.get(code)
            const stoloc = w?.stockLocation ?? ''
            return {
              code,
              name: wstLabels.get(code) ?? w?.description ?? code,
              color: PALETTE[i % PALETTE.length],
              articles: [...acc.articles].sort(),
              monthly: acc.monthly.map(round),
              weekly: acc.weekly.map(round),
              monthlyNet: acc.monthlyNet.map(round),
              weeklyNet: acc.weeklyNet.map(round),
              monthlyReste: acc.monthlyReste.map(round),
              weeklyReste: acc.weeklyReste.map(round),
              capacity: capacityByWst.get(code) ?? emptyCap(),
              atelier: stoloc,
              atelierLabel: atelierLabel(stoloc),
              workCenter: w?.workCenter ?? '',
              category: atelierCategoryFromPosteNature(posteNatureByWst.get(code) ?? 'autre'),
            }
          })
      }

      // ── Charge commande : explosion depth-4 + netting stock (suite issue #42).
      const chargeNeeds = await computeChargeNeeds(inputs)

      const ofLines = buildLines(
        mos.flatMap((mo) => {
          const ops = gammeMap.get(mo.article) ?? []
          if (!mo.startDate) return []
          const qty = ofResteAProduire(mo, inputs.avancementByOf)
          return ops
            .filter((gamme) => gamme.workstation && gamme.rate > 0)
            .map((gamme) => {
              const hours = hoursForQuantity(gamme, qty)
              return {
                wst: gamme.workstation,
                date: atMidnight(mo.startDate!),
                brutHours: hours,
                netHours: hours,
                // Vue OF : qty déjà déduite des pointages — les trois séries coïncident.
                resteHours: hours,
                field: ofSegment(mo.status) as keyof LoadPeriod,
                article: `${mo.article} ${mo.designation ?? ''}`.trim(),
              }
            })
        })
      )

      const cmdLines = buildLines(
        // Besoin PF (depth 0) → f/s ; composants induits (depth >0) → fi/si.
        chargeNeeds.map((n): AggRecord => ({
          wst: n.wst,
          date: n.date,
          brutHours: n.brutHours,
          netHours: n.netHours,
          resteHours: n.resteHours,
          field: chargeSegment(n.depth, n.nature) as keyof LoadPeriod,
          article: n.article,
        }))
      )

      const fmtLong = (d: Date) => {
        const s = d.toLocaleDateString('fr-FR', { month: 'long' })
        return s.charAt(0).toUpperCase() + s.slice(1)
      }
      const lastMonth = new Date(monthStart)
      lastMonth.setMonth(monthStart.getMonth() + NB_MONTHS - 1)
      const rangeLabel = `${fmtLong(monthStart)} → ${fmtLong(lastMonth)} ${lastMonth.getFullYear()} · ${NB_MONTHS} mois`

      const ateliers = new Map<string, { code: string; label: string; category: AtelierCategory }>()
      for (const l of [...ofLines, ...cmdLines]) {
        if (l.atelier && !ateliers.has(l.atelier)) {
          ateliers.set(l.atelier, { code: l.atelier, label: l.atelierLabel, category: l.category })
        }
      }

      return {
        rangeLabel,
        // Ancre d'horizon résolue (1er du mois de départ) : le détail d'un
        // bucket la renvoie pour viser exactement la même fenêtre.
        startIso: isoDay(monthStart),
        months: monthBuckets.map((m) => m.label),
        weeks: weekBuckets.map((w) => w.label),
        // Clés de bucket (non affichées) : le client les renvoie telles quelles
        // pour demander le détail d'une période — pas d'index positionnel, qui
        // se décalerait dès que l'horizon glisse.
        monthKeys: monthBuckets.map((m) => m.key),
        weekKeys: weekBuckets.map((w) => w.key),
        ofLines,
        cmdLines,
        ateliers: [...ateliers.values()].sort((a, b) => a.label.localeCompare(b.label)),
        x3Error,
      }
    },
  })
}

/** GET /charge — payload de la page Inertia de projection de charge long terme. */
export async function loadChargePayload(ctx: HttpContext) {
  return loadChargePayloadData({
    start: ctx.request.input('start') as string | undefined,
    force: !!ctx.request.input('refresh'),
  })
}

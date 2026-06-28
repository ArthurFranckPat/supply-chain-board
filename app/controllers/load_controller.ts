import { HttpContext } from '@adonisjs/core/http'
import boardDataset from '#services/board_dataset'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OrderLineRow } from '#repositories/order_line_repository'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { Workstation } from '#app/domain/models/workstation'
import { capDay } from '#app/domain/capacity'
import { atelierLabel, atelierCategory, type AtelierCategory } from '#app/domain/atelier'
import capacityCalendar from '#services/capacity_calendar_service'
import staticSync from '#services/static_sync_service'
import {
  isManufactured,
  requiredQuantity,
  type NomenclatureEntry,
} from '#app/domain/models/nomenclature'
import cache from '@adonisjs/cache/services/main'

/**
 * Shapes émis vers la page Inertia. Miroir côté client : inertia/lib/load/types.ts
 * (même convention que SuiviController ↔ inertia/lib/suivi/types.ts).
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
  /** Capacité nette (heures) par bucket, alignée sur monthly/weekly (issue #35). */
  capacity: { monthly: number[]; weekly: number[] }
  /** Atelier (STOLOC) du poste + métadonnées de filtre (issue #36). */
  atelier: string
  atelierLabel: string
  workCenter: string
  category: AtelierCategory
}

/**
 * Projection de charge long terme (variante 3 « Charge par ligne »).
 *
 * Agrège les OF (ORDERS, tous statuts 1/2/3 via boardDataset, cache SWR partagé)
 * en charge horaire par poste de charge (workstation gamme) × période, ventilée
 * Ferme/Planifié/Suggéré. Deux mailles servies côte à côte : mensuelle et hebdo.
 * Calcul pur côté serveur ; la présentation (mini-graphes + détail) est cliente.
 */

const DAY_MS = 86_400_000

const atMidnight = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Numéro de semaine ISO. */
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

/** Lundi de la semaine contenant `d`. */
const mondayOf = (d: Date): Date => {
  const x = atMidnight(d)
  const dow = (x.getDay() + 6) % 7 // 0 = lundi
  x.setDate(x.getDate() - dow)
  return x
}

/** Libellé mensuel court capitalisé sans point : « Juil », « Août ». */
const monthLabel = (d: Date): string => {
  const s = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const monthKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}`

/** Palette de pastilles par poste (cyclique, parité avec les maquettes design). */
const PALETTE = ['#5b7d4e', '#2f4858', '#b8862c', '#8b5cf6', '#8c7d66', '#a8431f', '#3f7d7a', '#9a3320']

const NB_MONTHS = 6

const emptyPeriod = (): LoadPeriod => ({ f: 0, p: 0, s: 0, fi: 0, si: 0 })
const round = (p: LoadPeriod): LoadPeriod => ({
  f: Math.round(p.f),
  p: Math.round(p.p),
  s: Math.round(p.s),
  fi: Math.round(p.fi),
  si: Math.round(p.si),
})

export default class LoadController {
  /** GET /charge — page Inertia de projection de charge long terme. */
  async index(ctx: HttpContext) {
    const startParam = ctx.request.input('start') as string | undefined
    const force = !!ctx.request.input('refresh')

    // Horizon : N mois pleins à partir du 1er du mois de `start` (par défaut mois courant).
    const monthStart = atMidnight(startParam ? new Date(startParam) : new Date())
    monthStart.setDate(1)
    const cacheKey = `payload:charge:${isoDay(monthStart)}:${NB_MONTHS}`
    const chargeCache = () => cache.namespace('charge')
    if (force) await chargeCache().delete({ key: cacheKey })

    const toYYYYMMDD = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      return `${y}${m}${da}`
    }

    const horizonEnd = new Date(monthStart)
    horizonEnd.setMonth(monthStart.getMonth() + NB_MONTHS)
    horizonEnd.setDate(0)
    horizonEnd.setHours(23, 59, 59, 999)

    // Tout le calcul dans le factory : cache miss = 1 exécution, hits suivants = instant (SWR).
    const props = await chargeCache().getOrSet({
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
        for (let cur = mondayOf(monthStart); cur <= horizonEnd; cur = new Date(cur.getTime() + 7 * DAY_MS)) {
          const key = isoDay(cur)
          weekIdxByKey.set(key, weekBuckets.length)
          const dd = String(cur.getDate()).padStart(2, '0')
          const mm = String(cur.getMonth() + 1).padStart(2, '0')
          weekBuckets.push({ key, label: `${dd}/${mm}\nS${isoWeek(cur)}` })
        }

        let mos: ManufacturingOrder[] = []
        let orderLines: Pick<OrderLineRow, 'article' | 'designation' | 'quantite' | 'dateLivraison' | 'nature'>[] = []
        let gammeOps: GammeOperation[] = []
        let workstations: Workstation[] = []
        let bomByParent = new Map<string, NomenclatureEntry[]>()
        let x3Error: string | null = null

        const [refR, ordR, olR, nomR] = await Promise.allSettled([
          boardDataset.getReferential(force),
          boardDataset.getOrdersForWindow(monthStart, horizonEnd, force),
          boardDataset.getOrderLinesForLoad(toYYYYMMDD(monthStart), toYYYYMMDD(horizonEnd), force),
          staticSync.readNomenclatures(),
        ])
        if (refR.status === 'fulfilled') {
          gammeOps = refR.value.gamme
          workstations = refR.value.workstations ?? []
        } else { x3Error = (refR.reason as Error).message }
        if (ordR.status === 'fulfilled') { mos = ordR.value.mos }
        else { x3Error = x3Error ?? (ordR.reason as Error).message }
        if (olR.status === 'fulfilled') { orderLines = olR.value }
        else { x3Error = x3Error ?? (olR.reason as Error).message }
        // BOM depth-1 (composants FABRIQUÉS) pour la charge induite (vue commande).
        if (nomR.status === 'fulfilled') {
          for (const e of nomR.value) {
            if (!isManufactured(e)) continue
            const arr = bomByParent.get(e.parentArticle)
            if (arr) arr.push(e)
            else bomByParent.set(e.parentArticle, [e])
          }
        }

        const gammeMap = new Map(gammeOps.map((g) => [g.article, g]))
        const wstLabels = new Map<string, string>()
        for (const g of gammeOps) {
          if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
        }

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
          capacityByWst.set(w.code, { monthly: monthly.map(Math.round), weekly: weekly.map(Math.round) })
        }
        const emptyCap = () => ({ monthly: monthBuckets.map(() => 0), weekly: weekBuckets.map(() => 0) })

        type AggRecord = { wst: string; date: Date; hours: number; field: keyof LoadPeriod; article: string }
        type Acc = { monthly: LoadPeriod[]; weekly: LoadPeriod[]; articles: Set<string> }

        const buildLines = (records: AggRecord[]): LoadLine[] => {
          const byLine = new Map<string, Acc>()
          for (const r of records) {
            if (r.hours <= 0 || r.date < monthStart || r.date > horizonEnd) continue
            const mi = monthIdxByKey.get(monthKey(r.date))
            if (mi === undefined) continue
            const wi = weekIdxByKey.get(isoDay(mondayOf(r.date)))
            let acc = byLine.get(r.wst)
            if (!acc) {
              acc = { monthly: monthBuckets.map(emptyPeriod), weekly: weekBuckets.map(emptyPeriod), articles: new Set() }
              byLine.set(r.wst, acc)
            }
            acc.monthly[mi][r.field] += r.hours
            if (wi !== undefined) acc.weekly[wi][r.field] += r.hours
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
                capacity: capacityByWst.get(code) ?? emptyCap(),
                atelier: stoloc,
                atelierLabel: atelierLabel(stoloc),
                workCenter: w?.workCenter ?? '',
                category: atelierCategory(stoloc),
              }
            })
        }

        const ofLines = buildLines(
          mos.flatMap((mo) => {
            const gamme = gammeMap.get(mo.article)
            if (!gamme?.workstation || !mo.startDate) return []
            const rate = gamme.rate ?? 0
            return [{
              wst: gamme.workstation,
              date: atMidnight(mo.startDate),
              hours: rate > 0 ? mo.quantity / rate : 0,
              field: (mo.status === 1 ? 'f' : mo.status === 2 ? 'p' : 's') as keyof LoadPeriod,
              article: `${mo.article} ${mo.designation ?? ''}`.trim(),
            }]
          }),
        )

        const cmdLines = buildLines(
          orderLines.flatMap((l): AggRecord[] => {
            const gamme = gammeMap.get(l.article)
            if (!gamme?.workstation) return []
            const rate = gamme.rate ?? 0
            const recs: AggRecord[] = [{
              wst: gamme.workstation,
              date: atMidnight(l.dateLivraison),
              hours: rate > 0 ? l.quantite / rate : 0,
              field: (l.nature === 'PREVISION' ? 's' : 'f') as keyof LoadPeriod,
              article: `${l.article} ${l.designation ?? ''}`.trim(),
            }]
            // Charge induite (besoin brut depth-1, issue #42) : pour chaque composant
            // FABRIQUÉ du PF, charge sur le poste DU COMPOSANT, à la date de la
            // commande. Brut (ni netting ni offset). Non appliqué aux OF (déjà
            // dépendants via le CBN — sinon double-compte).
            const bom = bomByParent.get(l.article)
            if (bom) {
              for (const entry of bom) {
                const compGamme = gammeMap.get(entry.componentArticle)
                const compPoste = compGamme?.workstation
                if (!compPoste) continue
                const compRate = compGamme!.rate ?? 0
                const compQty = requiredQuantity(entry, l.quantite)
                const compHours = compRate > 0 ? compQty / compRate : 0
                if (compHours <= 0) continue
                recs.push({
                  wst: compPoste,
                  date: atMidnight(l.dateLivraison),
                  hours: compHours,
                  // Induit ventilé par la nature de la commande parente :
                  // prévision → si (suggéré), ferme → fi.
                  field: l.nature === 'PREVISION' ? 'si' : 'fi',
                  article: entry.componentArticle,
                })
              }
            }
            return recs
          }),
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
          months: monthBuckets.map((m) => m.label),
          weeks: weekBuckets.map((w) => w.label),
          ofLines,
          cmdLines,
          ateliers: [...ateliers.values()].sort((a, b) => a.label.localeCompare(b.label)),
          x3Error,
        }
      },
    })

    return ctx.inertia.render('scheduler/load', props)
  }
}

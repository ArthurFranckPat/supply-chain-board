import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { CommandeOFMatcher } from '#app/domain/of_conso'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { timeStage } from '#services/perf_metrics'
import type { Article } from '#app/domain/models/article'
import { groupGammeByArticle, hoursForQuantity } from '#app/domain/models/gamme'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { Flow } from '#app/domain/models/flow'
import type { ManufacturingOrder } from '#repositories/of_repository'
import { atelierLabel as resolveAtelierLabel } from '#app/domain/atelier'
import cache from '@adonisjs/cache/services/main'
import { isoDay } from '#app/utils/dates'

/**
 * Issue #46 — engagement par poste : TOUS les OF fermes d'un poste, indépendamment
 * de la fenêtre board sélectionnée par l'utilisateur. Un poste peut avoir des OF
 * affermis hors fenêtre board : la vue sert justement à les révéler.
 *
 * Issue #100 — mode « À lancer » : candidats planifiés/suggérés (WIPSTA 2/3).
 * Matching commande = `loadOrderImpacts({ pipeline: 'programme' })` — MÊMES
 * entrées que /programme (getOrdersForWindow + demande + nomenclatures +
 * netDemandsByAllocation + delta #99). On n'expose que les commandes fermes
 * (`nature === 'commande'`, WIPSTA=1) — pas les prévisions.
 *
 * Engagement (kind=ferme) : getOrders() hors fenêtre + CommandeOFMatcher local
 * + repli peg (perf / historique #46) — ne pas confondre avec À lancer.
 */

/** Kind de dataset : fermes (engagement) vs candidats à affermir (#100). */
export type EngagementKind = 'ferme' | 'lancer'

const KIND_STATUSES: Record<EngagementKind, ReadonlySet<number>> = {
  ferme: new Set([1]),
  lancer: new Set([2, 3]),
}

const statusLabelOf = (status: number): string =>
  status === 1 ? 'Ferme' : status === 2 ? 'Planifié' : status === 3 ? 'Suggéré' : `Statut ${status}`

export interface EngagementCommande {
  numCommande: string
  ligne: string | null
  client: string | null
  livraisonIso: string | null
  /** 'matcher' = chaîne board (hard peg ou heuristique) ; 'peg' = repli contremarque. */
  method: 'matcher' | 'peg'
}

export interface EngagementRow {
  numOf: string
  article: string
  designation: string | null
  done: number
  launched: number
  dateDebutIso: string | null
  hours: number
  commandes: EngagementCommande[]
  /** Livraison la plus proche parmi les commandes liées — clé de tri urgence. */
  livraisonIso: string | null
  /** WIPSTA X3 — 1 ferme / 2 planifié / 3 suggéré (#100). */
  status: number
  statusLabel: string
}

export interface PosteEngagement {
  poste: { code: string; label: string }
  count: number
  totalHours: number
  /** Capacité hebdomadaire théorique du poste (h), dérivée du schéma horaire
   *  TABWEEDIA (Σ daycap × parallelUnits × eff×util / 100²). Null si poste
   *  inconnu du référentiel → la vue affiche la charge sans comparatif. */
  weeklyCapacityHours: number | null
  rows: EngagementRow[]
  x3Error: string | null
}

/** Ligne allégée (page /sequenceur, vue "tous les postes") — sans matching
 *  commande en mode engagement (perf). Mode lancer (#100) : pegs attachés
 *  (candidats planifiés/suggérés ≪ fermes → coût acceptable). */
export interface SummaryRow {
  numOf: string
  article: string
  designation: string | null
  done: number
  launched: number
  dateDebutIso: string | null
  hours: number
  status: number
  statusLabel: string
  /** Rempli en kind=lancer via loadOrderImpacts (commandes fermes) ; vide en engagement. */
  commandes: EngagementCommande[]
  livraisonIso: string | null
}

export interface PosteSummary {
  poste: { code: string; label: string }
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  rows: SummaryRow[]
  /** Atelier de rattachement (STOLOC du poste) — filtre atelier (#36), même
   *  rattachement que /charge. Vide si poste hors référentiel. */
  atelier: string
  atelierLabel: string
}

export interface EngagementSummaryDataset {
  postes: PosteSummary[]
  /** Fenêtre [from,to] utilisée pour matching/faisabilité (kind=lancer). */
  window: { from: string; to: string } | null
}

// Fenêtre de demande du matcher engagement : lookback 30 j (overdue) + horizon.
// Bornage nécessaire : la vue ORDERS passe par ZSOAPSQL O(n²).
/** Postes affichés au séquenceur : lignes de production PP_XXX seulement. */
const POSTE_PP_RE = /^PP_\d+$/

const DEMAND_LOOKBACK_DAYS = 30
/** Horizon matching engagement (OF fermes) — commandes jusqu'à ~4 mois. */
const ENGAGEMENT_HORIZON_DAYS = 120
/** Horizon « À lancer » (#100) — même mécanique que /programme, 30 j. */
const LANCER_HORIZON_DAYS = 30
const ENGAGEMENT_TTL = 2 * 60 * 1000

const engagementCache = () => cache.namespace('engagement')

const resolvePoste = (
  mo: ManufacturingOrder,
  overrideMap: Map<string, { workstation: string | null }>,
  opsByArticle: Map<string, { workstation: string | null }[]>
): string | null => {
  const ov = overrideMap.get(mo.numOf)
  return ov?.workstation ?? opsByArticle.get(mo.article)?.[0]?.workstation ?? null
}

const weeklyCapacityOf = (
  poste: string,
  workstations: {
    code: string
    dailyCapacity: number[]
    parallelUnits: number
    efficiency: number
    utilization: number
  }[]
): number | null => {
  const wst = workstations.find((w) => w.code === poste)
  if (!wst || !wst.dailyCapacity.some((c) => c > 0)) return null
  return (
    Math.round(
      wst.dailyCapacity.reduce((s, c) => s + c, 0) *
        wst.parallelUnits *
        (wst.efficiency / 100) *
        (wst.utilization / 100) *
        100
    ) / 100
  )
}

/** Demande window engagement ISO [today − lookback, today + horizon]. */
function demandWindow(horizonDays: number): {
  fromIso: string
  toIso: string
  from: Date
  to: Date
} {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const from = new Date(today)
  from.setDate(from.getDate() - DEMAND_LOOKBACK_DAYS)
  const to = new Date(today)
  to.setDate(to.getDate() + horizonDays)
  to.setHours(23, 59, 59, 999)
  return { from, to, fromIso: isoDay(from), toIso: isoDay(to) }
}

/**
 * Fenêtre [today, today + horizon] — même borne que /programme (pas de lookback).
 * Utilisée pour À lancer : pool OF + matching + faisabilité.
 */
function programmeHorizonWindow(horizonDays: number): {
  fromIso: string
  toIso: string
  from: Date
  to: Date
} {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const to = new Date(today)
  to.setDate(to.getDate() + horizonDays)
  to.setHours(23, 59, 59, 999)
  return { from: today, to, fromIso: isoDay(today), toIso: isoDay(to) }
}

/**
 * Matching À lancer (#100) : pipeline /programme tel quel.
 * Inverse orders→OF ; ne garde que `nature === 'commande'` (fermes client).
 */
async function resolveCommandesByOfFromProgramme(opts: {
  scopedNums: Set<string>
  force: boolean
  horizonDays: number
}): Promise<{
  byOf: Map<string, EngagementCommande[]>
  fromIso: string
  toIso: string
  errors: string[]
}> {
  const { from, to, fromIso, toIso } = programmeHorizonWindow(opts.horizonDays)
  const byOf = new Map<string, EngagementCommande[]>()
  const errors: string[] = []
  if (opts.scopedNums.size === 0) return { byOf, fromIso, toIso, errors }

  try {
    const { result } = await timeStage('engagement.loadOrderImpacts', () =>
      loadOrderImpacts({
        from,
        to,
        force: opts.force,
        pipeline: 'programme',
        mode: 'sequential',
      })
    )
    for (const order of result.orders) {
      if (order.nature !== 'commande') continue
      for (const ofRow of order.ofs) {
        if (!opts.scopedNums.has(ofRow.numOf)) continue
        const list = byOf.get(ofRow.numOf) ?? []
        const ligne = order.ligne ?? null
        if (!list.some((c) => c.numCommande === order.numCommande && c.ligne === ligne)) {
          list.push({
            numCommande: order.numCommande,
            ligne,
            client: order.client || null,
            livraisonIso: order.dateExpedition || null,
            method: 'matcher',
          })
        }
        byOf.set(ofRow.numOf, list)
      }
    }
  } catch (e) {
    errors.push(`loadOrderImpacts: ${(e as Error).message}`)
  }

  return { byOf, fromIso, toIso, errors }
}

/**
 * Matching engagement (kind=ferme) — CommandeOFMatcher local + repli peg.
 * `scopedNums` borne le résultat (jamais élargir le peg IN() à toute l'usine).
 */
async function resolveCommandesByOf(opts: {
  scopedNums: Set<string>
  supply: Flow[]
  force: boolean
  horizonDays: number
}): Promise<{ byOf: Map<string, EngagementCommande[]>; errors: string[] }> {
  const byOf = new Map<string, EngagementCommande[]>()
  const errors: string[] = []
  if (opts.scopedNums.size === 0) return { byOf, errors }

  const { fromIso, toIso } = demandWindow(opts.horizonDays)

  try {
    const [{ demand }, lineDateOverrides, articlesList] = await Promise.all([
      timeStage('engagement.demand', () =>
        boardDataset.getDemandAndReception(fromIso, toIso, opts.force)
      ),
      new OrderLineOverrideStore().getMap(),
      boardDataset.getArticles(),
    ])

    const remapped =
      lineDateOverrides.size === 0
        ? demand
        : demand.map((f) => {
            const o = f.origin as { type?: string; id?: string; ligne?: string | null }
            if (o.type !== 'order') return f
            const ov = lineDateOverrides.get(`${o.id}#${o.ligne ?? ''}`)
            if (!ov || !/^\d{4}-\d{2}-\d{2}$/.test(ov)) return f
            return { ...f, date: new Date(ov) }
          })

    const windowDemands = remapped.filter(
      (f) => f.direction === 'demand' && f.quantity > 0 && !!f.date
    )

    const articles = new Map<string, Article>(articlesList.map((a) => [a.code, a]))
    const matcher = new CommandeOFMatcher(
      opts.supply,
      articles,
      new Map<string, Nomenclature>(),
      30
    )
    const results = matcher.matchCommandes(windowDemands)

    for (const r of results) {
      for (const alloc of r.ofAllocations) {
        const ofId = ((alloc.ofFlow.origin as { id?: string }).id ?? '').trim()
        if (!opts.scopedNums.has(ofId)) continue
        const o = r.demandFlow.origin as {
          id?: string
          ligne?: string | null
          customer?: string | null
          type?: string
        }
        // Commandes fermes seulement (origin.type === 'order') — pas les prévisions.
        if (o.type !== 'order') continue
        const numCommande = o.id ?? ''
        if (!numCommande) continue
        const list = byOf.get(ofId) ?? []
        const ligne = o.ligne ?? null
        if (!list.some((c) => c.numCommande === numCommande && c.ligne === ligne)) {
          list.push({
            numCommande,
            ligne,
            client: o.customer || null,
            livraisonIso: r.demandFlow.date ? isoDay(r.demandFlow.date) : null,
            method: 'matcher',
          })
        }
        byOf.set(ofId, list)
      }
    }
  } catch (e) {
    errors.push(`matcher: ${(e as Error).message}`)
  }

  try {
    const pegs = await boardDataset.getOfPegsAll([...opts.scopedNums])
    for (const [ofNum, list] of pegs) {
      if (!opts.scopedNums.has(ofNum)) continue
      const existing = byOf.get(ofNum) ?? []
      for (const p of list) {
        if (existing.some((c) => c.numCommande === p.numCommande)) continue
        existing.push({
          numCommande: p.numCommande,
          ligne: null,
          client: p.client,
          livraisonIso: p.dateExpedition ? isoDay(p.dateExpedition) : null,
          method: 'peg',
        })
      }
      if (existing.length) byOf.set(ofNum, existing)
    }
  } catch (e) {
    errors.push(`peg: ${(e as Error).message}`)
  }

  return { byOf, errors }
}

/** Page /sequenceur (tous les postes) — sources déjà cachées (SWR board:*).
 *  kind=ferme : aucun matching commande (perf). kind=lancer : loadOrderImpacts. */
export async function loadPosteSummaries(
  force = false,
  kind: EngagementKind = 'ferme'
): Promise<EngagementSummaryDataset> {
  // Clé STABLE — cf. loadPosteEngagement. v3 = loadOrderImpacts + commandes fermes.
  const cacheKey = kind === 'ferme' ? 'summaries' : `summaries:${kind}:v3`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<EngagementSummaryDataset> => {
      const statuses = KIND_STATUSES[kind]
      const progWin = kind === 'lancer' ? programmeHorizonWindow(LANCER_HORIZON_DAYS) : null

      const [ord, ref, overrides] = await Promise.all([
        timeStage('engagement.summaries.orders', () =>
          kind === 'lancer' && progWin
            ? boardDataset.getOrdersForWindow(progWin.from, progWin.to, force)
            : boardDataset.getOrders(force)
        ),
        boardDataset.getReferential(force),
        new OverrideStore().getAll(),
      ])

      const opsByArticle = groupGammeByArticle(ref.gamme)
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const mosByPoste = new Map<string, ManufacturingOrder[]>()
      const seenOf = new Set<string>()
      for (const mo of ord.mos) {
        const st = Number(mo.status)
        if (!statuses.has(st)) continue
        if (seenOf.has(mo.numOf)) continue
        seenOf.add(mo.numOf)
        const poste = resolvePoste(mo, overrideMap, opsByArticle)
        if (!poste) continue
        const list = mosByPoste.get(poste) ?? []
        list.push(mo)
        mosByPoste.set(poste, list)
      }

      // Même source que le board /programme (board_payload_loader.wstLabels) :
      // libellé de gamme, PAS la description du référentiel workstation — deux
      // sources différentes qui peuvent diverger, le séquenceur doit afficher
      // le même nom de ligne que le board.
      const wstLabels = new Map<string, string>()
      for (const g of ref.gamme)
        if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
      const labelOf = (poste: string): string => wstLabels.get(poste) ?? poste

      // Séquenceur : uniquement les postes PP_XXX (lignes de production) — écarte
      // les codes hors nomenclature (stocks, ateliers annexes, codes d'override
      // libres…) qui n'ont pas leur place dans cette vue.
      const posteCodes = new Set<string>()
      for (const g of ref.gamme)
        if (g.workstation && POSTE_PP_RE.test(g.workstation)) posteCodes.add(g.workstation)
      for (const o of overrides)
        if (o.workstation && POSTE_PP_RE.test(o.workstation)) posteCodes.add(o.workstation)

      // Tri croissant sur le numéro (PP_2 avant PP_10) — un tri alpha nu
      // mettrait PP_10 avant PP_2.
      const posteNum = (code: string) =>
        Number.parseInt(POSTE_PP_RE.exec(code)?.[0].slice(3) ?? '0', 10)
      const sortedPosteCodes = [...posteCodes].sort((a, b) => posteNum(a) - posteNum(b))

      const postes: PosteSummary[] = sortedPosteCodes.map((code) => {
        const rows: SummaryRow[] = (mosByPoste.get(code) ?? [])
          .map((mo) => {
            const ov = overrideMap.get(mo.numOf)
            // Arrondi au dixième conservé ici (affichage) — cf. hoursForQuantity.
            const hours =
              Math.round(hoursForQuantity(opsByArticle.get(mo.article)?.[0], mo.quantity) * 10) / 10
            const start = ov?.dateDebut ? new Date(ov.dateDebut) : mo.startDate
            const st = Number(mo.status)
            return {
              numOf: mo.numOf,
              article: mo.article,
              designation: mo.designation,
              done: mo.quantityDone,
              launched: mo.quantityLaunched,
              dateDebutIso: start ? isoDay(start) : null,
              hours,
              status: st,
              statusLabel: statusLabelOf(st),
              commandes: [] as EngagementCommande[],
              livraisonIso: null as string | null,
            }
          })
          .sort(
            (a, b) =>
              (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
              a.numOf.localeCompare(b.numOf)
          )
        const stoloc = ref.workstations.find((w) => w.code === code)?.stockLocation ?? ''
        return {
          poste: { code, label: labelOf(code) },
          count: rows.length,
          totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
          weeklyCapacityHours: weeklyCapacityOf(code, ref.workstations),
          rows,
          atelier: stoloc,
          atelierLabel: resolveAtelierLabel(stoloc),
        }
      })

      // Mode lancer (#100) : loadOrderImpacts pipeline programme — commandes fermes.
      let window: { from: string; to: string } | null = null
      if (kind === 'lancer' && progWin) {
        window = { from: progWin.fromIso, to: progWin.toIso }
        const nums = new Set(postes.flatMap((p) => p.rows.map((r) => r.numOf)))
        if (nums.size > 0) {
          const { byOf } = await resolveCommandesByOfFromProgramme({
            scopedNums: nums,
            force,
            horizonDays: LANCER_HORIZON_DAYS,
          })
          for (const p of postes) {
            for (const r of p.rows) {
              const commandes = (byOf.get(r.numOf) ?? []).sort((a, b) =>
                (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999')
              )
              r.commandes = commandes
              r.livraisonIso = commandes.find((c) => c.livraisonIso)?.livraisonIso ?? null
            }
          }
        }
      }

      return { postes, window }
    },
  })
}

/** GET /api/v1/planning/postes/:poste/engagement — panneau « Engagement » (#46).
 *  Matching commande SCOPÉ à ce poste (petite liste d'OF) — ne jamais élargir à
 *  l'ensemble de l'usine, cf. commentaire de tête de fichier (ZSOAPSQL O(n²)).
 *  `kind=lancer` (#100) : planifiés/suggérés du poste via loadOrderImpacts. */
export async function loadPosteEngagement(
  poste: string,
  force = false,
  kind: EngagementKind = 'ferme'
): Promise<PosteEngagement> {
  // Clé STABLE (pas de rotation quotidienne) : avec le SWR bentocache (timeout 0
  // par défaut), une valeur en grâce (12 h) est servie INSTANTANÉMENT pendant le
  // recalcul en arrière-plan. Une clé datée changeait à minuit → aucune grâce
  // servable au 1er hit du jour → recalcul synchrone (jusqu'à ~20 s si
  // board:orders était aussi froid — mur froid mesuré : 22,5 s sur /sequenceur).
  const cacheKey = kind === 'ferme' ? `poste:${poste}` : `poste:${poste}:${kind}:v3`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<PosteEngagement> => {
      const statuses = KIND_STATUSES[kind]
      const progWin = kind === 'lancer' ? programmeHorizonWindow(LANCER_HORIZON_DAYS) : null
      const horizonDays = kind === 'lancer' ? LANCER_HORIZON_DAYS : ENGAGEMENT_HORIZON_DAYS

      const errors: string[] = []

      const [ord, ref, overrides] = await Promise.all([
        timeStage('engagement.orders', () =>
          kind === 'lancer' && progWin
            ? boardDataset.getOrdersForWindow(progWin.from, progWin.to, force)
            : boardDataset.getOrders(force)
        ),
        boardDataset.getReferential(force),
        new OverrideStore().getAll(),
      ])

      const opsByArticle = groupGammeByArticle(ref.gamme)
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const seenOf = new Set<string>()
      const scoped = ord.mos.filter((mo) => {
        const st = Number(mo.status)
        if (!statuses.has(st)) return false
        if (seenOf.has(mo.numOf)) return false
        if (resolvePoste(mo, overrideMap, opsByArticle) !== poste) return false
        seenOf.add(mo.numOf)
        return true
      })
      const scopedNums = new Set(scoped.map((m) => m.numOf))

      let byOf: Map<string, EngagementCommande[]>
      if (kind === 'lancer') {
        const matched = await resolveCommandesByOfFromProgramme({
          scopedNums,
          force,
          horizonDays,
        })
        byOf = matched.byOf
        errors.push(...matched.errors)
      } else {
        const matched = await resolveCommandesByOf({
          scopedNums,
          supply: ord.supply as Flow[],
          force,
          horizonDays,
        })
        byOf = matched.byOf
        errors.push(...matched.errors)
      }

      const rows: EngagementRow[] = scoped
        .map((mo) => {
          const ov = overrideMap.get(mo.numOf)
          const hours =
            Math.round(hoursForQuantity(opsByArticle.get(mo.article)?.[0], mo.quantity) * 10) / 10
          const start = ov?.dateDebut ? new Date(ov.dateDebut) : mo.startDate
          const commandes = (byOf.get(mo.numOf) ?? []).sort((a, b) =>
            (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999')
          )
          return {
            numOf: mo.numOf,
            article: mo.article,
            designation: mo.designation,
            done: mo.quantityDone,
            launched: mo.quantityLaunched,
            dateDebutIso: start ? isoDay(start) : null,
            hours,
            commandes,
            livraisonIso: commandes.find((c) => c.livraisonIso)?.livraisonIso ?? null,
            status: Number(mo.status),
            statusLabel: statusLabelOf(Number(mo.status)),
          }
        })
        .sort(
          (a, b) =>
            (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999') ||
            (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
            a.numOf.localeCompare(b.numOf)
        )

      let label = poste
      for (const g of ref.gamme)
        if (g.workstation === poste) label = g.workstationLabel || g.workstation

      return {
        poste: { code: poste, label },
        count: rows.length,
        totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
        weeklyCapacityHours: weeklyCapacityOf(poste, ref.workstations),
        rows,
        x3Error: errors.length ? errors.join(' | ') : null,
      }
    },
  })
}

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
import {
  atelierLabel as resolveAtelierLabel,
  buildPosteNatureByWorkstation,
  type PosteNature,
} from '#app/domain/atelier'
import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import { isoDay } from '#app/utils/dates'

/**
 * Séquenceur (#46 / #100 unifiés) — vue tabulaire du board /programme.
 *
 * Pool : **uniquement** les OF matchés à une commande client dans la fenêtre
 * matching (lookback + MATCHING_HORIZON_DAYS) — WIPSTA ∈ {1,2,3}.
 * Matching via `loadOrderImpacts({ pipeline: 'programme' })` +, en détail
 * poste, matcher local + peg. Faisabilité matières côté client (/programme).
 */

/** @deprecated Conservé pour compat appels API — le loader ignore le kind. */
export type EngagementKind = 'ferme' | 'lancer' | 'all'

const ALL_OF_STATUSES = new Set([1, 2, 3])

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

/** Ligne allégée (page /sequenceur, vue "tous les postes") — matching programme. */
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
  /** Rempli via matching programme (+ matcher/peg en détail poste). */
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
  /** Assemblage PF vs sous-ensemble (catégories article préfixe PF / SF). */
  nature: PosteNature
}

export interface EngagementSummaryDataset {
  postes: PosteSummary[]
  /** Fenêtre [from,to] des commandes matchées (borne du pool OF). */
  window: { from: string; to: string } | null
}

// Fenêtre de demande du matcher engagement : lookback 30 j (overdue) + horizon.
// Bornage nécessaire : la vue ORDERS passe par ZSOAPSQL O(n²).
/** Postes affichés au séquenceur : lignes de production PP_XXX seulement. */
const POSTE_PP_RE = /^PP_\d+$/

const DEMAND_LOOKBACK_DAYS = 30
/**
 * Horizon matching séquenceur — commandes `[today − DEMAND_LOOKBACK_DAYS, today + horizon]`.
 *
 * 30 j, et non 120 (#183). Ce n'est pas un réglage de perf posé au hasard : le
 * séquenceur rejoue le pipeline COMPLET d'impacts de `/programme`
 * (`loadOrderImpacts`, `pipeline: 'programme'`) sur cette fenêtre. Il fait donc
 * exactement le même travail que le board, sur une fenêtre qui valait 8,5× la
 * sienne.
 *
 * Mesuré au préchauffage du 02/09/2026, PERF_TRACE=1 :
 *
 *   /programme  (14 j)  · 13 appels SOAP · 5 923 ms · 11 237 lignes
 *   /sequenceur (120 j) · 24 appels SOAP · 15 057 ms · 23 734 lignes
 *
 * Et le coût n'est pas linéaire dans la fenêtre : `ZSOAPSQL` est en O(n²) sur
 * les lignes rendues par appel, donc élargir la fenêtre gonfle des lots déjà
 * trop gros. Les trois requêtes les plus lourdes du séquenceur tournaient à
 * 0,50-0,71 ms/ligne contre 0,15 mesuré à ~1 500 lignes par lot.
 *
 * CE QUE ÇA CHANGE FONCTIONNELLEMENT, et il faut le savoir avant de toucher à
 * cette valeur : le pool du séquenceur = les OF matchés à AU MOINS une commande
 * de la fenêtre. La réduire retire donc des OF de la vue — ceux dont la seule
 * commande rattachée tombe au-delà de 30 jours. C'est un choix de périmètre
 * métier (« que doit montrer le séquenceur »), pas une optimisation neutre.
 *
 * Si cette valeur bouge, BUMPER les clés de cache `summaries:vN` et
 * `poste:<code>:vN` : leur contenu dépend de cette fenêtre, et la grâce de 12 h
 * servirait sinon l'ancien périmètre après déploiement.
 */
const MATCHING_HORIZON_DAYS = 30
/** @deprecated Alias — même fenêtre que MATCHING_HORIZON_DAYS. */
const ENGAGEMENT_HORIZON_DAYS = MATCHING_HORIZON_DAYS
const ENGAGEMENT_TTL = 2 * 60 * 1000

const engagementCache = () => cacheNs('engagement')

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
 * Fenêtre matching séquenceur : lookback (retards) + horizon avant.
 * Plus large que /programme (30 j sans lookback) — le séquenceur liste TOUS
 * les OF ouverts, il faut rattacher les commandes hors fenêtre courte.
 */
function matchingHorizonWindow(horizonDays: number = MATCHING_HORIZON_DAYS): {
  fromIso: string
  toIso: string
  from: Date
  to: Date
} {
  return demandWindow(horizonDays)
}

/**
 * Matching programme élargi : commandes → OF alloués (tous WIPSTA).
 * Fenêtre = lookback + MATCHING_HORIZON_DAYS (pas le 30 j /programme).
 */
async function loadLancerFromProgramme(opts: { force: boolean; horizonDays?: number }): Promise<{
  byOf: Map<string, EngagementCommande[]>
  lancerNums: Set<string>
  fromIso: string
  toIso: string
  errors: string[]
}> {
  const horizonDays = opts.horizonDays ?? MATCHING_HORIZON_DAYS
  const { from, to, fromIso, toIso } = matchingHorizonWindow(horizonDays)
  const byOf = new Map<string, EngagementCommande[]>()
  const lancerNums = new Set<string>()
  const errors: string[] = []

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
        const st = ofRow.statutNum
        if (st === 2 || st === 3) lancerNums.add(ofRow.numOf)
        if (st !== 1 && st !== 2 && st !== 3) continue
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

  return { byOf, lancerNums, fromIso, toIso, errors }
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

/** Page /sequenceur (tous les postes) — pool = OF matchés aux commandes horizon. */
export async function loadPosteSummaries(
  force = false,
  _kind: EngagementKind = 'all'
): Promise<EngagementSummaryDataset> {
  void _kind
  // Clé STABLE — v12 = pool = OF matchés commandes (pas STRDAT), fenêtre 30 j (#183).
  const cacheKey = 'summaries:v12'
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: stamped(async (): Promise<EngagementSummaryDataset> => {
      // Matching commandes [lookback, +120 j] → OF alloués.
      const matched = await loadLancerFromProgramme({
        force,
        horizonDays: MATCHING_HORIZON_DAYS,
      })
      const cmdByOf = matched.byOf
      const window = { from: matched.fromIso, to: matched.toIso }

      const [ord, ref, overrides, articlesList] = await Promise.all([
        timeStage('engagement.summaries.orders', () => boardDataset.getOrders(force)),
        boardDataset.getReferential(force),
        new OverrideStore().getAll(),
        boardDataset.getArticles().catch(() => [] as { code: string; category: string }[]),
      ])

      const opsByArticle = groupGammeByArticle(ref.gamme)
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))
      const categoryByArticle = new Map(articlesList.map((a) => [a.code, a.category ?? '']))
      const posteNatureByWst = buildPosteNatureByWorkstation(ref.gamme, categoryByArticle)

      // Repli matcher+peg sur OF fermes absents du pipeline programme — n'ajoute
      // au pool que s'il y a match. Planifié/suggéré non matchés = hors vue.
      const firmMissing = new Set<string>()
      for (const mo of ord.mos) {
        if (Number(mo.status) !== 1) continue
        if (!cmdByOf.has(mo.numOf)) firmMissing.add(mo.numOf)
      }
      if (firmMissing.size > 0) {
        const local = await resolveCommandesByOf({
          scopedNums: firmMissing,
          supply: ord.supply as Flow[],
          force,
          horizonDays: MATCHING_HORIZON_DAYS,
        })
        for (const [num, list] of local.byOf) {
          if (list.length) cmdByOf.set(num, list)
        }
      }

      // Pool = uniquement OF matchés à ≥1 commande de la fenêtre.
      const mosByPoste = new Map<string, ManufacturingOrder[]>()
      const seenOf = new Set<string>()
      for (const mo of ord.mos) {
        const st = Number(mo.status)
        if (!ALL_OF_STATUSES.has(st)) continue
        if (seenOf.has(mo.numOf)) continue
        seenOf.add(mo.numOf)
        if (!cmdByOf.has(mo.numOf)) continue
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
            const commandes = (cmdByOf.get(mo.numOf) ?? []).sort((a, b) =>
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
              status: st,
              statusLabel: statusLabelOf(st),
              commandes,
              livraisonIso: commandes.find((c) => c.livraisonIso)?.livraisonIso ?? null,
            }
          })
          .sort(
            (a, b) =>
              (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999') ||
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
          nature: posteNatureByWst.get(code) ?? 'autre',
        }
      })

      return { postes, window }
    }),
  })
}

/** GET /api/v1/planning/postes/:poste/engagement — détail d'un poste (#46).
 *  Matching commande SCOPÉ à ce poste (petite liste d'OF) — ne jamais élargir à
 *  l'ensemble de l'usine, cf. commentaire de tête de fichier (ZSOAPSQL O(n²)).
 *  Pool = OF du poste matchés à ≥1 commande (programme + matcher/peg). */
export async function loadPosteEngagement(
  poste: string,
  force = false,
  _kind: EngagementKind = 'all'
): Promise<PosteEngagement> {
  void _kind
  // Clé STABLE — cf. loadPosteSummaries. v11 = pool = OF matchés.
  const cacheKey = `poste:${poste}:v12`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: stamped(async (): Promise<PosteEngagement> => {
      const errors: string[] = []

      const matched = await loadLancerFromProgramme({
        force,
        horizonDays: MATCHING_HORIZON_DAYS,
      })
      const programmeByOf = matched.byOf
      errors.push(...matched.errors)

      const [ord, ref, overrides] = await Promise.all([
        timeStage('engagement.orders', () => boardDataset.getOrders(force)),
        boardDataset.getReferential(force),
        new OverrideStore().getAll(),
      ])

      const opsByArticle = groupGammeByArticle(ref.gamme)
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const seenOf = new Set<string>()
      const onPoste = ord.mos.filter((mo) => {
        const st = Number(mo.status)
        if (!ALL_OF_STATUSES.has(st)) return false
        if (seenOf.has(mo.numOf)) return false
        if (resolvePoste(mo, overrideMap, opsByArticle) !== poste) return false
        seenOf.add(mo.numOf)
        return true
      })
      const onPosteNums = new Set(onPoste.map((m) => m.numOf))

      const local = await resolveCommandesByOf({
        scopedNums: onPosteNums,
        supply: ord.supply as Flow[],
        force,
        horizonDays: ENGAGEMENT_HORIZON_DAYS,
      })
      errors.push(...local.errors)

      // Programme + matcher local : union — puis pool = OF avec ≥1 commande.
      const byOf = new Map<string, EngagementCommande[]>()
      for (const num of onPosteNums) {
        const merged = [...(programmeByOf.get(num) ?? []), ...(local.byOf.get(num) ?? [])]
        const dedup: EngagementCommande[] = []
        for (const c of merged) {
          if (!dedup.some((d) => d.numCommande === c.numCommande && d.ligne === c.ligne)) {
            dedup.push(c)
          }
        }
        if (dedup.length) byOf.set(num, dedup)
      }

      const scoped = onPoste.filter((mo) => byOf.has(mo.numOf))

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
    }),
  })
}

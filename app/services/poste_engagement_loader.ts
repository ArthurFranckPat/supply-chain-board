import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { CommandeOFMatcher } from '#app/domain/of_conso'
import { timeStage } from '#services/perf_metrics'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { Flow } from '#app/domain/models/flow'
import type { ManufacturingOrder } from '#repositories/of_repository'
import cache from '@adonisjs/cache/services/main'

/**
 * Issue #46 — engagement par poste : TOUS les OF fermes d'un poste, indépendamment
 * de la fenêtre board sélectionnée par l'utilisateur. Un poste peut avoir des OF
 * affermis hors fenêtre board : la vue sert justement à les révéler.
 *
 * Source supply : getOrders() = tous les OF ouverts (lookback ~90 j ENDDAT, déjà
 * borné côté X3, tous statuts). Volontairement NON remplacé par getOrdersForWindow() :
 * ce dernier scoperait par STRDAT ∈ [fenêtre board] et raterait les OF hors fenêtre,
 * ce qui est précisément contraire à l'objectif. Le matcher doit aussi voir les
 * planifiés/suggérés (statut 2/3) pour allouer comme le board.
 *
 * Le matching OF↔commande est LE MÊME que celui du board (/programme, issue #21) :
 * `CommandeOFMatcher` (contremarque hard peg prioritaire, puis heuristiques
 * MTS/NOR/MTO par article/date), inversé commande→OF ⇒ OF→commandes. Repli
 * reverse peg SORDERQ (contremarque seule) pour les OF dont la commande expédie
 * HORS de la fenêtre de demande du matcher (cf. DEMAND_LOOKBACK/HORIZON_DAYS).
 *
 * IMPORTANT (perf) : `getOfPegsAll` est un SOAP ZSOAPSQL — son coût est O(n²) sur
 * le nombre de lignes ramenées, corrélé à la taille de la liste de n° d'OF passée
 * en IN(). `loadPosteEngagement` le scope donc à UN SEUL poste (petite liste, ce
 * qui a toujours été le cas — panneau `PosteEngagementSheet`). La page `/sequenceur`
 * (tous les postes) n'appelle JAMAIS le matcher/peg sur l'ensemble de l'usine :
 * `loadPosteSummaries` reste sur les sources déjà cachées (getOrders/getReferential),
 * sans commandes liées — un premier essai qui agrégeait le matching sur TOUS les
 * fermes de l'usine faisait passer /sequenceur de <1s à 26s (mesuré, revert).
 */

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
 *  commande, volontairement, pour rester sur les seules sources déjà cachées. */
export interface SummaryRow {
  numOf: string
  article: string
  designation: string | null
  done: number
  launched: number
  dateDebutIso: string | null
  hours: number
}

export interface PosteSummary {
  poste: { code: string; label: string }
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  rows: SummaryRow[]
}

export interface EngagementSummaryDataset {
  postes: PosteSummary[]
}

// Fenêtre de demande du matcher : assez large pour couvrir les commandes des OF
// fermes (lookback 30 j pour l'overdue, 120 j devant). Au-delà, le repli peg
// (indépendant de toute fenêtre) prend le relais. Bornage nécessaire : la vue
// ORDERS passe par ZSOAPSQL O(n²) — une fenêtre illimitée exploserait le SOAP.
/** Postes affichés au séquenceur : lignes de production PP_XXX seulement. */
const POSTE_PP_RE = /^PP_\d+$/

const DEMAND_LOOKBACK_DAYS = 30
const DEMAND_HORIZON_DAYS = 120
const ENGAGEMENT_TTL = 2 * 60 * 1000

const isoDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const engagementCache = () => cache.namespace('engagement')

const resolvePoste = (
  mo: ManufacturingOrder,
  overrideMap: Map<string, { workstation: string | null }>,
  gammeMap: Map<string, { workstation: string | null }>
): string | null => {
  const ov = overrideMap.get(mo.numOf)
  return ov?.workstation ?? gammeMap.get(mo.article)?.workstation ?? null
}

const weeklyCapacityOf = (
  poste: string,
  workstations: { code: string; dailyCapacity: number[]; parallelUnits: number; efficiency: number; utilization: number }[]
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

/** Page /sequenceur (tous les postes) — sources déjà cachées (SWR board:*),
 *  aucun matching commande. Coût borné, indépendant du nombre d'OF fermes. */
export async function loadPosteSummaries(force = false): Promise<EngagementSummaryDataset> {
  const cacheKey = `summaries:${isoDay(new Date())}`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<EngagementSummaryDataset> => {
      const [ord, ref, overrides] = await Promise.all([
        timeStage('engagement.summaries.orders', () => boardDataset.getOrders(force)),
        boardDataset.getReferential(force),
        new OverrideStore().getAll(),
      ])

      const gammeMap = new Map(ref.gamme.map((g) => [g.article, g]))
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const fermesByPoste = new Map<string, ManufacturingOrder[]>()
      for (const mo of ord.mos) {
        if (mo.status !== 1) continue
        const poste = resolvePoste(mo, overrideMap, gammeMap)
        if (!poste) continue
        const list = fermesByPoste.get(poste) ?? []
        list.push(mo)
        fermesByPoste.set(poste, list)
      }

      const labelOf = (poste: string): string =>
        ref.workstations.find((w) => w.code === poste)?.description ??
        ref.gamme.find((g) => g.workstation === poste)?.workstationLabel ??
        poste

      // Séquenceur : uniquement les postes PP_XXX (lignes de production) — écarte
      // les codes hors nomenclature (stocks, ateliers annexes, codes d'override
      // libres…) qui n'ont pas leur place dans cette vue.
      const posteCodes = new Set<string>()
      for (const g of ref.gamme) if (g.workstation && POSTE_PP_RE.test(g.workstation)) posteCodes.add(g.workstation)
      for (const o of overrides) if (o.workstation && POSTE_PP_RE.test(o.workstation)) posteCodes.add(o.workstation)

      const postes: PosteSummary[] = [...posteCodes].map((code) => {
        const rows: SummaryRow[] = (fermesByPoste.get(code) ?? [])
          .map((mo) => {
            const ov = overrideMap.get(mo.numOf)
            const rate = gammeMap.get(mo.article)?.rate ?? 0
            const hours = rate > 0 ? Math.round((mo.quantity / rate) * 10) / 10 : 0
            const start = ov?.dateDebut ? new Date(ov.dateDebut) : mo.startDate
            return {
              numOf: mo.numOf,
              article: mo.article,
              designation: mo.designation,
              done: mo.quantityDone,
              launched: mo.quantityLaunched,
              dateDebutIso: start ? isoDay(start) : null,
              hours,
            }
          })
          .sort(
            (a, b) =>
              (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
              a.numOf.localeCompare(b.numOf)
          )
        return {
          poste: { code, label: labelOf(code) },
          count: rows.length,
          totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
          weeklyCapacityHours: weeklyCapacityOf(code, ref.workstations),
          rows,
        }
      })

      return { postes }
    },
  })
}

/** GET /api/v1/planning/postes/:poste/engagement — panneau « Engagement » (#46).
 *  Matching commande SCOPÉ à ce poste (petite liste d'OF) — ne jamais élargir à
 *  l'ensemble de l'usine, cf. commentaire de tête de fichier (ZSOAPSQL O(n²)). */
export async function loadPosteEngagement(poste: string, force = false): Promise<PosteEngagement> {
  const cacheKey = `poste:${poste}:${isoDay(new Date())}`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<PosteEngagement> => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const from = new Date(today)
      from.setDate(from.getDate() - DEMAND_LOOKBACK_DAYS)
      const to = new Date(today)
      to.setDate(to.getDate() + DEMAND_HORIZON_DAYS)
      to.setHours(23, 59, 59, 999)
      const fromIso = isoDay(from)
      const toIso = isoDay(to)

      const errors: string[] = []

      const [ord, ref, articlesList, overrides] = await Promise.all([
        timeStage('engagement.orders', () => boardDataset.getOrders(force)),
        boardDataset.getReferential(force),
        boardDataset.getArticles(),
        new OverrideStore().getAll(),
      ])

      const gammeMap = new Map(ref.gamme.map((g) => [g.article, g]))
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const fermes = ord.mos.filter(
        (mo) => mo.status === 1 && resolvePoste(mo, overrideMap, gammeMap) === poste
      )
      const fermeNums = new Set(fermes.map((m) => m.numOf))

      const byOf = new Map<string, EngagementCommande[]>()
      try {
        const [{ demand }, lineDateOverrides] = await Promise.all([
          timeStage('engagement.demand', () => boardDataset.getDemandAndReception(fromIso, toIso, force)),
          new OrderLineOverrideStore().getMap(),
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

        const windowDemands = remapped.filter((f) => f.direction === 'demand' && f.quantity > 0 && !!f.date)

        const articles = new Map<string, Article>(articlesList.map((a) => [a.code, a]))
        const matcher = new CommandeOFMatcher(
          ord.supply as Flow[],
          articles,
          new Map<string, Nomenclature>(), // inutilisé par le matcher
          30
        )
        const results = matcher.matchCommandes(windowDemands)

        for (const r of results) {
          for (const alloc of r.ofAllocations) {
            const ofId = ((alloc.ofFlow.origin as { id?: string }).id ?? '').trim()
            if (!fermeNums.has(ofId)) continue
            const o = r.demandFlow.origin as { id?: string; ligne?: string | null; customer?: string | null }
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
        const pegs = await boardDataset.getOfPegsAll([...fermeNums])
        for (const [ofNum, list] of pegs) {
          if (!fermeNums.has(ofNum)) continue
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

      const rows: EngagementRow[] = fermes
        .map((mo) => {
          const ov = overrideMap.get(mo.numOf)
          const rate = gammeMap.get(mo.article)?.rate ?? 0
          const hours = rate > 0 ? Math.round((mo.quantity / rate) * 10) / 10 : 0
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
          }
        })
        .sort(
          (a, b) =>
            (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999') ||
            (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
            a.numOf.localeCompare(b.numOf)
        )

      const wst = ref.workstations.find((w) => w.code === poste)
      const label =
        wst?.description ?? ref.gamme.find((g) => g.workstation === poste)?.workstationLabel ?? poste

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

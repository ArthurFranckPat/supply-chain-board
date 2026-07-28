import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { CommandeOFMatcher } from '#app/domain/of_conso'
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
 * Issue #100 — mode « À lancer » : mêmes loaders, filtrés sur planifiés/suggérés
 * (WIPSTA 2/3) — candidats à l'affermissement, pas encore fermes.
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
 *  commande, volontairement, pour rester sur les seules sources déjà cachées. */
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

/** Page /sequenceur (tous les postes) — sources déjà cachées (SWR board:*),
 *  aucun matching commande. Coût borné, indépendant du nombre d'OF fermes. */
export async function loadPosteSummaries(
  force = false,
  kind: EngagementKind = 'ferme'
): Promise<EngagementSummaryDataset> {
  // Clé STABLE, même raison que loadPosteEngagement : une clé datée change à
  // minuit, donc plus aucune valeur en grâce (12 h) n'est servable au 1er hit du
  // jour → recalcul synchrone au lieu du SWR. Et rien ici ne dépend de la date
  // du jour : les dates rendues viennent des OF, la capacité est statique.
  // Suffixe kind : ferme vs lancer (#100) ne partagent pas le même dataset.
  const cacheKey = kind === 'ferme' ? 'summaries' : `summaries:${kind}`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<EngagementSummaryDataset> => {
      const statuses = KIND_STATUSES[kind]
      const [ord, ref, overrides] = await Promise.all([
        timeStage('engagement.summaries.orders', () => boardDataset.getOrders(force)),
        boardDataset.getReferential(force),
        new OverrideStore().getAll(),
      ])

      const opsByArticle = groupGammeByArticle(ref.gamme)
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const mosByPoste = new Map<string, ManufacturingOrder[]>()
      for (const mo of ord.mos) {
        if (!statuses.has(mo.status)) continue
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
            return {
              numOf: mo.numOf,
              article: mo.article,
              designation: mo.designation,
              done: mo.quantityDone,
              launched: mo.quantityLaunched,
              dateDebutIso: start ? isoDay(start) : null,
              hours,
              status: mo.status,
              statusLabel: statusLabelOf(mo.status),
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

      return { postes }
    },
  })
}

/** GET /api/v1/planning/postes/:poste/engagement — panneau « Engagement » (#46).
 *  Matching commande SCOPÉ à ce poste (petite liste d'OF) — ne jamais élargir à
 *  l'ensemble de l'usine, cf. commentaire de tête de fichier (ZSOAPSQL O(n²)).
 *  `kind=lancer` (#100) : planifiés/suggérés du poste, même matching. */
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
  const cacheKey = kind === 'ferme' ? `poste:${poste}` : `poste:${poste}:${kind}`
  if (force) await engagementCache().delete({ key: cacheKey })
  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<PosteEngagement> => {
      const statuses = KIND_STATUSES[kind]
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

      const opsByArticle = groupGammeByArticle(ref.gamme)
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      const scoped = ord.mos.filter(
        (mo) => statuses.has(mo.status) && resolvePoste(mo, overrideMap, opsByArticle) === poste
      )
      const scopedNums = new Set(scoped.map((m) => m.numOf))

      const byOf = new Map<string, EngagementCommande[]>()
      try {
        const [{ demand }, lineDateOverrides] = await Promise.all([
          timeStage('engagement.demand', () =>
            boardDataset.getDemandAndReception(fromIso, toIso, force)
          ),
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

        const windowDemands = remapped.filter(
          (f) => f.direction === 'demand' && f.quantity > 0 && !!f.date
        )

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
            if (!scopedNums.has(ofId)) continue
            const o = r.demandFlow.origin as {
              id?: string
              ligne?: string | null
              customer?: string | null
            }
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
        const pegs = await boardDataset.getOfPegsAll([...scopedNums])
        for (const [ofNum, list] of pegs) {
          if (!scopedNums.has(ofNum)) continue
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

      const rows: EngagementRow[] = scoped
        .map((mo) => {
          const ov = overrideMap.get(mo.numOf)
          // Arrondi au dixième conservé ici (affichage) — cf. hoursForQuantity.
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
            status: mo.status,
            statusLabel: statusLabelOf(mo.status),
          }
        })
        .sort(
          (a, b) =>
            (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999') ||
            (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
            a.numOf.localeCompare(b.numOf)
        )

      // Même source que /programme (board_payload_loader.wstLabels, dernière
      // gamme du poste qui gagne) : libellé de gamme, pas la description du
      // référentiel workstation.
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

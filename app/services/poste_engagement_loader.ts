import boardDataset from '#services/board_dataset'
import { OverrideStore } from '#services/override_store'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { CommandeOFMatcher } from '#app/domain/of-conso'
import { timeStage } from '#services/perf_metrics'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { Flow } from '#app/domain/models/flow'
import cache from '@adonisjs/cache/services/main'

/**
 * Issue #46 — panneau « Engagement » par poste : TOUS les OF fermes du poste,
 * indépendamment de la fenêtre board sélectionnée par l'utilisateur. Un poste peut
 * avoir des OF affermis hors fenêtre board : la vue sert justement à les révéler.
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
 * HORS de la fenêtre de demande du matcher (cf. DEMAND_LOOKBACK/HORIZON_DAYS) —
 * même rôle que `ofPegs` dans OrderImpactsContext. Ne pas remplacer par le peg
 * seul : les commandes MTS sans contremarque ne seraient jamais liées.
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
   *  inconnu du référentiel → la sheet affiche la charge sans comparatif. */
  weeklyCapacityHours: number | null
  rows: EngagementRow[]
  x3Error: string | null
}

// Fenêtre de demande du matcher : assez large pour couvrir les commandes des OF
// fermes (lookback 30 j pour l'overdue, 120 j devant). Au-delà, le repli peg
// (indépendant de toute fenêtre) prend le relais. Bornage nécessaire : la vue
// ORDERS passe par ZSOAPSQL O(n²) — une fenêtre illimitée exploserait le SOAP.
const DEMAND_LOOKBACK_DAYS = 30
const DEMAND_HORIZON_DAYS = 120
const ENGAGEMENT_TTL = 2 * 60 * 1000

const isoDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export async function loadPosteEngagement(
  poste: string,
  force = false
): Promise<PosteEngagement> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const from = new Date(today)
  from.setDate(from.getDate() - DEMAND_LOOKBACK_DAYS)
  const to = new Date(today)
  to.setDate(to.getDate() + DEMAND_HORIZON_DAYS)
  to.setHours(23, 59, 59, 999)
  const fromIso = isoDay(from)
  const toIso = isoDay(to)

  const engagementCache = () => cache.namespace('engagement')
  const cacheKey = `poste:${poste}:${isoDay(today)}`
  if (force) await engagementCache().delete({ key: cacheKey })

  return engagementCache().getOrSet({
    key: cacheKey,
    ttl: ENGAGEMENT_TTL,
    factory: async (): Promise<PosteEngagement> => {
      // Erreurs X3 accumulées par source (matcher + repli peg). Si les deux
      // échouent, l'utilisateur voit les deux causes au lieu d'une seule.
      const errors: string[] = []

      // Sources cachées (SWR board:*) : getOrders() = tous les OF ouverts (lookback
      // ~90 j ENDDAT, déjà borné côté X3, tous statuts — le matcher doit voir les
      // planifiés/suggérés pour allouer comme le board). RÉFÉRENIEL, articles, overrides.
      const [ord, ref, articlesList, overrides] = await Promise.all([
        timeStage('engagement.orders', () => boardDataset.getOrders(force)),
        boardDataset.getReferential(force),
        boardDataset.getArticles(),
        new OverrideStore().getAll(),
      ])

      const gammeMap = new Map(ref.gamme.map((g) => [g.article, g]))
      const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))

      // OF FERMES du poste — résolution poste identique au board : override d'abord.
      const fermes = ord.mos.filter((mo) => {
        if (mo.status !== 1) return false
        const ov = overrideMap.get(mo.numOf)
        const wst = ov?.workstation ?? gammeMap.get(mo.article)?.workstation ?? null
        return wst === poste
      })
      const fermeNums = new Set(fermes.map((m) => m.numOf))

      // ── Matching OF↔commande (chaîne board) ──
      // Demande WIPTYP=1+2 sur fenêtre large + remap des dates overridées (parité
      // loadOrderImpacts), puis CommandeOFMatcher sur TOUS les OF ouverts. Inversé
      // ensuite : commande→OF ⇒ OF→commandes, filtré aux fermes du poste.
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
            if (!fermeNums.has(ofId)) continue
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

      // ── Repli reverse peg (contremarque SORDERQ) ──
      // Couvre les OF dont la commande expédie hors fenêtre de demande. N'ajoute
      // que les commandes absentes du matching.
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

      // ── Lignes du panneau ──
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
        // Urgence client d'abord (sans livraison en dernier), puis début OF, puis n° OF.
        .sort(
          (a, b) =>
            (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999') ||
            (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
            a.numOf.localeCompare(b.numOf)
        )

      const wst = ref.workstations.find((w) => w.code === poste)
      const label = wst?.description ?? ref.gamme.find((g) => g.workstation === poste)?.workstationLabel ?? poste

      // Capacité hebdo théorique (h) = Σ daycap × unités parallèles × eff×util.
      // Méthode identique au calcul de charge (charge_service). Null si poste
      // inconnu ou schéma horaire vide → la sheet saute le comparatif.
      const weeklyCapacityHours = wst && wst.dailyCapacity.some((c) => c > 0)
        ? Math.round(
            wst.dailyCapacity.reduce((s, c) => s + c, 0) *
              wst.parallelUnits *
              (wst.efficiency / 100) *
              (wst.utilization / 100) *
              100
          ) / 100
        : null

      return {
        poste: { code: poste, label },
        count: rows.length,
        totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
        weeklyCapacityHours,
        rows,
        // Concatène les erreurs des deux sources : si matcher ET peg échouent,
        // l'utilisateur voit les deux causes (au lieu d'une seule écrasée).
        x3Error: errors.length ? errors.join(' | ') : null,
      }
    },
  })
}

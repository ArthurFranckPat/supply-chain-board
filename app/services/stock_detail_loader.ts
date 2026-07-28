/**
 * Détail d'un article pour la sheet du KPI stock — historique 52 semaines
 * (rembobinage STOJOU en cache SWR, cf.
 * StockValuationRepository.getArticleStockHistory) + projection 52 semaines
 * du stock à partir des besoins et ressources à venir.
 *
 * Les flux futurs passent par une requête ORDERS lean scopée à l'article
 * (CombinedOrdersRepository.fetchArticleFutureFlows) : le fetch global
 * partagé (getDemandAndReception) dépasse le seuil de lignes du SOAP
 * Syracuse sur un horizon 12 mois (resultXml is nil). Le résultat est mis en
 * cache 2 min avec le détail.
 *
 * Conventions de projection :
 *  - Besoins : demande client à livrer (ORDERS WIPTYP 1) + besoin matière
 *    (WIPTYP 6). Sans ce dernier, les articles achetés/semi-finis n'ont aucun
 *    besoin — ils ne sont pas vendus directement.
 *  - Ressources : réceptions achat attendues (WIPTYP 2) + production des OF
 *    (WIPTYP 5).
 *  - Statuts : Ferme + Planifié + Suggéré (WIPSTA 1/2/3), Clos exclu, la même
 *    règle des deux côtés. Le site tourne à 100 % CBN, les suggestions sont le
 *    plan ; les compter d'un seul côté déséquilibrerait la projection par
 *    construction (issue #88).
 *  - Seaux : S+1 … S+52 (lundis ISO) ; les flux datés avant S+1 (retards)
 *    sont clampés en S+1 — ils restent à passer et joueront sous peu.
 *  - stockProjeté(S+k) = stockActuel + Σ_{j≤k} (ressources − besoins), borné
 *    à 0 chaque semaine (le stock physique ne peut pas être négatif — même
 *    plancher que l'historique).
 *  - Valorisation au PMP actuel (même convention que l'historique).
 */

import cache from '@adonisjs/cache/services/main'
import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import { CombinedOrdersRepository } from '#repositories/combined_orders_repository'
import { isoWeekKey, type StockArticleHistory } from '#repositories/stock_valuation_repository'
import { isoDay } from '#app/utils/dates'

/** Point hebdomadaire de la projection (seaux S+1 … S+52). */
export interface StockFuturePoint {
  periode: string // clé YYYY-Www (semaine ISO)
  label: string
  besoinQte: number
  besoinVal: number
  ressourceQte: number
  ressourceVal: number
  stockQte: number // stock projeté fin de semaine (borné ≥ 0)
  stockVal: number
}

/**
 * Indicateurs de pilotage — aucune requête X3 supplémentaire : tout se déduit
 * de `series` (passé) et de la projection `future` (à venir).
 *
 * `null` quand le calcul n'a pas de sens (diviseur nul, pas de rupture sur
 * l'horizon), jamais 0 : un article sans sortie n'a pas « 0 jour de
 * couverture », il n'en a pas.
 *
 * **Deux couvertures, deux usages.** Celle qui vient de l'historique décrit le
 * régime moyen passé ; celle qui vient de la demande à venir est la seule à
 * porter une décision. Ne pas les afficher côte à côte : elles répondent à des
 * questions différentes et se contredisent dès que la demande n'est pas plate.
 */
export interface StockArticleIndicateurs {
  // --- Descriptif, fenêtre glissante passée ---
  sorties12m: number // Σ des sorties nettes de la fenêtre
  joursFenetre: number // amplitude réelle du calcul, en jours
  cmj: number | null // sorties / jours calendaires
  couvertureJours: number | null // stock actuel / cmj — régime moyen passé
  stockMoyen: number // moyenne du stock de fin de semaine
  rotation: number | null // sorties / stock moyen

  // --- Décisionnel, demande réelle à venir ---
  /** Jours avant rupture en déroulant les besoins réels, RÉCEPTIONS EXCLUES.
   *  `null` = le stock couvre tout l'horizon de projection. */
  couvertureProspectiveJours: number | null
  /** Semaine ISO de la rupture (clé YYYY-Www) et sa date, pour l'affichage. */
  ruptureSemaine: string | null
  ruptureDateIso: string | null
  /** couvertureProspectiveJours ÷ délai de réappro. < 1 = commander maintenant
   *  n'arrive plus à temps. C'est LE signal actionnable. */
  ratioProspectifDelai: number | null
}

export interface StockArticleDetail extends StockArticleHistory {
  future: StockFuturePoint[]
  indicateurs: StockArticleIndicateurs
}

export interface StockArticleDetailResult {
  detail: StockArticleDetail | null
  x3Error: string | null
}

export interface StockArticleDetailParams {
  article: string
  referenceDate?: Date
}

/** Erreur de paramètre — le contrôleur la traduit en 400. */
export class StockDetailBadRequest extends Error {}

const WEEKS = 52

/** Recule `d` au lundi de sa semaine (UTC). */
const toMonday = (d: Date): Date => {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  m.setUTCDate(m.getUTCDate() + 1 - (m.getUTCDay() || 7))
  return m
}

/**
 * Indicateurs de pilotage à partir de l'historique hebdomadaire.
 *
 * **Sorties, pas « consommation de production ».** `sortieQte` est le flux
 * physique net sortant, toutes causes confondues (consommation OF, ventes,
 * retours fournisseur, rebuts). C'est le bon numérateur pour une couverture :
 * le stock s'écoule par toutes ses sorties, pas seulement par la fabrication.
 *
 * **CMJ calendaire, pas « par jour de mouvement ».** Diviser par les seuls
 * jours où un mouvement a eu lieu répond à « combien je consomme un jour où je
 * consomme » et surestime la CMJ d'un facteur 2 sur un article à mouvements
 * intermittents — sur `11022900`, 194 jours de mouvement sur 365, soit 775/j
 * contre 406/j en calendaire, et une couverture affichée de 9,2 j au lieu de
 * 17,6 j. Le stock s'écoule en temps calendaire : le diviseur doit l'être
 * aussi.
 *
 * Les semaines de bord sont partielles ; l'amplitude est donc exposée
 * (`joursFenetre`) plutôt que figée à 365.
 */
function computeIndicateurs(
  history: StockArticleHistory,
  future: StockFuturePoint[],
  firstMonday: Date,
  refDate: Date
): StockArticleIndicateurs {
  const series = history.series
  const sorties12m = series.reduce((t, p) => t + p.sortieQte, 0)
  // 53 points hebdomadaires couvrent 52 intervalles, soit 364 jours.
  const joursFenetre = Math.max(1, (series.length - 1) * 7)
  const stockMoyen = series.length > 0 ? series.reduce((t, p) => t + p.qte, 0) / series.length : 0

  const cmj = sorties12m > 0 ? sorties12m / joursFenetre : null
  const delai = history.logistique.delaiReapproJours
  const couvertureJours = cmj !== null && cmj > 0 ? history.stock / cmj : null

  const round2 = (v: number) => Math.round(v * 100) / 100

  // --- Couverture prospective : déroulé des besoins réels, hors réceptions ---
  // Exclure les réceptions est le point clé. Les inclure redonnerait la courbe
  // de projection, qui répond à « où va mon stock » ; ici on demande « combien
  // de temps je tiens si rien n'arrive », seule formulation comparable à un
  // délai de réapprovisionnement.
  //
  // Une semaine de fermeture usine n'a aucun besoin et allonge donc la
  // couverture d'autant, automatiquement — c'est précisément ce qu'une CMJ
  // moyenne, plate par construction, ne sait pas faire.
  let restant = history.stock
  let couvertureProspectiveJours: number | null = null
  let ruptureSemaine: string | null = null
  let ruptureDateIso: string | null = null

  // Jours entre refDate et le premier seau (S+1) : la projection commence au
  // lundi suivant, pas aujourd'hui.
  const joursAvantPremierSeau = Math.max(
    0,
    Math.round((firstMonday.getTime() - refDate.getTime()) / 86_400_000)
  )

  for (const [i, element] of future.entries()) {
    const besoin = element.besoinQte
    if (besoin <= 0) continue
    if (restant >= besoin) {
      restant -= besoin
      continue
    }
    // Rupture dans cette semaine. Le besoin hebdomadaire est réputé s'étaler
    // uniformément sur les 7 jours — d'où l'interpolation du jour de rupture.
    const fraction = besoin > 0 ? restant / besoin : 0
    const jourDansSeau = i * 7 + fraction * 7
    couvertureProspectiveJours = round2(joursAvantPremierSeau + jourDansSeau)
    ruptureSemaine = element.periode
    const d = new Date(firstMonday.getTime() + jourDansSeau * 86_400_000)
    ruptureDateIso = isoDay(d)
    restant = 0
    break
  }

  return {
    sorties12m: round2(sorties12m),
    joursFenetre,
    cmj: cmj === null ? null : round2(cmj),
    couvertureJours: couvertureJours === null ? null : round2(couvertureJours),
    stockMoyen: round2(stockMoyen),
    rotation: stockMoyen > 0 ? round2(sorties12m / stockMoyen) : null,
    couvertureProspectiveJours,
    ruptureSemaine,
    ruptureDateIso,
    ratioProspectifDelai:
      couvertureProspectiveJours !== null && delai !== null && delai > 0
        ? round2(couvertureProspectiveJours / delai)
        : null,
  }
}

export async function loadStockArticleDetail(
  params: StockArticleDetailParams
): Promise<StockArticleDetailResult> {
  const article = params.article.trim()
  if (!article) throw new StockDetailBadRequest('Article manquant')
  const refDate = params.referenceDate ?? new Date()

  const cacheKey = `detail:stock-article:${article}:${isoDay(refDate)}`
  return cache.namespace('stock').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: async (): Promise<StockArticleDetailResult> => {
      const history = await boardDataset.getStockArticleHistory(article, refDate)
      if (!history) return { detail: null, x3Error: null }

      const fromIso = isoDay(refDate)
      const horizon = new Date(refDate.getTime() + WEEKS * 7 * 86_400_000)
      const toIso = isoDay(horizon)

      let x3Error: string | null = null

      // --- Seaux hebdomadaires S+1 … S+52 ---
      const firstMonday = new Date(toMonday(refDate).getTime() + 7 * 86_400_000)
      const weeks: Array<{ key: string; label: string }> = []
      for (let i = 0; i < WEEKS; i++) {
        const monday = new Date(firstMonday.getTime() + i * 7 * 86_400_000)
        const key = isoWeekKey(monday)
        weeks.push({ key, label: `sem. ${key.slice(-2)}` })
      }
      const firstKey = weeks[0].key
      const lastKey = weeks[weeks.length - 1].key

      const byWeek = new Map<string, { besoin: number; ressource: number }>()
      for (const w of weeks) byWeek.set(w.key, { besoin: 0, ressource: 0 })

      // Seau d'un flux : sa semaine ISO, les retards (avant S+1) clampés en S+1.
      const bucketOf = (d: Date | null): string | null => {
        const k = d ? isoWeekKey(d) : firstKey
        if (k > lastKey) return null // au-delà de l'horizon
        return k < firstKey ? firstKey : k
      }

      // --- Flux futurs : requête ORDERS lean scopée à l'article ---
      try {
        const flows = await new CombinedOrdersRepository().fetchArticleFutureFlows(
          article,
          fromIso,
          toIso
        )
        for (const f of flows) {
          const k = bucketOf(f.date)
          if (!k) continue
          const b = byWeek.get(k)
          if (!b) continue
          // Besoins : demande client (articles vendus) + besoin composant des
          // OF (articles achetés/semi-finis). Ressources : réceptions + OF.
          if (f.kind === 'demande' || f.kind === 'composant') b.besoin += f.qty
          else b.ressource += f.qty
        }
      } catch (e) {
        logger.error({ err: e }, `[stock-detail] échec chargement flux futurs : ${article}`)
        x3Error =
          'Données X3 indisponibles — projection besoins/ressources momentanément incalculable.'
      }

      // --- Projection cumulée depuis le stock actuel, bornée à 0 ---
      const pmp = history.pmp
      const round2 = (v: number) => Math.round(v * 100) / 100
      let running = history.stock
      const future: StockFuturePoint[] = weeks.map((w) => {
        const { besoin, ressource } = byWeek.get(w.key)!
        running = Math.max(0, running + ressource - besoin)
        return {
          periode: w.key,
          label: w.label,
          besoinQte: round2(besoin),
          besoinVal: round2(besoin * pmp),
          ressourceQte: round2(ressource),
          ressourceVal: round2(ressource * pmp),
          stockQte: round2(running),
          stockVal: round2(running * pmp),
        }
      })

      return {
        detail: {
          ...history,
          future,
          indicateurs: computeIndicateurs(history, future, firstMonday, refDate),
        },
        x3Error,
      }
    },
  })
}

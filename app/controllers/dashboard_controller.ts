import { type HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import type { RetardChargeKpi } from '#repositories/retard_repository'
import { emptyProfondeur } from '#app/domain/retard_profondeur'
import { OtdRepository, resolveOtdPeriods } from '#repositories/otd_repository'
import type { OtdKpi, OtdMode } from '#repositories/otd_repository'
import { defaultStockRange } from '#repositories/stock_valuation_repository'
import type { StockValuationKpi, StockGrain } from '#repositories/stock_valuation_repository'
import boardDataset from '#services/board_dataset'
import { StockDetailBadRequest, loadStockArticleDetail } from '#services/stock_detail_loader'
import type { StockArticleDetail } from '#services/stock_detail_loader'
import { RETARD_LOOKBACK_DAYS } from '#services/suivi_service'

/**
 * L'utilisateur a-t-il VRAIMENT figé une date de référence ?
 *
 * `pinned` décide de la forme de la clé de cache : une valeur figée est portée
 * telle quelle, la plage glissante par défaut est réduite à ses buckets de
 * période pour que la clé ne tourne pas à minuit (cf. `board_dataset`).
 *
 * Le test était `Boolean(referenceDate)`. Or `index()` construit `kpisHref` avec
 * un `referenceDate` TOUJOURS présent, initialisé à aujourd'hui — donc `pinned`
 * valait toujours `true` sur `/api/v1/dashboard/kpis` :
 *
 * ```
 * préchauffage  retard-kpi:90                 ← getRetardKpi(new Date(), 90)
 * requête       retard-kpi:90:2026-08-01      ← pinned = true
 * ```
 *
 * Deux clés : le préchauffage remplissait une entrée que personne ne lisait.
 *
 * `/api/v1/dashboard/stock` n'est PAS concerné — `stockHref` n'embarque pas de
 * `referenceDate`, `pinned` y valait déjà `false` et les clés coïncident.
 *
 * Les ~10 s observées sur cet endpoint en mode direct, juste après un
 * préchauffage de 10 312 ms, ont été élucidées (#105, point 5) : ce n'est PAS
 * une clé de cache. La requête arrivait PENDANT que le préchauffage au boot
 * calculait la MÊME clé — le L1 étant vide (pas d'entrée à servir en grâce,
 * `timeout: 0` ne rend le stale que s'il existe), le lock de bentocache fait
 * attendre l'appelant jusqu'à la fin de la factory du préchauffage, puis il
 * partage son résultat : une seule computation, payée une fois par le premier
 * appelant. C'est le cold start assumé, pas un trou de cache (vérifié par un
 * banc : 3 s de factory + appelant concurrent = 3 s d'attente et valeur
 * partagée, contre 0 ms sur clé chaude).
 *
 * Deux cas où la requête ne profite PAS du préchauffage, tous deux voulus :
 *  - le cloisonnement par environnement (`cacheNs`) : un utilisateur dont
 *    `lastEnv` diffère de `X3_ENV` lit un namespace froid — « froid vaut mieux
 *    que faux » (cf. `cache_ns.ts`) ;
 *  - en dev, `CACHE_STORE=memory` meurt à chaque reload HMR : le préchauffage
 *    rejoue et la 1re requête le race. En prod (Redis) le L2 survit au restart.
 *
 * La correction porte sur le SENS : « figée » veut dire « différente du défaut
 * glissant », pas « présente dans la requête ». Une date d'aujourd'hui EST le
 * défaut, quelle que soit la façon dont elle arrive.
 *
 * Comparaison au jour près et en heure locale : c'est la granularité de la clé
 * (`toISOString().slice(0, 10)`) et celle du choix utilisateur.
 */
export function isPinnedDate(raw: unknown, parsed: Date): boolean {
  if (!raw || Number.isNaN(parsed.getTime())) return false
  const today = new Date()
  return (
    parsed.getFullYear() !== today.getFullYear() ||
    parsed.getMonth() !== today.getMonth() ||
    parsed.getDate() !== today.getDate()
  )
}

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Page d'accueil par défaut post-login.
 *
 * Même motif que /suivi : la coquille Inertia est rendue instantanément (aucun calcul X3),
 * les KPI (calcul lourd) sont chargés en différé via trois endpoints séparés :
 *   - /api/v1/dashboard/kpis  → charge en retard (stable, rechargé uniquement au refresh)
 *   - /api/v1/dashboard/otd   → OTD (volatile : mode + plage date changent côté client)
 *   - /api/v1/dashboard/stock → valorisation du stock sur 12 mois (AE1)
 *
 * Les expéditions (issue #44) vivent désormais dans leur propre onglet dédié
 * (/expeditions, ExpeditionsController) — retiré du dashboard car une carte résumée
 * ne suffisait pas à l'usage opérationnel (vérification camion par camion).
 */
export default class DashboardController {
  /** GET / — coquille du tableau de bord. */
  async index(ctx: HttpContext) {
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) ||
      new Date().toISOString().slice(0, 10)
    // Layout personnalisé de l'utilisateur (ordre / visibilité / largeur des KPI +
    // ordre d'impression). `getDashboardLayout()` garantit un objet complet.
    const layout = ctx.auth.user?.getDashboardLayout() ?? undefined
    return ctx.inertia.render('dashboard', {
      referenceDate,
      kpisHref: `/api/v1/dashboard/kpis?referenceDate=${encodeURIComponent(referenceDate)}`,
      otdHref: `/api/v1/dashboard/otd?referenceDate=${encodeURIComponent(referenceDate)}`,
      stockHref: `/api/v1/dashboard/stock`,
      layout,
    })
  }

  /** GET /api/v1/dashboard/kpis — charge en retard (ORDERS + ITMMVT + MFGOPE).
   *  Cache SWR global via boardDataset : 3 appels SOAP séquentiels (~23 s à froid)
   *  → servis depuis la grâce, le refresh part en arrière-plan. */
  async kpis(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const parsed = referenceDate ? new Date(referenceDate as string) : new Date()
    const refDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed
    // Une date invalide retomberait sur `Invalid Date`, dont le toISOString()
    // utilisé plus bas (et dans la clé de cache) lève.
    const pinned = isPinnedDate(referenceDate, parsed)

    let retardCharge: RetardChargeKpi = {
      totalHeures: 0,
      nbLignes: 0,
      postes: [],
      lignes: [],
      profondeur: emptyProfondeur(),
    }
    let x3Error: string | null = null

    try {
      retardCharge = await boardDataset.getRetardKpi(refDate, RETARD_LOOKBACK_DAYS, pinned)
    } catch (e) {
      logger.error({ err: e }, '[dashboard] kpis — échec chargement retard X3')
      x3Error = 'Données X3 indisponibles — KPI momentanément incalculable.'
    }

    return { retardCharge, x3Error, referenceDate: refDate.toISOString().slice(0, 10) }
  }

  /** GET /api/v1/dashboard/otd — OTD (volatile : mode + plage changent côté client). */
  async otd(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const rawMode = ctx.request.input('otdMode')
    const otdMode: OtdMode = rawMode === 'acceptee' ? 'acceptee' : 'demandee'

    const client = (ctx.request.input('client') as string | undefined)?.trim() || ''

    const otdFromParam = ctx.request.input('otdFrom')
    const otdToParam = ctx.request.input('otdTo')
    let periods: Array<{ from: Date; to: Date; label: string }>

    if (otdFromParam && otdToParam) {
      const from = new Date(otdFromParam)
      const to = new Date(otdToParam)
      const fmtD = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const label = otdFromParam === otdToParam ? fmtD(from) : `${fmtD(from)} → ${fmtD(to)}`
      periods = [{ from, to, label }]
    } else {
      periods = resolveOtdPeriods(refDate)
    }

    let otd: OtdKpi[] = []
    let x3Error: string | null = null
    const repo = new OtdRepository()

    const results = await Promise.allSettled(
      periods.map((p) => repo.getOtd(p.from, p.to, p.label, otdMode, client || undefined))
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        otd.push(r.value)
      } else {
        logger.error({ err: r.reason }, '[dashboard] otd — échec chargement X3')
        if (!x3Error) x3Error = 'Données X3 indisponibles — OTD momentanément incalculable.'
      }
    }

    return { otd, x3Error }
  }

  /** GET /api/v1/dashboard/stock — valorisation du stock sur une plage (AE1).
   *  Cache SWR global via boardDataset (7 appels SOAP → 1/2min pour toute l'app). */
  async stockValuation(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate as string) : new Date()
    const safeRef = Number.isNaN(refDate.getTime()) ? new Date() : refDate

    const rawGrain = ctx.request.input('stockGrain')
    const grain: StockGrain = rawGrain === 'semaine' ? 'semaine' : 'mois'

    const fromParam = ctx.request.input('stockFrom')
    const toParam = ctx.request.input('stockTo')
    // Résout la plage concrète (défaut = 12 périodes glissantes) pour que la clé
    // de cache soit stable, même si l'utilisateur n'a pas fourni de plage.
    // `pinned` distingue les deux cas côté cache : une plage / une référence
    // explicite est portée telle quelle dans la clé, la plage glissante par
    // défaut est réduite à ses buckets de période (sinon la clé tourne à minuit
    // et le 1er hit du jour repaie le mur froid X3).
    let from: Date
    let to: Date
    // Cf. `isPinnedDate` : le front envoie toujours `referenceDate`, une date
    // d'aujourd'hui est donc le DÉFAUT et ne doit pas figer la clé.
    let pinned = isPinnedDate(referenceDate, refDate)
    if (fromParam && toParam) {
      const f = new Date(fromParam as string)
      const t = new Date(toParam as string)
      // Retombe sur la plage par défaut si les dates sont invalides.
      const valid = !Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())
      const range = valid ? { from: f, to: t } : defaultStockRange(grain, safeRef)
      if (valid) pinned = true
      from = range.from
      to = range.to
    } else {
      const range = defaultStockRange(grain, safeRef)
      from = range.from
      to = range.to
    }

    let stockValuation: StockValuationKpi = {
      grain,
      series: [],
      totalActuel: 0,
      totalDebut: 0,
      deltaPct: 0,
      categories: [],
      articles: [],
      nbArticles: 0,
    }
    let x3Error: string | null = null

    try {
      stockValuation = await boardDataset.getStockValuation(grain, from, to, safeRef, pinned)
    } catch (e) {
      logger.error({ err: e }, '[dashboard] stock — échec chargement valorisation X3')
      x3Error = 'Données X3 indisponibles — valorisation momentanément incalculable.'
    }

    return { stockValuation, x3Error }
  }

  /** GET /api/v1/dashboard/stock/article — historique hebdo d'un article (AE1)
   *  + projection 52 semaines (besoins/ressources, cf. loadStockArticleDetail).
   *  Alimente la sheet de détail ouverte au clic d'une ligne du KPI stock. */
  async stockArticleDetail(ctx: HttpContext) {
    const article = (ctx.request.input('article') as string | undefined)?.trim()
    if (!article) {
      return ctx.response.badRequest({ error: 'Paramètre article manquant' })
    }

    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate as string) : new Date()
    const safeRef = Number.isNaN(refDate.getTime()) ? new Date() : refDate

    let detail: StockArticleDetail | null = null
    let x3Error: string | null = null

    try {
      ;({ detail, x3Error } = await loadStockArticleDetail({
        article,
        referenceDate: safeRef,
      }))
    } catch (e) {
      if (e instanceof StockDetailBadRequest) {
        return ctx.response.badRequest({ error: e.message })
      }
      logger.error({ err: e }, '[dashboard] stock article — échec chargement détail')
      x3Error = 'Données X3 indisponibles — détail momentanément incalculable.'
    }

    if (!detail && !x3Error) {
      return ctx.response.notFound({ error: `Article inconnu : ${article}` })
    }

    return { detail, x3Error }
  }
}

import { type HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import logger from '@adonisjs/core/services/logger'
import { ConditionnementRepository } from '#repositories/conditionnement_repository'
import boardDataset from '#services/board_dataset'
import {
  evaluerConcordance,
  type EstimationResult,
  type EstimationsPaire,
} from '#app/domain/conditionnement_estimator'

/**
 * Page « Conditionnements » : vue COMPLÈTE des articles actifs (complets ou non),
 * avec leurs coefs de conditionnement référencés + estimation US/palette via
 * STOCK (SM*) + STOJOU (rangement REC) + contexte opérationnel (fournisseur,
 * dernières entrée/sortie).
 *
 * Outil de pilotage référentiel : on voit d'un coup l'état du conditionnement de
 * tous les articles (taux de remplissage), on filtre sur les manquants, et on
 * compare les deux estimations pour valider.
 *
 * **Chargement en 2 temps** (cold start maîtrisé) :
 *  1. `rows` (fast, ~1s) : articles seuls (ITMMASTER) + stats. Affichage immédiat
 *     du tableau, filtres et KPI disponibles.
 *  2. `estimations` (lazy, déclenché par l'utilisateur) : estimations STOCK/STOJOU
 *     + mouvements récents (coûteux : SOAP agrégeant STOJOU illimité). Chargés
 *     quand l'utilisateur active le filtre « manquants » ou clique sur un bouton.
 */

/** Une source d'estimation (STOCK ou STOJOU), pré-formatée pour le frontend. */
export interface EstimationSourceDisplay {
  usParPalette: number
  confiance: 'ok' | 'faible'
  observations: number
}

/** État du conditionnement référencé (filtre dynamique côté frontend). */
export type EtatCoef = 'complet' | 'manquant_0' | 'manquant_1' | 'manquant_les_deux'

/** Article pré-formaté (sans estimations — chargées séparément). */
export interface ConditionnementDisplayRow {
  article: string
  designation: string
  categorie: string | null
  pcuStuCoe: number | null
  ucParPal: number | null
  etatCoef: EtatCoef
  codeFrnsr: string | null
  nomFrnsr: string | null
}

/** Enrichissement d'un article : estimations + mouvements (chargés en lazy). */
export interface ArticleEnrichissement {
  stock: EstimationSourceDisplay | null
  stojou: EstimationSourceDisplay | null
  derniereEntree: string | null
  typeEntree: string | null
  derniereSortie: string | null
  typeSortie: string | null
  /** Concordance des 3 sources (UC/pal ITMMASTER, STOCK, STOJOU). */
  concordance: {
    niveau: 0 | 1 | 2 | 3
    nbSources: number
    nbConcordantes: number
  }
}

export interface ConditionnementsRowsResponse {
  rows: ConditionnementDisplayRow[]
  /** URL de l'endpoint d'enrichissement (estimations + mouvements), lazy. */
  estimationsHref: string
  stats: {
    totalArticles: number
    nbComplets: number
    nbManquant0: number
    nbManquant1: number
    nbManquantLesDeux: number
    tauxRemplissage: number
  }
  x3Error: string | null
}

/** Réponse de l'endpoint d'enrichissement : Map article → enrichissement. */
export interface EstimationsResponse {
  [article: string]: ArticleEnrichissement
}

/** Déduit l'état du conditionnement depuis les coefs. */
function etatDepuisCoefs(pcuStuCoe: number | null, ucParPal: number | null): EtatCoef {
  const has0 = pcuStuCoe !== null && pcuStuCoe > 0
  const has1 = ucParPal !== null && ucParPal > 0
  if (has0 && has1) return 'complet'
  if (has0 && !has1) return 'manquant_1'
  if (!has0 && has1) return 'manquant_0'
  return 'manquant_les_deux'
}

export default class ConditionnementsController {
  /** GET /conditionnements — coquille Inertia (instantanée, aucun calcul X3). */
  async index(ctx: HttpContext) {
    const rowsHref = '/api/v1/conditionnements/rows'
    return ctx.inertia.render('conditionnements', { rowsHref })
  }

  /** GET /api/v1/conditionnements/rows — articles seuls (FAST, ITMMASTER instantané). */
  async rows(_ctx: HttpContext) {
    const condCache = () => cache.namespace('conditionnements')

    let rows: ConditionnementDisplayRow[] = []
    let stats: ConditionnementsRowsResponse['stats'] = {
      totalArticles: 0,
      nbComplets: 0,
      nbManquant0: 0,
      nbManquant1: 0,
      nbManquantLesDeux: 0,
      tauxRemplissage: 0,
    }
    let x3Error: string | null = null

    try {
      const cached = await condCache().getOrSet({
        key: 'rows',
        ttl: 5 * 60 * 1000,
        timeout: 0,
        factory: async () => this.computeRows(),
      })
      rows = cached.rows
      stats = cached.stats
    } catch (e) {
      logger.error({ err: e }, '[conditionnements] rows — échec chargement X3')
      x3Error = 'Données X3 indisponibles — conditionnements momentanément incalculables.'
    }

    const response: ConditionnementsRowsResponse = {
      rows,
      stats,
      estimationsHref: '/api/v1/conditionnements/estimations',
      x3Error,
    }
    return response
  }

  /**
   * GET /api/v1/conditionnements/estimations — enrichissement LAZY (coûteux).
   * Estimations STOCK/STOJOU + mouvements récents, pour les articles au coef
   * manquant uniquement (les complets n'ont pas besoin de ce contexte).
   *
   * Param `articles` (query, CSV) : restreint aux articles demandés par le filtre
   * frontend (ex. seulement les manquants visibles), pour limiter le calcul.
   */
  async estimations(ctx: HttpContext) {
    const condCache = () => cache.namespace('conditionnements')
    const articlesParam = (ctx.request.input('articles') as string | undefined)?.trim()
    const articles = articlesParam
      ? articlesParam
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : []
    const cacheKey = `estim:${articles.length}` // pas du contenu exact (trop long) — taille suffit

    let enrichissements: EstimationsResponse = {}
    let x3Error: string | null = null

    try {
      const cached = await condCache().getOrSet({
        key: cacheKey,
        ttl: 5 * 60 * 1000,
        timeout: 0,
        factory: async () => this.computeEnrichissements(articles),
      })
      enrichissements = cached
    } catch (e) {
      logger.error({ err: e }, '[conditionnements] estimations — échec chargement X3')
      x3Error = 'Données X3 indisponibles — estimations momentanément incalculables.'
    }

    return { enrichissements, x3Error }
  }

  /** Mappe une EstimationResult vers sa forme display. */
  private toDisplay(e: EstimationResult): EstimationSourceDisplay {
    return { usParPalette: e.usParPalette, confiance: e.confiance, observations: e.observations }
  }

  /** Calcule les articles seuls (fast) + KPI. */
  private async computeRows(): Promise<Pick<ConditionnementsRowsResponse, 'rows' | 'stats'>> {
    const articles = await new ConditionnementRepository().getArticles()
    const rows: ConditionnementDisplayRow[] = articles.map((a) => ({
      article: a.article,
      designation: a.designation,
      categorie: a.categorie,
      pcuStuCoe: a.pcuStuCoe,
      ucParPal: a.ucParPal,
      etatCoef: etatDepuisCoefs(a.pcuStuCoe, a.ucParPal),
      codeFrnsr: a.codeFrnsr,
      nomFrnsr: a.nomFrnsr,
    }))

    const nbComplets = rows.filter((r) => r.etatCoef === 'complet').length
    const nbManquant0 = rows.filter((r) => r.etatCoef === 'manquant_0').length
    const nbManquant1 = rows.filter((r) => r.etatCoef === 'manquant_1').length
    const nbManquantLesDeux = rows.filter((r) => r.etatCoef === 'manquant_les_deux').length

    return {
      rows,
      stats: {
        totalArticles: rows.length,
        nbComplets,
        nbManquant0,
        nbManquant1,
        nbManquantLesDeux,
        tauxRemplissage: rows.length > 0 ? nbComplets / rows.length : 0,
      },
    }
  }

  /** Calcule les enrichissements (estimations + mouvements + concordance). */
  private async computeEnrichissements(articlesFiltres: string[]): Promise<EstimationsResponse> {
    const repo = new ConditionnementRepository()

    // Récupère tous les articles (pour les coefs + la liste à enrichir).
    const tous = await repo.getArticles()
    const coefParArticle = new Map<string, number | null>()
    for (const a of tous) coefParArticle.set(a.article, a.ucParPal)

    // Si pas d'articles fournis, on enrichit TOUS les articles (complets et
    // manquants) — l'utilisateur veut comparer les estimations même pour les
    // articles complets (vérifier la cohérence des coefs référencés).
    const articlesAEnrichir =
      articlesFiltres.length > 0 ? articlesFiltres : tous.map((a) => a.article)

    const [estimator, mouvements] = await Promise.all([
      boardDataset.getConditionnementEstimator().catch((e) => {
        logger.warn(
          { err: e },
          '[conditionnements] estimateur indisponible — repli sans estimation'
        )
        return new Map<string, EstimationsPaire>()
      }),
      repo.getMouvementsRecents(articlesAEnrichir).catch((e) => {
        logger.warn(
          { err: e },
          '[conditionnements] mouvements récents indisponibles — repli sans dates'
        )
        return new Map<
          string,
          {
            derniereEntree: string | null
            typeEntree: string | null
            derniereSortie: string | null
            typeSortie: string | null
          }
        >()
      }),
    ])

    const out: EstimationsResponse = {}
    for (const article of articlesAEnrichir) {
      const paire = estimator.get(article) ?? null
      const mvt = mouvements.get(article)
      const ucParPal = coefParArticle.get(article) ?? null
      const concordance = evaluerConcordance(ucParPal, paire?.stock ?? null, paire?.stojou ?? null)
      out[article] = {
        stock: paire?.stock ? this.toDisplay(paire.stock) : null,
        stojou: paire?.stojou ? this.toDisplay(paire.stojou) : null,
        derniereEntree: mvt?.derniereEntree ?? null,
        typeEntree: mvt?.typeEntree ?? null,
        derniereSortie: mvt?.derniereSortie ?? null,
        typeSortie: mvt?.typeSortie ?? null,
        concordance,
      }
    }
    return out
  }
}

import { type HttpContext } from '@adonisjs/core/http'
import {
  DEFAULT_HORIZON_DAYS,
  loadApproPayload,
  type ApproPayloadResult,
} from '#services/appro_payload_loader'
import demandSnapshotService from '#services/demand_snapshot_service'
import {
  cleLogiqueSuggestion,
  estCleMessage,
  isApproDecisionStatut,
} from '#app/domain/appro_decision'
import { ApproDecisionRepository } from '#app/repositories/appro_decision_repository'
import { fenetreValide } from '#app/domain/snapshot_couverture'
import articleExplanationService, {
  ArticleExplanationBadRequest,
  ArticleExplanationNotFound,
} from '#services/article_explanation_service'

/**
 * Page « Approvisionnements » (issue #103) : ce que le CBN de X3 propose côté
 * achat, groupé par fournisseur.
 *
 * Deux populations dans la même file :
 *  - les **suggestions d'achat** (« il faudrait commander ») ;
 *  - les **messages de replanification** sur commandes déjà passées (« avance
 *    celle-ci », « décale celle-là », « celle-ci ne sert plus »).
 *
 * La seconde est de loin la plus volumineuse à horizon court — 251 lignes
 * actionnables sous un mois contre 32 suggestions, mesuré le 01/08/2026 — alors
 * que rien ne l'affichait nulle part jusqu'ici.
 *
 * **Verdicts de triage (lot 1 #103).** Chaque ligne porte le verdict du moteur
 * déterministe (`appro_triage.ts`, rattaché par `attacheTriage` dans le loader) —
 * passer / surveiller / regrouper / replanifier / investiguer — avec sa preuve
 * sourcée. L'écran montre aussi l'échéance brute : le verdict aide à décider,
 * il ne remplace pas la donnée.
 *
 * Même motif que /receptions, /expeditions, /ruptures : coquille Inertia
 * instantanée, calcul X3 différé via `/api/v1/appro/rows`.
 */
export default class ApproController {
  /** GET /approvisionnements — coquille Inertia, aucun appel X3. */
  async index(ctx: HttpContext) {
    // Sans paramètre `horizon` → vue dérivée du délai (décision #114) ;
    // `horizon=30|60|90` → fenêtre fixe (bascule).
    const horizon = Number(ctx.request.input('horizon')) || null
    return ctx.inertia.render('approvisionnements', {
      horizon,
      rowsHref: horizon === null ? `/api/v1/appro/rows` : `/api/v1/appro/rows?horizon=${horizon}`,
      defaultHorizon: DEFAULT_HORIZON_DAYS,
    })
  }

  /** GET /api/v1/appro/rows — la file elle-même (X3 + cache SWR). */
  async rows(ctx: HttpContext) {
    const horizon = Number(ctx.request.input('horizon')) || null
    const payload: ApproPayloadResult = await loadApproPayload(horizon)
    return ctx.response.json(payload)
  }

  /**
   * POST /api/v1/appro/decision — enregistre une décision acheteur (ledger
   * append-only #134, décision #112). Rien n'est écrit dans X3 en v1.
   *
   * Corps : `{ nature: 'suggestion', statut, article, fournisseur, echeance,
   * quantite, causePredit?, confiancePredit?, verdictPredit? }` — la clé est le
   * couple fournisseur × article, l'échéance et la quantité sont stockées comme
   * instantané pour la tolérance #112 ; ou `{ nature: 'message', statut, cle,
   * article, causePredit?, confiancePredit?, verdictPredit? }` — la clé stable
   * (#107) est reprise TELLE QUELLE de la ligne affichée.
   *
   * `causePredit` / `confiancePredit` / `verdictPredit` (#138 lot 2) : ce que
   * le moteur d'explication et le triage disaient au moment de la décision,
   * figés pour l'auto-évaluation. Optionnels — une ligne sans explication n'a
   * rien à figer.
   *
   * Le client ne rebâtit jamais une clé : il renvoie celle qu'il a reçue. Un
   * découpage puis une reconstruction `M:numero:ligne` de part et d'autre du
   * réseau, c'est deux définitions d'un même format qui peuvent diverger.
   */
  async decide(ctx: HttpContext) {
    const body = ctx.request.body() as Record<string, unknown>
    const nature = body.nature === 'message' ? 'message' : 'suggestion'
    const statut = body.statut

    if (!isApproDecisionStatut(statut)) {
      return ctx.response.badRequest({ error: `statut invalide : ${String(statut)}` })
    }

    const repo = new ApproDecisionRepository()
    let cleLogique: string
    const article = String(body.article ?? '')
    const fournisseur: string | null =
      body.fournisseur === null || body.fournisseur === undefined ? null : String(body.fournisseur)
    const quantite = Number(body.quantite ?? 0)
    const echeance: string | null =
      body.echeance === null || body.echeance === undefined ? null : String(body.echeance)
    const causePredit: string | null =
      body.causePredit === null || body.causePredit === undefined ? null : String(body.causePredit)
    const confianceBrut = body.confiancePredit === '' ? Number.NaN : Number(body.confiancePredit)
    const confiancePredit: number | null =
      body.confiancePredit === null ||
      body.confiancePredit === undefined ||
      !Number.isFinite(confianceBrut) ||
      confianceBrut < 0 ||
      confianceBrut > 1
        ? null
        : Math.round(confianceBrut * 100) / 100
    const verdictPredit: string | null =
      body.verdictPredit === null || body.verdictPredit === undefined
        ? null
        : String(body.verdictPredit)
    const niveauxConnus = ['directe', 'probable', 'correlation', 'non_explique']
    const niveauBrut =
      body.niveauPredit === null || body.niveauPredit === undefined
        ? null
        : String(body.niveauPredit)
    const niveauPredit: string | null =
      niveauBrut !== null && niveauxConnus.includes(niveauBrut) ? niveauBrut : null

    if (nature === 'suggestion') {
      if (article === '') {
        return ctx.response.badRequest({ error: 'suggestion : article requis' })
      }
      cleLogique = cleLogiqueSuggestion(fournisseur ?? '', article)
    } else {
      const cle = String(body.cle ?? '')
      if (!estCleMessage(cle)) {
        return ctx.response.badRequest({ error: `message : clé « ${cle} » invalide` })
      }
      cleLogique = cle
    }

    const row = await repo.record({
      cleLogique,
      nature,
      statut,
      article,
      fournisseur,
      quantite,
      echeance,
      causePredit,
      confiancePredit,
      niveauPredit,
      verdictPredit,
    })
    return ctx.response.json({ cleLogique, statut, decidedAt: row.decidedAt })
  }

  /**
   * GET /api/v1/appro/messages-diff — diff des messages de replanification (#138 lot 1)
   * entre deux photos `appro_message_snapshots`. Par défaut les deux dernières.
   */
  async messagesDiff(ctx: HttpContext) {
    const avantQ = ctx.request.input('avant') as string | undefined
    const apresQ = ctx.request.input('apres') as string | undefined
    const fenetreQ = fenetreValide(ctx.request.input('fenetre'))
    let avant: string | null = avantQ ?? null
    let apres: string | null = apresQ ?? null
    if (avant === null || apres === null) {
      const jours =
        fenetreQ !== null
          ? await demandSnapshotService.photosMessagesFenetre(fenetreQ)
          : await demandSnapshotService.deuxDernieresPhotosMessages()
      if (jours === null) {
        return ctx.response.json({
          avant: null,
          apres: null,
          parNature: null,
          entrees: [],
          message: 'photo(s) messages indisponible(s) — le diff a besoin de deux photos',
        })
      }
      ;[apres, avant] = jours
    }
    const result = await demandSnapshotService.diffMessages(apres, avant)
    if (result === null) {
      return ctx.response.json({
        avant,
        apres,
        parNature: null,
        entrees: [],
        message: 'photo(s) illisible(s) — le diff messages a besoin de deux photos comparables',
      })
    }
    return ctx.response.json(result)
  }

  /**
   * GET /api/v1/appro/diff — diff inter-CBN des suggestions (#133) entre les
   * deux dernières photos (`demand_snapshots`, source `appro_suggestion`).
   *
   * Les deux jours sont LUS EN BASE, pas déduits de la date du jour : un run
   * nocturne manqué, un lundi matin ou une photo prise le week-end rendaient
   * sinon « indisponible » alors que deux photos comparables existent. Deux
   * photos restent nécessaires — `parNature: null` sur un trou de données,
   * jamais un faux « tout est apparu ».
   */
  async diff(ctx: HttpContext) {
    const jours = await demandSnapshotService.deuxDernieresPhotosAppro()
    if (jours === null) {
      return ctx.response.json({
        avant: null,
        apres: null,
        parNature: null,
        entrees: [],
        message:
          'photo(s) indisponible(s) — le diff inter-CBN a besoin de deux photos des suggestions',
      })
    }
    const [apres, avant] = jours
    const result = await demandSnapshotService.diffAppro(apres, avant)
    if (result === null) {
      return ctx.response.json({
        avant,
        apres,
        parNature: null,
        entrees: [],
        message: 'photo(s) illisible(s) — le diff inter-CBN a besoin de deux photos comparables',
      })
    }
    return ctx.response.json(result)
  }

  /**
   * GET /api/v1/appro/article-explanation — explication d'un message (tickets 02+04+05).
   * Compose grille time-phased + pegging (02, question A, cache TTL 04h via
   * article_explanation_service) et diff temporel SQLite (04, question B,
   * lui-même getOrSetForever). Périmètre V1 : MRPMES_0=2 uniquement, sinon
   * {supporte:false}. Composition explicite pour éviter le conflit silencieux
   * où l'un écrase l'autre (revue 04) — 05 conserve la jonction.
   * Shape public `diff: { depuis, entrees }` sans `message` interne (revue 04).
   */
  async articleExplanation(ctx: HttpContext) {
    const article = String(ctx.request.input('article') ?? '').trim()
    const cle = String(ctx.request.input('cle') ?? '').trim()
    if (!article) return ctx.response.badRequest({ error: 'article requis' })
    if (!cle) return ctx.response.badRequest({ error: 'cle requis (format VCRNUM:VCRLIN:VCRSEQ)' })
    const diffRaw = await demandSnapshotService.diffTemporel(article, cle)
    if (diffRaw === null) {
      return ctx.response.badRequest({
        error: `cle « ${cle} » invalide — format attendu VCRNUM:VCRLIN:VCRSEQ`,
      })
    }
    const diff = { depuis: diffRaw.depuis, entrees: diffRaw.entrees }
    try {
      const grilleResult = await articleExplanationService.explain(article, cle)
      if ((grilleResult as { supporte: boolean }).supporte === false) {
        return ctx.response.json({ ...grilleResult, article, cle, diff })
      }
      return ctx.response.json({ ...(grilleResult as object), diff })
    } catch (e) {
      if (e instanceof ArticleExplanationBadRequest) {
        return ctx.response.badRequest({ error: e.message })
      }
      if (e instanceof ArticleExplanationNotFound) {
        return ctx.response.notFound({ error: e.message })
      }
      throw e
    }
  }
}

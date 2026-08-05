import { type HttpContext } from '@adonisjs/core/http'
import {
  DEFAULT_HORIZON_DAYS,
  loadApproPayload,
  type ApproPayloadResult,
} from '#services/appro_payload_loader'

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
}

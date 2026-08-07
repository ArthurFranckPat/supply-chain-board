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
   * quantite }` — la clé est le couple fournisseur × article, l'échéance et la
   * quantité sont stockées comme instantané pour la tolérance #112 ; ou
   * `{ nature: 'message', statut, cle, article }` — la clé stable (#107) est
   * reprise TELLE QUELLE de la ligne affichée.
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
    let avant: string | null = avantQ ?? null
    let apres: string | null = apresQ ?? null
    if (avant === null || apres === null) {
      const jours = await demandSnapshotService.deuxDernieresPhotosMessages()
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

  /** GET /api/v1/appro/snapshots — liste des photos disponibles (§5.1). */
  async snapshots(ctx: HttpContext) {
    const photos = await demandSnapshotService.listSnapshots()
    return ctx.response.json({ photos })
  }

  /**
   * GET /api/v1/appro/drivers-diff — diff des drivers par article (#138 lot 1).
   * Query: ?avant=YYYY-MM-DD&apres=YYYY-MM-DD&source=a,b&nature=x,y&limit=200
   * Filtres et tri après cache (§5.3, §5.4) — total avant bornage.
   */
  async driversDiff(ctx: HttpContext) {
    const avantQ = ctx.request.input('avant') as string | undefined
    const apresQ = ctx.request.input('apres') as string | undefined
    let avant: string | null = avantQ ?? null
    let apres: string | null = apresQ ?? null
    if (avant === null || apres === null) {
      // Calendrier PROPRE aux drivers, et non celui des messages : depuis le
      // garde-fou par source (#138 lot 0), une extraction CBN en échec laisse
      // `demand_snapshots` avancer d'un jour sans `appro_message_snapshots`.
      // Emprunter les jours des messages ferait alors demander un diff sur des
      // jours où la photo du besoin n'existe pas — `null`, et un écran vide
      // sans raison lisible. `/explanations` croise les deux et impose, lui,
      // le calendrier des messages : c'est son objet.
      const jours = await demandSnapshotService.deuxDernieresPhotosBesoin()
      if (jours === null) {
        return ctx.response.json({
          avant: null,
          apres: null,
          total: 0,
          entrees: [],
          message: 'photo(s) drivers indisponible(s) — besoin de deux photos',
        })
      }
      ;[apres, avant] = jours
    }
    const result = await demandSnapshotService.diffDrivers(apres, avant)
    if (result === null) {
      return ctx.response.json({
        avant,
        apres,
        total: 0,
        entrees: [],
        message: 'photo(s) illisible(s) — diff drivers indisponible',
      })
    }

    // Filtres serveur (§5.3) — appliqués APRÈS le cache sur le résultat complet.
    const sourceQ = ctx.request.input('source') as string | undefined
    const natureQ = ctx.request.input('nature') as string | undefined
    const limitQ = ctx.request.input('limit') as string | undefined

    // Agrégats pour le bandeau (§6) — calculés sur le diff complet AVANT filtres,
    // sinon les tuiles changeraient de valeur au clic (effet de filtre croisé).
    const parSource: Record<string, number> = {}
    const parNature: Record<string, number> = {}
    for (const e of result.entrees) {
      parSource[e.source] = (parSource[e.source] ?? 0) + 1
      parNature[e.nature] = (parNature[e.nature] ?? 0) + 1
    }

    let entrees = result.entrees
    if (sourceQ) {
      const wanted = new Set(
        sourceQ
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
      if (wanted.size > 0) entrees = entrees.filter((e) => wanted.has(e.source))
    }
    if (natureQ) {
      const wanted = new Set(
        natureQ
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
      if (wanted.size > 0) entrees = entrees.filter((e) => wanted.has(e.nature))
    }

    const total = entrees.length
    let limit = limitQ !== undefined ? Number(limitQ) : 200
    if (!Number.isFinite(limit) || limit <= 0) limit = 200
    limit = Math.min(Math.max(Math.floor(limit), 1), 1000)
    const sliced = entrees.slice(0, limit)

    return ctx.response.json({
      avant: result.avant,
      apres: result.apres,
      total,
      parSource,
      parNature,
      entrees: sliced,
    })
  }

  /** GET /besoins/evolution — page Évolution des besoins (§5.5). */
  async evolution(ctx: HttpContext) {
    return ctx.inertia.render('besoins-evolution' as never, {} as never)
  }

  /**
   * GET /api/v1/appro/explanations — croisement messages × drivers (#138 lot 1).
   * Rend par message les corrélations convergentes triées par poids, et les
   * contradictions. Jamais "cause", seulement corrélation.
   */
  async explanations(ctx: HttpContext) {
    const avantQ = ctx.request.input('avant') as string | undefined
    const apresQ = ctx.request.input('apres') as string | undefined
    let avant: string | null = avantQ ?? null
    let apres: string | null = apresQ ?? null
    if (avant === null || apres === null) {
      const jours = await demandSnapshotService.deuxDernieresPhotosMessages()
      if (jours === null) {
        return ctx.response.json({
          avant: null,
          apres: null,
          nbMessages: 0,
          nbDrivers: 0,
          explications: [],
          message: 'photo(s) indisponible(s) — explications nécessitent deux photos',
        })
      }
      ;[apres, avant] = jours
    }
    const result = await demandSnapshotService.explainMessages(apres, avant)
    if (result === null) {
      return ctx.response.json({
        avant,
        apres,
        nbMessages: 0,
        nbDrivers: 0,
        explications: [],
        message: 'photo(s) illisible(s) — explications indisponibles',
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
}

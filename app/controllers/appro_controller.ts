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
  autoEvaluation,
} from '#app/domain/appro_decision'
import { ApproDecisionRepository } from '#app/repositories/appro_decision_repository'
import { fenetreValide } from '#app/domain/snapshot_couverture'
import { compteurVide, construireFrise } from '#app/domain/diff_frise'
import {
  DRIVER_DIFF_NATURES,
  DRIVER_SOURCES,
  type DriverDiffEntry,
} from '#app/domain/cbn_driver_diff'
import { estIsoDayValide } from '#app/utils/dates'
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
    // Une chaîne vide doit rester `null`, pas devenir 0 : `Number('') === 0`,
    // et une confiance prédite à 0 changerait silencieusement le sens de
    // l'auto-évaluation (une ligne sans prédiction ne doit pas peser comme une
    // prédiction à confiance nulle).
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
    // Le niveau est le SEUL des quatre que l'acheteur voit à l'écran : c'est
    // celui qui rend l'auto-évaluation lisible (« les explications présentées
    // comme sûres sont-elles moins contredites ? »). Liste fermée, pour qu'un
    // client bavard ne crée pas des colonnes de tableau de bord fantômes.
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
    const fenetreQ = fenetreValide(ctx.request.input('fenetre'))
    // Défaut 6 (#143) : un format absurde retombait silencieusement sur
    // « moins de deux photos », un message qui décrit les DONNÉES alors que
    // c'est le PARAMÈTRE qui est mauvais. Knex paramétrise déjà (pas
    // d'injection) — ceci est une histoire de message honnête, pas de sécurité.
    if (avantQ !== undefined && !estIsoDayValide(avantQ)) {
      return ctx.response.badRequest({
        error: `paramètre « avant » invalide : « ${avantQ} » — format attendu AAAA-MM-JJ`,
      })
    }
    if (apresQ !== undefined && !estIsoDayValide(apresQ)) {
      return ctx.response.badRequest({
        error: `paramètre « apres » invalide : « ${apresQ} » — format attendu AAAA-MM-JJ`,
      })
    }
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
      const jours =
        fenetreQ !== null
          ? await demandSnapshotService.photosBesoinFenetre(fenetreQ)
          : await demandSnapshotService.deuxDernieresPhotosBesoin()
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
    // Aucune source commune aux deux photos (#145) : le diff est vide parce
    // qu'il n'y avait RIEN à comparer. Le rendre comme un diff nominal ferait
    // afficher « aucune source n'a bougé » sous un bandeau qui dit l'inverse.
    if (result.message !== null) {
      return ctx.response.json({
        avant: result.avant,
        apres: result.apres,
        total: 0,
        entrees: [],
        sourcesEcartees: result.sourcesEcartees,
        sourcesComparees: result.sourcesComparees,
        message: result.message,
      })
    }

    // Filtres serveur (§5.3) — appliqués APRÈS le cache sur le résultat complet.
    const sourceQ = ctx.request.input('source') as string | undefined
    const natureQ = ctx.request.input('nature') as string | undefined
    const limitQ = ctx.request.input('limit') as string | undefined

    // Agrégats pour le bandeau (§6) — calculés sur le diff complet AVANT filtres,
    // sinon les tuiles changeraient de valeur au clic (effet de filtre croisé).
    const parSource = compteurVide(DRIVER_SOURCES)
    const parNature = compteurVide(DRIVER_DIFF_NATURES)
    for (const e of result.entrees) {
      parSource[e.source] += 1
      parNature[e.nature] += 1
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
      sourcesEcartees: result.sourcesEcartees,
      sourcesComparees: result.sourcesComparees,
    })
  }

  /**
   * GET /api/v1/appro/drivers-frise — frise des drivers sur une plage (#143).
   * Query: ?avant=YYYY-MM-DD&apres=YYYY-MM-DD&source=a,b&nature=x,y&limit=1000
   *
   * Chaîne les diffs de chaque paire consécutive de photos de la plage (au lieu
   * de comparer les deux bornes : un besoin avancé puis reculé s'y lisait
   * « inchangé ») et agrège le tout par article, daté du jour du pas.
   * Les trous de la série (photo attendue manquante) sont rendus à part.
   * Filtres et bornage après cache — mêmes sémantiques que `/drivers-diff`.
   */
  async driversFrise(ctx: HttpContext) {
    const avantQ = ctx.request.input('avant') as string | undefined
    const apresQ = ctx.request.input('apres') as string | undefined
    // Défaut 6 (#143) — même trou, même traitement que `/drivers-diff`.
    if (avantQ !== undefined && !estIsoDayValide(avantQ)) {
      return ctx.response.badRequest({
        error: `paramètre « avant » invalide : « ${avantQ} » — format attendu AAAA-MM-JJ`,
      })
    }
    if (apresQ !== undefined && !estIsoDayValide(apresQ)) {
      return ctx.response.badRequest({
        error: `paramètre « apres » invalide : « ${apresQ} » — format attendu AAAA-MM-JJ`,
      })
    }
    let avant: string | null = avantQ ?? null
    let apres: string | null = apresQ ?? null
    if (avant === null || apres === null) {
      const jours = await demandSnapshotService.deuxDernieresPhotosBesoin()
      if (jours === null) {
        return ctx.response.json({
          avant: null,
          apres: null,
          total: 0,
          pas: [],
          trous: [],
          articles: [],
          message: 'photo(s) drivers indisponible(s) — la frise a besoin d’au moins deux photos',
        })
      }
      ;[apres, avant] = jours
    }
    // Plage inversée (sélection avant > apres) : la frise est symétrique en
    // temps — la chaîne va toujours de la photo la plus ancienne à la plus
    // récente —, normaliser les bornes plutôt que de répondre « illisible »
    // sur un `whereBetween` inversé.
    if (avant !== null && apres !== null && avant > apres) {
      ;[avant, apres] = [apres, avant]
    }
    const result = await demandSnapshotService.friseDrivers(apres, avant)
    if (result === null) {
      return ctx.response.json({
        avant,
        apres,
        total: 0,
        pas: [],
        trous: [],
        articles: [],
        message: 'moins de deux photos dans la plage sélectionnée — frise indisponible',
      })
    }
    if (result.message !== null) {
      return ctx.response.json({
        avant: result.avant,
        apres: result.apres,
        total: 0,
        pas: [],
        trous: result.trous,
        articles: [],
        message: result.message,
      })
    }

    // Agrégats du bandeau, calculés sur la frise complète AVANT filtres, même
    // convention que `/drivers-diff` (§6) : les compteurs ne changent pas au clic.
    // Simple boucle : reconstruire `construireFrise` ici coûterait la Map
    // articles entière (~800 000 mouvements sur une plage large) pour deux
    // compteurs. Défaut 3 : compteurs COMPLETS (toutes les clés à 0), jamais
    // creux — mêmes listes que `diff_frise.ts`, importées pour ne pas diverger.
    const parNatureGlobal = compteurVide(DRIVER_DIFF_NATURES)
    const parSourceGlobal = compteurVide(DRIVER_SOURCES)
    for (const p of result.pas) {
      for (const e of p.entrees) {
        parNatureGlobal[e.nature] += 1
        parSourceGlobal[e.source] += 1
      }
    }

    const sourceQ = ctx.request.input('source') as string | undefined
    const natureQ = ctx.request.input('nature') as string | undefined
    const limitQ = ctx.request.input('limit') as string | undefined
    // Ensembles construits UNE fois, pas par entrée : la frise d'une plage peut
    // porter des dizaines de milliers de mouvements, recréer deux Set à chaque
    // appel de `filtre` coûterait un split + trim + Set par mouvement.
    const wantedSource = sourceQ
      ? new Set(
          sourceQ
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : null
    const wantedNature = natureQ
      ? new Set(
          natureQ
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : null
    const filtreActif =
      (wantedSource !== null && wantedSource.size > 0) ||
      (wantedNature !== null && wantedNature.size > 0)
    const filtre = (e: DriverDiffEntry): boolean => {
      if (wantedSource !== null && wantedSource.size > 0 && !wantedSource.has(e.source))
        return false
      if (wantedNature !== null && wantedNature.size > 0 && !wantedNature.has(e.nature))
        return false
      return true
    }

    // Défaut 1 (#143) : sans filtre actif, `filtre` est un no-op — recopier
    // TOUS les tableaux d'entrées (`p.entrees.filter(filtre)`, qui alloue même
    // quand rien n'est écarté) matérialisait la totalité de la plage à chaque
    // chargement de page pour ensuite ne garder que `limit` mouvements plus
    // bas. `result.pas` est réutilisé TEL QUEL : rien ci-dessous ne mute ni
    // les pas ni leurs entrées (`construireFrise` ne fait que lire, le résumé
    // par pas ne fait que lire) — sûr même si ces entrées viennent du cache
    // `appro:drivers:*`, en LECTURE SEULE (`serialize: false`, cf. cache_ns.ts).
    const pasFiltres = filtreActif
      ? result.pas.map((p) => ({ ...p, entrees: p.entrees.filter(filtre) }))
      : result.pas

    // Bornage : budget de mouvements consommé article par article, dans
    // l'ordre de la frise (les plus agités d'abord) — même sémantique que
    // `limit` de `/drivers-diff` (total après filtres, avant bornage). Porté
    // DANS `construireFrise` (`options.budget`, défaut 1) : la Map complète
    // des articles avec TOUS leurs mouvements n'est plus jamais construite
    // pour ensuite être tranchée ici — seuls les articles réellement servis
    // par le budget voient leurs mouvements matérialisés.
    let limit = limitQ !== undefined ? Number(limitQ) : 200
    if (!Number.isFinite(limit) || limit <= 0) limit = 200
    limit = Math.min(Math.max(Math.floor(limit), 1), 1000)
    const frise = construireFrise(pasFiltres, { budget: limit })

    // Résumé par pas, sans les entrees (la frise agrégée les porte déjà).
    // Calculé sur `pasFiltres` — même convention que les articles ci-dessous :
    // le bandeau reste global (pré-filtres, `friseComplete`), tout le reste
    // suit la sélection. Un clic sur `source=stock` doit resserrer la
    // chronologie des pas comme il resserre la liste des articles.
    const pas = pasFiltres.map((p) => {
      const parNature = compteurVide(DRIVER_DIFF_NATURES)
      const parSource = compteurVide(DRIVER_SOURCES)
      for (const e of p.entrees) {
        parNature[e.nature] += 1
        parSource[e.source] += 1
      }
      return {
        avant: p.avant,
        apres: p.apres,
        total: p.entrees.length,
        parNature,
        parSource,
        sourcesEcartees: p.sourcesEcartees,
        sourcesComparees: p.sourcesComparees,
        message: p.message,
      }
    })

    const articles = frise.articles

    return ctx.response.json({
      avant: result.avant,
      apres: result.apres,
      total: frise.total,
      parNature: parNatureGlobal,
      parSource: parSourceGlobal,
      pas,
      trous: result.trous,
      articles,
      message: null,
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

  /**
   * GET /api/v1/appro/patterns — patterns émergents (#138 lot 2) : articles
   * volatils et fournisseurs dont une part élevée des messages est liée à des
   * réceptions glissées. Fenêtre par défaut : 21 jours (3 semaines — la
   * maturation qui rend les patterns lisibles).
   */
  async patterns(ctx: HttpContext) {
    const fenetre = fenetreValide(ctx.request.input('fenetre')) ?? 21
    const result = await demandSnapshotService.patterns(fenetre)
    if (result === null) {
      return ctx.response.json({
        apres: null,
        avant: null,
        fenetreJours: fenetre,
        joursCouverts: 0,
        diffsAnalyses: 0,
        articles: [],
        fournisseurs: [],
        qualite: {
          messages: 0,
          nonExpliques: 0,
          tauxNonExplique: null,
          couvertureMoyenne: null,
          residuMoyen: null,
        },
        message:
          'historique insuffisant — photos des messages manquantes, ou drivers indisponibles sur la fenêtre',
      })
    }
    return ctx.response.json(result)
  }

  /**
   * GET /api/v1/appro/auto-evaluation — taux d'override du ledger par cause
   * prédite (#138 lot 2). Lit le ledger non expiré, agrège par
   * `cause_predit` ; un override = la décision contredit le verdict prédit
   * (`estOverride`).
   */
  async autoEvaluation(ctx: HttpContext) {
    const repo = new ApproDecisionRepository()
    const lignes = await repo.dernieresNonExpirees()
    return ctx.response.json(autoEvaluation(lignes))
  }

  /**
   * GET /api/v1/appro/article-explanation?article=V4254&cle=CG2600209:1000:1
   * Grille time-phased + pegging natif (ticket 02, question A).
   * Périmètre V1 : MRPMES_0=2 uniquement, sinon {supporte:false}.
   */
  async articleExplanation(ctx: HttpContext) {
    const article = String(ctx.request.input('article') ?? '').trim()
    const cle = String(ctx.request.input('cle') ?? '').trim()
    if (!article || !cle) {
      return ctx.response.badRequest({
        error: 'article et cle requis (ex: ?article=V4254&cle=CG2600209:1000:1)',
      })
    }
    try {
      const result = await articleExplanationService.explain(article, cle)
      return ctx.response.json(result)
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

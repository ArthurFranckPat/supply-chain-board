import { type HttpContext } from '@adonisjs/core/http'
import { OverrideStore } from '#services/override_store'
import boardDataset from '#services/board_dataset'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { loadOfMaterialsDiagnostic } from '#services/of_diagnostic_loader'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { GammeOperation } from '#app/domain/models/gamme'

/**
 * PlanningBoardController — endpoints OF LIVE consommés par le board unifié (/programme) :
 *   - PATCH /ofs/:of           : override d'OF (date/statut/poste/note)
 *   - POST /board-feasibility  : badges de faisabilité (loadOrderImpacts)
 *   - GET  /articles-by-component : recherche composant → PF parents
 *   - GET  /search/{poste,of,pf}  : recherche board
 *   - GET  /of-materials/:of/diagnostic : diagnostic récursif (issue #25)
 *
 * Endpoints legacy (index/show/whatif/orderImpacts/shortages/events/overrides/feasibility/
 * nomenclature/reload/resetOverride) supprimés : non appelés par le front (board unifié sur
 * /programme). Les helpers lourds associés (getSupplyFlows/getStockFlows full scan) partent
 * avec — cf. cleanup 2026-06-27.
 */
export default class PlanningBoardController {
  private get store() {
    return new OverrideStore()
  }

  async update(ctx: HttpContext) {
    const { dateDebut, dateFin, status, workstation, note } = ctx.request.only([
      'dateDebut',
      'dateFin',
      'status',
      'workstation',
      'note',
    ])
    await this.store.save(ctx.params.of, { dateDebut, dateFin, status, workstation, note })

    return {
      numOf: ctx.params.of,
      dateDebut: dateDebut ?? null,
      dateFin: dateFin ?? null,
      status: status ?? null,
      workstation: workstation ?? null,
      note: note ?? null,
      modified: true,
    }
  }

  /** POST /api/v1/planning/board-feasibility — badges de faisabilité (pipeline partagé loadOrderImpacts). */
  async boardFeasibility(ctx: HttpContext) {
    const fromParam = ctx.request.input('from') as string | undefined
    const toParam = ctx.request.input('to') as string | undefined
    const workstationFilter = ctx.request.input('workstation') as string | undefined
    const mode = ctx.request.input('mode') as string | undefined

    const windowFrom = new Date(fromParam ?? '')
    const windowTo = new Date(toParam ?? '')
    windowFrom.setHours(0, 0, 0, 0)
    windowTo.setHours(23, 59, 59, 999)

    if (isNaN(windowFrom.getTime()) || isNaN(windowTo.getTime()) || windowTo <= windowFrom) {
      return ctx.response.badRequest({ error: 'Dates invalides' })
    }

    // Pipeline partagé (issue #11) — voir app/services/order_impacts_loader.ts.
    // useWindowOfs : OFs scopés par STRDAT (comme le board /programme) → badges alignés sur
    // les OF VISIBLES (sinon on badgeait des OF ENDDAT hors board) + demande WIPTYP=1+2 sans
    // OFs (getDemandAndReception lean). Phase 2 (MFGMAT+pegs) conservée : badges MFGMAT-based
    // (parité panneau de détail, issue #11).
    const { result } = await loadOrderImpacts({
      from: windowFrom,
      to: windowTo,
      workstation: workstationFilter,
      mode: mode as 'immediate' | 'sequential' | undefined,
      force: !!ctx.request.input('refresh'),
      pipeline: 'board-badges',
    })

    return result
  }

  /**
   * Diagnostic récursif d'un OF (issue #25). Descend la chaîne des OF — MFGMAT d'abord
   * (OF fermes/planifiés éclatés), repli nomenclature théorique pour les OF suggérés sans
   * MFGMAT — pour désigner le VRAI composant bloquant, ou conclure qu'il n'y a qu'un OF de
   * sous-ensemble à lancer. Distinct du mode direct (ofMaterials, MFGMAT 1 niveau).
   */
  async ofMaterialsDiagnostic(ctx: HttpContext) {
    const numOf = ctx.params.of
    if (!numOf) return ctx.response.badRequest({ error: 'numOf requis' })

    const result = await loadOfMaterialsDiagnostic(ctx, numOf)
    if (!result) return ctx.response.notFound({ error: `OF ${numOf} introuvable dans le pool` })
    return result
  }

  /**
   * GET /api/v1/planning/articles-by-component/:component
   * Retourne les articles parents (PF) qui consomment le composant donné dans
   * leur nomenclature. Utilisé par la recherche "composant" du board pour
   * remonter les OFs qui consomment ce composant.
   */
  async articlesByComponent(ctx: HttpContext) {
    const component = String(ctx.params.component ?? '')
      .trim()
      .toUpperCase()
    if (!component) {
      return ctx.response.badRequest({ error: 'Paramètre "component" requis' })
    }

    const allEntries = await boardDataset.getNomenclature().catch(() => [])
    const q = component.toLowerCase()
    const parents = new Set<string>()
    for (const entry of allEntries) {
      const compCode = (entry.componentArticle ?? '').toLowerCase()
      const compDesc = (entry.componentDescription ?? '').toLowerCase()
      if (compCode.includes(q) || compDesc.includes(q)) {
        if (entry.parentArticle) parents.add(entry.parentArticle)
      }
    }

    return { component, articles: [...parents] }
  }

  /**
   * GET /api/v1/planning/search/poste?q=…
   * Postes de charge dont le code ou le libellé matchent q (dataset complet via
   * les gammes, pas seulement la fenêtre affichée). Sert la recherche par scope
   * « poste » du board.
   */
  async searchPoste(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '')
      .trim()
      .toLowerCase()
    if (!q) return ctx.response.badRequest({ error: 'Paramètre "q" requis' })
    let gamme: GammeOperation[] = []
    try {
      gamme = (await boardDataset.getReferential()).gamme
    } catch {
      /* référentiel indisponible → réponse vide */
    }
    const wsts = new Set<string>()
    for (const g of gamme) {
      const code = (g.workstation ?? '').toLowerCase()
      const label = (g.workstationLabel ?? '').toLowerCase()
      if (code.includes(q) || label.includes(q)) wsts.add(g.workstation)
    }
    return { workstations: [...wsts] }
  }

  /**
   * GET /api/v1/planning/search/of?q=…
   * Numéros d'OF dont le numéro, l'article ou la désignation matchent q
   * (dataset complet des ordres de fabrication).
   */
  async searchOf(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '')
      .trim()
      .toLowerCase()
    if (!q) return ctx.response.badRequest({ error: 'Paramètre "q" requis' })
    let mos: ManufacturingOrder[] = []
    try {
      mos = (await boardDataset.getOrders()).mos
    } catch {
      /* ordres indisponibles → réponse vide */
    }
    const ofs = new Set<string>()
    for (const mo of mos) {
      const hay = `${mo.numOf} ${mo.article} ${mo.designation ?? ''}`.toLowerCase()
      if (hay.includes(q)) ofs.add(mo.numOf)
    }
    return { ofs: [...ofs] }
  }

  /**
   * GET /api/v1/planning/search/pf?q=…
   * Articles (produits finis) dont le code ou la désignation matchent q
   * (dataset complet des ordres de fabrication).
   */
  async searchPf(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '')
      .trim()
      .toLowerCase()
    if (!q) return ctx.response.badRequest({ error: 'Paramètre "q" requis' })
    let mos: ManufacturingOrder[] = []
    try {
      mos = (await boardDataset.getOrders()).mos
    } catch {
      /* ordres indisponibles → réponse vide */
    }
    const articles = new Set<string>()
    for (const mo of mos) {
      const hay = `${mo.article} ${mo.designation ?? ''}`.toLowerCase()
      if (hay.includes(q)) articles.add(mo.article)
    }
    return { articles: [...articles] }
  }
}

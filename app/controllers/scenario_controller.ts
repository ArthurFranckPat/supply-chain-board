import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ScenarioStore } from '#services/scenario_store'
import { evaluateScenarioDiff } from '#services/scenario_diff_loader'
import type { PlanMutation } from '#app/domain/plan_diff'
import type { AllocationStrategy } from '#app/domain/of_conso'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Chaque comparaison ré-évalue un plan complet. Sans borne, une URL bricolée avec
 * cinquante ids enchaînait autant d'évaluations avant la première ligne de HTML.
 */
const MAX_COMPARE = 6

/**
 * CRUD + diff des scénarios de plan (issue #57, vision étage 3).
 *
 * Le mode scénario de `/programme` empile des mutations côté client (aucun PATCH
 * réel ne part) ; ce contrôleur les persiste, les relit et les réévalue sur données
 * fraîches. L'application (rejeu des mutations en PATCHs réels) reste côté client :
 * elle réutilise les endpoints unitaires existants (planning_board.update /
 * order_planning.update) puis marque le scénario `applique` via `update`.
 */
export default class ScenarioController {
  private store = new ScenarioStore()

  /**
   * Propriétaire de la requête. Les routes sont derrière `middleware.auth()` : l'absence
   * d'utilisateur est une anomalie de câblage, pas un cas fonctionnel — on refuse plutôt
   * que de retomber sur un scénario partagé par défaut.
   */
  private ownerOf(ctx: HttpContext): number | null {
    return ctx.auth?.user?.id ?? null
  }

  async index(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })
    return ctx.response.json({ scenarios: await this.store.list(userId) })
  }

  async show(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })
    const id = Number.parseInt(ctx.params.id, 10)
    const row = await this.store.get(id, userId)
    if (!row) return ctx.response.notFound({ error: 'Scénario introuvable.' })
    return ctx.response.json(row)
  }

  async store_(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })
    const { nom, description, mutations, strategy } = ctx.request.only([
      'nom',
      'description',
      'mutations',
      'strategy',
    ])
    if (!nom || typeof nom !== 'string') {
      return ctx.response.badRequest({ error: 'Nom requis.' })
    }
    const row = await this.store.create({
      nom: nom.trim(),
      description: description ?? null,
      auteur: ctx.auth?.user?.username ?? null,
      userId,
      mutations: normalizeMutations(mutations),
      strategy: strategy as AllocationStrategy | undefined,
    })
    return ctx.response.created(row)
  }

  async update(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })
    const id = Number.parseInt(ctx.params.id, 10)
    const body = ctx.request.only(['nom', 'description', 'mutations', 'statut', 'strategy'])
    const patch: Parameters<ScenarioStore['update']>[2] = {}
    if (body.nom !== undefined) patch.nom = String(body.nom).trim()
    if (body.description !== undefined) patch.description = body.description
    if (body.mutations !== undefined) patch.mutations = normalizeMutations(body.mutations)
    if (body.statut === 'applique' || body.statut === 'brouillon') patch.statut = body.statut
    if (body.strategy !== undefined) patch.strategy = body.strategy as AllocationStrategy
    const row = await this.store.update(id, userId, patch)
    if (!row) return ctx.response.notFound({ error: 'Scénario introuvable.' })
    return ctx.response.json(row)
  }

  async destroy(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })
    const id = Number.parseInt(ctx.params.id, 10)
    const ok = await this.store.delete(id, userId)
    if (!ok) return ctx.response.notFound({ error: 'Scénario introuvable.' })
    return ctx.response.json({ ok: true })
  }

  /**
   * Évalue le diff d'une liste de mutations sur données fraîches (constat 3 axes).
   * `id` optionnel (query) → horodate le scénario persisté (« évalué le … »).
   */
  async diff(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })
    const { from, to, mutations, id, strategy } = ctx.request.only([
      'from',
      'to',
      'mutations',
      'id',
      'strategy',
    ])
    if (!from || !to || !ISO_RE.test(from) || !ISO_RE.test(to)) {
      return ctx.response.badRequest({ error: 'Fenêtre (from/to) requise au format ISO.' })
    }
    const windowFrom = new Date(from)
    windowFrom.setHours(0, 0, 0, 0)
    const windowTo = new Date(to)
    windowTo.setHours(23, 59, 59, 999)

    const normalized = normalizeMutations(mutations)
    let result: Awaited<ReturnType<typeof evaluateScenarioDiff>>
    try {
      result = await evaluateScenarioDiff(
        normalized,
        { from: windowFrom, to: windowTo },
        strategy as AllocationStrategy | undefined
      )
    } catch (error) {
      // L'évaluation traverse tout le chargement X3 : sans trace explicite, l'échec
      // ressortait en 500 nu, illisible côté navigateur comme côté terminal.
      logger.error(
        { err: error, from, to, mutations: normalized.length, strategy },
        'scenarios/diff — évaluation échouée'
      )
      return ctx.response.status(502).json({
        error: "Évaluation du scénario impossible : le plan n'a pas pu être chargé.",
        cause: error instanceof Error ? error.message : String(error),
      })
    }

    if (id != null) {
      const numId = Number.parseInt(String(id), 10)
      if (!Number.isNaN(numId)) {
        await this.store.markEvaluated(numId, userId, result.evaluatedAt, result.dataAt)
      }
    }
    return ctx.response.json(result)
  }

  /**
   * Comparaison multi-scénarios (issue #61) : une colonne par scénario, plan actuel en
   * référence. Chaque scénario est ré-évalué sur données fraîches — décision actée, on
   * stocke les mutations, pas les résultats.
   */
  async comparePage(ctx: HttpContext) {
    const userId = this.ownerOf(ctx)
    if (!userId) return ctx.response.unauthorized({ error: 'Authentification requise.' })

    const idsStr = ctx.request.input('ids') as string | undefined
    if (!idsStr) return ctx.response.redirect().toPath('/programme')

    const ids = [
      ...new Set(
        idsStr
          .split(',')
          .map((id) => Number.parseInt(id, 10))
          .filter((id) => !Number.isNaN(id))
      ),
    ].slice(0, MAX_COMPARE)
    if (ids.length < 2) return ctx.response.redirect().toPath('/programme')

    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '30'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 30

    const windowStart = startParam ? new Date(startParam) : new Date()
    windowStart.setHours(0, 0, 0, 0)
    const windowEnd = new Date(windowStart.getTime() + horizon * 86400000)
    windowEnd.setHours(23, 59, 59, 999)
    const window = { from: windowStart, to: windowEnd }

    const scenarios = await this.store.getMany(ids, userId)
    if (scenarios.length < 2) return ctx.response.redirect().toPath('/programme')

    const comparisonRows = []
    // Le plan actuel est le `beforeStats` de n'importe laquelle des évaluations : le
    // baseline ne dépend pas des mutations. Une évaluation « à vide » de plus n'apportait
    // rien qu'un plan complet supplémentaire à charger.
    let planActuelStats: { delayedOrders: number; inducedShortages: number } | null = null
    let dataAt = new Date().toISOString()

    for (const scenario of scenarios) {
      const result = await evaluateScenarioDiff(scenario.mutations, window, scenario.strategy)
      planActuelStats ??= result.beforeStats
      dataAt = result.dataAt
      comparisonRows.push({
        id: scenario.id,
        nom: scenario.nom,
        description: scenario.description,
        auteur: scenario.auteur,
        statut: scenario.statut,
        strategy: scenario.strategy,
        mutationsCount: scenario.mutations.length,
        diff: result.diff,
        stats: result.afterStats,
      })
    }

    return ctx.inertia.render('scheduler/comparer', {
      scenarios: comparisonRows,
      planActuel: {
        nom: 'Plan Actuel',
        stats: planActuelStats ?? { delayedOrders: 0, inducedShortages: 0 },
      },
      windowFrom: isoDay(windowStart),
      windowTo: isoDay(windowEnd),
      evaluatedAt: new Date().toISOString(),
      dataAt,
    })
  }
}

/** ISO jour sur les composantes locales — `toISOString` recule d'un jour à minuit en UTC+n. */
function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Garde-fou : ne conserver que des objets porteurs d'un `type` de mutation connu. */
const KNOWN = new Set(['shift_of', 'shift_demand', 'inject_demand', 'suspend_supply'])
function normalizeMutations(raw: unknown): PlanMutation[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is PlanMutation =>
      !!m && typeof m === 'object' && KNOWN.has((m as { type?: string }).type ?? '')
  )
}

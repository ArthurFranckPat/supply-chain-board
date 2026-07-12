import type { HttpContext } from '@adonisjs/core/http'
import { ScenarioStore } from '#services/scenario_store'
import { evaluateScenarioDiff } from '#services/scenario_diff_loader'
import type { PlanMutation } from '#app/domain/plan-diff'
import Scenario from '#models/scenario'
import type { AllocationStrategy } from '#app/domain/of-conso'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

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

  async index(ctx: HttpContext) {
    return ctx.response.json({ scenarios: await this.store.list() })
  }

  async show(ctx: HttpContext) {
    const id = Number.parseInt(ctx.params.id, 10)
    const row = await this.store.get(id)
    if (!row) return ctx.response.notFound({ error: 'Scénario introuvable.' })
    return ctx.response.json(row)
  }

  async store_(ctx: HttpContext) {
    const { nom, description, mutations, strategy } = ctx.request.only(['nom', 'description', 'mutations', 'strategy'])
    if (!nom || typeof nom !== 'string') {
      return ctx.response.badRequest({ error: 'Nom requis.' })
    }
    const row = await this.store.create({
      nom: nom.trim(),
      description: description ?? null,
      auteur: ctx.auth?.user?.username ?? null,
      mutations: normalizeMutations(mutations),
      strategy: strategy as AllocationStrategy | undefined,
    })
    return ctx.response.created(row)
  }

  async update(ctx: HttpContext) {
    const id = Number.parseInt(ctx.params.id, 10)
    const body = ctx.request.only(['nom', 'description', 'mutations', 'statut', 'strategy'])
    const patch: Parameters<ScenarioStore['update']>[1] = {}
    if (body.nom !== undefined) patch.nom = String(body.nom).trim()
    if (body.description !== undefined) patch.description = body.description
    if (body.mutations !== undefined) patch.mutations = normalizeMutations(body.mutations)
    if (body.statut === 'applique' || body.statut === 'brouillon') patch.statut = body.statut
    if (body.strategy !== undefined) patch.strategy = body.strategy as AllocationStrategy
    const row = await this.store.update(id, patch)
    if (!row) return ctx.response.notFound({ error: 'Scénario introuvable.' })
    return ctx.response.json(row)
  }

  async destroy(ctx: HttpContext) {
    const id = Number.parseInt(ctx.params.id, 10)
    const ok = await this.store.delete(id)
    if (!ok) return ctx.response.notFound({ error: 'Scénario introuvable.' })
    return ctx.response.json({ ok: true })
  }

  /**
   * Évalue le diff d'une liste de mutations sur données fraîches (constat 3 axes).
   * `id` optionnel (query) → horodate le scénario persisté (« évalué le … »).
   */
  async diff(ctx: HttpContext) {
    const { from, to, mutations, id, strategy } = ctx.request.only(['from', 'to', 'mutations', 'id', 'strategy'])
    if (!from || !to || !ISO_RE.test(from) || !ISO_RE.test(to)) {
      return ctx.response.badRequest({ error: 'Fenêtre (from/to) requise au format ISO.' })
    }
    const windowFrom = new Date(from)
    windowFrom.setHours(0, 0, 0, 0)
    const windowTo = new Date(to)
    windowTo.setHours(23, 59, 59, 999)

    const result = await evaluateScenarioDiff(
      normalizeMutations(mutations),
      { from: windowFrom, to: windowTo },
      strategy as AllocationStrategy | undefined
    )

    if (id != null) {
      const numId = Number.parseInt(String(id), 10)
      if (!Number.isNaN(numId)) {
        await this.store.markEvaluated(numId, result.evaluatedAt, result.dataAt)
      }
    }
    return ctx.response.json(result)
  }

  async comparePage(ctx: HttpContext) {
    const idsStr = ctx.request.input('ids') as string | undefined
    if (!idsStr) {
      return ctx.response.redirect().toPath('/programme')
    }
    const ids = idsStr.split(',').map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id))
    if (ids.length < 2) {
      return ctx.response.redirect().toPath('/programme')
    }

    const startParam = ctx.request.input('start') as string | undefined
    const daysParam = Number.parseInt(ctx.request.input('days', '30'), 10)
    const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 30

    const windowStart = startParam ? new Date(startParam) : new Date()
    windowStart.setHours(0, 0, 0, 0)
    const windowEnd = new Date(windowStart.getTime() + horizon * 86400000)
    windowEnd.setHours(23, 59, 59, 999)

    const dbScenarios = await Scenario.query().whereIn('id', ids)
    const comparisonRows: any[] = []

    for (const id of ids) {
      const dbScenario = dbScenarios.find((s) => s.id === id)
      if (!dbScenario) continue

      let mutations: any[] = []
      try {
        mutations = JSON.parse(dbScenario.mutations)
      } catch {}

      const result = await evaluateScenarioDiff(
        mutations,
        { from: windowStart, to: windowEnd },
        dbScenario.strategy as any
      )

      comparisonRows.push({
        id: dbScenario.id,
        nom: dbScenario.nom,
        description: dbScenario.description,
        auteur: dbScenario.auteur,
        statut: dbScenario.statut,
        strategy: dbScenario.strategy,
        mutationsCount: mutations.length,
        diff: result.diff,
        stats: result.afterStats,
      })
    }

    const resultActuel = await evaluateScenarioDiff(
      [],
      { from: windowStart, to: windowEnd },
      'date_besoin'
    )

    const planActuel = {
      nom: 'Plan Actuel',
      diff: resultActuel.diff,
      stats: resultActuel.beforeStats,
    }

    const evaluatedAt = new Date().toISOString()
    const dataAt = windowEnd.toISOString()

    return ctx.inertia.render('scheduler/comparer', {
      scenarios: comparisonRows,
      planActuel,
      windowFrom: windowStart.toISOString().slice(0, 10),
      windowTo: windowEnd.toISOString().slice(0, 10),
      evaluatedAt,
      dataAt,
    })
  }
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

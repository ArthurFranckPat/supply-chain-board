import type { HttpContext } from '@adonisjs/core/http'
import { ScenarioStore } from '#services/scenario_store'
import { evaluateScenarioDiff } from '#services/scenario_diff_loader'
import type { PlanMutation } from '#app/domain/plan-diff'

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
    const { nom, description, mutations } = ctx.request.only(['nom', 'description', 'mutations'])
    if (!nom || typeof nom !== 'string') {
      return ctx.response.badRequest({ error: 'Nom requis.' })
    }
    const row = await this.store.create({
      nom: nom.trim(),
      description: description ?? null,
      auteur: ctx.auth?.user?.username ?? null,
      mutations: normalizeMutations(mutations),
    })
    return ctx.response.created(row)
  }

  async update(ctx: HttpContext) {
    const id = Number.parseInt(ctx.params.id, 10)
    const body = ctx.request.only(['nom', 'description', 'mutations', 'statut'])
    const patch: Parameters<ScenarioStore['update']>[1] = {}
    if (body.nom !== undefined) patch.nom = String(body.nom).trim()
    if (body.description !== undefined) patch.description = body.description
    if (body.mutations !== undefined) patch.mutations = normalizeMutations(body.mutations)
    if (body.statut === 'applique' || body.statut === 'brouillon') patch.statut = body.statut
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
    const { from, to, mutations, id } = ctx.request.only(['from', 'to', 'mutations', 'id'])
    if (!from || !to || !ISO_RE.test(from) || !ISO_RE.test(to)) {
      return ctx.response.badRequest({ error: 'Fenêtre (from/to) requise au format ISO.' })
    }
    const windowFrom = new Date(from)
    windowFrom.setHours(0, 0, 0, 0)
    const windowTo = new Date(to)
    windowTo.setHours(23, 59, 59, 999)

    const result = await evaluateScenarioDiff(normalizeMutations(mutations), {
      from: windowFrom,
      to: windowTo,
    })

    if (id != null) {
      const numId = Number.parseInt(String(id), 10)
      if (!Number.isNaN(numId)) {
        await this.store.markEvaluated(numId, result.evaluatedAt, result.dataAt)
      }
    }
    return ctx.response.json(result)
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

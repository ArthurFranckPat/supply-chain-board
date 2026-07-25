import Scenario from '#models/scenario'
import type { PlanMutation } from '#app/domain/plan_diff'
import type { AllocationStrategy } from '#app/domain/of_conso'

/** Vue applicative d'un scénario : mutations désérialisées. */
export interface ScenarioRow {
  id: number
  nom: string
  description: string | null
  auteur: string | null
  statut: 'brouillon' | 'applique'
  mutations: PlanMutation[]
  strategy: AllocationStrategy
  evaluatedAt: string | null
  dataAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScenarioInput {
  nom: string
  description?: string | null
  auteur?: string | null
  userId: number
  mutations: PlanMutation[]
  strategy?: AllocationStrategy
}

function toRow(m: Scenario): ScenarioRow {
  let mutations: PlanMutation[] = []
  try {
    const parsed = JSON.parse(m.mutations)
    if (Array.isArray(parsed)) mutations = parsed
  } catch {
    mutations = []
  }
  return {
    id: m.id,
    nom: m.nom,
    description: m.description,
    auteur: m.auteur,
    statut: m.statut === 'applique' ? 'applique' : 'brouillon',
    mutations,
    strategy: (m.strategy as AllocationStrategy) || 'date_besoin',
    evaluatedAt: m.evaluatedAt,
    dataAt: m.dataAt,
    createdAt: m.createdAt?.toISO() ?? '',
    updatedAt: m.updatedAt?.toISO() ?? '',
  }
}

/**
 * Persistance des scénarios (issue #57). Même pattern qu'`OverrideStore` : couche
 * fine sur le modèle Lucid, (dé)sérialisation JSON des mutations à la frontière.
 *
 * Cloisonnement : chaque méthode exige le `userId` du demandeur et filtre dessus. Un
 * scénario est un brouillon de travail personnel — la liste globale exposait celui des
 * autres, et show/update/destroy acceptaient n'importe quel id. Un scénario d'un autre
 * utilisateur se comporte comme un scénario inexistant (null / false → 404).
 */
export class ScenarioStore {
  async list(userId: number): Promise<ScenarioRow[]> {
    const rows = await Scenario.query().where('user_id', userId).orderBy('updated_at', 'desc')
    return rows.map(toRow)
  }

  async get(id: number, userId: number): Promise<ScenarioRow | null> {
    const row = await this.findOwned(id, userId)
    return row ? toRow(row) : null
  }

  /** Scénarios possédés, dans l'ordre demandé (comparateur multi-scénarios, #61). */
  async getMany(ids: number[], userId: number): Promise<ScenarioRow[]> {
    if (ids.length === 0) return []
    const rows = await Scenario.query().whereIn('id', ids).where('user_id', userId)
    const byId = new Map(rows.map((r) => [r.id, r]))
    return ids.flatMap((id) => {
      const row = byId.get(id)
      return row ? [toRow(row)] : []
    })
  }

  async create(data: ScenarioInput): Promise<ScenarioRow> {
    const row = await Scenario.create({
      nom: data.nom,
      description: data.description ?? null,
      auteur: data.auteur ?? null,
      userId: data.userId,
      statut: 'brouillon',
      mutations: JSON.stringify(data.mutations ?? []),
      strategy: data.strategy ?? 'date_besoin',
    })
    return toRow(row)
  }

  async update(
    id: number,
    userId: number,
    data: Partial<Omit<ScenarioInput, 'userId'>> & { statut?: 'brouillon' | 'applique' }
  ): Promise<ScenarioRow | null> {
    const row = await this.findOwned(id, userId)
    if (!row) return null
    if (data.nom !== undefined) row.nom = data.nom
    if (data.description !== undefined) row.description = data.description
    if (data.auteur !== undefined) row.auteur = data.auteur
    if (data.statut !== undefined) row.statut = data.statut
    if (data.mutations !== undefined) row.mutations = JSON.stringify(data.mutations)
    if (data.strategy !== undefined) row.strategy = data.strategy
    await row.save()
    return toRow(row)
  }

  /** Horodate la dernière évaluation (« évalué le … sur données du … »). */
  async markEvaluated(
    id: number,
    userId: number,
    evaluatedAt: string,
    dataAt: string
  ): Promise<void> {
    const row = await this.findOwned(id, userId)
    if (!row) return
    row.evaluatedAt = evaluatedAt
    row.dataAt = dataAt
    await row.save()
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const row = await this.findOwned(id, userId)
    if (!row) return false
    await row.delete()
    return true
  }

  private async findOwned(id: number, userId: number): Promise<Scenario | null> {
    return Scenario.query().where('id', id).where('user_id', userId).first()
  }
}

import Scenario from '#models/scenario'
import type { PlanMutation } from '#app/domain/plan-diff'

/** Vue applicative d'un scénario : mutations désérialisées. */
export interface ScenarioRow {
  id: number
  nom: string
  description: string | null
  auteur: string | null
  statut: 'brouillon' | 'applique'
  mutations: PlanMutation[]
  evaluatedAt: string | null
  dataAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScenarioInput {
  nom: string
  description?: string | null
  auteur?: string | null
  mutations: PlanMutation[]
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
    evaluatedAt: m.evaluatedAt,
    dataAt: m.dataAt,
    createdAt: m.createdAt?.toISO() ?? '',
    updatedAt: m.updatedAt?.toISO() ?? '',
  }
}

/**
 * Persistance des scénarios (issue #57). Même pattern qu'`OverrideStore` : couche
 * fine sur le modèle Lucid, (dé)sérialisation JSON des mutations à la frontière.
 */
export class ScenarioStore {
  async list(): Promise<ScenarioRow[]> {
    const rows = await Scenario.query().orderBy('updated_at', 'desc')
    return rows.map(toRow)
  }

  async get(id: number): Promise<ScenarioRow | null> {
    const row = await Scenario.find(id)
    return row ? toRow(row) : null
  }

  async create(data: ScenarioInput): Promise<ScenarioRow> {
    const row = await Scenario.create({
      nom: data.nom,
      description: data.description ?? null,
      auteur: data.auteur ?? null,
      statut: 'brouillon',
      mutations: JSON.stringify(data.mutations ?? []),
    })
    return toRow(row)
  }

  async update(
    id: number,
    data: Partial<ScenarioInput> & { statut?: 'brouillon' | 'applique' }
  ): Promise<ScenarioRow | null> {
    const row = await Scenario.find(id)
    if (!row) return null
    if (data.nom !== undefined) row.nom = data.nom
    if (data.description !== undefined) row.description = data.description
    if (data.auteur !== undefined) row.auteur = data.auteur
    if (data.statut !== undefined) row.statut = data.statut
    if (data.mutations !== undefined) row.mutations = JSON.stringify(data.mutations)
    await row.save()
    return toRow(row)
  }

  /** Horodate la dernière évaluation (« évalué le … sur données du … »). */
  async markEvaluated(id: number, evaluatedAt: string, dataAt: string): Promise<void> {
    const row = await Scenario.find(id)
    if (!row) return
    row.evaluatedAt = evaluatedAt
    row.dataAt = dataAt
    await row.save()
  }

  async delete(id: number): Promise<boolean> {
    const row = await Scenario.find(id)
    if (!row) return false
    await row.delete()
    return true
  }
}

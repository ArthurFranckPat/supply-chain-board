import OfOverride from '#models/of_override'
import type { OfOverrideRow } from '#app/domain/planning_board'

export class OverrideStore {
  async save(
    numOf: string,
    data: {
      dateDebut?: string | null
      dateFin?: string | null
      status?: number | null
      workstation?: string | null
      note?: string | null
    }
  ): Promise<OfOverride> {
    const existing = await OfOverride.findBy('num_of', numOf)

    // undefined = keep existing value, null = clear it explicitly
    const pick = <T>(next: T | undefined | null, prev: T | null): T | null =>
      next === undefined ? prev : next

    if (existing) {
      existing.merge({
        dateDebut: pick(data.dateDebut, existing.dateDebut),
        dateFin: pick(data.dateFin, existing.dateFin),
        status: pick(data.status, existing.status),
        workstation: pick(data.workstation, existing.workstation),
        note: pick(data.note, existing.note),
      })
      await existing.save()
      return existing
    }

    return await OfOverride.create({
      numOf,
      dateDebut: data.dateDebut ?? null,
      dateFin: data.dateFin ?? null,
      status: data.status ?? null,
      workstation: data.workstation ?? null,
      note: data.note ?? null,
    })
  }

  async get(numOf: string): Promise<OfOverrideRow | null> {
    const row = await OfOverride.findBy('num_of', numOf)
    if (!row) return null
    return {
      numOf: row.numOf,
      dateDebut: row.dateDebut,
      dateFin: row.dateFin,
      status: row.status,
      workstation: row.workstation,
      note: row.note,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  async getAll(): Promise<OfOverrideRow[]> {
    const rows = await OfOverride.all()
    return rows.map((row) => ({
      numOf: row.numOf,
      dateDebut: row.dateDebut,
      dateFin: row.dateFin,
      status: row.status,
      workstation: row.workstation,
      note: row.note,
      updatedAt: row.updatedAt.toISO()!,
    }))
  }

  async delete(numOf: string): Promise<boolean> {
    const row = await OfOverride.findBy('num_of', numOf)
    if (!row) return false
    await row.delete()
    return true
  }

  async deleteAll(): Promise<number> {
    const rows = await OfOverride.all()
    const count = rows.length
    for (const row of rows) {
      await row.delete()
    }
    return count
  }
}

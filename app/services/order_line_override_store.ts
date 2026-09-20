import { createHash } from 'node:crypto'
import OrderLineOverride from '#models/order_line_override'

export interface OrderLineOverrideRow {
  numCommande: string
  ligne: string
  dateLivraison: string
  updatedAt: string
}

/**
 * Store des overrides de date de livraison pour le mode planification (issue #10).
 * Même pattern que OverrideStore (OF), clé composite (numCommande, ligne).
 */
export class OrderLineOverrideStore {
  async save(
    numCommande: string,
    ligne: string,
    data: { dateLivraison?: string | null }
  ): Promise<OrderLineOverride> {
    const existing = await OrderLineOverride.query()
      .where('num_commande', numCommande)
      .where('ligne', ligne)
      .first()

    if (existing) {
      if (data.dateLivraison !== undefined && data.dateLivraison !== null) {
        existing.dateLivraison = data.dateLivraison
        await existing.save()
      }
      return existing
    }

    return await OrderLineOverride.create({
      numCommande,
      ligne,
      dateLivraison: data.dateLivraison ?? '',
    })
  }

  async get(numCommande: string, ligne: string): Promise<OrderLineOverrideRow | null> {
    const row = await OrderLineOverride.query()
      .where('num_commande', numCommande)
      .where('ligne', ligne)
      .first()
    if (!row) return null
    return {
      numCommande: row.numCommande,
      ligne: row.ligne,
      dateLivraison: row.dateLivraison,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  async getAll(): Promise<OrderLineOverrideRow[]> {
    const rows = await OrderLineOverride.all()
    return rows.map((row) => ({
      numCommande: row.numCommande,
      ligne: row.ligne,
      dateLivraison: row.dateLivraison,
      updatedAt: row.updatedAt.toISO()!,
    }))
  }

  async getMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    for (const r of await this.getAll()) {
      map.set(`${r.numCommande}#${r.ligne}`, r.dateLivraison)
    }
    return map
  }

  /**
   * Empreinte de l'ÉTAT COMPLET des overrides, à coller dans une clé de cache.
   *
   * Un consommateur qui décale ses dates avec ces overrides doit voir sa clé
   * changer dès qu'une ligne est re-datée, sinon il sert une valeur calculée
   * sous l'ancien jeu (SWR + grâce de 12 h côté /charge : le décalage pouvait
   * rester invisible une demi-journée). Le projet a déjà payé quatre fois le
   * bug de clé de cache qui ne reflète pas son entrée — ici l'entrée est une
   * table locale, l'empreinte se calcule donc à chaque appel sans rien coûter.
   *
   * `updatedAt` fait partie de l'empreinte : re-dater une ligne vers sa valeur
   * précédente, puis revenir, doit produire deux clés distinctes.
   */
  async signature(): Promise<string> {
    const rows = await this.getAll()
    if (rows.length === 0) return 'none'
    const payload = rows
      .map((r) => `${r.numCommande}#${r.ligne}=${r.dateLivraison}@${r.updatedAt}`)
      .sort()
      .join('|')
    return createHash('md5').update(payload).digest('hex').slice(0, 10)
  }

  async delete(numCommande: string, ligne: string): Promise<boolean> {
    const row = await OrderLineOverride.query()
      .where('num_commande', numCommande)
      .where('ligne', ligne)
      .first()
    if (!row) return false
    await row.delete()
    return true
  }
}

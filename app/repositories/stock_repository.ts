import type { Flow } from '#app/domain/models/flow'
import ItemMovement from '#models/x3/itmmvt'

/**
 * Taille de lot pour le scope article. 1000 était la limite Oracle du `IN (...)`,
 * mais la contrainte qui mord en premier n'est pas Oracle : c'est le buffer du
 * subprogram `ZSOAPSQL`, qui rend un `resultXml` VIDE quand la réponse dépasse sa
 * capacité (issue #40, correctif 4GL écrit mais pas déployé en production).
 * Surchargeable pour retomber sur l'ancien comportement une fois l'ERP à jour.
 */
const STOCK_CHUNK = Number(process.env.X3_STOCK_CHUNK) || 500

/** En deçà, un échec n'est plus une question de taille de réponse. */
const MIN_CHUNK = 25

export class X3StockRepository {
  /**
   * Stock courant. Si `articles` fourni → scope (WHERE ITMREF IN ...), batché.
   * Sans `articles` → toute la base (lourd).
   */
  async getStockFlows(articles?: string[]): Promise<Flow[]> {
    const base = () =>
      ItemMovement.query()
        .select(
          'ITMMVT.ITMREF_0',
          'ITMMVT.PHYSTO_0',
          'ITMMVT.CTLSTO_0',
          'ITMMVT.REJSTO_0',
          'ITMMVT.PHYALL_0',
          'ITMMVT.GLOALL_0',
          'ITMMVT.AVC_0'
        )
        .innerJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'ITMMVT.ITMREF_0')
        .where('ITMMASTER.ITMSTA_0', '1')

    /**
     * Un lot trop gros ressort en `resultXml is nil` — réponse vide, pas erreur SQL.
     * Le retry générique de `connection.ts` rejoue à l'identique et échoue pareil :
     * la taille, elle, n'a pas changé. On redécoupe donc le lot en deux et on
     * recommence, jusqu'à passer. Ne s'applique QU'À cette signature : une erreur
     * d'authentification ou de SQL doit remonter du premier coup.
     */
    const fetchChunk = async (part: string[]): Promise<ItemMovement[]> => {
      try {
        return await base().whereIn('ITMMVT.ITMREF_0', part)
      } catch (error) {
        const nilResult = (error as Error)?.message?.toLowerCase().includes('resultxml is nil')
        if (!nilResult || part.length <= MIN_CHUNK) throw error
        const mid = Math.ceil(part.length / 2)
        const [left, right] = [part.slice(0, mid), part.slice(mid)]
        return [...(await fetchChunk(left)), ...(await fetchChunk(right))]
      }
    }

    let rows: ItemMovement[]
    if (articles && articles.length > 0) {
      const uniq = [...new Set(articles.filter(Boolean))]
      rows = []
      for (let i = 0; i < uniq.length; i += STOCK_CHUNK) {
        rows.push(...(await fetchChunk(uniq.slice(i, i + STOCK_CHUNK))))
      }
    } else {
      rows = await base()
    }

    const flows: Flow[] = []
    for (const row of rows) {
      const article = row.article?.trim() ?? ''
      if (!article) continue

      const physique = Number.parseFloat(row.stockInterneA ?? '0') || 0
      const cq = Number.parseFloat(row.stockInterneQ ?? '0') || 0
      const rejected = Number.parseFloat(row.stockInterneR ?? '0') || 0
      const allouePhys = Number.parseFloat(row.alloueInterneA ?? '0') || 0
      const alloueGlob = Number.parseFloat(row.alloueGlobal ?? '0') || 0
      const pmp = Number.parseFloat(row.prixMoyenPondere ?? '0') || null
      const strict = physique - allouePhys - alloueGlob

      if (strict > 0) {
        flows.push({
          article,
          quantity: strict,
          direction: 'supply',
          date: null,
          origin: { type: 'stock', subType: 'strict', pmp },
        })
      }
      if (cq > 0) {
        flows.push({
          article,
          quantity: cq,
          direction: 'supply',
          date: null,
          origin: { type: 'stock', subType: 'qc', pmp },
        })
      }
      if (rejected > 0) {
        flows.push({
          article,
          quantity: rejected,
          direction: 'supply',
          date: null,
          origin: { type: 'stock', subType: 'rejected', pmp },
        })
      }
    }
    return flows
  }
}

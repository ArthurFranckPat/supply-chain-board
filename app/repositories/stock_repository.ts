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

/**
 * Composantes brutes du stock d'un article, avant tout calcul.
 *
 * `getStockFlows()` en dérive des `Flow` (un par sous-type non nul) — une découpe
 * de présentation. La réplique (#98) stocke les composantes : `strict` est un
 * calcul (`physique − alloueP hys − alloueGlobal`), pas une donnée, et le garder
 * dérivable laisse la règle modifiable sans réingestion.
 */
export interface StockLevel {
  article: string
  physique: number
  controleQual: number
  rebut: number
  allouePhys: number
  alloueGlobal: number
  pmp: number | null
}

export class X3StockRepository {
  /**
   * Composantes brutes par article, sur toute la base (ITMMASTER actifs).
   *
   * Ne filtre RIEN sur les quantités : contrairement à `getStockFlows()`, les
   * articles à composantes toutes nulles sont conservés. Une ligne à zéro est une
   * information — elle distingue « article connu, stock épuisé » de « article
   * absent de la réplique », deux cas qu'un consommateur doit pouvoir séparer.
   *
   * ## Agrégation par article : `ITMMVT` n'est PAS au grain article
   *
   * Certains articles y ont deux lignes — une par site (`STOFCY_0 = 'AE1'`) et une
   * ligne consolidée à site VIDE, convention X3. Vérifié en production :
   *
   *     A1307H03  STOFCY=''     PHYSTO=0     GLOALL=0
   *     A1307H03  STOFCY='AE1'  PHYSTO=4139  GLOALL=30
   *
   * Les lignes à site vide sont à zéro sur les quantités, ce qui explique que
   * `getStockFlows()` ne double-compte pas : il n'émet un flow que si la quantité
   * est > 0. Mais elles portent parfois un PMP, et un `SELECT` au grain article
   * casse sur une contrainte d'unicité si on ne les agrège pas.
   *
   * On somme donc les quantités (le site vide y ajoute zéro, donc sans effet, et
   * un éventuel second site réel serait correctement cumulé) et on prend le MAX du
   * PMP — un prix unitaire ne s'additionne pas.
   */
  async getStockLevels(): Promise<StockLevel[]> {
    const rows = await ItemMovement.query()
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

    const byArticle = new Map<string, StockLevel>()
    for (const row of rows) {
      const article = row.article?.trim() ?? ''
      if (!article) continue

      const pmp = Number.parseFloat(row.prixMoyenPondere ?? '0') || null
      const current = byArticle.get(article)

      if (!current) {
        byArticle.set(article, {
          article,
          physique: Number.parseFloat(row.stockInterneA ?? '0') || 0,
          controleQual: Number.parseFloat(row.stockInterneQ ?? '0') || 0,
          rebut: Number.parseFloat(row.stockInterneR ?? '0') || 0,
          allouePhys: Number.parseFloat(row.alloueInterneA ?? '0') || 0,
          alloueGlobal: Number.parseFloat(row.alloueGlobal ?? '0') || 0,
          pmp,
        })
        continue
      }

      current.physique += Number.parseFloat(row.stockInterneA ?? '0') || 0
      current.controleQual += Number.parseFloat(row.stockInterneQ ?? '0') || 0
      current.rebut += Number.parseFloat(row.stockInterneR ?? '0') || 0
      current.allouePhys += Number.parseFloat(row.alloueInterneA ?? '0') || 0
      current.alloueGlobal += Number.parseFloat(row.alloueGlobal ?? '0') || 0
      if (pmp !== null) current.pmp = Math.max(current.pmp ?? 0, pmp)
    }

    return [...byArticle.values()]
  }

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

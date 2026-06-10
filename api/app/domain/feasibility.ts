/**
 * Verification de faisabilite recursive des nomenclatures.
 *
 * Descend la BOM pour verifier que chaque composant achat
 * a suffisamment de stock (ou receptions) pour produire la quantite voulue.
 * Arrete la recursion sur les composants fabriques (traites par leur propre OF).
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { Nomenclature, NomenclatureEntry } from './models/nomenclature.js'
import { availableAt } from './availability.js'

export interface BlockingComponent {
  article: string
  needed: number
  available: number
  shortage: number
}

export interface FeasibilityResult {
  feasible: boolean
  blockingComponents: BlockingComponent[]
}

/**
 * Verifie la faisabilite de produire `quantity` d'un article.
 *
 * @param article - Article a verifier
 * @param quantity - Quantite a produire
 * @param flows - Flows de stock/reception disponibles
 * @param nomenclatures - BOM par article
 * @param articles - Catalogue articles
 * @param upToDate - Date limite pour les receptions (optionnel)
 * @param visited - Set anti-boucle circulaire (interne)
 */
export function checkFeasibility(
  article: string,
  quantity: number,
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  upToDate?: Date,
  visited?: Set<string>,
): FeasibilityResult {
  const blocking: BlockingComponent[] = []
  const seen = visited ?? new Set<string>()

  // Protection anti-boucle circulaire
  if (seen.has(article)) {
    return { feasible: true, blockingComponents: [] }
  }
  seen.add(article)

  const bom = nomenclatures.get(article)
  if (!bom || bom.components.length === 0) {
    return { feasible: true, blockingComponents: [] }
  }

  for (const entry of bom.components) {
    const needed = requiredQty(entry, quantity)

    if (entry.componentType === 'ACHETE') {
      // Composant achete: verifier stock + receptions
      const avail = upToDate
        ? availableAt(flows, entry.componentArticle, upToDate)
        : availableAt(flows, entry.componentArticle, new Date('2099-12-31'))

      if (avail < needed) {
        blocking.push({
          article: entry.componentArticle,
          needed,
          available: avail,
          shortage: needed - avail,
        })
      }
    } else {
      // Composant fabrique: descendre recursivement
      const subResult = checkFeasibility(
        entry.componentArticle,
        needed,
        flows,
        nomenclatures,
        articles,
        upToDate,
        new Set(seen), // copie pour permettre meme composant dans branches differentes
      )
      blocking.push(...subResult.blockingComponents)
    }
  }

  return {
    feasible: blocking.length === 0,
    blockingComponents: blocking,
  }
}

function requiredQty(entry: NomenclatureEntry, parentQty: number): number {
  if (entry.consumptionNature === 'FORFAIT') return entry.linkQuantity
  return entry.linkQuantity * parentQty
}

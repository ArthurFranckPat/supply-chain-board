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
import type { DispoPolicy } from './dispo-policy.js'

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
 * Vérifie la faisabilité de produire `quantity` d'un article.
 *
 * @param article - Article a verifier
 * @param quantity - Quantite a produire
 * @param flows - Flows de stock/reception disponibles
 * @param nomenclatures - BOM par article
 * @param articles - Catalogue articles (utilisé pour classification)
 * @param upToDate - Date limite pour les réceptions (optionnel)
 * @param dispoPolicy - 'stock_strict' (dispo instantanée) ou 'stock_plus_receptions'. Pas de
 *   défaut — choix forcé à la frontière (issue #51).
 * @param visited - Set anti-boucle circulaire (interne)
 * @param allocations - Quantités déjà allouées en ERP par article (ignorées dans le calcul)
 * @param treatFabricatedAsStock - Si vrai (mode proactif/séquentiel), les composants FABRIQUÉS sont
 *   vérifiés contre la quantité réellement disponible (stock + supply), comme les achats, au lieu
 *   d'être considérés couverts dès qu'un OF producteur existe. Reflète la faisabilité réelle :
 *   « un composant manquant est un composant manquant » (achat ou sous-ensemble fabriqué).
 *   Défaut faux → comportement historique préservé pour le badge board et promiseDate.
 */
export function checkFeasibility(
  article: string,
  quantity: number,
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  upToDate: Date | undefined,
  dispoPolicy: DispoPolicy,
  visited?: Set<string>,
  allocations?: Map<string, number>,
  treatFabricatedAsStock: boolean = false,
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
    if (entry.componentType === 'ACHETE' || treatFabricatedAsStock) {
      // Composant vérifié contre la quantité disponible (stock + supply) : achat, ou fabriqué
      // en mode proactif (faisabilité réelle — un sous-ensemble manquant est un composant manquant).
      // Déduire les quantités déjà allouées en ERP (ne pas les re-vérifier)
      const alreadyAllocated = allocations?.get(entry.componentArticle) ?? 0
      const remainingNeed = Math.max(0, needed - alreadyAllocated)
      if (remainingNeed <= 0) continue

      // Composant acheté : vérifier stock + réceptions (paramétrable)
      const avail = upToDate
        ? availableAt(flows, entry.componentArticle, upToDate, dispoPolicy)
        : availableAt(flows, entry.componentArticle, new Date('2099-12-31'), dispoPolicy)

      if (avail < remainingNeed) {
        blocking.push({
          article: entry.componentArticle,
          needed: remainingNeed,
          available: avail,
          shortage: remainingNeed - avail,
        })
      }
    } else if (hasSupplyFlowFor(flows, entry.componentArticle)) {
      // Composant fabriqué avec OF de couverture → ignoré (traité par son OF)
    } else {
      // Composant fabriqué SANS OF de couverture → descendre récursivement
      const subResult = checkFeasibility(
        entry.componentArticle,
        needed,
        flows,
        nomenclatures,
        articles,
        upToDate,
        dispoPolicy,
        new Set(seen),
        allocations,
      )
      blocking.push(...subResult.blockingComponents)
    }
  }

  return {
    feasible: blocking.length === 0,
    blockingComponents: blocking,
  }
}


/**
 * Vérifie si un flux supply (OF) existe pour un article fabriqué.
 * Si oui, le sous-ensemble a son propre OF → pas besoin de récursion.
 */
function hasSupplyFlowFor(flows: Flow[], article: string): boolean {
  return flows.some((f) => f.article === article && f.direction === 'supply' && f.quantity > 0)
}

function requiredQty(entry: NomenclatureEntry, parentQty: number): number {
  if (entry.consumptionNature === 'FORFAIT') return entry.linkQuantity
  return entry.linkQuantity * parentQty
}

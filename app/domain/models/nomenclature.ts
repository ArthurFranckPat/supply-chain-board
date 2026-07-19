/**
 * Nomenclature -- structure de fabrication (BOM).
 */

export type ComponentType = 'ACHETE' | 'FABRIQUE'
export type ConsumptionNature = 'FORFAIT' | 'PROPORTIONNEL'

export interface NomenclatureEntry {
  parentArticle: string
  parentDescription: string
  level: number
  componentArticle: string
  componentDescription: string
  linkQuantity: number
  componentType: ComponentType
  consumptionNature: ConsumptionNature
}

export interface Nomenclature {
  article: string
  description: string
  components: NomenclatureEntry[]
}

// -- Helpers --

export function isManufactured(entry: Pick<NomenclatureEntry, 'componentType'>): boolean {
  return entry.componentType === 'FABRIQUE'
}

/** Quantite requise pour une quantite parent donnee. */
export function requiredQuantity(entry: NomenclatureEntry, parentQty: number): number {
  if (entry.consumptionNature === 'FORFAIT') return entry.linkQuantity
  return entry.linkQuantity * parentQty
}

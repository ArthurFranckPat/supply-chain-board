/**
 * Recursive feasibility checker.
 *
 * Mirrors Python production_planning.feasibility.recursive.RecursiveChecker:
 * - checks stock/receptions for purchased components
 * - skips components already allocated in ERP for the parent OF
 * - treats subcontracted (ST*) articles as purchase articles
 * - resolves phantom (AFANT) articles
 * - reports fabricated sub-assemblies as missing when no covering OF exists
 */

import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import { StockState } from './stock-state.js'
import type { ErpAllocation } from './allocation.js'

export interface RecursiveCheckerResult {
  feasible: boolean
  missingComponents: Record<string, number>
  componentsChecked: number
  alerts: string[]
}

export interface StockRecord {
  stockPhysique: number
  stockAlloue: number
}

export interface ReceptionRecord {
  id: string
  article: string
  supplier: string
  quantity: number
  date: Date
}

export interface OfRecord {
  numOf: string
  article: string
  statutNum: number
  qteRestante: number
  dateDebut?: Date
  dateFin?: Date
}

export interface RecursiveCheckerOptions {
  useReceptions?: boolean
  stockState?: StockState
  checkDate?: Date
}
export interface RecursiveCheckerLoader {
  getArticle(article: string): Article | undefined
  getNomenclature(article: string): Nomenclature | undefined
  getStock(article: string): StockRecord | undefined
  getAllocationsOf(numDoc: string): ErpAllocation[]
  getOfsByArticle(article: string, statut?: number, dateBesoin?: Date): OfRecord[]
  getReceptions(article: string): ReceptionRecord[]
}

export function isSubcontracted(article: Article | undefined): boolean {
  return article?.category?.toUpperCase().startsWith('ST') ?? false
}

export function isPhantom(article: Article | undefined): boolean {
  return article?.category?.toUpperCase() === 'AFANT'
}

export class RecursiveChecker {
  dataLoader: RecursiveCheckerLoader
  useReceptions: boolean
  checkDate?: Date
  stockState?: StockState

  constructor(loader: RecursiveCheckerLoader, options: RecursiveCheckerOptions = {}) {
    this.dataLoader = loader
    this.useReceptions = options.useReceptions ?? false
    this.checkDate = options.checkDate
    this.stockState = options.stockState
  }

  private erpAllocationsFor(numDoc: string): Map<string, number> {
    const map = new Map<string, number>()
    for (const alloc of this.dataLoader.getAllocationsOf(numDoc)) {
      map.set(alloc.article, (map.get(alloc.article) ?? 0) + alloc.qteAllouee)
    }
    return map
  }

  private availableStock(article: string, date: Date): number {
    if (this.stockState) {
      return this.stockState.getAvailable(article)
    }
    const stock = this.dataLoader.getStock(article)
    let available = stock ? stock.stockPhysique - stock.stockAlloue : 0
    if (this.useReceptions) {
      for (const rec of this.dataLoader.getReceptions(article)) {
        if (rec.date <= date) available += rec.quantity
      }
    }
    return available
  }

  private checkStock(article: string, quantityNeeded: number, date: Date): RecursiveCheckerResult {
    const available = this.availableStock(article, date)
    const shortage = Math.max(0, quantityNeeded - available)
    return {
      feasible: shortage === 0,
      missingComponents: shortage ? { [article]: shortage } : {},
      componentsChecked: 1,
      alerts: shortage ? [`Stock insuffisant pour ${article}: besoin=${quantityNeeded}, dispo=${available}`] : [],
    }
  }

  /**
   * Determine the need date for an OF.
   * Priority: DATE_DEBUT -> linked commande date - 2 days -> DATE_FIN - 2 days.
   */
  getDateBesoinCommande(of: OfRecord): Date {
    if (of.dateDebut) return of.dateDebut

    // Linked commande via contremarque/NUM_ORDRE_ORIGINE (not available in this minimal loader)
    if (of.dateFin) {
      const d = new Date(of.dateFin)
      d.setDate(d.getDate() - 2)
      return d
    }

    return this.checkDate ?? new Date()
  }

  checkOf(of: OfRecord): RecursiveCheckerResult {
    const dateBesoin = this.getDateBesoinCommande(of)
    return this.checkArticleRecursive(of.article, of.qteRestante, dateBesoin, 0, of.statutNum === 1, of.numOf)
  }

  checkArticleRecursive(
    article: string,
    qteBesoin: number,
    dateBesoin: Date,
    depth: number = 0,
    ofParentEstFerme: boolean = false,
    numOfParent: string | null = null,
  ): RecursiveCheckerResult {
    const articleInfo = this.dataLoader.getArticle(article)
    const nomenclature = this.dataLoader.getNomenclature(article)

    // Leaf purchase article or subcontracted article -> stock check
    if (!nomenclature || nomenclature.components.length === 0 || isSubcontracted(articleInfo)) {
      const stockResult = this.checkStock(article, qteBesoin, dateBesoin)
      if (numOfParent && ofParentEstFerme) {
        return { ...stockResult, feasible: true }
      }
      return stockResult
    }

    const erpAlloc = numOfParent ? this.erpAllocationsFor(numOfParent) : new Map<string, number>()
    const missingComponents: Record<string, number> = {}
    const alerts: string[] = []
    let componentsChecked = 0

    // First pass: resolve phantoms and collect covered real variants so that
    // direct siblings that are also phantom variants are not double-counted.
    const phantomCoveredVariants = new Set<string>()
    for (const entry of nomenclature.components) {
      const componentArticle = entry.componentArticle
      const componentInfo = this.dataLoader.getArticle(componentArticle)
      const componentBom = this.dataLoader.getNomenclature(componentArticle)
      const besoin = requiredQuantity(entry, qteBesoin)

      if (isPhantom(componentInfo) && componentBom) {
        componentsChecked++
        if (this.availableStock(componentArticle, dateBesoin) >= besoin) {
          alerts.push(`AFANT ${componentArticle} utilise stock legacy`)
          for (const variant of componentBom.components) {
            phantomCoveredVariants.add(variant.componentArticle)
          }
          continue
        }

        const variantResults = componentBom.components.map((variantEntry) =>
          this.checkArticleRecursive(
            variantEntry.componentArticle,
            requiredQuantity(variantEntry, besoin),
            dateBesoin,
            depth + 1,
            ofParentEstFerme,
            numOfParent,
          ),
        )
        const coveringIndex = variantResults.findIndex((r) => r.feasible)
        if (coveringIndex >= 0) {
          const variant = componentBom.components[coveringIndex].componentArticle
          alerts.push(`AFANT ${componentArticle} resolu par ${variant}`)
          phantomCoveredVariants.add(variant)
        } else {
          missingComponents[componentArticle] = besoin
          alerts.push(`AFANT ${componentArticle}: aucune variante complete disponible`)
        }
        variantResults.forEach((r) => {
          alerts.push(...r.alerts)
          componentsChecked += r.componentsChecked
        })
      }
    }

    for (const entry of nomenclature.components) {
      componentsChecked++
      const componentArticle = entry.componentArticle
      const componentInfo = this.dataLoader.getArticle(componentArticle)
      const besoin = requiredQuantity(entry, qteBesoin)

      // ERP allocation for this component on the parent OF -> skip feasibility check
      const alreadyAllocated = erpAlloc.get(componentArticle) ?? 0
      if (alreadyAllocated > 0) {
        alerts.push(`${componentArticle} deja alloue a ${numOfParent}, ignore`)
        continue
      }

      // Phantom articles handled in first pass
      if (isPhantom(componentInfo)) continue

      // Real variants already covered by a phantom must not be mixed
      if (phantomCoveredVariants.has(componentArticle)) {
        alerts.push(`${componentArticle} couvert par AFANT, ignore`)
        continue
      }

      // Fabricated component: look for an existing OF covering the need,
      // otherwise descend into its BOM to report missing purchased components.
      if (entry.componentType === 'FABRIQUE' && !isSubcontracted(componentInfo)) {
        const coveringOfs = this.dataLoader.getOfsByArticle(componentArticle, undefined, dateBesoin)
        const totalCover = coveringOfs.reduce((sum, of) => sum + of.qteRestante, 0)
        if (totalCover >= besoin) {
          componentsChecked += coveringOfs.length
          continue
        }

        const uncovered = besoin - totalCover
        missingComponents[componentArticle] = uncovered
        alerts.push(`Sous-assemblage ${componentArticle} non couvert: besoin=${besoin}, couvert=${totalCover}`)

        // Descend into BOM to expose missing purchase parts
        const bomResult = this.checkArticleRecursive(componentArticle, uncovered, dateBesoin, depth + 1, ofParentEstFerme, numOfParent)
        Object.assign(missingComponents, bomResult.missingComponents)
        alerts.push(...bomResult.alerts)
        componentsChecked += bomResult.componentsChecked + coveringOfs.length
        continue
      }

      // Purchased or subcontracted component -> recurse / stock check
      const subResult = this.checkArticleRecursive(componentArticle, besoin, dateBesoin, depth + 1, ofParentEstFerme, numOfParent)
      Object.assign(missingComponents, subResult.missingComponents)
      alerts.push(...subResult.alerts)
      componentsChecked += subResult.componentsChecked
    }

    const hasShortage = Object.keys(missingComponents).length > 0
    const feasible = !hasShortage || (numOfParent !== null && ofParentEstFerme)
    return { feasible, missingComponents, componentsChecked, alerts }
  }
}

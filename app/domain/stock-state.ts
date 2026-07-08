/**
 * Stock virtuel pour allocation concurrente entre OF.
 *
 * Tracke les allocations sans modifier le stock réel.
 * Utilisé par evaluateSequentialFeasibility et CommandeOFMatcher.
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import { checkFeasibility } from './feasibility.js'
import { availableAt } from './availability.js'
import { isFirm } from './rules.js'


export interface FeasibilityOptions {
  mode?: 'immediate' | 'sequential'
  /** Allocations ERP par numéro d'OF : Map<numOf, Map<article, qteAllouee>> */
  allocations?: Map<string, Map<string, number>>
}
export interface FeasibilityEntry {
  numOf: string
  article: string
  /** Qté restant à produire (reprise de l'OfInput) — sert au calcul de charge aval. */
  qteRestante: number
  feasible: boolean
  status: 'ok' | 'blocked' | 'no_bom'
  missingComponents: Record<string, number>
  alerts: string[]
  allocated: Record<string, number>
  dateBesoin: string | null
  statutNum: number
}

export interface OfInput {
  numOf: string
  article: string
  qteRestante: number
  dateDebut: string | null
  dateFin: string | null
  statutNum: number
}

/**
 * Besoins en COMPOSANTS DIRECTS (achat ET fabriqués) d'un article pour une quantité donnée.
 *
 * Tous les composants directs du BOM sont retournés — y compris les sous-ensembles fabriqués —
 * afin que la consommation séquentielle les réserve virtuellement : si l'OF A consomme un
 * sous-ensemble S, l'OF B suivant le réclamant verra S diminué. « Un composant manquant est un
 * composant manquant », achat ou fabriqué. (Les fantômes/sous-traitance sont résolus plus bas
 * dans checkFeasibility, pas au niveau direct du BOM.)
 */
function directComponentRequirements(
  article: string,
  quantity: number,
  nomenclatures: Map<string, Nomenclature>,
): Record<string, number> {
  const requirements: Record<string, number> = {}
  const bom = nomenclatures.get(article)
  if (!bom) return requirements
  for (const comp of bom.components) {
    const qty = requiredQuantity(comp, quantity)
    requirements[comp.componentArticle] = (requirements[comp.componentArticle] ?? 0) + qty
  }
  return requirements
}

function classifyFeasibility(result: { feasible: boolean; blockingComponents: Array<{ article: string }> }): 'ok' | 'blocked' | 'no_bom' {
  return result.feasible ? 'ok' : 'blocked'
}

/**
 * Vérifie la faisabilité composants pour une liste d'OF.
 *
 * @param mode — 'immediate' : chaque OF vérifié indépendamment (pas de consommation).
 *                'sequential' : OFs triés par priorité, chaque allocation consomme le stock
 *                et impacte la faisabilité des suivants (par défaut).
 */
export function evaluateSequentialFeasibility(
  ofs: OfInput[],
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  horizonEnd: Date,
  options?: FeasibilityOptions,
): Map<string, FeasibilityEntry> {
  const mode = options?.mode ?? 'immediate'

  const entries = new Map<string, FeasibilityEntry>()

  const dateBesoin = (ofInput: OfInput) => ofInput.dateDebut ?? ofInput.dateFin ?? ''

  if (mode === 'immediate') {
    for (const ofInput of ofs) {
      if (isFirm(ofInput.statutNum)) {
        entries.set(ofInput.numOf, {
          numOf: ofInput.numOf, article: ofInput.article, qteRestante: ofInput.qteRestante, feasible: true,
          status: 'ok' as const, missingComponents: {}, alerts: [], allocated: {},
          dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
        })
        continue
      }
      const ofAllocs = options?.allocations?.get(ofInput.numOf)
      // Mode "dispo instantanée" : seul le stock présent compte, PAS les réceptions
      // à venir. Aligne le badge sur le détail OF (cf. issue #11) — les deux verdicts
      // doivent répondre à la même question (dispo maintenant), sans réceptions futures.
      const result = checkFeasibility(ofInput.article, ofInput.qteRestante, flows, nomenclatures, articles, horizonEnd, 'stock_strict', undefined, ofAllocs)
      const missingComponents: Record<string, number> = {}
      for (const bc of result.blockingComponents) {
        missingComponents[bc.article] = bc.shortage
      }
      entries.set(ofInput.numOf, {
        numOf: ofInput.numOf, article: ofInput.article, qteRestante: ofInput.qteRestante, feasible: result.feasible,
        status: classifyFeasibility(result), missingComponents, alerts: [], allocated: {},
        dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
      })
    }
  } else {
    // Mode séquentiel
    const preFeasible = new Map<string, boolean>()
    for (const ofInput of ofs) {
      if (isFirm(ofInput.statutNum)) continue
      const ofAllocs = options?.allocations?.get(ofInput.numOf)
      const result = checkFeasibility(ofInput.article, ofInput.qteRestante, flows, nomenclatures, articles, horizonEnd, 'stock_plus_receptions', undefined, ofAllocs, true)
      preFeasible.set(ofInput.numOf, result.feasible)
    }
    // OF fermes : toujours faisables, pas de calcul, pas d'allocation virtuelle
    for (const ofInput of ofs) {
      if (!isFirm(ofInput.statutNum)) continue
      entries.set(ofInput.numOf, {
        numOf: ofInput.numOf, article: ofInput.article, qteRestante: ofInput.qteRestante, feasible: true,
        status: 'ok' as const, missingComponents: {}, alerts: [], allocated: {},
        dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
      })
    }
    // OF non fermes : allocation virtuelle séquentielle
    const nonFirm = ofs.filter((o) => !isFirm(o.statutNum))
    const sorted = nonFirm.sort((a, b) => {
      const pa = isFirm(a.statutNum) ? 0 : 1
      const pb = isFirm(b.statutNum) ? 0 : 1
      if (pa !== pb) return pa - pb
      const da = dateBesoin(a)
      const db = dateBesoin(b)
      if (da !== db) return da < db ? -1 : 1
      const fa = preFeasible.get(a.numOf) ? 0 : 1
      const fb = preFeasible.get(b.numOf) ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.numOf.localeCompare(b.numOf)
    })
    // Mode proactif : les composants fabriqués sont vérifiés contre la quantité disponible
    // (stock + supply) comme les achats — faisabilité réelle + consommation séquentielle.
    const mutableFlows = flows.map((f) => ({ ...f }))
    for (const ofInput of sorted) {
      const result = checkFeasibility(ofInput.article, ofInput.qteRestante, mutableFlows, nomenclatures, articles, horizonEnd, 'stock_strict', undefined, undefined, true)
      const allocated: Record<string, number> = {}
      if (result.feasible) {
        const requirements = directComponentRequirements(ofInput.article, ofInput.qteRestante, nomenclatures)
        for (const [article, besoin] of Object.entries(requirements)) {
          // Cap = quantité réellement disponible (stock + supply) sur les flows mutés, pour
          // réserver aussi les sous-ensembles fabriqués et réduire la couverture des OF suivants.
          // N'entre ici que pour un OF déjà jugé faisable en 'stock_strict' (ligne ci-dessus) —
          // 'stock_plus_receptions' ici ne fait que dimensionner la RÉSERVATION virtuelle, pas
          // le verdict. Valeur historique (ex-défaut implicite d'availableAt) préservée telle quelle.
          const qte = Math.min(besoin, availableAt(mutableFlows, article, horizonEnd, 'stock_plus_receptions'))
          if (qte > 0) allocated[article] = qte
        }
        if (Object.keys(allocated).length > 0) {
          for (const [article, qty] of Object.entries(allocated)) {
            let remaining = qty
            for (const flow of mutableFlows) {
              if (remaining <= 0) break
              if (flow.article === article && flow.direction === 'supply' && flow.quantity > 0) {
                const taken = Math.min(remaining, flow.quantity)
                flow.quantity -= taken
                remaining -= taken
              }
            }
          }
        }
      }
      const missingComponents: Record<string, number> = {}
      for (const bc of result.blockingComponents) {
        missingComponents[bc.article] = bc.shortage
      }
      entries.set(ofInput.numOf, {
        numOf: ofInput.numOf, article: ofInput.article, qteRestante: ofInput.qteRestante, feasible: result.feasible,
        status: classifyFeasibility(result), missingComponents, alerts: [], allocated,
        dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
      })
    }
  }
  return entries
}

export class StockState {
  private initialStock: Map<string, number>
  private allocatedStock: Map<string, number> = new Map()

  constructor(initialStock: Map<string, number> | Record<string, number>) {
    if (initialStock instanceof Map) {
      this.initialStock = new Map(initialStock)
    } else {
      this.initialStock = new Map(Object.entries(initialStock))
    }
  }

  getAvailable(article: string): number {
    return (this.initialStock.get(article) ?? 0) - (this.allocatedStock.get(article) ?? 0)
  }

  allocate(_ofNum: string, allocations: Map<string, number> | Record<string, number>): void {
    const entries = allocations instanceof Map ? allocations.entries() : Object.entries(allocations)
    for (const [article, quantity] of entries) {
      const current = this.allocatedStock.get(article) ?? 0
      this.allocatedStock.set(article, current + quantity)
    }
  }

  addSupply(article: string, quantity: number): void {
    const current = this.initialStock.get(article) ?? 0
    this.initialStock.set(article, current + quantity)
  }

  getInitialStock(article: string): number {
    return this.initialStock.get(article) ?? 0
  }

  getAllocated(article: string): number {
    return this.allocatedStock.get(article) ?? 0
  }
}

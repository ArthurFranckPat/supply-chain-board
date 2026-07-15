/**
 * Types ERP partagés (stock, réceptions, OF) + helpers de classification article.
 *
 * Historique : ce fichier portait la classe RecursiveChecker (checker récursif porté du
 * Python). Supprimée à l'étape 3 de l'issue #73 — le moteur de rupture unique
 * (rupture-engine.ts) rend tous les verdicts. Restent les types de records consommés par
 * les repositories, loaders et le diagnostic.
 */

import type { Article } from './models/article.js'

export interface StockRecord {
  stockPhysique: number
  stockAlloue: number
  /** Stock sous contrôle qualité (non disponible tant que le CQ n'est pas levé). Optionnel. */
  stockQc?: number
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

export function isSubcontracted(article: Article | undefined): boolean {
  return article?.category?.toUpperCase().startsWith('ST') ?? false
}

export function isPhantom(article: Article | undefined): boolean {
  return article?.category?.toUpperCase() === 'AFANT'
}

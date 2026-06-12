/**
 * Planning Board -- merge ERP OF data with local overrides,
 * then build effective Flow projections for the planning horizon.
 */

import type { Flow } from './models/flow.js'

// -- Types --

export interface OfFromErp {
  numOf: string
  article: string
  description: string
  statutNum: number
  dateDebut: Date
  dateFin: Date
  qteRestante: number
}

export interface OfOverride {
  numOf: string
  dateDebut: string | null
  dateFin: string | null
  status: number | null
  note: string | null
  updatedAt: string
}

export interface MergedOf {
  numOf: string
  article: string
  description: string
  statutNum: number
  dateDebut: string
  dateFin: string
  qteRestante: number
  modified: boolean
  note?: string | null
}

// -- Merge --

export function mergeOfWithOverride(base: OfFromErp, override: OfOverride | null): MergedOf {
  if (!override) {
    return {
      numOf: base.numOf,
      article: base.article,
      description: base.description,
      statutNum: base.statutNum,
      dateDebut: toIsoDate(base.dateDebut),
      dateFin: toIsoDate(base.dateFin),
      qteRestante: base.qteRestante,
      modified: false,
    }
  }

  const hasExplicitOverride =
    override.dateDebut !== null ||
    override.dateFin !== null ||
    override.status !== null ||
    override.note !== null

  return {
    numOf: base.numOf,
    article: base.article,
    description: base.description,
    statutNum: override.status ?? base.statutNum,
    dateDebut: override.dateDebut ?? toIsoDate(base.dateDebut),
    dateFin: override.dateFin ?? toIsoDate(base.dateFin),
    qteRestante: base.qteRestante,
    modified: hasExplicitOverride,
    note: override.note,
  }
}

// -- Effective Flows --

export function buildEffectiveFlows(
  merged: MergedOf[],
  windowStart?: Date,
  windowEnd?: Date,
): Flow[] {
  return merged
    .filter((of) => {
      if (!windowStart || !windowEnd) return true
      const endDate = new Date(of.dateFin)
      return endDate >= windowStart && endDate <= windowEnd
    })
    .map((of) => ({
      article: of.article,
      quantity: of.qteRestante,
      direction: 'supply' as const,
      date: new Date(of.dateFin),
      origin: {
        type: 'of' as const,
        id: of.numOf,
        status: of.statutNum as 1 | 2 | 3,
        statutLabel: null,
        typeOf: null,
        typeOfLabel: null,
        designation: null,
      },
    }))
}

// -- Helpers --

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// -- Override Store row type --

export interface OfOverrideRow {
  numOf: string
  dateDebut: string | null
  dateFin: string | null
  status: number | null
  note: string | null
  updatedAt: string
}

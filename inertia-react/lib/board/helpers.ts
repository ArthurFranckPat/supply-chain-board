/**
 * Helpers dérivés du store board (consommés via sélecteurs zustand / useMemo).
 * Port React de inertia/lib/board/store.ts (partie helpers purs).
 */

import type { BoardState, StatusKey, BatchItem } from './store'
import type { Card } from '@/lib/board/types'

// Copie des constants depuis store.ts pour éviter les imports circulaires
const STATUS_FILTER_KEYS = ['ferme', 'planifie', 'suggere'] as const

const normStatus = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const SCOPE_CFG: Record<
  import('@/lib/board/types').SearchScope,
  { url: (q: string) => string; key: string; attr: (c: Card, lineCode: string) => string }
> = {
  poste: {
    url: () => '',
    key: 'workstations',
    attr: (_c, lineCode) => lineCode,
  },
  of: {
    url: () => '',
    key: 'ofs',
    attr: (c) => c.id,
  },
  pf: {
    url: () => '',
    key: 'articles',
    attr: (c) => c.article ?? '',
  },
  composant: {
    url: () => '',
    key: 'articles',
    attr: (c) => c.article ?? '',
  },
}

/** La carte passe le filtre statut (Ferme/Planifié/Suggéré). */
export function cardStatusOk(state: BoardState, card: Card): boolean {
  const key = normStatus(card.status) as StatusKey
  if (!STATUS_FILTER_KEYS.includes(key)) return true
  return state.statusFilter.has(key)
}

/** La carte matche la requête courante (scope) + le filtre statut. */
export function cardMatches(state: BoardState, card: Card, lineCode: string): boolean {
  if (!cardStatusOk(state, card)) return false
  const q = state.query.trim()
  if (!q) return true
  const ms = state.matchSet
  if (ms === null) return false
  return ms.has(SCOPE_CFG[state.scope].attr(card, lineCode).toLowerCase())
}

/** Une ligne reste visible si elle matche (poste) ou tient ≥1 carte matchée. */
export function lineVisible(state: BoardState, lineCode: string): boolean {
  const q = state.query.trim()
  if (!q) return true
  const ms = state.matchSet
  if (state.scope === 'poste' && ms !== null && ms.has(lineCode.toLowerCase())) return true
  const line = state.board.lines.find((l) => l.code === lineCode)
  if (!line) return false
  return line.dayCells.some((dc) => dc.cards.some((c) => cardMatches(state, c, lineCode)))
}

/** Charge par colonne (somme des heures des cartes visibles). */
export function computeDayLoad(state: BoardState): number[] {
  const sums = new Array<number>(state.board.cols).fill(0)
  for (const line of state.board.lines) {
    if (!lineVisible(state, line.code)) continue
    line.dayCells.forEach((dc, col) => {
      for (const card of dc.cards) {
        if (cardMatches(state, card, line.code)) sums[col] += card.hours
      }
    })
  }
  return sums
}

/** Charge hebdo par ligne (recomputée live depuis les positions des cartes). */
export function lineWeekLoads(state: BoardState, lineCode: string) {
  const line = state.board.lines.find((l) => l.code === lineCode)
  if (!line) return []
  const byWeek: Record<number, number> = {}
  line.dayCells.forEach((dc, col) => {
    const wk = state.board.colWeek[col]
    if (wk === undefined) return
    for (const card of dc.cards)
      if (cardStatusOk(state, card)) byWeek[wk] = (byWeek[wk] ?? 0) + card.hours
  })
  return line.weekLoads.map((wl) => {
    const hours = Math.round((byWeek[wl.week] ?? 0) * 10) / 10
    const cap = state.board.weekCaps[String(wl.week)] ?? 0
    const pct = cap > 0 ? Math.round((hours / cap) * 100) : 0
    const barClass = pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500'
    return { week: wl.week, hours, pct, barClass }
  })
}

export function feasOf(state: BoardState, numOf: string): import('@/lib/board/types').FeasStatus | undefined {
  return state.feasibility[numOf]
}

export function statusActive(state: BoardState, s: StatusKey): boolean {
  return state.statusFilter.has(s)
}

export function batchCounts(state: BoardState) {
  let ok = 0
  let err = 0
  let run = 0
  for (const k in state.batch) {
    const s = state.batch[k].st
    if (s === 'ok') ok++
    else if (s === 'error') err++
    else run++
  }
  return { ok, err, run, total: ok + err + run }
}

export { STATUS_FILTER_KEYS, normStatus }
export type { StatusKey, BatchItem }

/**
 * Store zustand du board planification (order-grid) — port React du Solid
 * inertia/lib/orders/store.ts.
 *
 * Drag **en temps seul** : on n'autorise pas le changement de poste (rangée figée
 * par la gamme). Override de date = PATCH endpoint dédié ; rollback + toast en cas d'échec.
 *
 * Filtres entièrement client-side (toutes les lignes sont déjà chargées via props) :
 *  - recherche live + scope (poste / commande / article / client)
 *  - cases à cocher type commande (MTS/MTO/NOR) et nature (COMMANDE/PREVISION)
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import { router } from '@inertiajs/react'
import type { OrderBoardData, OrderCard, OrderSearchScope } from '@/lib/orders/types'
import type { FeasibilityMode, FeasStatus } from '@/lib/board/types'
import { route } from '@/lib/routes'

const ALL_TYPES = ['MTS', 'MTO', 'NOR'] as const
const ALL_NATURES = ['COMMANDE', 'PREVISION'] as const

type StatusKey = (typeof ALL_TYPES)[number] | (typeof ALL_NATURES)[number]

interface OrderBoardState {
  board: OrderBoardData
  query: string
  scope: OrderSearchScope
  // Sélection des filtres : un Set vide ⇒ aucun masquage (tout visible).
  typeFilter: Set<string>
  natureFilter: Set<string>
  // Filtre atelier (STOLOC, issue #36) : vide ⇒ tous les ateliers visibles.
  atelierFilter: Set<string>
  // ── Faisabilité (issue #21) ──
  mode: FeasibilityMode
  feasibility: Record<string, FeasStatus>
  feasLoading: boolean

  // Actions
  setBoard: (b: OrderBoardData) => void
  reset: (next: OrderBoardData) => void
  updateData: (next: OrderBoardData) => void

  onQueryInput: (value: string) => void
  onScopeChange: (value: OrderSearchScope) => void
  clearSearch: () => void

  toggleType: (t: string) => void
  toggleNature: (n: string) => void
  toggleAtelier: (code: string) => void
  clearAtelier: () => void

  moveCard: (id: string, fromLineCode: string, toCol: number, toIso: string) => void
  resetOverride: (id: string) => void

  // Faisabilité
  setMode: (m: FeasibilityMode) => void
  runFeasibility: (from: string, to: string) => void

  // Helpers dérivés (consommés via sélecteurs)
  cardMatches: (card: OrderCard, lineCode: string) => boolean
  lineVisible: (lineCode: string) => boolean
  dayLoad: () => number[]
  dayLoadSplit: () => { direct: number[]; amont: number[] }
  lineWeekLoads: (lineCode: string) => ReturnType<typeof import('./orders-store').lineWeekLoads>
  feasOf: (cardId: string) => FeasStatus | undefined
}

const EMPTY_BOARD: OrderBoardData = {
  days: [],
  lines: [],
  ateliers: [],
  weekSpans: [],
  cols: 0,
  colWeek: [],
  weekCaps: {},
}

// ---------------------------------------------------------------------------
// Helpers immuables
// ---------------------------------------------------------------------------

function findCardPos(
  board: OrderBoardData,
  id: string
): { line: number; col: number; idx: number; card: OrderCard } | null {
  for (let li = 0; li < board.lines.length; li++) {
    const cells = board.lines[li].dayCells
    for (let ci = 0; ci < cells.length; ci++) {
      const idx = cells[ci].cards.findIndex((c) => c.id === id)
      if (idx !== -1) return { line: li, col: ci, idx, card: cells[ci].cards[idx] }
    }
  }
  return null
}

/** Déplace immuablement une carte (from → to), gère same-line et same-col. */
function moveCardInBoard(
  board: OrderBoardData,
  fromLine: number,
  fromCol: number,
  fromIdx: number,
  toLine: number,
  toCol: number
): OrderBoardData {
  const card = board.lines[fromLine].dayCells[fromCol].cards[fromIdx]
  const lines = board.lines.slice()
  if (fromLine === toLine) {
    const cells = board.lines[fromLine].dayCells.slice()
    cells[fromCol] = {
      ...cells[fromCol],
      cards: cells[fromCol].cards.filter((_, i) => i !== fromIdx),
    }
    const targetBase =
      fromCol === toCol ? cells[toCol].cards : board.lines[toLine].dayCells[toCol].cards
    cells[toCol] = { ...cells[toCol], cards: [...targetBase, card] }
    lines[fromLine] = { ...board.lines[fromLine], dayCells: cells }
  } else {
    const srcCells = board.lines[fromLine].dayCells.slice()
    srcCells[fromCol] = {
      ...srcCells[fromCol],
      cards: srcCells[fromCol].cards.filter((_, i) => i !== fromIdx),
    }
    lines[fromLine] = { ...board.lines[fromLine], dayCells: srcCells }
    const dstCells = board.lines[toLine].dayCells.slice()
    dstCells[toCol] = { ...dstCells[toCol], cards: [...dstCells[toCol].cards, card] }
    lines[toLine] = { ...board.lines[toLine], dayCells: dstCells }
  }
  return { ...board, lines }
}

// ---------------------------------------------------------------------------
// Helper dérivé : charge hebdo par ligne
// ---------------------------------------------------------------------------

export function lineWeekLoads(
  board: OrderBoardData,
  lineCode: string,
  cardMatchesFn: (card: OrderCard, lineCode: string) => boolean
) {
  const line = board.lines.find((l) => l.code === lineCode)
  if (!line) return []
  const directByWeek: Record<number, number> = {}
  const induitByWeek: Record<number, number> = {}
  line.dayCells.forEach((dc, col) => {
    const wk = board.colWeek[col]
    if (wk === undefined) return
    for (const card of dc.cards) {
      if (!cardMatchesFn(card, lineCode)) continue
      if (card.induit) induitByWeek[wk] = (induitByWeek[wk] ?? 0) + card.hours
      else directByWeek[wk] = (directByWeek[wk] ?? 0) + card.hours
    }
  })
  return line.weekLoads.map((wl) => {
    const direct = Math.round((directByWeek[wl.week] ?? 0) * 10) / 10
    const induit = Math.round((induitByWeek[wl.week] ?? 0) * 10) / 10
    const total = direct + induit
    const cap = board.weekCaps[String(wl.week)] ?? 0
    const pct = cap > 0 ? Math.round((total / cap) * 100) : 0
    const barClass = pct > 100 ? 'bg-destructive' : pct >= 90 ? 'bg-suggere' : 'bg-ferme'
    return { week: wl.week, direct, induit, hours: total, pct, barClass }
  })
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOrderBoardStore = create<OrderBoardState>((set, get) => ({
  board: EMPTY_BOARD,
  query: '',
  scope: 'poste',
  typeFilter: new Set(ALL_TYPES),
  natureFilter: new Set(ALL_NATURES),
  atelierFilter: new Set(),
  mode: 'immediate',
  feasibility: {},
  feasLoading: false,

  setBoard: (b) => set({ board: b }),

  reset: (next) =>
    set({
      board: next,
      query: '',
      typeFilter: new Set(ALL_TYPES),
      natureFilter: new Set(ALL_NATURES),
      atelierFilter: new Set(),
      feasibility: {},
    }),

  updateData: (next) => set({ board: next }),

  onQueryInput: (value) => set({ query: value }),

  onScopeChange: (value) => set({ scope: value }),

  clearSearch: () => set({ query: '' }),

  toggleType: (t) =>
    set((state) => {
      const next = new Set(state.typeFilter)
      next.has(t) ? next.delete(t) : next.add(t)
      return { typeFilter: next }
    }),

  toggleNature: (n) =>
    set((state) => {
      const next = new Set(state.natureFilter)
      next.has(n) ? next.delete(n) : next.add(n)
      return { natureFilter: next }
    }),

  toggleAtelier: (code) =>
    set((state) => {
      const next = new Set(state.atelierFilter)
      next.has(code) ? next.delete(code) : next.add(code)
      return { atelierFilter: next }
    }),

  clearAtelier: () => set({ atelierFilter: new Set() }),

  moveCard: (id, fromLineCode, toCol, toIso) => {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return

    const board = get().board
    const from = findCardPos(board, id)
    if (!from) return
    // Interdit cross-row (poste figé par la gamme).
    if (board.lines[from.line].code !== fromLineCode) {
      toast('Poste figé par la gamme — déplacez seulement le jour.')
      return
    }
    if (from.col === toCol) return

    const toLine = board.lines.findIndex((l) => l.code === fromLineCode)
    if (toLine === -1) return
    const snapshot = { line: from.line, col: from.col, idx: from.idx }
    const card = from.card

    set({ board: moveCardInBoard(board, from.line, from.col, from.idx, toLine, toCol) })
    set({ feasibility: {} })

    fetch(route('order_planning.update', { order: numCommande, line: ligne }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLivraison: toIso }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      })
      .catch((err) => {
        const cur = get().board
        const rb = findCardPos(cur, id)
        if (!rb) return
        const lines = cur.lines.slice()
        const tcells = lines[toLine].dayCells.slice()
        tcells[toCol] = {
          ...tcells[toCol],
          cards: tcells[toCol].cards.filter((c) => c.id !== id),
        }
        lines[toLine] = { ...lines[toLine], dayCells: tcells }
        const fcells = lines[from.line].dayCells.slice()
        fcells[from.col] = {
          ...fcells[from.col],
          cards: [
            ...fcells[from.col].cards.slice(0, from.idx),
            card,
            ...fcells[from.col].cards.slice(from.idx),
          ],
        }
        lines[from.line] = { ...lines[from.line], dayCells: fcells }
        set({ board: { ...cur, lines } })
        toast.error(`Déplacement échoué : ${err.message}`)
      })
  },

  resetOverride: (id) => {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return
    fetch(route('order_planning.reset_override', { order: numCommande, line: ligne }), {
      method: 'DELETE',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        toast('Override réinitialisé')
        router.reload()
      })
      .catch((err) => toast(`Échec : ${err.message}`))
  },

  setMode: (m) => set({ mode: m }),

  runFeasibility: (from, to) => {
    if (!from || !to || get().feasLoading) return
    set({ feasLoading: true })
    fetch(route('planning_board.board_feasibility'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, mode: get().mode }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{
          orders?: Array<{
            numCommande: string
            ligne?: string | null
            ofs?: Array<{
              feasible?: boolean | null
              missingComponents?: Record<string, number>
              qcComponents?: Record<string, number>
            }>
          }>
        }>
      })
      .then((data) => {
        const map: Record<string, FeasStatus> = {}
        let nbOk = 0
        let nbBlocked = 0
        let nbQc = 0
        for (const o of data.orders ?? []) {
          if (!o.ligne) continue
          const cardId = `${o.numCommande}#${o.ligne}`
          const ofs = o.ofs ?? []
          const blockedOfs = ofs.filter((of) => of.feasible === false)
          // Dépendance CQ agrégée sur la ligne : un seul OF tributaire suffit à la signaler.
          const qcComponents: Record<string, number> = {}
          for (const of of ofs) {
            for (const [comp, qty] of Object.entries(of.qcComponents ?? {})) {
              qcComponents[comp] = (qcComponents[comp] ?? 0) + qty
            }
          }
          const dependsOnQc = Object.keys(qcComponents).length > 0
          if (blockedOfs.length > 0) {
            const missing = new Set<string>()
            for (const of of blockedOfs) {
              for (const comp of Object.keys(of.missingComponents ?? {})) missing.add(comp)
            }
            map[cardId] = {
              st: 'blocked',
              missing: Array.from(missing),
              ...(dependsOnQc ? { qcComponents } : {}),
            }
            nbBlocked++
          } else if (dependsOnQc) {
            map[cardId] = { st: 'qc', missing: [], qcComponents }
            nbQc++
          } else {
            map[cardId] = { st: 'ok', missing: [] }
            nbOk++
          }
        }
        set({ feasibility: map })
        const parts = [
          nbBlocked > 0 ? `${nbBlocked} bloquée(s)` : null,
          nbQc > 0 ? `${nbQc} sous CQ` : null,
          `${nbOk} OK`,
        ].filter(Boolean)
        toast(parts.join(' · '))
      })
      .catch((err) => toast(`Échec : ${err.message}`))
      .finally(() => set({ feasLoading: false }))
  },

  // Helpers dérivés inline (pour éviter les imports circulaires)
  cardMatches: (card, lineCode) => {
    const state = get()
    // Carte induite (ghost) : charge structurelle, toujours visible, hors filtres.
    if (card.induit) return true
    const tf = state.typeFilter
    const t = card.orderType ?? 'NOR'
    if (!tf.has(t)) return false
    if (!state.natureFilter.has(card.nature)) return false

    const q = state.query.trim()
    if (!q) return true
    switch (state.scope) {
      case 'poste':
        return lineCode.toLowerCase().includes(q.toLowerCase())
      case 'commande':
        return card.id.toLowerCase().includes(q.toLowerCase())
      case 'article': {
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
        const nq = norm(q)
        return norm(card.article ?? '').includes(nq) || norm(card.title).includes(nq)
      }
      case 'client':
        return (card.customer ?? '').toLowerCase().includes(q.toLowerCase())
      default:
        return true
    }
  },

  lineVisible: (lineCode) => {
    const state = get()
    const line = state.board.lines.find((l) => l.code === lineCode)
    if (!line) return false
    const af = state.atelierFilter
    if (af.size > 0 && !(line.atelier && af.has(line.atelier))) return false
    return line.dayCells.some((dc) => dc.cards.some((c) => get().cardMatches(c, lineCode)))
  },

  dayLoad: () => {
    const state = get()
    const sums = new Array<number>(state.board.cols).fill(0)
    for (const line of state.board.lines) {
      if (!state.lineVisible(line.code)) continue
      line.dayCells.forEach((dc, col) => {
        for (const card of dc.cards) {
          if (state.cardMatches(card, line.code)) sums[col] += card.hours
        }
      })
    }
    return sums
  },

  dayLoadSplit: () => {
    const state = get()
    const direct = new Array<number>(state.board.cols).fill(0)
    const amont = new Array<number>(state.board.cols).fill(0)
    for (const line of state.board.lines) {
      if (!state.lineVisible(line.code)) continue
      line.dayCells.forEach((dc, col) => {
        for (const card of dc.cards) {
          if (!state.cardMatches(card, line.code)) continue
          if (card.induit) amont[col] += card.hours
          else direct[col] += card.hours
        }
      })
    }
    return { direct, amont }
  },

  lineWeekLoads: (lineCode) => {
    const state = get()
    return lineWeekLoads(state.board, lineCode, state.cardMatches)
  },

  feasOf: (cardId) => get().feasibility[cardId],
}))

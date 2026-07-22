/**
 * Store zustand du board /programme — port React du Solid
 * inertia/lib/board/store.ts (522 l.). État + actions ; helpers dérivés exportés
 * séparément (consommés via sélecteurs zustand / useMemo dans les composants).
 *
 * Mises à jour immuables chirurgicales (pas d'immer) : seules les lignes touchées
 * changent de réf → sélecteurs par index zustand → re-renders minimaux au drop.
 *
 * Singleton module-level (un seul board vivant à la fois). Caches / pendings /
 * intercepteur aussi module-level.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import { router } from '@inertiajs/react'
import type { BoardData, Card, SearchScope, FeasibilityMode, FeasStatus } from '@/lib/board/types'
import { route } from '@/lib/routes'

// ---------------------------------------------------------------------------
// Config statique
// ---------------------------------------------------------------------------

/** Une route backend par scope. Chacune renvoie le matched set COMPLET (pas juste
 *  la fenêtre visible) → robuste au volume et aux OF hors fenêtre (#7). */
const SCOPE_CFG: Record<
  SearchScope,
  { url: (q: string) => string; key: string; attr: (c: Card, lineCode: string) => string }
> = {
  poste: {
    url: (q) => `${route('planning_board.search_poste')}?q=${encodeURIComponent(q)}`,
    key: 'workstations',
    attr: (_c, lineCode) => lineCode,
  },
  of: {
    url: (q) => `${route('planning_board.search_of')}?q=${encodeURIComponent(q)}`,
    key: 'ofs',
    attr: (c) => c.id,
  },
  pf: {
    url: (q) => `${route('planning_board.search_pf')}?q=${encodeURIComponent(q)}`,
    key: 'articles',
    attr: (c) => c.article ?? '',
  },
  composant: {
    url: (q) => route('planning_board.articles_by_component', { component: q.toUpperCase() }),
    key: 'articles',
    attr: (c) => c.article ?? '',
  },
}

const STATUS_FILTER_KEYS = ['ferme', 'planifie', 'suggere'] as const
export type StatusKey = (typeof STATUS_FILTER_KEYS)[number]
const normStatus = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

type BatchItem = { st: 'running' | 'ok' | 'error'; msg?: string }
export type MoveIntercept = (m: {
  numOf: string
  toLineCode: string
  toCol: number
  toIso: string
  dateFinIso?: string
}) => void

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

const EMPTY_BOARD: BoardData = {
  days: [],
  lines: [],
  weekSpans: [],
  cols: 0,
  colWeek: [],
  weekCaps: {},
}

interface BoardState {
  board: BoardData
  query: string
  scope: SearchScope
  /** null = requête en cours → rien ne matche (tout grisé). */
  matchSet: Set<string> | null
  mode: FeasibilityMode
  feasibility: Record<string, FeasStatus>
  feasLoading: boolean
  statusFilter: Set<StatusKey>
  selectMode: boolean
  selected: Set<string>
  batch: Record<string, BatchItem>
  batchRunning: boolean

  // Board
  setBoard: (b: BoardData) => void
  reset: (next: BoardData) => void
  updateData: (next: BoardData) => void
  moveCard: (
    numOf: string,
    toLineCode: string,
    toCol: number,
    toIso: string,
    dateFinIso?: string
  ) => void
  moveCardToIso: (numOf: string, toLineCode: string, toIso: string) => void
  transformCard: (oldId: string, newId: string) => void
  setMoveInterceptor: (fn: MoveIntercept | null) => void

  // Recherche + filtres
  onQueryInput: (value: string) => void
  onScopeChange: (value: SearchScope) => void
  clearSearch: () => void
  setMode: (m: FeasibilityMode) => void
  toggleStatus: (s: StatusKey) => void

  // Faisabilité
  runFeasibility: (from: string, to: string) => void

  // Sélection multi-OF + batch firm (#34)
  enterSelect: () => void
  exitSelect: () => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  batchFirm: (ids: string[]) => Promise<void>
}

export type { BoardState }

// ---------------------------------------------------------------------------
// Helpers immuables
// ---------------------------------------------------------------------------

function findCardPos(
  board: BoardData,
  numOf: string
): { line: number; col: number; idx: number; card: Card } | null {
  for (let li = 0; li < board.lines.length; li++) {
    const cells = board.lines[li].dayCells
    for (let ci = 0; ci < cells.length; ci++) {
      const idx = cells[ci].cards.findIndex((c) => c.id === numOf)
      if (idx !== -1) return { line: li, col: ci, idx, card: cells[ci].cards[idx] }
    }
  }
  return null
}

/** Déplace immuablement une carte (from → to), gère same-line et same-col. */
function moveCardInBoard(
  board: BoardData,
  fromLine: number,
  fromCol: number,
  fromIdx: number,
  toLine: number,
  toCol: number
): BoardData {
  const card = board.lines[fromLine].dayCells[fromCol].cards[fromIdx]
  const lines = board.lines.slice()
  if (fromLine === toLine) {
    const cells = board.lines[fromLine].dayCells.slice()
    cells[fromCol] = {
      ...cells[fromCol],
      cards: cells[fromCol].cards.filter((_, i) => i !== fromIdx),
    }
    // base cible = cellule déjà filtrée si fromCol===toCol, sinon cellule brute
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
// Singletons module-level
// ---------------------------------------------------------------------------

const searchCache = new Map<string, Set<string>>()
let pendingSeq = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null
let moveInterceptor: MoveIntercept | null = null

// ---------------------------------------------------------------------------
// runSearch — closure sur set, debounce + race-guard
// ---------------------------------------------------------------------------

function runSearch(scope: SearchScope, rawQuery: string, set: (partial: Partial<BoardState>) => void) {
  const q = rawQuery.trim().toLowerCase()
  if (!q) {
    set({ matchSet: new Set<string>() })
    return
  }
  const cacheKey = `${scope} ${q}`
  const cached = searchCache.get(cacheKey)
  if (cached) {
    set({ matchSet: cached })
    return
  }
  set({ matchSet: null }) // loading → tout grisé
  const seq = ++pendingSeq
  fetch(SCOPE_CFG[scope].url(q))
    .then((r): Promise<Record<string, string[]>> => (r.ok ? r.json() : Promise.resolve({})))
    .then((data) => {
      const matched = new Set<string>(
        (data[SCOPE_CFG[scope].key] || []).map((v) => v.toLowerCase())
      )
      searchCache.set(cacheKey, matched)
      const s = useBoardStore.getState()
      if (seq === pendingSeq && s.scope === scope && s.query.trim().toLowerCase() === q) {
        set({ matchSet: matched })
      }
    })
    .catch(() => {
      searchCache.set(cacheKey, new Set<string>())
      const s = useBoardStore.getState()
      if (seq === pendingSeq && s.scope === scope) set({ matchSet: new Set<string>() })
    })
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBoardStore = create<BoardState>((set, get) => ({
  board: EMPTY_BOARD,
  query: '',
  scope: 'poste',
  matchSet: new Set<string>(),
  mode: 'immediate',
  feasibility: {},
  feasLoading: false,
  statusFilter: new Set<StatusKey>(STATUS_FILTER_KEYS),
  selectMode: false,
  selected: new Set<string>(),
  batch: {},
  batchRunning: false,

  setBoard: (b) => set({ board: b }),

  reset: (next) =>
    set({
      board: next,
      query: '',
      matchSet: new Set<string>(),
      statusFilter: new Set<StatusKey>(STATUS_FILTER_KEYS),
      feasibility: {},
    }),

  updateData: (next) => set({ board: next }),

  setMoveInterceptor: (fn) => {
    moveInterceptor = fn
  },

  moveCard: (numOf, toLineCode, toCol, toIso, dateFinIso) => {
    const board = get().board
    const from = findCardPos(board, numOf)
    if (!from) return
    const toLine = board.lines.findIndex((l) => l.code === toLineCode)
    if (toLine === -1) return

    set({ board: moveCardInBoard(board, from.line, from.col, from.idx, toLine, toCol) })
    // Un OF déplacé change de date/poste → badges de faisabilité potentiellement faux.
    set({ feasibility: {} })

    // Mode scénario (#57) : capture la mutation au lieu de PATCHer.
    if (moveInterceptor) {
      moveInterceptor({ numOf, toLineCode, toCol, toIso, dateFinIso })
      return
    }

    fetch(route('planning_board.update', { of: numOf }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workstation: toLineCode,
        dateDebut: toIso,
        ...(dateFinIso ? { dateFin: dateFinIso } : {}),
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      })
      .catch((err) => {
        // Rollback : retire de la cible, remet à la source.
        const cur = get().board
        const rb = findCardPos(cur, numOf)
        if (!rb) return
        const lines = cur.lines.slice()
        // retire de toLine/toCol
        const tcells = lines[toLine].dayCells.slice()
        tcells[toCol] = {
          ...tcells[toCol],
          cards: tcells[toCol].cards.filter((c) => c.id !== numOf),
        }
        lines[toLine] = { ...lines[toLine], dayCells: tcells }
        // remet à from
        const fcells = lines[from.line].dayCells.slice()
        fcells[from.col] = {
          ...fcells[from.col],
          cards: [
            ...fcells[from.col].cards.slice(0, from.idx),
            from.card,
            ...fcells[from.col].cards.slice(from.idx),
          ],
        }
        lines[from.line] = { ...lines[from.line], dayCells: fcells }
        set({ board: { ...cur, lines } })
        toast.error(`Déplacement échoué : ${err.message}`)
      })
  },

  moveCardToIso: (numOf, toLineCode, toIso) => {
    const board = get().board
    const toCol = board.lines[0]?.dayCells.findIndex((dc) => dc.iso === toIso) ?? -1
    const toLine = board.lines.findIndex((l) => l.code === toLineCode)
    if (toCol === -1 || toLine === -1) return
    const from = findCardPos(board, numOf)
    if (!from) return
    set({ board: moveCardInBoard(board, from.line, from.col, from.idx, toLine, toCol) })
    set({ feasibility: {} })
  },

  transformCard: (oldId, newId) => {
    if (oldId === newId) return
    const board = get().board
    let changed = false
    const lines = board.lines.map((line) => {
      if (changed) return line
      let lineChanged = false
      const dayCells = line.dayCells.map((cell) => {
        if (!cell.cards.some((x) => x.id === oldId)) return cell
        lineChanged = true
        return {
          ...cell,
          cards: cell.cards.map((x) =>
            x.id === oldId
              ? { ...x, id: newId, href: x.href.replace(oldId, newId), status: 'ferme' as Card['status'] }
              : x
          ),
        }
      })
      if (!lineChanged) return line
      changed = true
      return { ...line, dayCells }
    })
    if (changed) set({ board: { ...board, lines } })
  },

  // ── Recherche + filtres ──

  toggleStatus: (s) =>
    set((state) => {
      const next = new Set(state.statusFilter)
      next.has(s) ? next.delete(s) : next.add(s)
      return { statusFilter: next }
    }),

  setMode: (m) => set({ mode: m }),

  onQueryInput: (value) => {
    set({ query: value })
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      searchTimer = null
      runSearch(get().scope, value, set)
    }, 180)
  },

  onScopeChange: (value) => {
    set({ scope: value })
    const q = get().query
    if (q.trim()) runSearch(value, q, set)
  },

  clearSearch: () => set({ query: '', matchSet: new Set<string>() }),

  // ── Faisabilité ──

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
          ofs?: { numOf: string; feasible?: boolean; missingComponents?: Record<string, unknown> }[]
        }>
      })
      .then((data) => {
        const map: Record<string, FeasStatus> = {}
        let nbOk = 0
        let nbBlocked = 0
        for (const of of data.ofs ?? []) {
          if (of.feasible === false) {
            map[of.numOf] = { st: 'blocked', missing: Object.keys(of.missingComponents ?? {}) }
            nbBlocked++
          } else if (of.feasible === true) {
            map[of.numOf] = { st: 'ok', missing: [] }
            nbOk++
          }
        }
        set({ feasibility: map })
        toast(nbBlocked > 0 ? `${nbBlocked} bloqué(s) · ${nbOk} OK` : `${nbOk} OF réalisables`)
      })
      .catch((err) => toast(`Échec : ${err.message}`))
      .finally(() => set({ feasLoading: false }))
  },

  // ── Sélection + batch firm (#34) ──

  enterSelect: () => set({ selectMode: true }),
  exitSelect: () => set({ selectMode: false, selected: new Set<string>(), batch: {} }),
  toggleSelect: (id) =>
    set((state) => {
      const n = new Set(state.selected)
      n.has(id) ? n.delete(id) : n.add(id)
      return { selected: n }
    }),
  clearSelection: () => set({ selected: new Set<string>() }),

  batchFirm: async (ids) => {
    if (get().batchRunning || ids.length === 0) return
    set({
      batchRunning: true,
      batch: Object.fromEntries(ids.map((id) => [id, { st: 'running' as const }])),
    })
    let nbOk = 0
    let nbErr = 0
    /** OF affermis dont au moins un document du dossier n'est pas parti (#85). */
    let nbPrintKo = 0
    const firmed: string[] = []
    for (const id of ids) {
      try {
        // `batch: true` : impression soumise sans attendre le verdict du serveur
        // d'édition. Attendre l'issue de chaque tirage rendrait un lot de 20 OF
        // interminable ; les tâches sont journalisées avec leur numéro et
        // `print:reconcile` tranche ensuite.
        const res = await fetch(route('planning.order_firm', { orderNum: id }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: true }),
        })
        const data = (await res.json()) as {
          ok: boolean
          mfgNum?: string
          error?: string
          print?: { ok: boolean; documents?: { status: string; serverVerdict: string }[] }
        }
        if (data.ok && data.mfgNum) {
          if (data.print && !data.print.ok) nbPrintKo++
          set((s) => ({ batch: { ...s.batch, [id]: { st: 'ok', msg: data.mfgNum } } }))
          get().transformCard(id, data.mfgNum)
          firmed.push(id)
          nbOk++
        } else {
          set((s) => ({
            batch: { ...s.batch, [id]: { st: 'error', msg: data.error ?? 'Refusé par X3' } },
          }))
          nbErr++
        }
      } catch (e) {
        set((s) => ({ batch: { ...s.batch, [id]: { st: 'error', msg: (e as Error).message } } }))
        nbErr++
      }
    }
    set({ batchRunning: false })
    // Affermissement et impression sont deux verdicts : un lot « tout affermi »
    // dont des dossiers ne sont pas partis ne doit pas s'annoncer comme un succès.
    const firmText = nbErr === 0 ? `${nbOk} OF affermi(s)` : `${nbOk} affermi(s) · ${nbErr} échec(s)`
    toast(nbPrintKo > 0 ? `${firmText} · ${nbPrintKo} dossier(s) non imprimé(s)` : firmText)
    set((s) => {
      const n = new Set(s.selected)
      for (const oldId of firmed) n.delete(oldId)
      return { selected: n }
    })
    if (nbOk > 0) setTimeout(() => router.reload(), 2000)
  },
}))

// ---------------------------------------------------------------------------
// Helpers dérivés (purs — consommés via sélecteurs zustand / useMemo)
// ---------------------------------------------------------------------------

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
    const barClass = pct > 100 ? 'bg-destructive' : pct >= 90 ? 'bg-suggere' : 'bg-ferme'
    return { week: wl.week, hours, pct, barClass }
  })
}

export function feasOf(state: BoardState, numOf: string): FeasStatus | undefined {
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
export type { BatchItem }

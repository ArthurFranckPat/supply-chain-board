import { createSignal, createMemo } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import type { BoardData, Card, SearchScope, FeasibilityMode, FeasStatus } from './types'
import { route } from '@/lib/routes'

/** One backend route per scope. Each returns the FULL matched set (not just the
 *  visible window) → robust vs volume and out-of-window OFs (#7). */
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

export function createBoardStore(initial: BoardData) {
  const [board, setBoard] = createStore<BoardData>(initial)

  const [query, setQuery] = createSignal('')
  const [scope, setScope] = createSignal<SearchScope>('poste')
  // null = request in flight → nothing matches (everything dimmed).
  const [matchSet, setMatchSet] = createSignal<Set<string> | null>(new Set())

  // ── Filtre par statut d'OF (Ferme / Planifié / Suggéré) ──
  // Set des statuts ACTIFS (affichés). Les cartes d'un autre statut (en cours,
  // terminé, bloqué) ne sont jamais masquées par ce filtre. Comme la recherche,
  // le filtre estompe les cartes hors-sélection (et les retire des charges),
  // sans masquer les lignes.
  const STATUS_FILTER_KEYS = ['ferme', 'planifie', 'suggere'] as const
  type StatusKey = (typeof STATUS_FILTER_KEYS)[number]
  const normStatus = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const [statusFilter, setStatusFilter] = createSignal<Set<StatusKey>>(new Set(STATUS_FILTER_KEYS))
  const statusActive = (s: StatusKey) => statusFilter().has(s)
  const toggleStatus = (s: StatusKey) =>
    setStatusFilter((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })

  const [mode, setMode] = createSignal<FeasibilityMode>('immediate')
  // numOf → feasibility status (empty until "Calculer faisabilité" runs).
  const [feasibility, setFeasibility] = createSignal<Record<string, FeasStatus>>({})
  const [feasLoading, setFeasLoading] = createSignal(false)
  const feasOf = (numOf: string): FeasStatus | undefined => feasibility()[numOf]

  const cache = new Map<string, Set<string>>()
  let pendingSeq = 0

  /** Whether a card passes the status filter (Ferme/Planifié/Suggéré). */
  function cardStatusOk(card: Card): boolean {
    const key = normStatus(card.status) as StatusKey
    // Hors des 3 statuts filtrables (en cours, terminé, bloqué) → toujours visible.
    if (!STATUS_FILTER_KEYS.includes(key)) return true
    return statusFilter().has(key)
  }

  /** Whether a card matches the current query under the active scope + the status filter. */
  function cardMatches(card: Card, lineCode: string): boolean {
    if (!cardStatusOk(card)) return false
    const q = query().trim()
    if (!q) return true
    const set = matchSet()
    if (set === null) return false
    return set.has(SCOPE_CFG[scope()].attr(card, lineCode).toLowerCase())
  }

  /** A line stays visible if it matches (poste) or holds ≥1 matched card. */
  function lineVisible(lineCode: string): boolean {
    const q = query().trim()
    if (!q) return true
    const set = matchSet()
    const s = scope()
    if (s === 'poste' && set !== null && set.has(lineCode.toLowerCase())) return true
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return false
    return line.dayCells.some((dc) => dc.cards.some((c) => cardMatches(c, lineCode)))
  }

  /** Fire the per-scope backend search (cached, race-guarded), update matchSet. */
  function runSearch(s: SearchScope, rawQuery: string) {
    const q = rawQuery.trim().toLowerCase()
    if (!q) {
      setMatchSet(new Set<string>())
      return
    }
    const cacheKey = `${s} ${q}`
    const cached = cache.get(cacheKey)
    if (cached) {
      setMatchSet(cached)
      return
    }
    setMatchSet(null) // loading → all dimmed
    const seq = ++pendingSeq
    fetch(SCOPE_CFG[s].url(q))
      .then((r): Promise<Record<string, string[]>> => (r.ok ? r.json() : Promise.resolve({})))
      .then((data) => {
        const set = new Set<string>((data[SCOPE_CFG[s].key] || []).map((v) => v.toLowerCase()))
        cache.set(cacheKey, set)
        if (seq === pendingSeq && scope() === s && query().trim().toLowerCase() === q) {
          setMatchSet(set)
        }
      })
      .catch(() => {
        const set = new Set<string>()
        cache.set(cacheKey, set)
        if (seq === pendingSeq && scope() === s) setMatchSet(set)
      })
  }

  function onQueryInput(value: string) {
    setQuery(value)
    runSearch(scope(), value)
  }
  function onScopeChange(value: SearchScope) {
    setScope(value)
    const q = query()
    if (q.trim()) runSearch(value, q)
  }
  function clearSearch() {
    setQuery('')
    setMatchSet(new Set<string>())
  }

  /**
   * Remplace les données du board (après une navigation Inertia : prev/next/
   * today/horizon) en conservant le store. Réinit filtre + faisabilité : les
   * badges et la recherche dépendent des cartes, qui changent avec la fenêtre.
   */
  function reset(next: BoardData) {
    setBoard(reconcile(next))
    setQuery('')
    setMatchSet(new Set<string>())
    setStatusFilter(new Set(STATUS_FILTER_KEYS))
    setFeasibility({})
    cache.clear()
  }

  // ── Derived load — day columns (sum visible cards' hours per column) ──
  const dayLoad = createMemo<number[]>(() => {
    const sums = new Array<number>(board.cols).fill(0)
    for (const line of board.lines) {
      if (!lineVisible(line.code)) continue
      line.dayCells.forEach((dc, col) => {
        for (const card of dc.cards) {
          if (cardMatches(card, line.code)) sums[col] += card.hours
        }
      })
    }
    return sums
  })

  /** Per-line weekly histogram, recomputed live from card positions. */
  function lineWeekLoads(lineCode: string) {
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return []
    const byWeek: Record<number, number> = {}
    line.dayCells.forEach((dc, col) => {
      const wk = board.colWeek[col]
      if (wk === undefined) return
      for (const card of dc.cards) if (cardStatusOk(card)) byWeek[wk] = (byWeek[wk] ?? 0) + card.hours
    })
    return line.weekLoads.map((wl) => {
      const hours = Math.round((byWeek[wl.week] ?? 0) * 10) / 10
      const cap = board.weekCaps[String(wl.week)] ?? 0
      const pct = cap > 0 ? Math.round((hours / cap) * 100) : 0
      const barClass = pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500'
      return { week: wl.week, hours, pct, barClass }
    })
  }

  // ── Drag: optimistic move + PATCH + rollback ──
  function moveCard(numOf: string, toLineCode: string, toCol: number, toIso: string) {
    // Locate the card and its current position (returning narrows the type).
    const findPos = () => {
      for (let li = 0; li < board.lines.length; li++) {
        const cells = board.lines[li].dayCells
        for (let ci = 0; ci < cells.length; ci++) {
          const idx = cells[ci].cards.findIndex((c) => c.id === numOf)
          if (idx !== -1) return { line: li, col: ci, idx, card: cells[ci].cards[idx] }
        }
      }
      return null
    }
    const from = findPos()
    if (!from) return
    const toLine = board.lines.findIndex((l) => l.code === toLineCode)
    if (toLine === -1) return
    const { card } = from
    const snapshot = { line: from.line, col: from.col, idx: from.idx }

    setBoard(
      produce((b) => {
        b.lines[snapshot.line].dayCells[snapshot.col].cards.splice(snapshot.idx, 1)
        b.lines[toLine].dayCells[toCol].cards.push(card)
      })
    )

    // Un OF déplacé change de date/poste → ses badges de faisabilité (calculés
    // sur l'ancienne position) deviennent potentiellement faux. On invalide le
    // cache de faisabilité, comme pour un changement de fenêtre (reset()).
    setFeasibility({})

    fetch(route('planning_board.update', { of: numOf }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workstation: toLineCode, dateDebut: toIso }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      })
      .catch((err) => {
        // Rollback.
        setBoard(
          produce((b) => {
            const ci = b.lines[toLine].dayCells[toCol].cards.findIndex((c) => c.id === numOf)
            if (ci !== -1) b.lines[toLine].dayCells[toCol].cards.splice(ci, 1)
            b.lines[snapshot.line].dayCells[snapshot.col].cards.splice(snapshot.idx, 0, card)
          })
        )
        window.dispatchEvent(
          new CustomEvent('sch-toast', { detail: `Déplacement échoué : ${err.message}` })
        )
      })
  }

  function toast(detail: string) {
    window.dispatchEvent(new CustomEvent('sch-toast', { detail }))
  }

  // ── Feasibility: POST board-feasibility → per-OF status map (badges) ──
  function runFeasibility(from: string, to: string) {
    if (!from || !to || feasLoading()) return
    setFeasLoading(true)
    fetch(route('planning_board.board_feasibility'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, mode: mode() }),
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
        setFeasibility(map)
        toast(nbBlocked > 0 ? `${nbBlocked} bloqué(s) · ${nbOk} OK` : `${nbOk} OF réalisables`)
      })
      .catch((err) => toast(`Échec : ${err.message}`))
      .finally(() => setFeasLoading(false))
  }

  return {
    board,
    query,
    scope,
    matchSet,
    mode,
    setMode,
    statusActive,
    toggleStatus,
    feasOf,
    feasLoading,
    cardMatches,
    lineVisible,
    dayLoad,
    lineWeekLoads,
    onQueryInput,
    onScopeChange,
    clearSearch,
    reset,
    moveCard,
    /** Retire une carte du board (ex. suggestion affermie → disparaît, #31/#32).
     *  Mise à jour optimiste : le nouvel OF apparaît au reload partiel suivant. */
    removeCard(numOf: string) {
      setBoard(
        produce((b) => {
          for (const line of b.lines) {
            for (const cell of line.dayCells) {
              const idx = cell.cards.findIndex((c) => c.id === numOf)
              if (idx !== -1) {
                cell.cards.splice(idx, 1)
                return
              }
            }
          }
        }),
      )
    },
    runFeasibility,
  }
}

export type BoardStore = ReturnType<typeof createBoardStore>

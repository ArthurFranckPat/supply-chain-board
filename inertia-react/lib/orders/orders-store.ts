/**
 * Store zustand du board planification (order-grid) — port React du Solid
 * inertia/lib/orders/store.ts.
 *
 * Drag **en temps seul** : on n'autorise pas le changement de poste (rangée figée
 * par la gamme). Override de date = PATCH endpoint dédié ; rollback + toast en cas d'échec.
 *
 * Filtres client-side (toutes les lignes sont déjà chargées via props) :
 *  - recherche live + scope (poste / commande / article / client / composant)
 *  - le scope « composant » est la seule exception : il interroge le backend
 *    (`articles-by-component`) pour remonter les PF qui consomment le composant,
 *    puis matche les cartes sur leur article — même mécanique que le board OF.
 *  - cases à cocher type commande (MTS/MTO/NOR) et nature (COMMANDE/PREVISION)
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import { router } from '@inertiajs/react'
import type { OrderBoardData, OrderCard, OrderSearchScope } from '@r/lib/orders/types'
import type {
  FeasibilityMode,
  FeasStatus,
  PosteNature,
  PosteNatureFilterKey,
} from '@r/lib/board/types'
import { route } from '@r/lib/routes'

const ALL_TYPES = ['MTS', 'MTO', 'NOR'] as const
const ALL_NATURES = ['COMMANDE', 'PREVISION'] as const
/**
 * Prévisions décochées au départ : le board Cmdes sert d'abord à piloter le carnet
 * ferme. Les SGAxxx de prévision noient les vraies commandes et se réactivent d'un
 * clic dans le filtre « Nature ».
 */
const DEFAULT_NATURES = ['COMMANDE'] as const
const ALL_POSTE_NATURES = ['assemblage_pf', 'assemble_sous_ensemble'] as const

type StatusKey = (typeof ALL_TYPES)[number] | (typeof ALL_NATURES)[number]

interface OrderBoardState {
  board: OrderBoardData
  query: string
  scope: OrderSearchScope
  /**
   * Scope « composant » : articles parents renvoyés par le backend.
   * `null` = requête en vol → rien ne matche (parité avec le `matchSet` du board OF).
   * Ignoré par les autres scopes.
   */
  componentMatch: Set<string> | null
  // Sélection des filtres : un Set vide ⇒ aucun masquage (tout visible).
  typeFilter: Set<string>
  natureFilter: Set<string>
  // Filtre atelier (STOLOC, issue #36) : vide ⇒ tous les ateliers visibles.
  atelierFilter: Set<string>
  /** Filtre nature poste : assemblage PF / sous-ensemble. Les deux actifs par défaut. */
  posteNatureFilter: Set<PosteNatureFilterKey>
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
  togglePosteNature: (n: PosteNatureFilterKey) => void

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
    for (const [ci, cell] of cells.entries()) {
      const idx = cell.cards.findIndex((c) => c.id === id)
      if (idx !== -1) return { line: li, col: ci, idx, card: cell.cards[idx] }
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
// Recherche « composant » — debounce + cache + race-guard
// ---------------------------------------------------------------------------

const componentCache = new Map<string, Set<string>>()
let componentSeq = 0
let componentTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Remonte les PF qui consomment le composant cherché, puis les stocke en minuscules
 * pour que `cardMatches` compare sur `card.article`. Le même endpoint sert la recherche
 * composant du board OF — il matche code ET libellé du composant.
 */
function runComponentSearch(rawQuery: string, set: (partial: Partial<OrderBoardState>) => void) {
  const q = rawQuery.trim().toLowerCase()
  if (!q) {
    set({ componentMatch: new Set<string>() })
    return
  }
  const cached = componentCache.get(q)
  if (cached) {
    set({ componentMatch: cached })
    return
  }
  set({ componentMatch: null }) // requête en vol → tout grisé
  const seq = ++componentSeq
  fetch(route('planning_board.articles_by_component', { component: q.toUpperCase() }))
    .then((r): Promise<{ articles?: string[] }> => (r.ok ? r.json() : Promise.resolve({})))
    .then((data) => {
      const matched = new Set<string>((data.articles ?? []).map((v) => v.toLowerCase()))
      componentCache.set(q, matched)
      const st = useOrderBoardStore.getState()
      if (seq === componentSeq && st.scope === 'composant' && st.query.trim().toLowerCase() === q) {
        set({ componentMatch: matched })
      }
    })
    .catch(() => {
      componentCache.set(q, new Set<string>())
      const st = useOrderBoardStore.getState()
      if (seq === componentSeq && st.scope === 'composant')
        set({ componentMatch: new Set<string>() })
    })
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOrderBoardStore = create<OrderBoardState>((set, get) => ({
  board: EMPTY_BOARD,
  query: '',
  scope: 'poste',
  componentMatch: new Set<string>(),
  typeFilter: new Set(ALL_TYPES),
  natureFilter: new Set<string>(DEFAULT_NATURES),
  atelierFilter: new Set(),
  posteNatureFilter: new Set<PosteNatureFilterKey>(ALL_POSTE_NATURES),
  mode: 'immediate',
  feasibility: {},
  feasLoading: false,

  setBoard: (b) => set({ board: b }),

  reset: (next) =>
    set({
      board: next,
      query: '',
      componentMatch: new Set<string>(),
      typeFilter: new Set(ALL_TYPES),
      natureFilter: new Set<string>(DEFAULT_NATURES),
      atelierFilter: new Set(),
      posteNatureFilter: new Set<PosteNatureFilterKey>(ALL_POSTE_NATURES),
      feasibility: {},
    }),

  updateData: (next) => set({ board: next }),

  onQueryInput: (value) => {
    set({ query: value })
    if (get().scope !== 'composant') return
    if (componentTimer) clearTimeout(componentTimer)
    componentTimer = setTimeout(() => {
      componentTimer = null
      runComponentSearch(value, set)
    }, 180)
  },

  onScopeChange: (value) => {
    set({ scope: value })
    if (value !== 'composant') return
    const q = get().query
    if (q.trim()) runComponentSearch(q, set)
  },

  clearSearch: () => set({ query: '', componentMatch: new Set<string>() }),

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

  togglePosteNature: (n) =>
    set((state) => {
      const next = new Set(state.posteNatureFilter)
      next.has(n) ? next.delete(n) : next.add(n)
      return { posteNatureFilter: next }
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
              /** WIPSTA 1/2/3 — statut OF alloué (pastille card). */
              statutNum?: number
            }>
          }>
        }>
      })
      .then((data) => {
        const map: Record<string, FeasStatus> = {}
        const ofStatusByCard = new Map<string, 'ferme' | 'planifie' | 'suggere' | null>()
        let nbOk = 0
        let nbBlocked = 0
        let nbQc = 0
        for (const o of data.orders ?? []) {
          // Prévision : X3 lui donne VCRLIN_0 = 0, que le repository ne reporte pas
          // (`ligne` null). L'id de carte côté serveur vaut alors `<num>#` — filtrer
          // sur `!o.ligne` jetait donc TOUTES les prévisions : ni badge faisabilité,
          // ni pastille OF, alors que le matcher les alloue bien (of_conso).
          const cardId = `${o.numCommande}#${o.ligne ?? ''}`
          const ofs = o.ofs ?? []
          // Pastille : statut du 1er OF alloué (même primaire que le matcher).
          const primary = ofs[0]
          if (primary?.statutNum === 1) ofStatusByCard.set(cardId, 'ferme')
          else if (primary?.statutNum === 2) ofStatusByCard.set(cardId, 'planifie')
          else if (primary?.statutNum === 3) ofStatusByCard.set(cardId, 'suggere')
          else ofStatusByCard.set(cardId, null)
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
        // Rafraîchit la pastille OF (matcher stock-aware + overrides) sur les cards.
        const board = get().board
        const lines = board.lines.map((line) => ({
          ...line,
          dayCells: line.dayCells.map((dc) => ({
            ...dc,
            cards: dc.cards.map((card) =>
              ofStatusByCard.has(card.id)
                ? { ...card, ofStatus: ofStatusByCard.get(card.id) ?? null }
                : card
            ),
          })),
        }))
        set({ feasibility: map, board: { ...board, lines } })
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
    // Carte induite (ghost) : charge structurelle. Exemptée des filtres Type/Nature
    // seulement — sa nature 'INDUIT' n'appartient pas à ces vocabulaires (MTS/MTO/NOR,
    // COMMANDE/PREVISION), l'y soumettre la ferait disparaître d'office.
    // La RECHERCHE, elle, s'y applique : sans ça, toute ligne portant un ghost restait
    // visible et filtrer sur un poste laissait le board entier à l'écran, les autres
    // cartes simplement éteintes — au lieu de ne montrer que le résultat comme en OF.
    if (!card.induit) {
      const tf = state.typeFilter
      const t = card.orderType ?? 'NOR'
      if (!tf.has(t)) return false
      if (!state.natureFilter.has(card.nature)) return false
    }

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
      case 'composant': {
        const ms = state.componentMatch
        if (ms === null) return false
        return ms.has((card.article ?? '').toLowerCase())
      }
      default:
        return true
    }
  },

  lineVisible: (lineCode) => {
    const state = get()
    const line = state.board.lines.find((l) => l.code === lineCode)
    if (!line) return false
    const nature: PosteNature = line.nature ?? 'autre'
    if (nature === 'autre') {
      if (!(
        state.posteNatureFilter.has('assemblage_pf') &&
        state.posteNatureFilter.has('assemble_sous_ensemble')
      )) {
        return false
      }
    } else if (!state.posteNatureFilter.has(nature)) {
      return false
    }
    const af = state.atelierFilter
    if (af.size > 0 && !(line.atelier && af.has(line.atelier))) return false
    // Recherche par poste : le poste cherché reste affiché même vide — c'est LUI le
    // résultat, pas ses cartes (parité avec `lineVisible` des modes OF/Combiné).
    const q = state.query.trim()
    if (q && state.scope === 'poste' && lineCode.toLowerCase().includes(q.toLowerCase())) {
      return true
    }
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

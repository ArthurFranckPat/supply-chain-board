import { createMemo, createSignal } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { OrderBoardData, OrderCard, OrderSearchScope } from './types'

const API = '/api/v1/order-planning'

const ALL_TYPES = ['MTS', 'MTO', 'NOR'] as const
const ALL_NATURES = ['COMMANDE', 'PREVISION'] as const

/**
 * Store du board planification (issue #10).
 * Drag **en temps seul** : on n'autorise pas le changement de poste (rangée figée
 * par la gamme). Override de date = PATCH endpoint dédié ; rollback + toast en cas d'échec.
 *
 * Filtres entièrement client-side (toutes les lignes sont déjà chargées en SSR) :
 *  - recherche live + scope (poste / commande / article / client)
 *  - cases à cocher type commande (MTS/MTO/NOR) et nature (COMMANDE/PREVISION)
 */
export function createOrderBoardStore(initial: OrderBoardData) {
  const [board, setBoard] = createStore<OrderBoardData>(initial)

  const [query, setQuery] = createSignal('')
  const [scope, setScope] = createSignal<OrderSearchScope>('poste')
  // Sélection des filtres : un Set vide ⇒ aucun masquage (tout visible).
  const [typeFilter, setTypeFilter] = createSignal<Set<string>>(new Set(ALL_TYPES))
  const [natureFilter, setNatureFilter] = createSignal<Set<string>>(new Set(ALL_NATURES))

  /** Passe le filtre type/nature (cases à cocher). */
  function passesFilters(card: OrderCard): boolean {
    const tf = typeFilter()
    // orderType null ⇒ visible seulement si NOR coché (fallback historique).
    const t = card.orderType ?? 'NOR'
    if (!tf.has(t)) return false
    if (!natureFilter().has(card.nature)) return false
    return true
  }

  /** Une carte matche recherche (selon scope) + filtres. */
  function cardMatches(card: OrderCard, lineCode: string): boolean {
    if (!passesFilters(card)) return false
    const q = query().trim().toLowerCase()
    if (!q) return true
    switch (scope()) {
      case 'poste':
        return lineCode.toLowerCase().includes(q)
      case 'commande':
        return card.id.toLowerCase().includes(q)
      case 'article':
        return (card.article ?? '').toLowerCase().includes(q) || card.title.toLowerCase().includes(q)
      case 'client':
        return (card.customer ?? '').toLowerCase().includes(q)
    }
  }

  function lineVisible(lineCode: string): boolean {
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return false
    return line.dayCells.some((dc) => dc.cards.some((c) => cardMatches(c, lineCode)))
  }

  function onQueryInput(value: string) {
    setQuery(value)
  }
  function onScopeChange(value: OrderSearchScope) {
    setScope(value)
  }
  function clearSearch() {
    setQuery('')
  }

  function toggleType(t: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }
  function toggleNature(n: string) {
    setNatureFilter((prev) => {
      const next = new Set(prev)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })
  }

  // ── Charge/jour live (somme des heures des cartes visibles par colonne). ──
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

  /** Histogramme hebdo par ligne, recalculé live depuis les positions des cartes. */
  function lineWeekLoads(lineCode: string) {
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return []
    const byWeek: Record<number, number> = {}
    line.dayCells.forEach((dc, col) => {
      const wk = board.colWeek[col]
      if (wk === undefined) return
      for (const card of dc.cards) byWeek[wk] = (byWeek[wk] ?? 0) + card.hours
    })
    return line.weekLoads.map((wl) => {
      const hours = Math.round((byWeek[wl.week] ?? 0) * 10) / 10
      const cap = board.weekCaps[String(wl.week)] ?? 0
      const pct = cap > 0 ? Math.round((hours / cap) * 100) : 0
      const barClass = pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-blue-500' : 'bg-emerald-500'
      return { week: wl.week, hours, pct, barClass }
    })
  }

  // ── Drag : PATCH override + optimistic + rollback ──
  function moveCard(id: string, fromLineCode: string, toCol: number, toIso: string) {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return

    const findPos = () => {
      for (let li = 0; li < board.lines.length; li++) {
        const cells = board.lines[li].dayCells
        for (let ci = 0; ci < cells.length; ci++) {
          const idx = cells[ci].cards.findIndex((c) => c.id === id)
          if (idx !== -1) return { line: li, col: ci, idx, card: cells[ci].cards[idx] }
        }
      }
      return null
    }
    const from = findPos()
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

    setBoard(
      produce((b) => {
        b.lines[snapshot.line].dayCells[snapshot.col].cards.splice(snapshot.idx, 1)
        b.lines[toLine].dayCells[toCol].cards.push({ ...card, hasOverride: true, accentClass: 'border-l-amber-500', cardClass: 'bg-amber-50/40', idTone: 'text-amber-700' })
      })
    )

    fetch(`${API}/order-lines/${encodeURIComponent(numCommande)}/${encodeURIComponent(ligne)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateLivraison: toIso }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      })
      .catch((err) => {
        setBoard(
          produce((b) => {
            const ci = b.lines[toLine].dayCells[toCol].cards.findIndex((c) => c.id === id)
            if (ci !== -1) b.lines[toLine].dayCells[toCol].cards.splice(ci, 1)
            b.lines[snapshot.line].dayCells[snapshot.col].cards.splice(snapshot.idx, 0, card)
          })
        )
        window.dispatchEvent(
          new CustomEvent('sch-toast', { detail: `Déplacement échoué : ${err.message}` })
        )
      })
  }

  function resetOverride(id: string) {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return
    fetch(`${API}/order-lines/${encodeURIComponent(numCommande)}/${encodeURIComponent(ligne)}/override`, {
      method: 'DELETE',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        toast('Override réinitialisé')
        // Recharge la page — laisse X3/SSR rejouer avec date d'origine.
        window.location.reload()
      })
      .catch((err) => toast(`Échec : ${err.message}`))
  }

  function toast(detail: string) {
    window.dispatchEvent(new CustomEvent('sch-toast', { detail }))
  }

  return {
    board,
    query,
    scope,
    typeFilter,
    natureFilter,
    cardMatches,
    lineVisible,
    dayLoad,
    lineWeekLoads,
    onQueryInput,
    onScopeChange,
    clearSearch,
    toggleType,
    toggleNature,
    moveCard,
    resetOverride,
  }
}

export type OrderBoardStore = ReturnType<typeof createOrderBoardStore>

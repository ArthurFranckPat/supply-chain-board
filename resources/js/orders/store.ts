import { createSignal } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { OrderBoardData, OrderCard } from './types'

const API = '/api/v1/order-planning'

/**
 * Store du board planification (issue #10).
 * Drag **en temps seul** : on n'autorise pas le changement de poste (rangée figée
 * par la gamme). Override de date = PATCH endpoint dédié ; rollback + toast en cas d'échec.
 */
export function createOrderBoardStore(initial: OrderBoardData) {
  const [board, setBoard] = createStore<OrderBoardData>(initial)

  const [query, setQuery] = createSignal('')
  const [matchSet, setMatchSet] = createSignal<Set<string>>(new Set())

  /** Une carte matche la recherche si query vide, ou si son id (commande) / client / article matche. */
  function cardMatches(card: OrderCard, lineCode: string): boolean {
    const q = query().trim().toLowerCase()
    if (!q) return true
    if (card.id.toLowerCase().includes(q)) return true
    if (card.article && card.article.toLowerCase().includes(q)) return true
    if (card.title.toLowerCase().includes(q)) return true
    return false
  }

  function lineVisible(lineCode: string): boolean {
    const q = query().trim()
    if (!q) return true
    const line = board.lines.find((l) => l.code === lineCode)
    if (!line) return false
    return line.weekCells.some((wc) => wc.cards.some((c) => cardMatches(c, lineCode)))
  }

  function onQueryInput(value: string) {
    setQuery(value)
  }

  function clearSearch() {
    setQuery('')
  }

  // ── Drag : PATCH override + optimistic + rollback ──
  function moveCard(id: string, fromLineCode: string, toCol: number, toIso: string) {
    const [numCommande, ligne] = id.split('#')
    if (!numCommande || !ligne) return

    const findPos = () => {
      for (let li = 0; li < board.lines.length; li++) {
        const cells = board.lines[li].weekCells
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
      toast('Poste figé par la gamme — déplacez seulement la semaine.')
      return
    }
    if (from.col === toCol) return

    const toLine = board.lines.findIndex((l) => l.code === fromLineCode)
    if (toLine === -1) return
    const snapshot = { line: from.line, col: from.col, idx: from.idx }
    const card = from.card

    setBoard(
      produce((b) => {
        b.lines[snapshot.line].weekCells[snapshot.col].cards.splice(snapshot.idx, 1)
        b.lines[toLine].weekCells[toCol].cards.push({ ...card, hasOverride: true, accentClass: 'border-l-amber-500', cardClass: 'bg-amber-50/40', idTone: 'text-amber-700' })
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
            const ci = b.lines[toLine].weekCells[toCol].cards.findIndex((c) => c.id === id)
            if (ci !== -1) b.lines[toLine].weekCells[toCol].cards.splice(ci, 1)
            b.lines[snapshot.line].weekCells[snapshot.col].cards.splice(snapshot.idx, 0, card)
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
    matchSet,
    setMatchSet,
    cardMatches,
    lineVisible,
    onQueryInput,
    clearSearch,
    moveCard,
    resetOverride,
  }
}

export type OrderBoardStore = ReturnType<typeof createOrderBoardStore>

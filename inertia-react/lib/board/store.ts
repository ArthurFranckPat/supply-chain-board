/**
 * Store zustand du POC board (phase 3 migration react-shadcn).
 *
 * Périmètre volontairement réduit vs inertia/lib/board/store.ts : board +
 * moveCard optimiste. AUCUN PATCH réseau — le POC mesure la mécanique
 * React (drag hors state, latence du drop, re-renders), pas le write-back.
 *
 * Mise à jour immuable chirurgicale : seules les lignes source/cible
 * changent de référence → les BoardLine non concernées (sélecteur par index)
 * ne re-rendent pas au drop.
 */
import { create } from 'zustand'
import type { BoardData } from '@/lib/board/types'

const EMPTY_BOARD: BoardData = {
  days: [],
  lines: [],
  weekSpans: [],
  cols: 0,
  colWeek: [],
  weekCaps: {},
}

interface BoardPocState {
  board: BoardData
  /** Nombre de moves effectués (statistique POC). */
  moveCount: number
  setBoard: (b: BoardData) => void
  moveCard: (numOf: string, toLineCode: string, toCol: number) => void
}

export const useBoardStore = create<BoardPocState>((set) => ({
  board: EMPTY_BOARD,
  moveCount: 0,

  setBoard: (b) => set({ board: b }),

  moveCard: (numOf, toLineCode, toCol) =>
    set((state) => {
      const b = state.board
      // Localise la carte (ligne/cellule/index).
      let fromLine = -1
      let fromCol = -1
      let fromIdx = -1
      outer: for (let li = 0; li < b.lines.length; li++) {
        const cells = b.lines[li].dayCells
        for (let ci = 0; ci < cells.length; ci++) {
          const idx = cells[ci].cards.findIndex((c) => c.id === numOf)
          if (idx !== -1) {
            fromLine = li
            fromCol = ci
            fromIdx = idx
            break outer
          }
        }
      }
      if (fromLine === -1) return state
      const toLine = b.lines.findIndex((l) => l.code === toLineCode)
      if (toLine === -1 || toCol < 0 || toCol >= b.lines[toLine].dayCells.length) return state
      if (fromLine === toLine && fromCol === toCol) return state

      const card = b.lines[fromLine].dayCells[fromCol].cards[fromIdx]

      const lines = b.lines.slice()
      // Retrait — clone chirurgical de la ligne source.
      const src = lines[fromLine]
      const srcCells = src.dayCells.slice()
      srcCells[fromCol] = {
        ...srcCells[fromCol],
        cards: srcCells[fromCol].cards.filter((c) => c.id !== numOf),
      }
      lines[fromLine] = { ...src, dayCells: srcCells }
      // Ajout — clone chirurgical de la ligne cible (qui peut être la même).
      const dst = lines[toLine]
      const dstCells = toLine === fromLine ? lines[toLine].dayCells.slice() : dst.dayCells.slice()
      dstCells[toCol] = {
        ...dstCells[toCol],
        cards: [...dstCells[toCol].cards, card],
      }
      lines[toLine] = { ...lines[toLine], dayCells: dstCells }

      return { board: { ...b, lines }, moveCount: state.moveCount + 1 }
    }),
}))

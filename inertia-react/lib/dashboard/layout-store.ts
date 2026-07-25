/**
 * Store zustand du layout du tableau de bord (ordre, visibilité, largeur,
 * ordre d'impression). Port React du store Solid (createStore + produce).
 *
 * Source de vérité : serveur (users.dashboard_layout) → sync via props
 * Inertia → mutations locales → PATCH /api/v1/user/dashboard-layout.
 *
 * Persisté côté client (localStorage) pour éviter un flash de layout vide
 * au chargement.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  DashboardLayout,
  KpiId,
  KpiLayoutItem,
  KpiWidth,
} from '@/lib/dashboard/types'
import {
  colsForWidth,
  DEFAULT_DASHBOARD_LAYOUT,
  GRID_COLS,
  normalizeDashboardLayout,
} from '@/lib/dashboard/types'

interface LayoutState extends DashboardLayout {
  // Actions
  setLayout: (layout: DashboardLayout) => void
  setVisible: (id: KpiId, visible: boolean) => void
  setWidth: (id: KpiId, width: KpiWidth) => void
  updateGridItems: (gridItems: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void
  moveItem: (draggedId: KpiId, targetId: KpiId) => void
  moveItemDir: (id: KpiId, dir: -1 | 1) => void
  movePrint: (id: KpiId, dir: -1 | 1) => void
  reset: () => void

  // Lecteurs ciblés
  layoutItem: (id: KpiId) => KpiLayoutItem | undefined
  isVisible: (id: KpiId) => boolean
  printRank: (id: KpiId) => number
  screenRank: (id: KpiId) => number
}

const initialLayout = normalizeDashboardLayout(null) ?? DEFAULT_DASHBOARD_LAYOUT

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      version: initialLayout.version,
      items: initialLayout.items,
      printOrder: initialLayout.printOrder,

      setLayout: (layout) => set(layout),

      setVisible: (id, visible) =>
        set((state) => ({
          items: state.items.map((it) => (it.id === id ? { ...it, visible } : it)),
        })),

      setWidth: (id, width) =>
        set((state) => ({
          items: state.items.map((it) => {
            if (it.id !== id) return it
            const w = colsForWidth(width)
            return { ...it, width, w }
          }),
        })),

      updateGridItems: (gridItems) =>
        set((state) => ({
          items: state.items.map((it) => {
            const match = gridItems.find((g) => g.i === it.id)
            if (!match) return it
            const width: KpiWidth =
              match.w <= GRID_COLS / 3 ? 1 : match.w <= (GRID_COLS * 2) / 3 ? 2 : 3
            return { ...it, x: match.x, y: match.y, w: match.w, h: match.h, width }
          }),
        })),

      moveItem: (draggedId, targetId) => {
        const { items } = get()
        if (draggedId === targetId) return
        const ordered = [...items]
        const from = ordered.findIndex((it) => it.id === draggedId)
        const to = ordered.findIndex((it) => it.id === targetId)
        if (from === -1 || to === -1) return
        const [moved] = ordered.splice(from, 1)
        ordered.splice(to, 0, moved)
        set({ items: ordered })
      },

      moveItemDir: (id, dir) => {
        const { items } = get()
        const ordered = [...items]
        const i = ordered.findIndex((it) => it.id === id)
        const j = i + dir
        if (i === -1 || j < 0 || j >= ordered.length) return
        ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
        set({ items: ordered })
      },

      movePrint: (id, dir) => {
        const { printOrder } = get()
        const order = [...printOrder]
        const i = order.indexOf(id)
        const j = i + dir
        if (i === -1 || j < 0 || j >= order.length) return
        ;[order[i], order[j]] = [order[j], order[i]]
        set({ printOrder: order })
      },

      reset: () => set(DEFAULT_DASHBOARD_LAYOUT),

      // Lecteurs ciblés
      layoutItem: (id) => get().items.find((it) => it.id === id),
      isVisible: (id) => get().items.find((it) => it.id === id)?.visible ?? true,
      printRank: (id) => get().printOrder.indexOf(id),
      screenRank: (id) => get().items.findIndex((it) => it.id === id),
    }),
    {
      name: 'dashboard-layout',
      // On persiste items + printOrder seulement
      partialize: (state) => ({
        version: state.version,
        items: state.items,
        printOrder: state.printOrder,
      }),
      // Deux migrations passent par le normaliseur, jamais par une réhydratation
      // brute :
      //  - store v2 : les items d'avant la grille n'ont ni x/y ni w/h, et
      //    donnaient une géométrie NaN au premier rendu ;
      //  - store v3 : le pas de grille a été divisé par deux, les unités des
      //    layouts plus anciens doivent être doublées (cf. LAYOUT_VERSION).
      version: 3,
      migrate: (persisted) => normalizeDashboardLayout(persisted),
    }
  )
)

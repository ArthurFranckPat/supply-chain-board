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
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeDashboardLayout,
} from '@/lib/dashboard/types'

interface LayoutState extends DashboardLayout {
  // Actions
  setLayout: (layout: DashboardLayout) => void
  setVisible: (id: KpiId, visible: boolean) => void
  setWidth: (id: KpiId, width: KpiWidth) => void
  moveItem: (draggedId: KpiId, targetId: KpiId) => void
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
      items: initialLayout.items,
      printOrder: initialLayout.printOrder,

      setLayout: (layout) => set(layout),

      setVisible: (id, visible) =>
        set((state) => ({
          items: state.items.map((it) => (it.id === id ? { ...it, visible } : it)),
        })),

      setWidth: (id, width) =>
        set((state) => ({
          items: state.items.map((it) => (it.id === id ? { ...it, width } : it)),
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
      partialize: (state) => ({ items: state.items, printOrder: state.printOrder }),
    }
  )
)

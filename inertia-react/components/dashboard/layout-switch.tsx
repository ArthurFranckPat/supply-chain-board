/**
 * Aiguillage entre les deux modèles de disposition du tableau de bord
 * (issue #87), pour les comparer sur les mêmes cartes et les mêmes données.
 *
 * - `grid`   : grille maison, placement libre en x/y, drag et resize à cran,
 *              compaction verticale, disposition persistée.
 * - `panels` : volets accolés (`react-resizable-panels`), redimensionnement
 *              continu, pas de déplacement de carte, tailles non persistées.
 *
 * Les deux acceptent les mêmes enfants, appariés par leur `key` (= id du KPI) —
 * l'appelant n'a donc rien à dupliquer.
 */
import type { ReactNode } from 'react'

import { DashboardGrid, type DashboardGridItem } from '@r/components/dashboard/grid'
import { DashboardPanels } from '@r/components/dashboard/panels'

export type DashboardLayoutMode = 'grid' | 'panels'

export const DASHBOARD_LAYOUT_MODE_KEY = 'dashboard-layout-mode'

export function isDashboardLayoutMode(v: unknown): v is DashboardLayoutMode {
  return v === 'grid' || v === 'panels'
}

export interface DashboardLayoutSwitchProps {
  mode: DashboardLayoutMode
  items: DashboardGridItem[]
  children: ReactNode
  editMode: boolean
  onChange: (items: DashboardGridItem[]) => void
  cols: number
  rowHeight: number
  gap: number
  minW: number
  minH: number
  /** Hauteur du groupe de volets — sans objet en mode grille. */
  panelsHeight?: string
}

export function DashboardLayoutSwitch({
  mode,
  items,
  children,
  editMode,
  onChange,
  cols,
  rowHeight,
  gap,
  minW,
  minH,
  panelsHeight,
}: DashboardLayoutSwitchProps) {
  if (mode === 'panels') {
    return (
      <DashboardPanels items={items} cols={cols} height={panelsHeight}>
        {children}
      </DashboardPanels>
    )
  }

  return (
    <DashboardGrid
      items={items}
      editMode={editMode}
      onChange={onChange}
      cols={cols}
      rowHeight={rowHeight}
      gap={gap}
      minW={minW}
      minH={minH}
    >
      {children}
    </DashboardGrid>
  )
}

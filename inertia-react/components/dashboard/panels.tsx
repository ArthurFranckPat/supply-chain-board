/**
 * Variante « volets » de la disposition du tableau de bord (issue #87).
 *
 * Bâtie sur `react-resizable-panels` via le composant shadcn/Base UI
 * `resizable`. Existe pour comparer deux modèles de mise en page sur les mêmes
 * cartes et les mêmes données, pas pour remplacer `DashboardGrid`.
 *
 * Différences de modèle, assumées :
 *
 * - Volets accolés, pas de placement libre. Une carte ne se déplace pas : elle
 *   occupe une case d'un arbre de groupes. Aucune poignée de déplacement ici.
 * - Redimensionnement continu, sans cran ni compaction. L'espace est toujours
 *   rempli à 100 %, il n'y a donc jamais de trou ni de bas de page en escalier.
 * - Le groupe racine exige une hauteur explicite : les volets remplissent leur
 *   parent. Le tableau de bord devient une vue verrouillée sur la hauteur
 *   d'écran, chaque carte scrollant à l'intérieur — au lieu d'une page qui
 *   s'allonge. C'est la conséquence la plus visible du changement de modèle.
 * - Les tailles ne sont pas persistées. Le schéma `users.dashboard_layout` est
 *   en `x/y/w/h` et ne sait pas décrire un arbre de pourcentages ; on ne le
 *   corrompt pas pour une comparaison. Un rechargement repart de la disposition
 *   de la grille.
 */
import { useMemo } from 'react'
import * as React from 'react'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@r/components/ui/resizable'
import { cn } from '@r/lib/utils'
import type { DashboardGridItem } from '@r/components/dashboard/grid'

export interface DashboardPanelsProps {
  /** Items visibles, en unités de grille — sert à retrouver colonnes et proportions. */
  items: DashboardGridItem[]
  /** Enfants appariés par leur `key` (= `id`), comme pour la grille. */
  children: React.ReactNode
  /** Nombre de colonnes de référence, pour convertir `w` en pourcentage. */
  cols?: number
  /** Hauteur du groupe racine — obligatoire, les volets remplissent leur parent. */
  height?: string
  className?: string
}

interface Column {
  x: number
  /** Largeur de la colonne en unités de grille. */
  w: number
  items: DashboardGridItem[]
}

/**
 * Reconstruit des colonnes à partir du placement libre de la grille, pour que
 * la vue volets démarre sur la même disposition que la vue grille.
 * Regroupement par `x`, puis tri vertical dans chaque colonne.
 */
function toColumns(items: DashboardGridItem[]): Column[] {
  const byX = new Map<number, DashboardGridItem[]>()
  for (const it of items) {
    const bucket = byX.get(it.x)
    if (bucket) bucket.push(it)
    else byX.set(it.x, [it])
  }
  return [...byX.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, group]) => ({
      x,
      w: Math.max(...group.map((it) => it.w)),
      items: [...group].sort((a, b) => a.y - b.y),
    }))
}

const pct = (part: number, total: number) => `${total > 0 ? (part / total) * 100 : 0}%`

export function DashboardPanels({
  items,
  children,
  cols = 24,
  height = 'calc(100dvh - 13rem)',
  className,
}: DashboardPanelsProps) {
  const columns = useMemo(() => toColumns(items), [items])

  /**
   * Même précaution que dans la grille : cloner dans le corps du rendu
   * fabriquerait un nouvel élément à chaque frame de redimensionnement et
   * re-rendrait toutes les cartes KPI. Mémorisé sur `children`.
   */
  const clonedChildren = useMemo(() => {
    const map = new Map<string, React.ReactNode>()
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child) || child.key == null) return
      const id = String(child.key).replace(/^\.\$/, '')
      const el = child as React.ReactElement<{ className?: string }>
      map.set(id, React.cloneElement(el, { className: cn(el.props.className, 'h-full w-full') }))
    })
    return map
  }, [children])

  const totalCols = columns.reduce((sum, c) => sum + c.w, 0) || cols

  return (
    <div className={cn('dashboard-panels', className)} style={{ height }}>
      <ResizablePanelGroup orientation="horizontal">
        {columns.map((column, columnIndex) => {
          const rows = column.items.filter((it) => clonedChildren.has(it.id))
          if (rows.length === 0) return null
          const totalRows = rows.reduce((sum, it) => sum + it.h, 0)

          return (
            <React.Fragment key={`col-${column.x}`}>
              {columnIndex > 0 && <ResizableHandle withHandle />}
              <ResizablePanel
                id={`col-${column.x}`}
                defaultSize={pct(column.w, totalCols)}
                minSize="15%"
                className="min-w-0"
              >
                <ResizablePanelGroup orientation="vertical">
                  {rows.map((it, rowIndex) => (
                    <React.Fragment key={it.id}>
                      {rowIndex > 0 && <ResizableHandle withHandle />}
                      <ResizablePanel
                        id={it.id}
                        defaultSize={pct(it.h, totalRows)}
                        minSize="10%"
                        className="min-h-0 p-1"
                      >
                        {clonedChildren.get(it.id)}
                      </ResizablePanel>
                    </React.Fragment>
                  ))}
                </ResizablePanelGroup>
              </ResizablePanel>
            </React.Fragment>
          )
        })}
      </ResizablePanelGroup>
    </div>
  )
}

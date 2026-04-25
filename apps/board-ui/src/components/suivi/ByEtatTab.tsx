import { useMemo } from 'react'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import type { OrderRow } from '@/types/suivi-commandes'
import { statusClass } from '@/types/suivi-commandes'
import { cn } from '@/lib/utils'

interface EtatAgg {
  statut: string
  nbCommandes: number
  nbArticles: number
  totalRestant: number
}

export function ByEtatTab({ rows }: { rows: OrderRow[] }) {
  const data = useMemo<EtatAgg[]>(() => {
    const map = new Map<string, { commandes: Set<string>; articles: Set<string>; restant: number }>()
    for (const r of rows) {
      const key = r.Statut || '(vide)'
      if (!map.has(key)) map.set(key, { commandes: new Set(), articles: new Set(), restant: 0 })
      const entry = map.get(key)!
      entry.commandes.add(r['No commande'])
      entry.articles.add(r.Article)
      entry.restant += r['Quantité restante'] ?? 0
    }
    return Array.from(map.entries())
      .map(([statut, v]) => ({ statut, nbCommandes: v.commandes.size, nbArticles: v.articles.size, totalRestant: v.restant }))
      .sort((a, b) => b.nbCommandes - a.nbCommandes)
  }, [rows])

  const columns: GridTableColumn<EtatAgg>[] = [
    { key: 'statut', header: 'Statut', cell: (r) => <span className={cn('text-[10px]', statusClass(r.statut))}>{r.statut}</span>, width: '140px' },
    { key: 'nbCommandes', header: 'Commandes', cell: (r) => r.nbCommandes, align: 'right', width: '100px' },
    { key: 'nbArticles', header: 'Articles', cell: (r) => r.nbArticles, align: 'right', width: '100px' },
    { key: 'totalRestant', header: 'Restant', cell: (r) => r.totalRestant.toLocaleString('fr-FR'), align: 'right', width: '100px' },
  ]

  return (
    <GridTable
      columns={columns}
      data={data}
      keyExtractor={(r) => r.statut}
      maxHeight="50vh"
      emptyMessage="Aucune donnée"
    />
  )
}

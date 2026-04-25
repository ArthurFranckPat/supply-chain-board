import { useMemo } from 'react'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import type { OrderRow } from '@/types/suivi-commandes'

interface ClientAgg {
  client: string
  nbCommandes: number
  totalLivre: number
  totalRestant: number
}

export function ByClientTab({ rows }: { rows: OrderRow[] }) {
  const data = useMemo<ClientAgg[]>(() => {
    const map = new Map<string, { commandes: Set<string>; livre: number; restant: number }>()
    for (const r of rows) {
      const key = r['Nom client commande']
      if (!map.has(key)) map.set(key, { commandes: new Set(), livre: 0, restant: 0 })
      const entry = map.get(key)!
      entry.commandes.add(r['No commande'])
      entry.livre += r['Quantité livrée'] ?? 0
      entry.restant += r['Quantité restante'] ?? 0
    }
    return Array.from(map.entries())
      .map(([client, v]) => ({ client, nbCommandes: v.commandes.size, totalLivre: v.livre, totalRestant: v.restant }))
      .sort((a, b) => b.totalRestant - a.totalRestant)
  }, [rows])

  const columns: GridTableColumn<ClientAgg>[] = [
    { key: 'client', header: 'Client', cell: (r) => r.client, width: '1fr' },
    { key: 'nbCommandes', header: 'Commandes', cell: (r) => r.nbCommandes, align: 'right', width: '100px' },
    { key: 'totalLivre', header: 'Livré', cell: (r) => r.totalLivre.toLocaleString('fr-FR'), align: 'right', width: '100px' },
    { key: 'totalRestant', header: 'Restant', cell: (r) => r.totalRestant.toLocaleString('fr-FR'), align: 'right', width: '100px' },
  ]

  return (
    <GridTable
      columns={columns}
      data={data}
      keyExtractor={(r) => r.client}
      maxHeight="50vh"
      emptyMessage="Aucune donnée"
    />
  )
}

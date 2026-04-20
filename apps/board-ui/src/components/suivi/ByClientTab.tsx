import { useMemo } from 'react'
import { Pill } from '@/components/ui/pill'
import type { OrderRow } from '@/types/suivi-commandes'

interface ClientAgg {
  id: string
  client: string
  nbCommandes: number
  totalLivre: number
  totalRestant: number
}

const COL = '1fr 100px 100px 100px'

export function ByClientTab({ rows }: { rows: OrderRow[] }) {
  const data = useMemo(() => {
    const map = new Map<string, { commandes: Set<string>; livre: number; restant: number }>()
    for (const r of rows) {
      const key = r['Nom client commande']
      if (!map.has(key)) map.set(key, { commandes: new Set(), livre: 0, restant: 0 })
      const entry = map.get(key)!
      entry.commandes.add(r['No commande'])
      entry.livre += r['Quantit\u00e9 livr\u00e9e'] ?? 0
      entry.restant += r['Quantit\u00e9 restante'] ?? 0
    }
    return Array.from(map.entries())
      .map(([client, v]) => ({
        id: client,
        client,
        nbCommandes: v.commandes.size,
        totalLivre: v.livre,
        totalRestant: v.restant,
      }))
      .sort((a, b) => b.totalRestant - a.totalRestant)
  }, [rows])

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div
        className="grid gap-3 px-3.5 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider bg-accent/30"
        style={{ gridTemplateColumns: COL }}
      >
        <span>Client</span>
        <span className="text-right">Commandes</span>
        <span className="text-right">Livré</span>
        <span className="text-right">Restant</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {data.map((row, idx) => (
          <div
            key={row.id}
            className="grid gap-3 items-center text-xs border-b border-border/50 hover:bg-muted/30 transition-colors"
            style={{
              gridTemplateColumns: COL,
              padding: '6px 14px',
              background: idx % 2 === 1 ? 'var(--color-accent)' : 'transparent',
            }}
          >
            <span className="font-medium truncate">{row.client}</span>
            <span className="text-right tabular-nums font-mono text-[11px]">{row.nbCommandes}</span>
            <span className="text-right tabular-nums font-mono text-[11px] text-muted-foreground">{row.totalLivre.toLocaleString('fr-FR')}</span>
            <span className="text-right tabular-nums font-mono text-[11px] font-semibold">{row.totalRestant.toLocaleString('fr-FR')}</span>
          </div>
        ))}
        {data.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">Aucune donnée</div>
        )}
      </div>
    </section>
  )
}

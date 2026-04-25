import { useMemo } from 'react'
import { Pill } from '@/components/ui/pill'
import type { OrderRow } from '@/types/suivi-commandes'
import { STATUS_TONE_MAP } from '@/types/suivi-commandes'

const COL = '140px 100px 100px 100px'

export function ByEtatTab({ rows }: { rows: OrderRow[] }) {
  const data = useMemo(() => {
    const map = new Map<string, { commandes: Set<string>; articles: Set<string>; restant: number }>()
    for (const r of rows) {
      const key = r.Statut || '(vide)'
      if (!map.has(key)) map.set(key, { commandes: new Set(), articles: new Set(), restant: 0 })
      const entry = map.get(key)!
      entry.commandes.add(r['No commande'])
      entry.articles.add(r.Article)
      entry.restant += r['Quantit\u00e9 restante'] ?? 0
    }
    return Array.from(map.entries())
      .map(([statut, v]) => ({
        id: statut,
        statut,
        nbCommandes: v.commandes.size,
        nbArticles: v.articles.size,
        totalRestant: v.restant,
      }))
      .sort((a, b) => b.nbCommandes - a.nbCommandes)
  }, [rows])

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div
        className="grid gap-3 px-3.5 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider bg-accent/30"
        style={{ gridTemplateColumns: COL }}
      >
        <span>Statut</span>
        <span className="text-right">Commandes</span>
        <span className="text-right">Articles</span>
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
            <Pill tone={STATUS_TONE_MAP[row.statut] ?? 'default'}>{row.statut}</Pill>
            <span className="text-right tabular-nums font-mono text-[11px]">{row.nbCommandes}</span>
            <span className="text-right tabular-nums font-mono text-[11px] text-muted-foreground">{row.nbArticles}</span>
            <span className="text-right tabular-nums font-mono text-[11px]">{row.totalRestant.toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

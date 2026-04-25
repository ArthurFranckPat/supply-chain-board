import { useState, useMemo } from 'react'
import { Pill } from '@/components/ui/pill'
import { Segmented } from '@/components/ui/segmented'
import { formatDateShort } from '@/lib/format'
import type { ReceptionRow } from '@/types/scheduler'

interface ExpectedComponentsProps {
  rows: ReceptionRow[]
}

export function ExpectedComponents({ rows }: ExpectedComponentsProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (mode === 'blocked' && !r.ofs.some(o => o.blocked)) return false
      if (mode === 'late' && r.jours_restants >= 0) return false
      if (mode === 'impact' && r.nb_of_concernes === 0) return false
      if (query) {
        const q = query.toLowerCase()
        return r.num_commande.toLowerCase().includes(q)
          || r.article.toLowerCase().includes(q)
          || (r.description ?? '').toLowerCase().includes(q)
          || (r.fournisseur ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [rows, mode, query])

  if (rows.length === 0) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Aucune commande d'achat en attente</div>
  }

  const late = rows.filter(r => r.jours_restants < 0).length
  const blocked = rows.filter(r => r.ofs.some(o => o.blocked)).length

  return (
    <div>
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border flex-wrap">
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher..."
          className="h-7 px-2 text-[11px] border border-border bg-card outline-none focus:border-ring placeholder:text-muted-foreground flex-1 min-w-[180px] max-w-[300px]"
        />
        <Segmented
          value={mode} onChange={setMode}
          options={[
            { value: 'all', label: `Toutes (${rows.length})` },
            { value: 'blocked', label: `Bloqués (${blocked})` },
            { value: 'late', label: `Retard (${late})` },
            { value: 'impact', label: 'Impact' },
          ]}
        />
        <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="grid gap-2 py-1.5 px-1 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
        style={{ gridTemplateColumns: '16px 80px 1fr 100px 50px 70px 50px 60px' }}
      >
        <span /><span>Cmd</span><span>Article</span><span>Fourn.</span>
        <span className="text-right">Qté</span><span className="text-right">Date</span><span className="text-right">Stock</span><span>État</span>
      </div>

      <div className="max-h-[48vh] overflow-y-auto">
        {filtered.map((row, idx) => {
          const isLate = row.jours_restants < 0
          const isImminent = !isLate && row.jours_restants <= 2
          const hasBlockedOfs = row.ofs.some(o => o.blocked)
          const rowKey = `${row.article}-${row.fournisseur}-${row.date_prevue}-${idx}`
          const isExpanded = expandedRow === rowKey

          return (
            <div key={rowKey}>
              <div
                className="grid gap-2 items-center text-[11px] py-1.5 px-1 cursor-pointer hover:bg-muted/20"
                style={{
                  gridTemplateColumns: '16px 80px 1fr 100px 50px 70px 50px 60px',
                  borderLeft: hasBlockedOfs ? '2px solid var(--color-destructive)' : '2px solid transparent',
                }}
                onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
              >
                <span className="text-muted-foreground">{row.nb_of_concernes > 0 ? (isExpanded ? '▼' : '▶') : ''}</span>
                <span className="font-mono text-[11px]">{row.num_commande}</span>
                <div className="flex flex-col gap-0 min-w-0">
                  <span className="font-semibold text-[11px]">{row.article}</span>
                  {row.description && <span className="text-[10px] text-muted-foreground truncate">{row.description}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground font-mono truncate">{row.fournisseur || '-'}</span>
                <span className="text-right tabular-nums">{row.quantite.toLocaleString('fr-FR')}</span>
                <span className={`text-right font-mono text-[10px] ${isLate ? 'text-destructive font-semibold' : isImminent ? 'text-orange' : 'text-muted-foreground'}`}>
                  {formatDateShort(row.date_prevue)}
                </span>
                <span className="text-right tabular-nums text-[10px]">{row.stock_actuel.toLocaleString('fr-FR')}</span>
                <div className="flex items-center gap-1">
                  {isLate ? <Pill tone="danger">{Math.abs(row.jours_restants)}j</Pill>
                    : isImminent ? <Pill tone="warn">{row.jours_restants === 0 ? "Auj." : `${row.jours_restants}j`}</Pill>
                    : <Pill tone="good">{row.jours_restants}j</Pill>}
                  {row.nb_of_concernes > 0 && <span className="text-[9px] text-muted-foreground font-mono">{row.nb_of_concernes}OF</span>}
                </div>
              </div>

              {isExpanded && row.ofs.length > 0 && (
                <div className="ml-4 pl-2 border-l border-border py-1 pr-2 bg-muted/20">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">OF concernés ({row.nb_of_concernes})</div>
                  {row.ofs.map((of) => (
                    <div key={of.num_of} className="flex items-center gap-2 text-[11px] py-0.5">
                      <span className="font-mono font-semibold">{of.num_of}</span>
                      <span className="text-muted-foreground">{of.article}</span>
                      <span className="text-muted-foreground font-mono">{of.line}</span>
                      {of.scheduled_day && <span className="text-muted-foreground font-mono">{formatDateShort(of.scheduled_day)}</span>}
                      {of.blocked ? <Pill tone="danger">Bloqué</Pill>
                        : of.blocking_components ? <Pill tone="warn">Planifié</Pill>
                        : <Pill tone="good">OK</Pill>}
                      {of.blocked && of.blocking_components && (
                        <span className="text-[10px] text-destructive font-mono truncate">{of.blocking_components}</span>
                      )}
                    </div>
                  ))}
                  {row.nb_of_concernes > row.ofs.length && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">+{row.nb_of_concernes - row.ofs.length} OF</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">Aucun résultat</div>}
      </div>
    </div>
  )
}

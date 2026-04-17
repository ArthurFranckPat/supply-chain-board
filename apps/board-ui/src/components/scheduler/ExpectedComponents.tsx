import { useState, useMemo } from 'react'
import { Clock, AlertTriangle, CheckCircle2, Truck, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react'
import { Pill } from '@/components/ui/pill'
import { Segmented } from '@/components/ui/segmented'
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
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
        Aucune commande d'achat en attente sur l'horizon
      </div>
    )
  }

  const late = rows.filter(r => r.jours_restants < 0).length
  const blocked = rows.filter(r => r.ofs.some(o => o.blocked)).length

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-3 mb-1 border-b border-border/50">
        {/* Search */}
        <div className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg flex-1 min-w-[220px] max-w-[380px]">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="N° commande · article · description · fournisseur"
            className="flex-1 bg-transparent border-none outline-none text-xs text-foreground"
          />
        </div>

        {/* Filter pills */}
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'all', label: `Toutes (${rows.length})` },
            { value: 'blocked', label: `OF bloqués (${blocked})` },
            { value: 'late', label: `En retard (${late})` },
            { value: 'impact', label: 'Impactantes' },
          ]}
        />

        <span className="text-[11px] text-muted-foreground ml-auto">
          {filtered.length} / {rows.length}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid gap-3 py-2 px-1 border-b border-border text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider"
        style={{ gridTemplateColumns: '24px 90px 1fr 120px 60px 80px 60px 72px' }}
      >
        <span />
        <span>Commande</span>
        <span>Article</span>
        <span>Fournisseur</span>
        <span className="text-right">Qté</span>
        <span className="text-right">Date prévue</span>
        <span className="text-right">Stock</span>
        <span>État</span>
      </div>

      {/* Rows */}
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
                className={`grid gap-3 items-center text-xs py-2 px-1 cursor-pointer ${
                  hasBlockedOfs ? 'bg-destructive/5' : idx % 2 === 1 ? 'bg-accent/50' : ''
                } ${hasBlockedOfs ? 'border-l-2 border-l-destructive' : ''}`}
                style={{ gridTemplateColumns: '24px 90px 1fr 120px 60px 80px 60px 72px' }}
                onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
              >
                {row.nb_of_concernes > 0 ? (
                  isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                ) : <span />}
                <span className="font-mono text-[11px] font-medium">{row.num_commande}</span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold text-xs">{row.article}</span>
                  {row.description && (
                    <span className="text-[10.5px] text-muted-foreground truncate">{row.description}</span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground font-mono truncate" title={row.fournisseur}>
                  {row.fournisseur || '-'}
                </span>
                <span className="text-right tabular-nums">{row.quantite.toLocaleString('fr-FR')}</span>
                <span className={`text-right font-mono text-[11px] ${
                  isLate ? 'text-destructive font-semibold' : isImminent ? 'text-orange font-semibold' : 'text-muted-foreground'
                }`}>
                  {formatDateShort(row.date_prevue)}
                </span>
                <span className="text-right tabular-nums text-[11px]">{row.stock_actuel.toLocaleString('fr-FR')}</span>
                <div className="flex items-center gap-1">
                  {isLate ? (
                    <Pill tone="danger" icon={<AlertTriangle className="h-2.5 w-2.5" />}>
                      {Math.abs(row.jours_restants)}j
                    </Pill>
                  ) : isImminent ? (
                    <Pill tone="warn" icon={<Clock className="h-2.5 w-2.5" />}>
                      {row.jours_restants === 0 ? "Auj." : `${row.jours_restants}j`}
                    </Pill>
                  ) : (
                    <Pill tone="good" icon={<CheckCircle2 className="h-2.5 w-2.5" />}>
                      {row.jours_restants}j
                    </Pill>
                  )}
                  {row.nb_of_concernes > 0 && (
                    <span className="text-[9px] text-muted-foreground font-mono">{row.nb_of_concernes}OF</span>
                  )}
                </div>
              </div>

              {/* Expanded: linked OFs */}
              {isExpanded && row.ofs.length > 0 && (
                <div className="ml-8 mr-2 py-2 px-3 bg-muted/50 rounded-lg mb-1 border border-border/50">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mb-1.5">
                    OF concernés ({row.nb_of_concernes})
                  </div>
                  {row.ofs.map((of) => (
                    <div key={of.num_of} className="flex items-center gap-3 text-[11px] py-0.5">
                      <span className="font-mono font-medium">{of.num_of}</span>
                      <span className="text-muted-foreground">{of.article}</span>
                      <span className="text-muted-foreground font-mono">{of.line}</span>
                      {of.scheduled_day && (
                        <span className="text-muted-foreground font-mono">{formatDateShort(of.scheduled_day)}</span>
                      )}
                      {of.blocked ? (
                        <Pill tone="danger">Bloqué</Pill>
                      ) : (
                        <Pill tone="good">OK</Pill>
                      )}
                    </div>
                  ))}
                  {row.nb_of_concernes > row.ofs.length && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      +{row.nb_of_concernes - row.ofs.length} OF supplémentaires
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">Aucun résultat</div>
        )}
      </div>
    </div>
  )
}

function formatDateShort(v?: string | null) {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) } catch { return v }
}

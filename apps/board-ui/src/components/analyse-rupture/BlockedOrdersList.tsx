import { useState, Fragment } from 'react'
import { Pill } from '@/components/ui/pill'
import { fmtDate } from '@/lib/format'
import type { AnalyseRuptureResponse } from '@/types/analyse-rupture'
import { PoolTree } from './PoolTree'

interface BlockedOrdersListProps {
  result: AnalyseRuptureResponse
  isProjected: boolean
}

export function BlockedOrdersList({ result, isProjected }: BlockedOrdersListProps) {
  const [expandedOfs, setExpandedOfs] = useState<Set<number>>(new Set())
  const [expandedOrphans, setExpandedOrphans] = useState(false)
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set())

  function toggleOfs(index: number) {
    setExpandedOfs((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleBranch(key: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function groupedByBranch() {
    const cmds = result.commandes_bloquees
    const map = new Map<string, { cmd: (typeof cmds)[number]; idx: number }[]>()
    for (let idx = 0; idx < cmds.length; idx++) {
      const cmd = cmds[idx]
      const key = cmd.branch_key ?? '(Autres)'
      const group = map.get(key) ?? []
      group.push({ cmd, idx })
      map.set(key, group)
    }
    return map
  }

  function getSfDescription(branchKey: string): string {
    const contrib = result.component.pool_repartition.find((p) => p.article === branchKey)
    return contrib?.description ?? ''
  }

  return (
    <Fragment>
      {/* Component info */}
      <div className="bg-card border border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="block text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Composant</span>
            <p className="text-[14px] font-bold">{result.component.code}</p>
            <p className="text-[11px] text-muted-foreground">{result.component.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Pill tone="default">Stock {result.component.stock_physique}</Pill>
            <Pill tone="warn">Alloue {result.component.stock_alloue}</Pill>
            <Pill tone="good">Dispo {isProjected ? result.component.stock_disponible_projete : result.component.stock_disponible}</Pill>
            {(isProjected ? result.component.deficit_projete : result.component.deficit) > 0 && (
              <Pill tone="danger">Deficit {isProjected ? result.component.deficit_projete : result.component.deficit}</Pill>
            )}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="flex items-center gap-1.5">
        <Pill tone="danger">{result.summary.total_blocked_ofs} OFs bloques</Pill>
        <Pill tone="warn">{result.summary.total_affected_orders} cmd impactees</Pill>
        <Pill tone="primary">{result.summary.affected_lines.length} lignes</Pill>
        <Pill tone="good">Pool {Math.round(result.component.pool_total)}</Pill>
        {result.summary.truncated && <Pill tone="warn">Résultat tronqué</Pill>}
      </div>

      {/* Pool breakdown */}
      {result.component.pool_repartition.filter((p) => p.contribution !== 0).length > 0 && (
        <PoolTree repartition={result.component.pool_repartition.filter((p) => p.contribution !== 0)} />
      )}

      {/* Commandes bloquees */}
      <div className="space-y-1">
        <span className="block text-[9px] text-muted-foreground uppercase tracking-wide font-semibold px-1">
          Commandes bloquees ({result.commandes_bloquees.length})
        </span>

        {result.merge_branches ? (
          result.commandes_bloquees.map((cmd, index) => {
            const poolTotal = cmd.branch_pool_total ?? (result.component.pool_total || 1)
            const poolPct = Math.max(0, Math.min(100, (cmd.proj_pool / poolTotal) * 100))
            return (
              <div key={`${cmd.num_commande}-${cmd.branch_key ?? index}`} className="bg-card border border-border">
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-border/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-[11px]">{cmd.num_commande}</span>
                    <span className="font-semibold text-[11px] truncate">{cmd.client}</span>
                    <span className="text-[10px] text-muted-foreground">{cmd.article}</span>
                    <Pill tone="outline">{cmd.type_commande}</Pill>
                    {cmd.nature === 'PREVISION' && <Pill tone="warn">Prevision</Pill>}
                    {cmd.branch_key && <Pill tone="outline">{cmd.branch_key}</Pill>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDate(cmd.date_expedition)}</span>
                    {cmd.etat && <Pill tone={cmd.etat === 'RUPTURE' ? 'danger' : 'good'}>{cmd.etat}</Pill>}
                  </div>
                </div>

                {cmd.chemin_impact.length > 1 && (
                  <div className="px-3 py-1">
                    <div className="flex items-center gap-0 flex-wrap">
                      {cmd.chemin_impact.map((code, i) => {
                        const isLast = i === cmd.chemin_impact.length - 1
                        const isFirst = i === 0
                        return (
                          <span key={i} className="flex items-center gap-0">
                            <span className={`inline-flex items-center px-1 py-0 text-[10px] font-mono border ${
                              isFirst ? 'bg-foreground/10 text-foreground font-semibold border-border'
                                : isLast ? 'bg-destructive/10 text-destructive font-semibold border-destructive/20'
                                : 'bg-muted text-muted-foreground border-border'
                            }`}>
                              {code}
                            </span>
                            {!isLast && <span className="mx-0.5 text-[9px] text-muted-foreground">&rsaquo;</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="px-3 py-1.5 flex items-center gap-3">
                  <div className="w-14 shrink-0 text-center">
                    <span className="block text-[8px] text-muted-foreground uppercase">Qte</span>
                    <span className="block text-[14px] font-mono font-bold tabular-nums leading-tight">{cmd.qte_restante}</span>
                  </div>
                  <div className="w-px h-6 bg-border shrink-0" />
                  <div className="w-16 shrink-0 text-center">
                    <span className="block text-[8px] text-muted-foreground uppercase">Impact</span>
                    <span className="block text-[14px] font-mono font-bold tabular-nums leading-tight text-destructive">-{Math.round(cmd.qte_impact_composant)}</span>
                  </div>
                  <div className="w-px h-6 bg-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[8px] text-muted-foreground uppercase">Pool restant</span>
                      <span className="text-[10px] font-mono font-semibold tabular-nums">{Math.round(Math.max(0, cmd.proj_pool))} / {Math.round(poolTotal)}</span>
                    </div>
                    <div className="h-[3px] bg-border">
                      <div className="h-full bg-primary transition-all" style={{ width: `${poolPct}%` }} />
                    </div>
                  </div>
                </div>

                {cmd.ofs_bloquants.length > 0 && (
                  <div className="border-t border-border px-3">
                    {expandedOfs.has(index) ? (
                      <>
                        <button className="w-full py-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => toggleOfs(index)}>
                          <span>▼</span> Masquer OFs
                        </button>
                        <div className="space-y-0.5 pb-2">
                          {cmd.ofs_bloquants.map((of) => (
                            <div key={of.num_of} className={`flex items-center justify-between px-2 py-1 text-[11px] ${of.composants_alloues ? 'bg-green/5 border border-green/20' : 'bg-muted/40'}`}>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold">{of.num_of}</span>
                                <span className="text-muted-foreground">{of.article}</span>
                                <Pill tone="outline">{of.statut}</Pill>
                                {of.composants_alloues && <Pill tone="good">Alloues</Pill>}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="tabular-nums">{of.qte_restante}/{of.qte_a_fabriquer}</span>
                                <span>{of.date_fin}</span>
                                {of.postes_charge.length > 0 && <span>{of.postes_charge.join(', ')}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <button className="w-full py-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => toggleOfs(index)}>
                        <span>▶</span> {cmd.ofs_bloquants.length} OF{cmd.ofs_bloquants.length > 1 ? 's' : ''} bloquant{cmd.ofs_bloquants.length > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          (() => {
            const branches = groupedByBranch()
            return Array.from(branches.entries()).map(([branchKey, cmds]) => {
              const isExpanded = expandedBranches.size === 0 || expandedBranches.has(branchKey)
              const branchPool = cmds[0]?.cmd.branch_pool_total ?? (result.component.pool_total || 1)
              const desc = getSfDescription(branchKey)

              return (
                <div key={branchKey} className="bg-card border border-border">
                  <button className="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-muted/20 transition-colors" onClick={() => toggleBranch(branchKey)}>
                    <span className="text-muted-foreground text-[11px]">{isExpanded ? '▼' : '▶'}</span>
                    <span className="font-mono font-bold text-[12px]">{branchKey}</span>
                    {desc && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{desc}</span>}
                    <Pill tone="primary">Pool {Math.round(branchPool)}</Pill>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{cmds.length}</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      <div className="ml-3 pl-2 border-l border-border space-y-1 py-1 pr-3">
                        {cmds.map(({ cmd, idx }) => {
                          const poolTotal = cmd.branch_pool_total ?? (result.component.pool_total || 1)
                          const poolPct = Math.max(0, Math.min(100, (cmd.proj_pool / poolTotal) * 100))
                          return (
                            <div key={`${cmd.num_commande}-${idx}`} className="relative pl-2">
                              <div className="absolute left-0 top-3 w-2 border-t border-border" />
                              <div className="bg-card border border-border">
                                <div className="px-2 py-1 flex items-center justify-between border-b border-border/40">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-mono font-semibold text-[11px]">{cmd.num_commande}</span>
                                    <span className="font-semibold text-[11px] truncate">{cmd.client}</span>
                                    <span className="text-[10px] text-muted-foreground">{cmd.article}</span>
                                    <Pill tone="outline">{cmd.type_commande}</Pill>
                                    {cmd.nature === 'PREVISION' && <Pill tone="warn">Prevision</Pill>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDate(cmd.date_expedition)}</span>
                                    {cmd.etat && <Pill tone={cmd.etat === 'RUPTURE' ? 'danger' : 'good'}>{cmd.etat}</Pill>}
                                  </div>
                                </div>

                                <div className="px-2 py-1 flex items-center gap-2">
                                  <div className="w-12 shrink-0 text-center">
                                    <span className="block text-[7px] text-muted-foreground uppercase">Qte</span>
                                    <span className="block text-[13px] font-mono font-bold">{cmd.qte_restante}</span>
                                  </div>
                                  <div className="w-px h-5 bg-border shrink-0" />
                                  <div className="w-14 shrink-0 text-center">
                                    <span className="block text-[7px] text-muted-foreground uppercase">Impact</span>
                                    <span className="block text-[13px] font-mono font-bold text-destructive">-{Math.round(cmd.qte_impact_composant)}</span>
                                  </div>
                                  <div className="w-px h-5 bg-border shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[7px] text-muted-foreground uppercase">Pool</span>
                                      <span className="text-[9px] font-mono font-semibold">{Math.round(Math.max(0, cmd.proj_pool))}/{Math.round(poolTotal)}</span>
                                    </div>
                                    <div className="h-[3px] bg-border">
                                      <div className="h-full bg-primary transition-all" style={{ width: `${poolPct}%` }} />
                                    </div>
                                  </div>
                                </div>

                                {cmd.ofs_bloquants.length > 0 && (
                                  <div className="border-t border-border px-2">
                                    {expandedOfs.has(idx) ? (
                                      <>
                                        <button className="w-full py-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => toggleOfs(idx)}>
                                          <span>▼</span> Masquer OFs
                                        </button>
                                        <div className="space-y-0.5 pb-1.5">
                                          {cmd.ofs_bloquants.map((of) => (
                                            <div key={of.num_of} className={`flex items-center justify-between px-2 py-1 text-[10px] ${of.composants_alloues ? 'bg-green/5 border border-green/20' : 'bg-muted/40'}`}>
                                              <div className="flex items-center gap-1.5">
                                                <span className="font-mono font-semibold">{of.num_of}</span>
                                                <span className="text-muted-foreground">{of.article}</span>
                                                <Pill tone="outline">{of.statut}</Pill>
                                                {of.composants_alloues && <Pill tone="good">Alloues</Pill>}
                                              </div>
                                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                <span className="tabular-nums">{of.qte_restante}/{of.qte_a_fabriquer}</span>
                                                <span>{of.date_fin}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    ) : (
                                      <button className="w-full py-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => toggleOfs(idx)}>
                                        <span>▶</span> {cmd.ofs_bloquants.length} OF
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          })()
        )}
      </div>

      {/* OFs sans commande */}
      {result.ofs_sans_commande.length > 0 && (
        <div className="space-y-1">
          <button className="w-full bg-card border border-border text-left px-3 py-2 flex items-center gap-2" onClick={() => setExpandedOrphans(!expandedOrphans)}>
            <span className="text-muted-foreground text-[11px]">{expandedOrphans ? '▼' : '▶'}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold flex-1">OFs sans rattachement ({result.ofs_sans_commande.length})</span>
            <Pill tone="outline">{result.ofs_sans_commande.length}</Pill>
          </button>

          {expandedOrphans && (
            <div className="space-y-0.5">
              {result.ofs_sans_commande.map((of) => (
                <div key={of.num_of} className={`bg-card border px-3 py-1.5 flex items-center justify-between text-[11px] ${of.composants_alloues ? 'border-green/30' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{of.num_of}</span>
                    <span className="text-muted-foreground">{of.article}</span>
                    <Pill tone="outline">{of.statut}</Pill>
                    {of.composants_alloues && <Pill tone="good">Alloues</Pill>}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{of.qte_restante}/{of.qte_a_fabriquer}</span>
                    <span>{of.date_fin}</span>
                    {of.postes_charge.length > 0 && <span>{of.postes_charge.join(', ')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Affected lines */}
      {result.summary.affected_lines.length > 0 && (
        <div className="bg-card border border-border px-3 py-2">
          <span className="block text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Lignes impactees</span>
          <div className="flex flex-wrap gap-1">
            {result.summary.affected_lines.map((line) => (
              <Pill key={line} tone="primary">{line}</Pill>
            ))}
          </div>
        </div>
      )}
    </Fragment>
  )
}

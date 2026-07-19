/**
 * Vue R2 « Par composant » du suivi des ruptures (port React) : agrégation
 * « quel composant fait le plus de dégâts ? » (nb OFs bloqués, qté totale,
 * commande la plus urgente).
 *
 * L'agrégation (groupByComponent) est une dérivation pure (lib/shortages/
 * shortage-math.ts) ; cette vue se contente du rendu table agrégée.
 */
import { useMemo, type ReactNode } from 'react'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cn } from '@r/lib/utils'
import {
  VERDICT_BADGE,
  groupByComponent,
  isLate,
  TH,
  TH_R,
  TD,
} from '@/lib/shortages/shortage-math'

export function ShortageComposants({
  rows,
  onSelectOf,
  emptyState,
}: {
  rows: ShortageDisplayRow[]
  onSelectOf: (numOf: string) => void
  emptyState: ReactNode
}) {
  const groups = useMemo(() => groupByComponent(rows), [rows])

  const fmtTotal = (n: number) => {
    const r = Math.round(n * 100) / 100
    return Number.isInteger(r) ? String(r) : r.toLocaleString('fr-FR')
  }

  if (groups.length === 0) {
    return (
      <div className="h-full overflow-auto bg-card">{emptyState}</div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-card">
      <table className="min-w-[1080px] w-full text-xs">
        <thead>
          <tr className="sticky top-0 z-10 bg-secondary">
            <th className={`w-[38px] ${TH}`}>N°</th>
            <th className={TH}>Composant · Désignation</th>
            <th className={`w-[110px] ${TH_R}`}>Qté manq. totale</th>
            <th className={`w-[90px] ${TH_R}`}>OFs bloqués</th>
            <th className={TH}>OFs</th>
            <th className={`w-[210px] ${TH}`}>Commande la plus urgente</th>
            <th className={`w-[150px] ${TH.replace('border-r border-rule-soft', '')}`}>Couverture</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => {
            const late = g.worstVerdict === 'retard' || g.worstVerdict === 'sans_couverture'
            return (
              <tr
                key={g.component}
                className={cn(
                  'border-t border-rule-soft transition-colors',
                  late
                    ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
                    : 'hover:bg-foreground/[0.04]'
                )}
              >
                <td
                  className={cn(
                    'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
                    late && '[box-shadow:inset_3px_0_var(--color-destructive)]'
                  )}
                >
                  {i + 1}
                </td>
                <td className={TD}>
                  <div className="font-mono text-[14px] font-bold tracking-tight text-foreground">
                    {g.component}
                  </div>
                  <div className="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
                    {g.componentDesc}
                  </div>
                </td>
                <td className={`whitespace-nowrap text-right ${TD}`}>
                  <span
                    className={cn(
                      'font-fraunces text-[14px] font-bold tabular-nums leading-none',
                      late ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    {fmtTotal(g.totalManquant)}
                    <span className="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">
                      u
                    </span>
                  </span>
                </td>
                <td className={`whitespace-nowrap text-right ${TD}`}>
                  <span className="font-fraunces text-[14px] font-bold tabular-nums leading-none text-foreground">
                    {g.lines.length}
                  </span>
                </td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1">
                    {g.lines.map((l) => (
                      <button
                        key={l.numOf}
                        type="button"
                        onClick={() => onSelectOf(l.numOf)}
                        title={`${l.articleParent} · ${l.articleParentDesc} — manque ${l.qteManquante} u`}
                        className={cn(
                          'cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold transition-colors hover:border-brand hover:text-brand',
                          l.verdictKey === 'sans_couverture'
                            ? 'border-destructive/30 text-destructive'
                            : 'border-rule text-secondary-foreground'
                        )}
                      >
                        {l.numOf}
                      </button>
                    ))}
                  </div>
                </td>
                <td className={TD}>
                  {g.urgent ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[12px] font-semibold text-secondary-foreground">
                          {g.urgent.numCommande}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-[11px] font-bold',
                            late ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          {g.urgent.dateExpedition}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate max-w-[13rem] font-sans text-[11px] leading-snug text-muted-foreground">
                        {g.urgent.client}
                      </div>
                    </>
                  ) : (
                    <span className="font-sans text-[11px] italic text-muted-foreground/50">
                      — orphelins
                    </span>
                  )}
                </td>
                <td className="w-[150px] px-4 py-[13px] align-middle">
                  {g.nbSansCouverture > 0 ? (
                    <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-destructive">
                      {g.nbSansCouverture}/{g.lines.length} sans couv.
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                        VERDICT_BADGE[g.worstVerdict].cls
                      )}
                    >
                      {VERDICT_BADGE[g.worstVerdict].label}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default ShortageComposants

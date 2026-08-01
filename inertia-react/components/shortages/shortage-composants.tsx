/**
 * Vue R2 « Par composant » du suivi des ruptures (port React) : agrégation
 * « quel composant fait le plus de dégâts ? » (nb OFs bloqués, qté totale,
 * commande la plus urgente).
 *
 * L'agrégation (groupByComponent) est une dérivation pure (lib/shortages/
 * shortage-math.ts) ; cette vue se contente du rendu table agrégée via le
 * DataTable partagé (même tri/style que le Registre R1 et /suivi proactif).
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { ShortageDisplayRow } from '@r/lib/shortages/types'
import { cn } from '@r/lib/utils'
import {
  VERDICT_BAR,
  VERDICT_DOT,
  VERDICT_TEXT,
  VERDICT_LABEL,
  groupByComponent,
  type ComponentGroup,
  TH,
  TH_R,
  TD,
} from '@r/lib/shortages/shortage-math'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'

const late = (g: ComponentGroup) =>
  g.worstVerdict === 'retard' || g.worstVerdict === 'sans_couverture'

const fmtTotal = (n: number) => {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toLocaleString('fr-FR')
}

function createColumns(onSelectOf: (numOf: string) => void): ColumnDef<ComponentGroup>[] {
  return [
    {
      accessorKey: 'component',
      header: () => 'Composant · Désignation',
      cell: ({ row: { original: g } }) => (
        <>
          <div className="font-mono text-[14px] font-bold tracking-tight text-foreground">
            {g.component}
          </div>
          <div className="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
            {g.componentDesc}
          </div>
        </>
      ),
      meta: { thClass: TH, tdClass: TD },
    },
    {
      accessorKey: 'totalManquant',
      header: () => 'Qté manq. totale',
      cell: ({ row: { original: g } }) => (
        <span
          className={cn(
            'font-fraunces text-[14px] font-bold tabular-nums leading-none',
            late(g) ? 'text-destructive' : 'text-foreground'
          )}
        >
          {fmtTotal(g.totalManquant)}
          <span className="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">
            u
          </span>
        </span>
      ),
      meta: {
        thClass: `w-[110px] ${TH_R}`,
        tdClass: `w-[110px] whitespace-nowrap text-right ${TD}`,
      },
    },
    {
      id: 'nbOfs',
      accessorFn: (g) => g.lines.length,
      header: () => 'OFs bloqués',
      cell: ({ row: { original: g } }) => (
        <span className="font-fraunces text-[14px] font-bold tabular-nums leading-none text-foreground">
          {g.lines.length}
        </span>
      ),
      meta: { thClass: `w-[90px] ${TH_R}`, tdClass: `w-[90px] whitespace-nowrap text-right ${TD}` },
    },
    {
      id: 'ofs',
      enableSorting: false,
      header: () => 'OFs',
      cell: ({ row: { original: g } }) => (
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
      ),
      meta: { thClass: TH, tdClass: TD },
    },
    {
      id: 'urgent',
      enableSorting: false,
      header: () => 'Commande la plus urgente',
      cell: ({ row: { original: g } }) =>
        g.urgent ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[12px] font-semibold text-secondary-foreground">
                {g.urgent.numCommande}
              </span>
              <span
                className={cn(
                  'font-mono text-[11px] font-bold',
                  late(g) ? 'text-destructive' : 'text-muted-foreground'
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
          <span className="font-sans text-[11px] italic text-muted-foreground/50">— orphelins</span>
        ),
      meta: { thClass: `w-[210px] ${TH}`, tdClass: `w-[210px] ${TD}` },
    },
    {
      id: 'couverture',
      enableSorting: false,
      header: () => 'Couverture',
      cell: ({ row: { original: g } }) =>
        g.nbSansCouverture > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
            <span className="text-[11px] font-semibold whitespace-nowrap text-destructive">
              {g.nbSansCouverture}/{g.lines.length} sans couv.
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('size-1.5 shrink-0 rounded-full', VERDICT_DOT[g.worstVerdict])} />
            <span
              className={cn(
                'text-[11px] font-semibold whitespace-nowrap',
                VERDICT_TEXT[g.worstVerdict]
              )}
            >
              {VERDICT_LABEL[g.worstVerdict]}
            </span>
          </span>
        ),
      meta: { thClass: `w-[150px] ${TH}`, tdClass: `w-[150px] ${TD}` },
    },
  ]
}

export function ShortageComposants({
  rows,
  onSelectOf,
  emptyState,
}: {
  rows: ShortageDisplayRow[]
  onSelectOf: (numOf: string) => void
  emptyState: ReactNode
}) {
  const [sorting, setSorting] = useState<SortingState[]>([])
  const groups = useMemo(() => groupByComponent(rows), [rows])
  const columns = useMemo(() => createColumns(onSelectOf), [onSelectOf])

  const indexColumn = {
    headerLabel: 'N°',
    thClass: `w-[38px] ${TH}`,
    tdClass: (g: ComponentGroup) =>
      cn(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80',
        VERDICT_BAR[g.worstVerdict]
      ),
  }

  return (
    <DataTable
      columns={columns}
      rows={groups}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[1080px] text-xs"
      scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowClass={() =>
        'border-t border-rule-soft transition-colors even:bg-foreground/[0.015] hover:bg-foreground/[0.07]'
      }
      getRowKey={(g) => g.component}
      emptyState={emptyState}
    />
  )
}

export default ShortageComposants

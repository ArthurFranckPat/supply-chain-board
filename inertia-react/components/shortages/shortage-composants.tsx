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
import { X3Link } from '@r/components/x3-link'
import { Badge } from '@r/components/ui/badge'
import { cn } from '@r/lib/utils'
import {
  VERDICT_TONE,
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
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-mono text-xs font-bold tracking-tight text-foreground">
            {g.component}
          </span>
          <span className="truncate text-2xs text-muted-foreground/70">{g.componentDesc}</span>
        </div>
      ),
      meta: { thClass: `w-[220px] ${TH}`, tdClass: TD },
    },
    {
      accessorKey: 'totalManquant',
      header: () => 'Qté manq. totale',
      cell: ({ row: { original: g } }) => (
        <span
          className={cn(
            'font-mono text-cell-lg font-bold leading-none tracking-tight tabular-nums',
            late(g) ? 'text-destructive' : 'text-foreground'
          )}
        >
          {fmtTotal(g.totalManquant)}
          <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
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
        <span className="font-mono text-cell-lg font-bold leading-none tracking-tight tabular-nums text-foreground">
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
        <div className="flex flex-wrap gap-1.5">
          {g.lines.map((l) => (
            <button
              key={l.numOf}
              type="button"
              onClick={() => onSelectOf(l.numOf)}
              title={`${l.articleParent} · ${l.articleParentDesc} — manque ${l.qteManquante} u`}
              className={cn(
                'truncate rounded font-mono text-2xs font-semibold leading-none underline decoration-dotted underline-offset-2',
                l.verdictKey === 'sans_couverture'
                  ? 'text-destructive decoration-destructive/40 hover:text-destructive/70'
                  : 'text-secondary-foreground decoration-muted-foreground/40 hover:text-secondary-foreground/70'
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
              <X3Link
                fonction="GESSOH"
                cle={g.urgent.numCommande}
                title={`Ouvrir la commande ${g.urgent.numCommande} dans Sage X3`}
                className="font-mono text-xs font-bold tracking-tight text-secondary-foreground"
              >
                {g.urgent.numCommande}
              </X3Link>
              <span
                className={cn(
                  'font-mono text-2xs font-semibold',
                  late(g) ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {g.urgent.dateExpedition}
              </span>
            </div>
            <div className="mt-0.5 truncate max-w-[13rem] text-2xs text-muted-foreground">
              {g.urgent.client}
            </div>
          </>
        ) : (
          <span className="text-2xs italic text-muted-foreground/50">— orphelins</span>
        ),
      meta: { thClass: `w-[210px] ${TH}`, tdClass: `w-[210px] ${TD}` },
    },
    {
      id: 'couverture',
      enableSorting: false,
      header: () => 'Couverture',
      cell: ({ row: { original: g } }) =>
        g.nbSansCouverture > 0 ? (
          <Badge variant="destructive" className="font-semibold">
            {g.nbSansCouverture}/{g.lines.length} sans couv.
          </Badge>
        ) : (
          <Badge variant={VERDICT_TONE[g.worstVerdict].badge} className="font-semibold">
            {VERDICT_LABEL[g.worstVerdict]}
          </Badge>
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
        'px-4 py-[7px] align-middle font-sans text-xs font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        VERDICT_TONE[g.worstVerdict].bar
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

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
import { CellNumber, CellStack, CellVerdict, severityBarClass } from '@r/components/ui/table-row'
import { cn } from '@r/lib/utils'
import {
  VERDICT_TONE,
  VERDICT_LABEL,
  groupByComponent,
  type ComponentGroup,
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
        <CellStack
          code={g.component}
          label={g.componentDesc}
          labelTitle={g.componentDesc || undefined}
        />
      ),
      meta: { thClass: 'w-[220px]' },
    },
    {
      accessorKey: 'totalManquant',
      header: () => 'Qté manq. totale',
      cell: ({ row: { original: g } }) => (
        <CellNumber
          tone={late(g) ? 'critical' : null}
          value={
            <>
              {fmtTotal(g.totalManquant)}
              <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
            </>
          }
        />
      ),
      meta: {
        thClass: 'w-[110px] text-right!',
        tdClass: 'w-[110px] whitespace-nowrap text-right',
      },
    },
    {
      id: 'nbOfs',
      accessorFn: (g) => g.lines.length,
      header: () => 'OFs bloqués',
      cell: ({ row: { original: g } }) => <CellNumber value={g.lines.length} />,
      meta: { thClass: 'w-[90px] text-right!', tdClass: 'w-[90px] whitespace-nowrap text-right' },
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
      meta: {},
    },
    {
      id: 'urgent',
      enableSorting: false,
      header: () => 'Commande la plus urgente',
      cell: ({ row: { original: g } }) =>
        g.urgent ? (
          <CellStack
            code={
              <X3Link
                fonction="GESSOH"
                cle={g.urgent.numCommande}
                title={`Ouvrir la commande ${g.urgent.numCommande} dans Sage X3`}
                className="text-secondary-foreground"
              >
                {g.urgent.numCommande}
              </X3Link>
            }
            action={
              <span
                className={cn(
                  'font-mono text-2xs font-semibold',
                  late(g) ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {g.urgent.dateExpedition}
              </span>
            }
            label={g.urgent.client}
          />
        ) : (
          <span className="text-2xs italic text-muted-foreground/50">— orphelins</span>
        ),
      meta: { thClass: 'w-[210px]', tdClass: 'w-[210px]' },
    },
    {
      id: 'couverture',
      enableSorting: false,
      header: () => 'Couverture',
      cell: ({ row: { original: g } }) =>
        g.nbSansCouverture > 0 ? (
          <CellVerdict
            icon={VERDICT_TONE.sans_couverture.icon}
            label={`${g.nbSansCouverture}/${g.lines.length} sans couv.`}
            tone={VERDICT_TONE.sans_couverture.text}
          />
        ) : (
          <CellVerdict
            icon={VERDICT_TONE[g.worstVerdict].icon}
            label={VERDICT_LABEL[g.worstVerdict]}
            tone={VERDICT_TONE[g.worstVerdict].text}
          />
        ),
      meta: { thClass: 'w-[150px]', tdClass: 'w-[150px]' },
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
    thClass: 'w-[38px]',
    tdClass: (g: ComponentGroup) =>
      cn(
        'font-sans font-bold tracking-tight text-muted-foreground/80 tabular-nums',
        severityBarClass(VERDICT_TONE[g.worstVerdict].tone)
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
      getRowKey={(g) => g.component}
      emptyState={emptyState}
    />
  )
}

export default ShortageComposants

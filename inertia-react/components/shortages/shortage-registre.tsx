/**
 * Vue R1 « Registre » du suivi des ruptures (port React) : table éditoriale dense,
 * une ligne par couple composant × OF bloqué, colonnes triables via le DataTable maison.
 *
 * Les lignes arrivent déjà filtrées du parent (scheduler/shortages) ; le tri
 * est géré localement par le DataTable.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cn } from '@r/lib/utils'
import { isLate, TH, TH_R, TD } from '@/lib/shortages/shortage-math'

const EMPTY = { rows: [] }

export function ShortageRegistre({
  rows,
  onSelectOf,
  emptyState,
}: {
  rows: ShortageDisplayRow[]
  onSelectOf: (numOf: string) => void
  emptyState: ReactNode
}) {
  // Tri par défaut : composant alphabétique.
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'component', desc: false }])

  const columns: ColumnDef<ShortageDisplayRow>[] = [
    {
      accessorKey: 'component',
      header: () => 'Composant',
      cell: ({ row: { original: row } }) => (
        <>
          <div className="font-mono text-[14px] font-bold tracking-tight text-foreground">
            {row.component}
          </div>
          <div className="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
            {row.componentDesc}
          </div>
        </>
      ),
      meta: { thClass: TH, tdClass: TD },
    },
    {
      accessorKey: 'qteManquante',
      header: () => 'Qté manq.',
      cell: ({ row: { original: row } }) => (
        <span
          className={cn(
            'font-fraunces text-[14px] font-bold tabular-nums leading-none',
            isLate(row) ? 'text-destructive' : 'text-foreground'
          )}
        >
          {row.qteManquante}
          <span className="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
        </span>
      ),
      meta: { thClass: `w-[80px] ${TH_R}`, tdClass: `w-[80px] whitespace-nowrap text-right ${TD}` },
    },
    {
      accessorKey: 'numOf',
      header: () => 'OF bloqué',
      cell: ({ row: { original: row } }) => (
        <>
          <button
            type="button"
            onClick={() => onSelectOf(row.numOf)}
            className="cursor-pointer font-mono text-[12px] font-semibold text-brand hover:underline"
          >
            {row.numOf}
          </button>
          <div className="mt-0.5 truncate max-w-[11rem] font-mono text-[10.5px] text-muted-foreground">
            <span className="font-semibold">{row.articleParent}</span>
            {row.articleParentDesc && (
              <span className="font-sans font-normal"> · {row.articleParentDesc}</span>
            )}
          </div>
        </>
      ),
      meta: { thClass: `w-[170px] ${TH}`, tdClass: `w-[170px] ${TD}` },
    },
    {
      accessorKey: 'numCommande',
      header: () => 'Commande',
      cell: ({ row: { original: row } }) =>
        row.hasCommande ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[12px] font-semibold text-secondary-foreground">
                {row.numCommande}
              </span>
              {row.dateExpedition && (
                <span
                  className={cn(
                    'font-mono text-[11px] font-bold',
                    isLate(row) ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  title={`Expé : ${row.dateExpeditionIso ?? ''}`}
                >
                  {row.dateExpedition}
                </span>
              )}
              {row.autresCommandes.length > 0 && (
                <span
                  className="rounded bg-brand-soft px-1 font-mono text-[9px] font-bold text-brand"
                  title={`Aussi : ${row.autresCommandes.join(', ')}`}
                >
                  +{row.autresCommandes.length}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate max-w-[11rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {row.client}
            </div>
          </>
        ) : (
          <span className="font-sans text-[11px] italic text-muted-foreground/50">— orphelin</span>
        ),
      meta: { thClass: `w-[180px] ${TH}`, tdClass: `w-[180px] ${TD}` },
    },
    {
      id: 'reception',
      enableSorting: false,
      header: () => 'Réception attendue',
      cell: ({ row: { original: row } }) => {
        const rec = row.reception
        if (!rec) {
          if (row.verdictKey !== 'sous_ensemble') {
            return <span className="text-muted-foreground/50">—</span>
          }
          if (row.sousEnsembleOfs.length === 0) {
            return <span className="text-muted-foreground/50">—</span>
          }
          return (
            <div className="flex flex-wrap items-center gap-1">
              {row.sousEnsembleOfs.slice(0, 3).map((numOf) => (
                <button
                  key={numOf}
                  type="button"
                  onClick={() => onSelectOf(numOf)}
                  className="cursor-pointer rounded border border-planifie/30 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-planifie transition-colors hover:border-brand hover:text-brand"
                >
                  {numOf}
                </button>
              ))}
              {row.sousEnsembleOfs.length > 3 && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  +{row.sousEnsembleOfs.length - 3}
                </span>
              )}
            </div>
          )
        }
        return (
          <>
            <div className="font-mono text-[11px] font-semibold text-muted-foreground">
              {rec.id}
            </div>
            <div className="mt-0.5 truncate max-w-[14rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {rec.supplier} · {rec.qty}u · {rec.dateArrivee}
            </div>
          </>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      id: 'verdict',
      enableSorting: false,
      header: () => 'Verdict',
      cell: ({ row: { original: row } }) => (
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
            row.verdictCls
          )}
        >
          {row.verdictLabel}
        </span>
      ),
      meta: {
        thClass: `w-[150px] ${TH.replace('border-r border-rule-soft', '')}`,
        tdClass: `w-[150px] px-4 py-[13px] align-middle`,
      },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: `w-[38px] ${TH}`,
    tdClass: (row: ShortageDisplayRow) =>
      cn(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]'
      ),
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[880px] text-xs"
      scrollContainerClass="h-full border-0 rounded-none shadow-none"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowClass={(row) =>
        cn(
          'border-t border-rule-soft transition-colors',
          isLate(row)
            ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
            : 'hover:bg-foreground/[0.04]'
        )
      }
      emptyState={emptyState}
    />
  )
}

export default ShortageRegistre

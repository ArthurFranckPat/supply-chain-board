/**
 * Vue R1 « Registre » du suivi des ruptures (port React) : table éditoriale dense,
 * une ligne par couple composant × OF bloqué, colonnes triables via le DataTable maison.
 *
 * Les lignes arrivent déjà filtrées du parent (scheduler/shortages) ; le tri
 * est géré localement par le DataTable.
 */
import { useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import {
  CellEvidence,
  CellNumber,
  CellStack,
  CellVerdict,
  severityBarClass,
} from '@r/components/ui/table-row'
import type { ShortageDisplayRow } from '@r/lib/shortages/types'
import { X3Link } from '@r/components/x3-link'
import { cn } from '@r/lib/utils'
import { isLate, VERDICT_TONE } from '@r/lib/shortages/shortage-math'

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
        <CellStack
          code={row.component}
          label={row.componentDesc}
          labelTitle={row.componentDesc || undefined}
          action={
            row.overDeclaration && row.overDeclaration.length > 0 ? (
              <span
                className="shrink-0"
                title={`Sur-déclaré ailleurs : ${row.overDeclaration
                  .map((o) => `${o.numOf} (écart ${o.ecart})`)
                  .join(', ')} — stock compté potentiellement faux`}
              >
                <TriangleAlert size={11} strokeWidth={2} className="text-suggere" />
              </span>
            ) : undefined
          }
        />
      ),
      meta: { thClass: 'w-[220px]' },
    },
    {
      accessorKey: 'qteManquante',
      header: () => 'Qté manq.',
      cell: ({ row: { original: row } }) => (
        <CellNumber
          tone={isLate(row) ? 'critical' : null}
          value={
            <>
              {row.qteManquante}
              <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
            </>
          }
        />
      ),
      meta: { thClass: 'w-[80px] text-right!', tdClass: 'w-[80px] whitespace-nowrap text-right' },
    },
    {
      accessorKey: 'numOf',
      header: () => 'OF bloqué',
      cell: ({ row: { original: row } }) => (
        <CellStack
          code={
            <button
              type="button"
              onClick={() => onSelectOf(row.numOf)}
              className="cursor-pointer text-brand underline decoration-dotted decoration-brand/40 underline-offset-2 hover:text-brand/70"
            >
              {row.numOf}
            </button>
          }
          label={
            <>
              <span className="font-semibold">{row.articleParent}</span>
              {row.articleParentDesc && <span> · {row.articleParentDesc}</span>}
            </>
          }
        />
      ),
      meta: { thClass: 'w-[170px]', tdClass: 'w-[170px]' },
    },
    {
      accessorKey: 'numCommande',
      header: () => 'Commande',
      cell: ({ row: { original: row } }) =>
        row.hasCommande ? (
          <CellStack
            code={
              <X3Link
                fonction="GESSOH"
                cle={row.numCommande}
                title={`Ouvrir la commande ${row.numCommande} dans Sage X3`}
                className="text-secondary-foreground"
              >
                {row.numCommande}
              </X3Link>
            }
            action={
              <>
                {row.dateExpedition && (
                  <span
                    className={cn(
                      'font-mono text-2xs font-semibold',
                      isLate(row) ? 'text-destructive' : 'text-muted-foreground'
                    )}
                    title={`Expé : ${row.dateExpeditionIso ?? ''}`}
                  >
                    {row.dateExpedition}
                  </span>
                )}
                {row.autresCommandes.length > 0 && (
                  <span
                    className="rounded bg-brand-soft px-1 font-mono text-3xs font-bold text-brand"
                    title={`Aussi : ${row.autresCommandes.join(', ')}`}
                  >
                    +{row.autresCommandes.length}
                  </span>
                )}
              </>
            }
            label={row.client}
          />
        ) : (
          <span className="text-2xs italic text-muted-foreground/50">— orphelin</span>
        ),
      meta: { thClass: 'w-[180px]', tdClass: 'w-[180px]' },
    },
    {
      id: 'reception',
      enableSorting: false,
      header: () => 'Réception attendue',
      cell: ({ row: { original: row } }) => {
        const rec = row.reception
        if (!rec) {
          if (row.verdictKey !== 'sous_ensemble' || row.sousEnsembleOfs.length === 0) {
            return <span className="text-muted-foreground/50">—</span>
          }
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {row.sousEnsembleOfs.slice(0, 3).map((numOf) => (
                <button
                  key={numOf}
                  type="button"
                  onClick={() => onSelectOf(numOf)}
                  className="truncate rounded font-mono text-2xs font-semibold leading-none text-planifie underline decoration-dotted decoration-planifie/40 underline-offset-2 hover:text-planifie/70"
                >
                  {numOf}
                </button>
              ))}
              {row.sousEnsembleOfs.length > 3 && (
                <span className="font-mono text-3xs text-muted-foreground">
                  +{row.sousEnsembleOfs.length - 3}
                </span>
              )}
            </div>
          )
        }
        return (
          <CellStack
            code={rec.id}
            label={`${rec.supplier} · ${rec.qty}u · ${rec.dateArrivee}`}
            labelTitle={rec.supplier}
          />
        )
      },
      meta: {},
    },
    {
      id: 'verdict',
      enableSorting: false,
      header: () => 'Verdict',
      cell: ({ row: { original: row } }) => (
        <CellVerdict
          icon={VERDICT_TONE[row.verdictKey].icon}
          label={row.verdictLabel}
          tone={VERDICT_TONE[row.verdictKey].text}
        />
      ),
      meta: { thClass: 'w-[150px]', tdClass: 'w-[150px]' },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: 'w-[38px]',
    tdClass: (row: ShortageDisplayRow) =>
      cn(
        'font-sans font-bold tracking-tight text-muted-foreground/80 tabular-nums',
        severityBarClass(VERDICT_TONE[row.verdictKey].tone)
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
      scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      emptyState={emptyState}
    />
  )
}

export default ShortageRegistre

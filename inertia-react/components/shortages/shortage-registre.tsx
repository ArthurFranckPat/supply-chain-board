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
import { Badge } from '@r/components/ui/badge'
import type { ShortageDisplayRow } from '@r/lib/shortages/types'
import { X3Link } from '@r/components/x3-link'
import { cn } from '@r/lib/utils'
import {
  isLate,
  TH,
  TH_R,
  TD,
  VERDICT_BAR,
  VERDICT_LABEL,
} from '@r/lib/shortages/shortage-math'

/** Mapping verdict → variant Badge du design system. */
const VERDICT_BADGE_VARIANT: Record<ShortageDisplayRow['verdictKey'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  couvert: 'success',
  a_risque: 'warning',
  retard: 'destructive',
  sous_ensemble: 'secondary',
  sans_couverture: 'destructive',
}

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
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-mono text-xs font-bold tracking-tight text-foreground">
            {row.component}
          </span>
          <span className="truncate text-2xs text-muted-foreground/70">{row.componentDesc}</span>
          {row.overDeclaration && row.overDeclaration.length > 0 && (
            <span
              className="shrink-0"
              title={`Sur-déclaré ailleurs : ${row.overDeclaration
                .map((o) => `${o.numOf} (écart ${o.ecart})`)
                .join(', ')} — stock compté potentiellement faux`}
            >
              <TriangleAlert size={11} strokeWidth={2} className="text-suggere" />
            </span>
          )}
        </div>
      ),
      meta: { thClass: `w-[220px] ${TH}`, tdClass: TD },
    },
    {
      accessorKey: 'qteManquante',
      header: () => 'Qté manq.',
      cell: ({ row: { original: row } }) => (
        <span
          className={cn(
            'font-mono text-cell-lg font-bold leading-none tracking-tight tabular-nums',
            isLate(row) ? 'text-destructive' : 'text-foreground'
          )}
        >
          {row.qteManquante}
          <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
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
            className="cursor-pointer font-mono text-xs font-bold tracking-tight text-brand underline decoration-dotted decoration-brand/40 underline-offset-2 hover:text-brand/70"
          >
            {row.numOf}
          </button>
          <div className="mt-0.5 truncate max-w-[11rem] text-2xs text-muted-foreground">
            <span className="font-semibold">{row.articleParent}</span>
            {row.articleParentDesc && <span> · {row.articleParentDesc}</span>}
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
              <X3Link
                fonction="GESSOH"
                cle={row.numCommande}
                title={`Ouvrir la commande ${row.numCommande} dans Sage X3`}
                className="font-mono text-xs font-bold tracking-tight text-secondary-foreground"
              >
                {row.numCommande}
              </X3Link>
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
            </div>
            <div className="mt-0.5 truncate max-w-[11rem] text-2xs text-muted-foreground">
              {row.client}
            </div>
          </>
        ) : (
          <span className="text-2xs italic text-muted-foreground/50">— orphelin</span>
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
          <>
            <div className="font-mono text-2xs font-semibold text-muted-foreground">{rec.id}</div>
            <div className="mt-0.5 truncate max-w-[14rem] text-2xs text-muted-foreground">
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
        <Badge variant={VERDICT_BADGE_VARIANT[row.verdictKey]} className="h-[18px] px-2 text-[10px] font-semibold">
          {row.verdictLabel}
        </Badge>
      ),
      meta: { thClass: `w-[150px] ${TH}`, tdClass: `w-[150px] ${TD}` },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: `w-[38px] ${TH}`,
    tdClass: (row: ShortageDisplayRow) =>
      cn(
        'px-4 py-[7px] align-middle font-sans text-xs font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        VERDICT_BAR[row.verdictKey]
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
      getRowClass={() =>
        'border-t border-rule-soft transition-colors even:bg-foreground/[0.015] hover:bg-foreground/[0.07]'
      }
      emptyState={emptyState}
    />
  )
}

export default ShortageRegistre

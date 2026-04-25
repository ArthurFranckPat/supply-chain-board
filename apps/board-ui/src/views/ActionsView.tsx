import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingEmpty } from '@/components/ui/loading'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import { useDetailDrawer } from '@/context/DetailDrawerContext'
import type { ActionReportPayload, ActionReportLine } from '@/types/api'

interface ActionsViewProps {
  data: ActionReportPayload | null
}

function ActionTable({ data, onRowClick }: { data: ActionReportLine[]; onRowClick: (line: ActionReportLine) => void }) {
  const columns: GridTableColumn<ActionReportLine>[] = [
    {
      key: 'article',
      header: 'Composant',
      cell: (l) => <span className="font-mono font-semibold">{l.article_composant ?? 'N/A'}</span>,
      width: '130px',
    },
    {
      key: 'missing',
      header: 'Manque',
      align: 'right',
      width: '80px',
      cell: (l) => (
        <span className={cn('tabular-nums font-mono', l.missing_qty_total && l.missing_qty_total > 0 ? 'text-destructive font-semibold' : '')}>
          {(l.missing_qty_total ?? 0).toLocaleString('fr-FR')}
        </span>
      ),
    },
    {
      key: 'ofs',
      header: 'OF',
      align: 'right',
      width: '60px',
      cell: (l) => <span className="tabular-nums font-mono">{l.nb_ofs_impactes ?? 0}</span>,
    },
    {
      key: 'cmds',
      header: 'Cmd',
      align: 'right',
      width: '60px',
      cell: (l) => <span className="tabular-nums font-mono">{l.nb_commandes_impactees ?? 0}</span>,
    },
    {
      key: 'niveau',
      header: 'Niveau',
      align: 'center',
      width: '80px',
      cell: (l) => (
        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium border bg-sky-50 text-sky-700 border-sky-200">
          {l.niveau_action ?? 'N/A'}
        </span>
      ),
    },
  ]

  return (
    <GridTable
      columns={columns}
      data={data}
      keyExtractor={(l) => `${l.article_composant}-${l.niveau_action}-${l.missing_qty_total}`}
      maxHeight="380px"
      onRowClick={onRowClick}
      emptyMessage="Aucun composant bloquant."
    />
  )
}

export function ActionsView({ data }: ActionsViewProps) {
  const { open } = useDetailDrawer()
  const componentLines = data?.component_lines ?? []
  const supplierLines = data?.supplier_lines ?? []
  const kanbanLines = data?.poste_kanban_lines ?? []

  if (!data) {
    return (
      <LoadingEmpty
        message="Aucune action appro disponible. Lancez un calcul d'ordonnancement d'abord."
        action={{ label: "Aller à l'ordonnancement", onClick: () => {} }}
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Composants bloquants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composants bloquants ({componentLines.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionTable data={componentLines} onRowClick={(line) =>
            open({
              title: line.article_composant ?? 'Composant',
              description: line.action_recommandee ?? '',
              payload: line,
            })
          } />
        </CardContent>
      </Card>

      {/* Fournisseurs + Kanban */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fournisseurs & Kanban</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {supplierLines.slice(0, 8).map((line, i) => (
            <button
              key={`supplier-${i}`}
              className="w-full text-left p-3 rounded-sm border border-border hover:bg-accent"
              onClick={() =>
                open({
                  title: `${line.fournisseur ?? 'Fournisseur'} / ${line.num_commande_achat ?? 'N/A'}`,
                  description: 'Vue fournisseur',
                  payload: line,
                })
              }
            >
              <div className="flex items-center justify-between">
                <strong className="text-sm">{line.fournisseur ?? 'N/A'}</strong>
                <span className="text-xs text-muted-foreground">{line.num_commande_achat ?? 'Sans CA'}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {line.articles_concernes?.join(', ') ?? 'Aucun article'}
              </p>
            </button>
          ))}
          {kanbanLines.slice(0, 6).map((line, i) => (
            <button
              key={`kanban-${i}`}
              className="w-full text-left p-3 rounded-sm border border-border hover:bg-accent"
              onClick={() =>
                open({
                  title: line.poste_fournisseur ?? 'Poste',
                  description: line.action_recommandee ?? '',
                  payload: line,
                })
              }
            >
              <div className="flex items-center justify-between">
                <strong className="text-sm">{line.poste_fournisseur ?? 'N/A'}</strong>
                <span className="text-xs text-muted-foreground">{line.libelle_poste_fournisseur ?? ''}</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

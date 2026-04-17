import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DetailItem } from '@/types/api'

interface ActionReportLine {
  article_composant?: string
  missing_qty_total?: number
  nb_ofs_impactes?: number
  nb_commandes_impactees?: number
  niveau_action?: string
  action_recommandee?: string
  fournisseur?: string
  num_commande_achat?: string
  articles_concernes?: string[]
  poste_fournisseur?: string
  libelle_poste_fournisseur?: string
}

interface ActionsViewProps {
  data: Record<string, unknown> | null
  onInspect: (item: DetailItem) => void
}

export function ActionsView({ data, onInspect }: ActionsViewProps) {
  const componentLines = (data?.component_lines ?? []) as ActionReportLine[]
  const supplierLines = (data?.supplier_lines ?? []) as ActionReportLine[]
  const kanbanLines = (data?.poste_kanban_lines ?? []) as ActionReportLine[]

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="font-semibold">Aucune action appro disponible</p>
          <p className="text-sm">Lancez un run S+1 d'abord.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Composants bloquants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composants bloquants ({componentLines.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Composant</TableHead>
                <TableHead>Manque</TableHead>
                <TableHead>OF</TableHead>
                <TableHead>Cmd</TableHead>
                <TableHead>Niveau</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {componentLines.map((line, i) => (
                <TableRow
                  key={`${line.article_composant}-${i}`}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() =>
                    onInspect({
                      title: line.article_composant ?? 'Composant',
                      description: line.action_recommandee ?? '',
                      payload: line,
                    })
                  }
                >
                  <TableCell className="font-mono text-xs">{line.article_composant ?? 'N/A'}</TableCell>
                  <TableCell>{line.missing_qty_total ?? 0}</TableCell>
                  <TableCell>{line.nb_ofs_impactes ?? 0}</TableCell>
                  <TableCell>{line.nb_commandes_impactees ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{line.niveau_action ?? 'N/A'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              className="w-full text-left p-3 rounded-md border border-border hover:bg-accent"
              onClick={() =>
                onInspect({
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
              className="w-full text-left p-3 rounded-md border border-border hover:bg-accent"
              onClick={() =>
                onInspect({
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

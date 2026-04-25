import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingEmpty } from '@/components/ui/loading'
import { useDetailDrawer } from '@/context/DetailDrawerContext'
import type { EmbeddedReport } from '@/types/api'

interface RapportsViewProps {
  embeddedReports: Record<string, EmbeddedReport> | null
}

export function RapportsView({ embeddedReports }: RapportsViewProps) {
  const { open } = useDetailDrawer()
  const reports = embeddedReports
    ? Object.values(embeddedReports).filter(Boolean)
    : []

  return (
    <div className="space-y-6 max-w-4xl">
      {reports.map((report) => {
        const name = String(report.path ?? '').split('/').pop() ?? report.type
        return (
          <Card key={String(report.type)}>
            <CardHeader
              className="cursor-pointer hover:bg-accent rounded-t-lg"
              onClick={() =>
                open({
                  title: String(report.type),
                  description: String(report.path ?? ''),
                  payload: report,
                })
              }
            >
              <CardTitle className="text-base">{String(name)}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-96 font-mono whitespace-pre-wrap">
                {String(report.content ?? '').slice(0, 5000) || 'Aucun contenu'}
              </pre>
            </CardContent>
          </Card>
        )
      })}
      {reports.length === 0 && (
        <LoadingEmpty message="Aucun rapport disponible. Lancez un calcul d'ordonnancement pour générer les rapports." />
      )}
    </div>
  )
}

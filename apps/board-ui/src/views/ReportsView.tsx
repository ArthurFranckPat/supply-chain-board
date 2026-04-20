import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingEmpty } from '@/components/ui/loading'
import type { DetailItem } from '@/types/api'

interface ReportsViewProps {
  embeddedReports: Record<string, unknown> | null
  onInspect: (item: DetailItem) => void
}

export function ReportsView({ embeddedReports, onInspect }: ReportsViewProps) {
  const reports = embeddedReports
    ? Object.values(embeddedReports).filter(Boolean) as Record<string, unknown>[]
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
                onInspect({
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
        <LoadingEmpty message="Aucun rapport disponible. Lancez un run S+1 pour générer les rapports." />
      )}
    </div>
  )
}

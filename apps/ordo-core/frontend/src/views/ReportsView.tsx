import type { DetailItem, EmbeddedReport, ReportFile } from '../types'

interface ReportsViewProps {
  reports: ReportFile[]
  embeddedReports: { actions: EmbeddedReport; s1: EmbeddedReport } | null
  onInspect: (item: DetailItem) => void
  onRefresh: () => void
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString('fr-FR')
}

export function ReportsView({
  reports,
  embeddedReports,
  onInspect,
  onRefresh,
}: ReportsViewProps) {
  return (
    <section className="panel-stack">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Generated reports</p>
            <h3>Markdown disponibles</h3>
          </div>
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Rafraîchir
          </button>
        </header>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Catégorie</th>
                <th>Mis à jour</th>
                <th>Taille</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr
                  key={report.path}
                  onClick={() =>
                    onInspect({
                      title: report.name,
                      description: report.path,
                      payload: report,
                    })
                  }
                >
                  <td>{report.name}</td>
                  <td>{report.category}</td>
                  <td>{formatDate(report.updated_at)}</td>
                  <td>{Math.round(report.size_bytes / 1024)} ko</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="split-panels">
        {[embeddedReports?.actions, embeddedReports?.s1]
          .filter((item): item is EmbeddedReport => Boolean(item))
          .map((report) => (
            <article className="panel" key={report.type}>
              <header className="panel-header">
                <div>
                  <p className="eyebrow">{report.type}</p>
                  <h3>{report.path.split('/').pop()}</h3>
                </div>
              </header>
              <div className="report-preview">
                <pre>{report.content?.slice(0, 2200) ?? 'Aucun contenu'}</pre>
              </div>
            </article>
          ))}
      </section>
    </section>
  )
}

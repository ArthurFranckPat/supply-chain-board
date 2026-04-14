import type { DetailItem, RunState } from '../types'

interface S1ViewProps {
  runState: 'idle' | 'running' | 'success' | 'error'
  data: RunState | null
  onInspect: (item: DetailItem) => void
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleDateString('fr-FR')
}

export function S1View({ runState, data, onInspect }: S1ViewProps) {
  if (runState === 'running') {
    return (
      <section className="panel">
        <div className="empty-state">
          <strong>Run S+1 en cours</strong>
          <p>Les KPI et la table OF se rafraîchiront dès que le backend aura terminé.</p>
        </div>
      </section>
    )
  }

  if (!data?.result) {
    return (
      <section className="panel">
        <div className="empty-state">
          <strong>Aucun run S+1 disponible</strong>
          <p>Lancez un premier run depuis Home pour ouvrir cette vue opérationnelle.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="panel-stack">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">S+1</p>
            <h3>Faisabilité OF</h3>
          </div>
          <div className="panel-meta">
            <span>Réf. {formatDate(data.result.reference_date)}</span>
            <span>{data.result.summary.horizon_days} jours</span>
          </div>
        </header>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>OF</th>
                <th>Article</th>
                <th>Cmd</th>
                <th>Date début</th>
                <th>Date fin</th>
                <th>Qté</th>
                <th>Statut</th>
                <th>Manquants</th>
              </tr>
            </thead>
            <tbody>
              {data.result.of_results.map((row) => (
                <tr
                  key={row.num_of}
                  onClick={() =>
                    onInspect({
                      title: row.num_of,
                      description: `${row.article} · ${row.commande}`,
                      payload: row,
                    })
                  }
                >
                  <td>{row.num_of}</td>
                  <td>{row.article}</td>
                  <td>{row.commande}</td>
                  <td>{formatDate(row.date_debut)}</td>
                  <td>{formatDate(row.date_fin)}</td>
                  <td>{row.qte_restante}</td>
                  <td>
                    <span className={`status-pill ${row.feasible ? 'is-success' : 'is-danger'}`}>
                      {row.feasible ? 'Faisable' : 'Bloqué'}
                    </span>
                  </td>
                  <td>
                    {Object.keys(row.missing_components).length > 0
                      ? Object.entries(row.missing_components)
                          .slice(0, 3)
                          .map(([name, qty]) => `${name}:${qty}`)
                          .join(', ')
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

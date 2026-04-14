import type { ActionReportPayload, DetailItem } from '../types'

interface ActionsViewProps {
  data: ActionReportPayload | null
  onInspect: (item: DetailItem) => void
}

export function ActionsView({ data, onInspect }: ActionsViewProps) {
  if (!data) {
    return (
      <section className="panel">
        <div className="empty-state">
          <strong>Aucune action appro disponible</strong>
          <p>Le rapport d’actions apparaîtra ici après un run S+1 généré côté backend.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="split-panels">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Critical components</p>
            <h3>Composants bloquants</h3>
          </div>
        </header>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Composant</th>
                <th>Manque</th>
                <th>Cmd</th>
                <th>OF</th>
                <th>Niveau</th>
              </tr>
            </thead>
            <tbody>
              {data.component_lines.map((line, index) => (
                <tr
                  key={`${line.article_composant ?? 'component'}-${index}`}
                  onClick={() =>
                    onInspect({
                      title: line.article_composant ?? 'Composant',
                      description: line.action_recommandee ?? 'Détail composant',
                      payload: line,
                    })
                  }
                >
                  <td>{line.article_composant ?? 'N/A'}</td>
                  <td>{line.missing_qty_total ?? 0}</td>
                  <td>{line.nb_commandes_impactees ?? 0}</td>
                  <td>{line.nb_ofs_impactes ?? 0}</td>
                  <td>{line.niveau_action ?? 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Execution view</p>
            <h3>Fournisseurs et postes kanban</h3>
          </div>
        </header>
        <div className="stacked-list">
          {data.supplier_lines.slice(0, 6).map((line, index) => (
            <button
              key={`${line.fournisseur ?? 'supplier'}-${index}`}
              type="button"
              className="list-card"
              onClick={() =>
                onInspect({
                  title: `${line.fournisseur ?? 'Fournisseur'} / ${line.num_commande_achat ?? 'N/A'}`,
                  description: 'Vue fournisseur / commande achat',
                  payload: line,
                })
              }
            >
              <strong>{line.fournisseur ?? 'N/A'}</strong>
              <span>{line.num_commande_achat ?? 'Sans CA'}</span>
              <small>{line.articles_concernes?.join(', ') ?? 'Aucun article'}</small>
            </button>
          ))}

          {data.poste_kanban_lines.slice(0, 6).map((line, index) => (
            <button
              key={`${line.poste_fournisseur ?? 'poste'}-${index}`}
              type="button"
              className="list-card"
              onClick={() =>
                onInspect({
                  title: line.poste_fournisseur ?? 'Poste fournisseur',
                  description: line.action_recommandee ?? 'Vue kanban',
                  payload: line,
                })
              }
            >
              <strong>{line.poste_fournisseur ?? 'N/A'}</strong>
              <span>{line.libelle_poste_fournisseur ?? 'N/A'}</span>
              <small>{line.articles_kanban_concernes?.join(', ') ?? 'Aucun kanban'}</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}

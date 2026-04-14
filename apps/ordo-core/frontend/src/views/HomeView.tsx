import type { DataSource } from '../types'

interface HomeViewProps {
  source: DataSource
  setSource: (value: DataSource) => void
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  runState: 'idle' | 'running' | 'success' | 'error'
  lastSourceSnapshot: Record<string, unknown> | null
  onLoadSource: () => void
  onRunS1: () => void
}

const SOURCE_OPTIONS: DataSource[] = ['data', 'downloads']

function sourceLabel(source: DataSource) {
  return source === 'data' ? 'Répertoire data/' : 'Téléchargements'
}

function formatSnapshotValue(value: unknown) {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

export function HomeView({
  source,
  setSource,
  loadState,
  runState,
  lastSourceSnapshot,
  onLoadSource,
  onRunS1,
}: HomeViewProps) {
  return (
    <section className="panel-stack">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Source</p>
            <h3>Choix du jeu de données</h3>
          </div>
        </header>
        <div className="source-grid">
          {SOURCE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`source-card${source === option ? ' is-selected' : ''}`}
              onClick={() => setSource(option)}
            >
              <span className="source-card__label">{sourceLabel(option)}</span>
              <strong>{option === 'data' ? 'CSV versionnés' : 'Exports récents ERP'}</strong>
              <small>
                {option === 'data'
                  ? 'Stable pour analyse, tests et comparaison.'
                  : 'Lecture directe des derniers exports détectés.'}
              </small>
            </button>
          ))}
        </div>
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={onLoadSource}
            disabled={loadState === 'loading'}
          >
            {loadState === 'loading' ? 'Chargement...' : 'Charger la source'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onRunS1}
            disabled={loadState !== 'ready' || runState === 'running'}
          >
            {runState === 'running' ? 'Run S+1 en cours...' : 'Lancer le run S+1'}
          </button>
        </div>
      </section>

      <section className="panel panel-split">
        <div>
          <header className="panel-header">
            <div>
              <p className="eyebrow">Snapshot</p>
              <h3>Dernier chargement</h3>
            </div>
          </header>
          {lastSourceSnapshot ? (
            <dl className="definition-list">
              {Object.entries(lastSourceSnapshot).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{formatSnapshotValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="empty-state">
              <strong>Aucune source chargée</strong>
              <p>Chargez `data/` ou `Téléchargements` avant de lancer l’analyse S+1.</p>
            </div>
          )}
        </div>

        <div>
          <header className="panel-header">
            <div>
              <p className="eyebrow">Mode opératoire</p>
              <h3>Vertical slice V1</h3>
            </div>
          </header>
          <ol className="step-list">
            <li>Choisir une source de données.</li>
            <li>Lancer le run S+1 projeté.</li>
            <li>Analyser les OF non faisables.</li>
            <li>Basculer sur les actions appro et rapports.</li>
          </ol>
        </div>
      </section>
    </section>
  )
}

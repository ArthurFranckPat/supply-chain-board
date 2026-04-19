import type { DataSource } from '../types'

interface HomeViewProps {
  source: DataSource
  setSource: (value: DataSource) => void
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  lastSourceSnapshot: Record<string, unknown> | null
  onLoadSource: () => void
}

const SOURCE_OPTIONS: DataSource[] = ['extractions']

function sourceLabel(_source: DataSource) {
  return 'Extractions ERP'
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
  lastSourceSnapshot,
  onLoadSource,
}: HomeViewProps) {
  return (
    <section className="panel-stack">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Source</p>
            <h3>Jeu de donnees ERP</h3>
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
              <strong>Fichiers centralises</strong>
              <small>
                Lecture directe des extractions automatisees du dossier partage.
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
              <strong>Aucune source chargee</strong>
              <p>Charge les extractions ERP avant de lancer l'analyse.</p>
            </div>
          )}
        </div>

        <div>
          <header className="panel-header">
            <div>
              <p className="eyebrow">Mode operatoire</p>
              <h3>Vertical slice V1</h3>
            </div>
          </header>
          <ol className="step-list">
            <li>Charger la source Extractions ERP.</li>
            <li>Analyser les OF non faisables.</li>
            <li>Basculer sur les actions appro et rapports.</li>
          </ol>
        </div>
      </section>
    </section>
  )
}

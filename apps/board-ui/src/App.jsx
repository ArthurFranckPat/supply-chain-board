import { useEffect, useMemo, useState } from 'react'

const HUB_URL = import.meta.env.VITE_HUB_URL ?? 'http://127.0.0.1:8010'

function HealthPill({ label, status }) {
  const tone = status === 'ok' ? 'ok' : status === 'error' ? 'error' : 'warn'
  return (
    <div className={`pill pill-${tone}`}>
      <span>{label}</span>
      <strong>{status}</strong>
    </div>
  )
}

function SummaryCard({ label, value, tone = 'neutral' }) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)
  const [horizon, setHorizon] = useState(7)
  const [source, setSource] = useState('data')
  const [suiviFolder, setSuiviFolder] = useState('')

  async function fetchHealth() {
    try {
      const response = await fetch(`${HUB_URL}/health`)
      const data = await response.json()
      setHealth(data)
    } catch {
      setHealth({
        status: 'error',
        downstream: {
          'ordo-core': { status: 'error' },
          'suivi-commandes': { status: 'error' },
        },
      })
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  async function runPipeline(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${HUB_URL}/v1/pipeline/supply-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          horizon,
          include_previsions: false,
          feasibility_mode: 'projected',
          suivi_folder: suiviFolder.trim() || null,
          timeout_seconds: 240,
        }),
      })

      if (!response.ok) {
        const details = await response.text()
        throw new Error(details || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setPayload(data)
      await fetchHealth()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  const cards = useMemo(() => {
    const summary = payload?.board_summary ?? {}
    return [
      {
        label: 'OF non faisables',
        value: summary.ordo_non_feasible_ofs ?? 0,
        tone: (summary.ordo_non_feasible_ofs ?? 0) > 0 ? 'danger' : 'good',
      },
      {
        label: 'Composants action',
        value: summary.ordo_action_components ?? 0,
        tone: (summary.ordo_action_components ?? 0) > 0 ? 'warn' : 'good',
      },
      {
        label: 'Retards prod',
        value: summary.suivi_retard_prod ?? 0,
        tone: (summary.suivi_retard_prod ?? 0) > 0 ? 'danger' : 'good',
      },
      {
        label: 'Allocations a faire',
        value: summary.suivi_allocation_a_faire ?? 0,
        tone: (summary.suivi_allocation_a_faire ?? 0) > 0 ? 'warn' : 'good',
      },
      {
        label: 'Lignes suivies',
        value: summary.suivi_total_rows ?? 0,
        tone: 'neutral',
      },
    ]
  }, [payload])

  const statusCounts = payload?.suivi?.status_counts ?? {}
  const statusRows = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="page-shell">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <header className="hero">
        <div>
          <p className="kicker">Supply Chain Board</p>
          <h1>Cockpit unifie Ordo + Suivi Commandes</h1>
          <p className="subtitle">
            Un seul lancement de pipeline pour recuperer faisabilite OF, risques composants,
            et statuts de commandes.
          </p>
        </div>
        <div className="health-grid">
          <HealthPill label="Hub" status={health?.status ?? 'checking'} />
          <HealthPill
            label="Ordo"
            status={health?.downstream?.['ordo-core']?.status ?? 'checking'}
          />
          <HealthPill
            label="Suivi"
            status={health?.downstream?.['suivi-commandes']?.status ?? 'checking'}
          />
        </div>
      </header>

      <section className="control-panel">
        <form onSubmit={runPipeline} className="pipeline-form">
          <label>
            Source Ordo
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="data">data</option>
              <option value="downloads">downloads</option>
            </select>
          </label>

          <label>
            Horizon S+1 (jours)
            <input
              type="number"
              min={1}
              max={60}
              value={horizon}
              onChange={(event) => setHorizon(Number(event.target.value || 7))}
            />
          </label>

          <label className="wide">
            Dossier export suivi (optionnel)
            <input
              type="text"
              placeholder="Ex: C:\\Exports\\Suivi"
              value={suiviFolder}
              onChange={(event) => setSuiviFolder(event.target.value)}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Execution en cours...' : 'Executer le pipeline board'}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      <section className="summary-grid">
        {cards.map((item) => (
          <SummaryCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </section>

      <section className="data-panels">
        <article className="panel">
          <h2>Distribution statuts commandes</h2>
          {statusRows.length === 0 ? (
            <p className="empty">Aucun resultat charge pour le moment.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map(([status, count]) => (
                  <tr key={status}>
                    <td>{status}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="panel">
          <h2>Synthese run Ordo</h2>
          <pre>
            {JSON.stringify(payload?.ordo?.result?.summary ?? { message: 'No run yet' }, null, 2)}
          </pre>
        </article>
      </section>
    </div>
  )
}

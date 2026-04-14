import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { ApiError, apiClient } from './api/client'
import { ActionsView } from './views/ActionsView'
import { HomeView } from './views/HomeView'
import { ReportsView } from './views/ReportsView'
import { S1View } from './views/S1View'
import type {
  ApiConfig,
  DataSource,
  DetailItem,
  ReportFile,
  RunState,
} from './types'

type ViewKey = 'home' | 's1' | 'actions' | 'reports' | 'settings'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type RunStateStatus = 'idle' | 'running' | 'success' | 'error'

const VIEW_ITEMS: Array<{ key: ViewKey; label: string; hint: string }> = [
  { key: 'home', label: 'Home', hint: 'Sources + lancement' },
  { key: 's1', label: 'S+1', hint: 'Faisabilité OF' },
  { key: 'actions', label: 'Actions', hint: 'Appro + kanban' },
  { key: 'reports', label: 'Reports', hint: 'Markdown générés' },
  { key: 'settings', label: 'Settings', hint: 'Info locale' },
]

function formatTimestamp(value?: string | null) {
  if (!value) return 'N/A'
  try {
    return new Date(value).toLocaleString('fr-FR')
  } catch {
    return value
  }
}

async function pollRunUntilSettled(runId: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const run = await apiClient.getRun(runId)
    if (run.status !== 'running') {
      return run
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new ApiError('Le run S+1 est resté en attente trop longtemps.')
}

function getHealthTone(state: 'checking' | 'ready' | 'error') {
  if (state === 'ready') return 'success'
  if (state === 'error') return 'danger'
  return 'info'
}

function getLoadTone(state: LoadState) {
  if (state === 'ready') return 'success'
  if (state === 'error') return 'danger'
  return 'info'
}

function getRunTone(state: RunStateStatus) {
  if (state === 'success') return 'success'
  if (state === 'error') return 'danger'
  if (state === 'running') return 'info'
  return 'muted'
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [config, setConfig] = useState<ApiConfig | null>(null)
  const [reports, setReports] = useState<ReportFile[]>([])
  const [source, setSource] = useState<DataSource>('data')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [runState, setRunState] = useState<RunStateStatus>('idle')
  const [backendState, setBackendState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [lastRun, setLastRun] = useState<RunState | null>(null)
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<Record<string, unknown> | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const [health, appConfig, reportFiles] = await Promise.all([
          apiClient.getHealth(),
          apiClient.getConfig(),
          apiClient.listReports(),
        ])

        if (cancelled) return
        setBackendState(health.status === 'ok' ? 'ready' : 'error')
        setConfig(appConfig)
        setReports(reportFiles)
        setErrorMessage(null)
      } catch (error) {
        if (cancelled) return
        const message =
          error instanceof ApiError
            ? error.message
            : 'Impossible de joindre l’API locale. Lancez uvicorn src.api.server:app --reload.'
        setBackendState('error')
        setErrorMessage(message)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  const kpis = useMemo(() => {
    const summary = lastRun?.result?.summary
    return [
      {
        label: 'OF matchés',
        value: summary?.matched_ofs ?? 0,
        tone: 'info',
      },
      {
        label: 'OF non faisables',
        value: summary?.non_feasible_ofs ?? 0,
        tone: (summary?.non_feasible_ofs ?? 0) > 0 ? 'danger' : 'success',
      },
      {
        label: 'Alertes composants',
        value: summary?.action_components ?? 0,
        tone: (summary?.action_components ?? 0) > 0 ? 'warning' : 'success',
      },
      {
        label: 'Postes kanban à risque',
        value: summary?.kanban_postes ?? 0,
        tone: (summary?.kanban_postes ?? 0) > 0 ? 'warning' : 'success',
      },
    ]
  }, [lastRun])
  const activeViewItem = VIEW_ITEMS.find((item) => item.key === activeView)

  async function refreshReports() {
    try {
      const nextReports = await apiClient.listReports()
      setReports(nextReports)
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
      }
    }
  }

  async function handleLoadSource() {
    setLoadState('loading')
    setErrorMessage(null)
    try {
      const response = await apiClient.loadData(source)
      setLastSourceSnapshot(response)
      setLoadState('ready')
      await refreshReports()
    } catch (error) {
      setLoadState('error')
      setErrorMessage(error instanceof ApiError ? error.message : 'Chargement impossible.')
    }
  }

  async function handleRunS1() {
    setRunState('running')
    setErrorMessage(null)
    try {
      const response = await apiClient.runS1({
        horizon: 7,
        include_previsions: false,
        feasibility_mode: 'projected',
      })
      setLastRun(response)
      setActiveView('s1')
      const settledRun =
        response.status === 'running' ? await pollRunUntilSettled(response.run_id) : response
      setLastRun(settledRun)
      setRunState(settledRun.status === 'completed' ? 'success' : 'error')
      if (settledRun.status === 'failed') {
        setErrorMessage(settledRun.error ?? 'Le run S+1 a échoué.')
      }
      await refreshReports()
    } catch (error) {
      setRunState('error')
      setErrorMessage(error instanceof ApiError ? error.message : 'Exécution S+1 impossible.')
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-kicker">Industrial command center</span>
          <h1>Ordo GUI</h1>
          <p>Faisabilité, S+1, actions appro et rapports dans une interface dense.</p>
        </div>

        <nav className="nav-stack" aria-label="Navigation principale">
          {VIEW_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item${activeView === item.key ? ' is-active' : ''}`}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </nav>

        <section className="sidebar-status">
          <div className="status-chip">
            API
            <strong className={`tone-${getHealthTone(backendState)}`}>
              {backendState === 'ready' ? 'ready' : backendState === 'error' ? 'error' : 'checking'}
            </strong>
          </div>
          <div className="status-chip">
            Source
            <strong className={`tone-${getLoadTone(loadState)}`}>
              {loadState}
            </strong>
          </div>
          <div className="status-chip">
            Run S+1
            <strong className={`tone-${getRunTone(runState)}`}>
              {runState}
            </strong>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="topbar-label">Workspace</p>
            <h2>{activeViewItem?.label}</h2>
          </div>
          <div className="topbar-meta">
            <span>Source: <strong>{source}</strong></span>
            <span>Dernier run: <strong>{formatTimestamp(lastRun?.completed_at ?? lastRun?.created_at)}</strong></span>
          </div>
        </header>

        {errorMessage ? (
          <div className="inline-alert" role="alert">
            <strong>Blocage</strong>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <section className="kpi-grid" aria-label="Indicateurs">
          {kpis.map((kpi) => (
            <article key={kpi.label} className={`kpi-card tone-${kpi.tone}`}>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
            </article>
          ))}
        </section>

        <section className="content-area">
          {activeView === 'home' ? (
            <HomeView
              source={source}
              setSource={setSource}
              loadState={loadState}
              runState={runState}
              lastSourceSnapshot={lastSourceSnapshot}
              onLoadSource={handleLoadSource}
              onRunS1={handleRunS1}
            />
          ) : null}

          {activeView === 's1' ? (
            <S1View
              runState={runState}
              data={lastRun}
              onInspect={(item) => setDetailItem(item)}
            />
          ) : null}

          {activeView === 'actions' ? (
            <ActionsView
              data={lastRun?.result?.action_report ?? null}
              onInspect={(item) => setDetailItem(item)}
            />
          ) : null}

          {activeView === 'reports' ? (
            <ReportsView
              reports={reports}
              embeddedReports={lastRun?.result?.reports ?? null}
              onInspect={(item) => setDetailItem(item)}
              onRefresh={refreshReports}
            />
          ) : null}

          {activeView === 'settings' ? (
            <section className="panel">
              <header className="panel-header">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h3>Configuration locale</h3>
                </div>
              </header>
              <div className="settings-grid">
                <div className="setting-card">
                  <span>Sources disponibles</span>
                  <strong>{config?.sources.map((entry) => entry.label).join(' / ') ?? 'N/A'}</strong>
                </div>
                <div className="setting-card">
                  <span>Source par défaut</span>
                  <strong>{config?.data_dir_default ?? 'data/'}</strong>
                </div>
                <div className="setting-card">
                  <span>API backend</span>
                  <strong>{backendState === 'ready' ? 'Connectée' : 'À démarrer'}</strong>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </main>

      <aside className={`detail-drawer${detailItem ? ' is-open' : ''}`}>
        <div className="detail-drawer__header">
          <div>
            <p className="eyebrow">Detail</p>
            <h3>{detailItem?.title ?? 'Inspection'}</h3>
          </div>
          <button className="ghost-button" onClick={() => setDetailItem(null)} type="button">
            Fermer
          </button>
        </div>
        <div className="detail-drawer__body">
          {detailItem ? (
            <>
              <p className="detail-description">{detailItem.description}</p>
              <pre className="detail-json">{JSON.stringify(detailItem.payload, null, 2)}</pre>
            </>
          ) : (
            <div className="empty-state">
              <strong>Conservez le contexte</strong>
              <p>Ouvrez une ligne OF, composant ou rapport pour inspecter le détail sans perdre la table.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export default App

import { useEffect, useState } from 'react'
import './index.css'
import { ApiError, apiClient } from './api/client'
import { ActionsView } from './views/ActionsView'
import { HomeView } from './views/HomeView'
import { ReportsView } from './views/ReportsView'
import type {
  ApiConfig,
  DataSource,
  DetailItem,
  ReportFile,
} from './types'

type ViewKey = 'home' | 'actions' | 'reports' | 'settings'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const VIEW_ITEMS: Array<{ key: ViewKey; label: string; hint: string }> = [
  { key: 'home', label: 'Home', hint: 'Sources + lancement' },
  { key: 'actions', label: 'Actions', hint: 'Appro + kanban' },
  { key: 'reports', label: 'Reports', hint: 'Markdown générés' },
  { key: 'settings', label: 'Settings', hint: 'Info locale' },
]

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

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [config, setConfig] = useState<ApiConfig | null>(null)
  const [reports, setReports] = useState<ReportFile[]>([])
  const [source, setSource] = useState<DataSource>('extractions')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [backendState, setBackendState] = useState<'checking' | 'ready' | 'error'>('checking')
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-kicker">Industrial command center</span>
          <h1>Ordo GUI</h1>
          <p>Actions appro et rapports dans une interface dense.</p>
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
          </div>
        </header>

        {errorMessage ? (
          <div className="inline-alert" role="alert">
            <strong>Blocage</strong>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <section className="content-area">
          {activeView === 'home' ? (
            <HomeView
              source={source}
              setSource={setSource}
              loadState={loadState}
              lastSourceSnapshot={lastSourceSnapshot}
              onLoadSource={handleLoadSource}
            />
          ) : null}

          {activeView === 'actions' ? (
            <ActionsView
              data={null}
              onInspect={(item) => setDetailItem(item)}
            />
          ) : null}

          {activeView === 'reports' ? (
            <ReportsView
              reports={reports}
              embeddedReports={null}
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

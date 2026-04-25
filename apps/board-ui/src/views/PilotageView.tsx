import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { SimpleTooltip } from '@/components/ui/tooltip'
import {
  Server, ShoppingCart, Database, Activity,
  Package, Layers, Wrench, Boxes, Warehouse,
  Truck, FileText, Zap, Play, Loader2,
  AlertTriangle, CalendarDays, CheckCircle,
} from 'lucide-react'

import type { DataSourceSnapshot } from '@/types/api'

export interface SchedulingOptions {
  blockingComponentsMode: string
  immediateComponents: boolean
  demandHorizonDays: number
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface PilotageViewProps {
  loadState: LoadState
  scheduleState: 'idle' | 'running' | 'success'
  lastSourceSnapshot: DataSourceSnapshot | null
  backendState: 'checking' | 'ready' | 'error'
  suiviReady: boolean
  options: SchedulingOptions
  onRunSchedule: () => void
  onOptionsChange: (options: SchedulingOptions) => void
}

const BLOCKING_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'blocked', label: 'Récursive', hint: 'Parcourt toute la nomenclature pour trouver les composants achetés manquants' },
  { value: 'direct', label: 'Directe', hint: 'Vérifie uniquement les composants du niveau 1 de la nomenclature' },
  { value: 'both', label: 'Complète', hint: 'Combine les deux analyses pour un résultat exhaustif' },
]

const HORIZON_OPTIONS: Array<{ days: number; hint: string }> = [
  { days: 7, hint: 'Planification sur la semaine prochaine (S+1)' },
  { days: 15, hint: 'Horizon élargi couvrant S+1 et S+2' },
  { days: 30, hint: 'Horizon long couvrant S+1 à S+4' },
]

const SNAPSHOT_ICONS: Record<string, React.ReactNode> = {
  articles: <Package className="h-3.5 w-3.5" />,
  nomenclatures: <Layers className="h-3.5 w-3.5" />,
  gammes: <Wrench className="h-3.5 w-3.5" />,
  ofs: <Boxes className="h-3.5 w-3.5" />,
  stock: <Warehouse className="h-3.5 w-3.5" />,
  receptions: <Truck className="h-3.5 w-3.5" />,
  commandes: <FileText className="h-3.5 w-3.5" />,
}

const QUICK_NAV = [
  { path: '/order-tracking', label: 'Suivi commandes', icon: <ShoppingCart className="h-4 w-4" /> },
  { path: '/capacity', label: 'Capacités atelier', icon: <CalendarDays className="h-4 w-4" /> },
  { path: '/feasibility', label: 'Faisabilité commande', icon: <CheckCircle className="h-4 w-4" /> },
  { path: '/analyse-rupture', label: 'Ruptures & Gaps', icon: <AlertTriangle className="h-4 w-4" /> },
]

function statusDot(state: 'checking' | 'ready' | 'error' | boolean) {
  if (state === 'ready' || state === true)
    return <span className="w-[6px] h-[6px] rounded-full bg-green" />
  if (state === 'error' || state === false)
    return <span className="w-[6px] h-[6px] rounded-full bg-destructive" />
  return <span className="w-[6px] h-[6px] rounded-full bg-muted-foreground animate-pulse" />
}

function statusLabel(state: 'checking' | 'ready' | 'error' | boolean) {
  if (state === 'ready' || state === true) return 'OK'
  if (state === 'error' || state === false) return 'Erreur'
  return 'Vérification...'
}

export function PilotageView({
  loadState,
  scheduleState,
  lastSourceSnapshot,
  backendState,
  suiviReady,
  options,
  onRunSchedule,
  onOptionsChange,
}: PilotageViewProps) {
  const navigate = useNavigate()
  const counts = lastSourceSnapshot?.counts
  const isReady = loadState === 'ready'

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Section 1: System status */}
      <div className="grid grid-cols-4 gap-3">
        {/* API Ordo-core */}
        <div className="bg-card border border-border rounded-2xl px-3.5 py-3 flex items-center gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Server className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9.5px] text-muted-foreground uppercase tracking-wider font-semibold">API Ordo</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusDot(backendState)}
              <span className="text-xs font-semibold">{statusLabel(backendState)}</span>
            </div>
          </div>
        </div>

        {/* API Suivi */}
        <div className="bg-card border border-border rounded-2xl px-3.5 py-3 flex items-center gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <ShoppingCart className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9.5px] text-muted-foreground uppercase tracking-wider font-semibold">API Suivi</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusDot(suiviReady)}
              <span className="text-xs font-semibold">{statusLabel(suiviReady)}</span>
            </div>
          </div>
        </div>

        {/* Data */}
        <div className="bg-card border border-border rounded-2xl px-3.5 py-3 flex items-center gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            loadState === 'ready' ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'
          }`}>
            <Database className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9.5px] text-muted-foreground uppercase tracking-wider font-semibold">Données</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {loadState === 'loading' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {loadState === 'ready' && statusDot('ready')}
              {loadState === 'error' && statusDot('error')}
              {loadState === 'idle' && statusDot('checking')}
              <span className="text-xs font-semibold">
                {loadState === 'ready' ? 'Chargées' : loadState === 'loading' ? 'Chargement...' : loadState === 'error' ? 'Erreur' : 'En attente'}
              </span>
            </div>
          </div>
        </div>

        {/* Ordonnancement */}
        <div className="bg-card border border-border rounded-2xl px-3.5 py-3 flex items-center gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            scheduleState === 'success' ? 'bg-green/10 text-green'
              : scheduleState === 'running' ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9.5px] text-muted-foreground uppercase tracking-wider font-semibold">Ordonnancement</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {scheduleState === 'running' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              {scheduleState === 'success' && statusDot('ready')}
              {scheduleState === 'idle' && statusDot(false)}
              <span className="text-xs font-semibold">
                {scheduleState === 'success' ? 'Résultat OK' : scheduleState === 'running' ? 'En cours...' : 'Aucun calcul'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: ERP Snapshot */}
      {counts && (
        <div className="bg-card border border-border rounded-2xl px-3.5 py-3">
          <p className="text-[9.5px] text-muted-foreground uppercase tracking-wider font-semibold font-mono mb-2.5">Données ERP chargées</p>
          <div className="grid grid-cols-7 gap-2">
            {Object.entries(counts).map(([key, value]) => (
              <div key={key} className="flex flex-col items-center gap-1 py-1.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                  {SNAPSHOT_ICONS[key] ?? <Package className="h-3.5 w-3.5" />}
                </div>
                <p className="text-[14px] font-bold tabular-nums leading-none">{value.toLocaleString('fr-FR')}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium leading-tight">{key.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!counts && loadState !== 'loading' && (
        <div className="bg-card border border-dashed border-border rounded-2xl py-10 text-center">
          <Database className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {loadState === 'error'
              ? 'Erreur lors du chargement des données.'
              : 'Chargement des données ERP en cours...'}
          </p>
        </div>
      )}

      {/* Section 3: Actions */}
      <div className="grid grid-cols-3 gap-4">
        {/* Configuration ordonnancement — 2 cols */}
        <Card className="col-span-2">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                <Zap className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none">Lancer l'ordonnancement</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Planification des ordres de fabrication</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Disponibilite composants */}
              <div className="space-y-1.5">
                <SimpleTooltip
                  side="right"
                  content={
                    <div className="space-y-1.5 max-w-[220px]">
                      <p className="font-medium">Mode de verification composants</p>
                      <p><strong>Avec réceptions :</strong> intègre les commandes fournisseur à venir dans le stock disponible.</p>
                      <p><strong>Stock seul :</strong> verifie uniquement le stock physique actuel.</p>
                    </div>
                  }
                >
                  <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-2">
                    Disponibilité composants
                  </button>
                </SimpleTooltip>
                <Segmented
                  options={[
                    { value: 'projected', label: 'Avec réceptions' },
                    { value: 'immediate', label: 'Stock seul' },
                  ]}
                  value={options.immediateComponents ? 'immediate' : 'projected'}
                  onChange={(v) => onOptionsChange({ ...options, immediateComponents: v === 'immediate' })}
                />
              </div>

              {/* Horizon */}
              <div className="flex items-center gap-2">
                <SimpleTooltip side="top" content="Nombre de jours couverts par le calcul de demande client">
                  <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Horizon</span>
                </SimpleTooltip>
                <div className="flex gap-1">
                  {HORIZON_OPTIONS.map(({ days, hint }) => (
                    <SimpleTooltip key={days} side="bottom" content={hint}>
                      <button
                        type="button"
                        onClick={() => onOptionsChange({ ...options, demandHorizonDays: days })}
                        disabled={!isReady || scheduleState === 'running'}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          options.demandHorizonDays === days
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } disabled:opacity-50`}
                      >
                        S+{Math.ceil(days / 7)}
                      </button>
                    </SimpleTooltip>
                  ))}
                </div>
              </div>

              {/* Composants manquants */}
              <div className="flex items-center gap-2">
                <SimpleTooltip
                  side="right"
                  content="Profondeur d'analyse de la nomenclature pour detecter les composants manquants"
                >
                  <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Composants manquants</span>
                </SimpleTooltip>
                <div className="flex gap-1">
                  {BLOCKING_OPTIONS.map(({ value, label, hint }) => (
                    <SimpleTooltip key={value} side="bottom" content={hint}>
                      <button
                        type="button"
                        onClick={() => onOptionsChange({ ...options, blockingComponentsMode: value })}
                        disabled={!isReady || scheduleState === 'running'}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          options.blockingComponentsMode === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } disabled:opacity-50`}
                      >
                        {label}
                      </button>
                    </SimpleTooltip>
                  ))}
                </div>
              </div>

              <button
                onClick={onRunSchedule}
                disabled={!isReady || scheduleState === 'running'}
                className="w-full bg-primary text-white border-none px-3 py-[9px] rounded-[9px] text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scheduleState === 'running' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Planification...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                        Lancer l'ordonnancement
                  </>
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Quick nav — 1 col */}
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none">Accès rapides</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Navigation</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_NAV.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-muted/50 hover:bg-accent transition-colors text-foreground"
                >
                  {item.icon}
                  <span className="text-[10.5px] font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

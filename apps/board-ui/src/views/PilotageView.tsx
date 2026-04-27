import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { SimpleTooltip } from '@/components/ui/tooltip'
import type { DataSourceSnapshot } from '@/types/api'

export interface SchedulingOptions {
  blockingComponentsMode: string
  immediateComponents: boolean
  demandHorizonDays: number
  algorithm: 'greedy' | 'ga' | 'compare'
  gaRandomSeed: number | null
  gaPopulationSize: number
  gaMaxGenerations: number
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
  { value: 'blocked', label: 'Récursive', hint: 'Parcourt toute la nomenclature' },
  { value: 'direct', label: 'Directe', hint: 'Niveau 1 uniquement' },
  { value: 'both', label: 'Complète', hint: 'Combine les deux analyses' },
]

const HORIZON_OPTIONS: Array<{ days: number; hint: string }> = [
  { days: 7, hint: 'Semaine prochaine (S+1)' },
  { days: 15, hint: 'S+1 et S+2' },
  { days: 30, hint: 'S+1 à S+4' },
]

const ALGO_OPTIONS: Array<{ value: SchedulingOptions['algorithm']; label: string; hint: string }> = [
  { value: 'greedy', label: 'Glouton V1', hint: 'Algorithme rapide, résultat déterministe' },
  { value: 'ga', label: 'Génétique V2', hint: 'Algorithme évolutif, exploration multi-solutions' },
  { value: 'compare', label: 'Comparer', hint: 'Lance les deux et compare les résultats' },
]

const QUICK_NAV = [
  { path: '/order-tracking', label: 'Suivi commandes' },
  { path: '/capacity', label: 'Capacités atelier' },
  { path: '/feasibility', label: 'Faisabilité commande' },
  { path: '/analyse-rupture', label: 'Ruptures & Gaps' },
]

function statusDot(state: 'checking' | 'ready' | 'error' | boolean) {
  if (state === 'ready' || state === true) return <span className="w-[6px] h-[6px] bg-green" />
  if (state === 'error' || state === false) return <span className="w-[6px] h-[6px] bg-destructive" />
  return <span className="w-[6px] h-[6px] bg-muted-foreground animate-pulse" />
}

function statusLabel(state: 'checking' | 'ready' | 'error' | boolean) {
  if (state === 'ready' || state === true) return 'OK'
  if (state === 'error' || state === false) return 'Erreur'
  return 'Vérification...'
}

export function PilotageView({ loadState, scheduleState, lastSourceSnapshot, backendState, suiviReady, options, onRunSchedule, onOptionsChange }: PilotageViewProps) {
  const navigate = useNavigate()
  const counts = lastSourceSnapshot?.counts
  const isReady = loadState === 'ready'

  return (
    <div className="flex flex-col gap-3 max-w-[1000px]">
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-border flex items-center gap-2.5 px-3 py-2">
          <div className="shrink-0 w-7 h-7 flex items-center justify-center bg-primary/10 text-primary font-mono text-[10px] font-bold">API</div>
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">API Ordo</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusDot(backendState)}
              <span className="text-[11px] font-semibold">{statusLabel(backendState)}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border flex items-center gap-2.5 px-3 py-2">
          <div className="shrink-0 w-7 h-7 flex items-center justify-center bg-primary/10 text-primary font-mono text-[10px] font-bold">SUI</div>
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">API Suivi</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusDot(suiviReady)}
              <span className="text-[11px] font-semibold">{statusLabel(suiviReady)}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border flex items-center gap-2.5 px-3 py-2">
          <div className={`shrink-0 w-7 h-7 flex items-center justify-center ${loadState === 'ready' ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'} font-mono text-[10px] font-bold`}>DAT</div>
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Données</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {loadState === 'loading' && <span className="text-[10px] text-muted-foreground">...</span>}
              {loadState === 'ready' && statusDot('ready')}
              {loadState === 'error' && statusDot('error')}
              {loadState === 'idle' && statusDot('checking')}
              <span className="text-[11px] font-semibold">{loadState === 'ready' ? 'Chargées' : loadState === 'loading' ? 'Chargement...' : loadState === 'error' ? 'Erreur' : 'En attente'}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border flex items-center gap-2.5 px-3 py-2">
          <div className={`shrink-0 w-7 h-7 flex items-center justify-center ${scheduleState === 'success' ? 'bg-green/10 text-green' : scheduleState === 'running' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'} font-mono text-[10px] font-bold`}>ORD</div>
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Ordonnancement</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {scheduleState === 'running' && <span className="text-[10px] text-primary animate-pulse">...</span>}
              {scheduleState === 'success' && statusDot('ready')}
              {scheduleState === 'idle' && statusDot(false)}
              <span className="text-[11px] font-semibold">{scheduleState === 'success' ? 'Résultat OK' : scheduleState === 'running' ? 'En cours...' : 'Aucun calcul'}</span>
            </div>
          </div>
        </div>
      </div>

      {counts && (
        <Card>
          <CardHeader><CardTitle>Données ERP chargées</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {Object.entries(counts).map(([key, value]) => (
                <div key={key} className="flex flex-col items-center gap-1 py-1">
                  <div className="w-7 h-7 flex items-center justify-center bg-primary/10 text-primary font-mono text-[10px] font-bold">{key.slice(0, 3).toUpperCase()}</div>
                  <p className="text-[13px] font-bold tabular-nums leading-none">{value.toLocaleString('fr-FR')}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium leading-tight text-center">{key.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!counts && loadState !== 'loading' && (
        <div className="bg-card border border-dashed border-border py-6 text-center">
          <p className="text-xs text-muted-foreground">{loadState === 'error' ? 'Erreur lors du chargement des données.' : 'Chargement des données ERP en cours...'}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHeader><CardTitle>Lancer l'ordonnancement</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="space-y-2.5">
              <div className="space-y-1">
                <SimpleTooltip side="right" content={<div className="space-y-1 max-w-[220px]"><p className="font-medium">Mode de verification composants</p><p><strong>Avec réceptions :</strong> intègre les commandes fournisseur à venir.</p><p><strong>Stock seul :</strong> verifie uniquement le stock physique.</p></div>}>
                  <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-2">Disponibilité composants</button>
                </SimpleTooltip>
                <Segmented options={[{ value: 'projected', label: 'Avec réceptions' }, { value: 'immediate', label: 'Stock seul' }]} value={options.immediateComponents ? 'immediate' : 'projected'} onChange={v => onOptionsChange({ ...options, immediateComponents: v === 'immediate' })} />
              </div>

              <div className="flex items-center gap-2">
                <SimpleTooltip side="top" content="Nombre de jours couverts par le calcul de demande client">
                  <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Horizon</span>
                </SimpleTooltip>
                <div className="flex gap-1">
                  {HORIZON_OPTIONS.map(({ days, hint }) => (
                    <SimpleTooltip key={days} side="bottom" content={hint}>
                      <button type="button" onClick={() => onOptionsChange({ ...options, demandHorizonDays: days })} disabled={!isReady || scheduleState === 'running'}
                        className={`px-2 py-0.5 text-[11px] font-medium transition-colors border ${options.demandHorizonDays === days ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'} disabled:opacity-50`}>
                        S+{Math.ceil(days / 7)}
                      </button>
                    </SimpleTooltip>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <SimpleTooltip side="right" content="Profondeur d'analyse de la nomenclature">
                  <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Composants manquants</span>
                </SimpleTooltip>
                <div className="flex gap-1">
                  {BLOCKING_OPTIONS.map(({ value, label, hint }) => (
                    <SimpleTooltip key={value} side="bottom" content={hint}>
                      <button type="button" onClick={() => onOptionsChange({ ...options, blockingComponentsMode: value })} disabled={!isReady || scheduleState === 'running'}
                        className={`px-2 py-0.5 text-[11px] font-medium transition-colors border ${options.blockingComponentsMode === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'} disabled:opacity-50`}>
                        {label}
                      </button>
                    </SimpleTooltip>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <SimpleTooltip side="right" content="Algorithme d'ordonnancement">
                    <span className="text-[11px] text-muted-foreground shrink-0 cursor-help underline decoration-dotted underline-offset-2">Algorithme</span>
                  </SimpleTooltip>
                  <div className="flex gap-1">
                    {ALGO_OPTIONS.map(({ value, label, hint }) => (
                      <SimpleTooltip key={value} side="bottom" content={hint}>
                        <button type="button" onClick={() => onOptionsChange({ ...options, algorithm: value })} disabled={!isReady || scheduleState === 'running'}
                          className={`px-2 py-0.5 text-[11px] font-medium transition-colors border ${options.algorithm === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'} disabled:opacity-50`}>
                          {label}
                        </button>
                      </SimpleTooltip>
                    ))}
                  </div>
                </div>

                {options.algorithm !== 'greedy' && (
                  <div className="flex items-center gap-2 pl-[68px]">
                    <SimpleTooltip side="bottom" content="Taille de la population AG">
                      <span className="text-[10px] text-muted-foreground shrink-0">Pop</span>
                    </SimpleTooltip>
                    <input type="number" min={10} max={200} value={options.gaPopulationSize}
                      onChange={e => onOptionsChange({ ...options, gaPopulationSize: parseInt(e.target.value) || 50 })}
                      disabled={!isReady || scheduleState === 'running'}
                      className="w-14 px-1 py-0.5 text-[11px] border border-border bg-card text-foreground disabled:opacity-50" />
                    <SimpleTooltip side="bottom" content="Nombre max de générations">
                      <span className="text-[10px] text-muted-foreground shrink-0">Gen</span>
                    </SimpleTooltip>
                    <input type="number" min={5} max={500} value={options.gaMaxGenerations}
                      onChange={e => onOptionsChange({ ...options, gaMaxGenerations: parseInt(e.target.value) || 50 })}
                      disabled={!isReady || scheduleState === 'running'}
                      className="w-14 px-1 py-0.5 text-[11px] border border-border bg-card text-foreground disabled:opacity-50" />
                    <SimpleTooltip side="bottom" content="Graine aléatoire (vide = aléatoire)">
                      <span className="text-[10px] text-muted-foreground shrink-0">Seed</span>
                    </SimpleTooltip>
                    <input type="number" value={options.gaRandomSeed ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        onOptionsChange({ ...options, gaRandomSeed: v === '' ? null : parseInt(v) })
                      }}
                      disabled={!isReady || scheduleState === 'running'}
                      placeholder="—"
                      className="w-14 px-1 py-0.5 text-[11px] border border-border bg-card text-foreground disabled:opacity-50 placeholder:text-muted-foreground/50" />
                  </div>
                )}
              </div>

              <button onClick={onRunSchedule} disabled={!isReady || scheduleState === 'running'}
                className="w-full bg-primary text-white border-none px-3 py-2 text-[11px] font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {scheduleState === 'running' ? <>⟳ Planification...</> : <>▶ Lancer l'ordonnancement</>}
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Accès rapides</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_NAV.map(item => (
                <button key={item.path} onClick={() => navigate(item.path)} className="flex flex-col items-center gap-1 py-2.5 px-2 border border-border bg-muted/40 hover:bg-accent transition-colors text-foreground">
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

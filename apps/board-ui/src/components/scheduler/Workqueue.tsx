import { useState, Fragment } from 'react'
import { Target, ChevronDown, ChevronUp, ArrowRight, ShoppingCart, TrendingDown, Activity, Wrench, AlertTriangle } from 'lucide-react'

interface WorkItem {
  id: string
  severity: 'high' | 'med' | 'low'
  icon: string
  title: string
  subtitle: string
  detail: string
  action: string
  impact: string
  refs: Record<string, string>
}

interface WorkqueueProps {
  items: WorkItem[]
  onFocus: (refs: Record<string, string>) => void
}

const SEVERITY_COLORS = {
  high: { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive', label: 'Critique' },
  med: { bg: 'bg-orange/10', text: 'text-orange', dot: 'bg-orange', label: 'Modéré' },
  low: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary', label: 'Optimisation' },
}

const ICON_MAP: Record<string, React.ReactNode> = {
  alert: <AlertTriangle className="h-3 w-3" />,
  cart: <ShoppingCart className="h-3 w-3" />,
  trendDown: <TrendingDown className="h-3 w-3" />,
  activity: <Activity className="h-3 w-3" />,
  wrench: <Wrench className="h-3 w-3" />,
}

function WorkItemCard({ item, onFocus }: { item: WorkItem; onFocus: () => void }) {
  const [open, setOpen] = useState(false)
  const sev = SEVERITY_COLORS[item.severity]
  const icon = ICON_MAP[item.icon] ?? <Activity className="h-3 w-3" />

  return (
    <div
      className="px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-start gap-2">
        <div className={`w-[22px] h-[22px] rounded-md ${sev.bg} ${sev.text} flex items-center justify-center shrink-0 mt-0.5`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold leading-snug">{item.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.subtitle}</div>
          {open && (
            <div className="mt-2 p-2 bg-muted rounded-md text-[11px] leading-snug">
              <div className="mb-1.5">{item.detail}</div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onFocus() }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold bg-primary text-primary-foreground px-2.5 py-1 rounded-md"
                >
                  {item.action}
                  <ArrowRight className="h-2.5 w-2.5" />
                </button>
                <span className="text-[10.5px] text-green font-semibold font-mono">{item.impact}</span>
              </div>
            </div>
          )}
        </div>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground/50 mt-1" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50 mt-1" />}
      </div>
    </div>
  )
}

export function Workqueue({ items, onFocus }: WorkqueueProps) {
  // Group by severity
  const grouped = { high: [] as WorkItem[], med: [] as WorkItem[], low: [] as WorkItem[] }
  for (const it of items) grouped[it.severity].push(it)

  return (
    <aside className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden h-fit sticky top-3.5"
      style={{ maxHeight: 'calc(100vh - 82px)' }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold flex items-center gap-1.5">
            <Target className="h-3 w-3 text-primary" />
            À arbitrer
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {items.length} actions priorisées
          </div>
        </div>
        <button className="text-[10.5px] text-muted-foreground bg-transparent border border-border px-2 py-1 rounded-md">
          Tout voir
        </button>
      </div>

      {/* Items */}
      <div className="overflow-y-auto py-1">
        {(['high', 'med', 'low'] as const).map((sev) =>
          grouped[sev].length > 0 && (
            <Fragment key={sev}>
              <div className="px-4 pt-2.5 pb-1.5 text-[9.5px] font-semibold text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[sev].dot}`} />
                {SEVERITY_COLORS[sev].label}
                <span className="ml-auto text-muted-foreground/50">{grouped[sev].length}</span>
              </div>
              {grouped[sev].map((it) => (
                <WorkItemCard key={it.id} item={it} onFocus={() => onFocus(it.refs)} />
              ))}
            </Fragment>
          )
        )}
      </div>
    </aside>
  )
}

// Helper to derive workqueue items from scheduler alerts
export function deriveWorkqueue(alerts: string[]): WorkItem[] {
  const items: WorkItem[] = []
  const blocked = alerts.filter((a) => a.toLowerCase().includes('bloqu'))
  const retard = alerts.filter((a) => a.toLowerCase().includes('retard'))
  const other = alerts.filter((a) => !a.toLowerCase().includes('bloqu') && !a.toLowerCase().includes('retard'))

  if (blocked.length > 0) {
    items.push({
      id: 'wq-blocked',
      severity: 'high',
      icon: 'alert',
      title: `${blocked.length} OF bloqués par rupture composants`,
      subtitle: 'Composants manquants empêchent la planification',
      detail: blocked.slice(0, 3).join(' · '),
      action: 'Voir les bloqués',
      impact: 'Débloquer pour améliorer le score',
      refs: {},
    })
  }

  if (retard.length > 0) {
    items.push({
      id: 'wq-retard',
      severity: 'med',
      icon: 'cart',
      title: `${retard.length} commandes en retard`,
      subtitle: 'Commandes client avec échéance dépassée',
      detail: retard.slice(0, 3).join(' · '),
      action: 'Voir les commandes',
      impact: 'Taux service ↑',
      refs: {},
    })
  }

  if (other.length > 0) {
    items.push({
      id: 'wq-other',
      severity: 'low',
      icon: 'activity',
      title: `${other.length} alertes supplémentaires`,
      subtitle: 'Autres points d\'attention identifiés',
      detail: other.slice(0, 3).join(' · '),
      action: 'Consulter',
      impact: 'Optimisation',
      refs: {},
    })
  }

  return items
}

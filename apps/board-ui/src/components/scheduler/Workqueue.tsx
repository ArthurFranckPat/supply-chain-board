import { useState, Fragment } from 'react'

interface WorkItem {
  id: string
  severity: 'high' | 'med' | 'low'
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

const SEVERITY_LABELS = {
  high: 'Critique',
  med: 'Modéré',
  low: 'Optimisation',
}

function WorkItemCard({ item, onFocus }: { item: WorkItem; onFocus: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-3 py-2 border-b border-border/40 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setOpen((v) => !v)}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold">{item.title}</div>
          <div className="text-[10px] text-muted-foreground">{item.subtitle}</div>
          {open && (
            <div className="mt-1.5 p-1.5 bg-muted text-[11px]">
              <div className="mb-1">{item.detail}</div>
              <div className="flex items-center gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); onFocus() }} className="text-[11px] font-semibold bg-primary text-primary-foreground px-2 py-0.5">
                  {item.action}
                </button>
                <span className="text-[10px] text-green font-semibold font-mono">{item.impact}</span>
              </div>
            </div>
          )}
        </div>
        <span className="text-muted-foreground text-[10px] mt-0.5">{open ? '▲' : '▼'}</span>
      </div>
    </div>
  )
}

export function Workqueue({ items, onFocus }: WorkqueueProps) {
  const grouped = { high: [] as WorkItem[], med: [] as WorkItem[], low: [] as WorkItem[] }
  for (const it of items) grouped[it.severity].push(it)

  return (
    <aside className="bg-card border border-border flex flex-col overflow-hidden h-fit sticky top-3" style={{ maxHeight: 'calc(100vh - 82px)' }}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold">À arbitrer</div>
          <div className="text-[10px] text-muted-foreground">{items.length} actions</div>
        </div>
      </div>
      <div className="overflow-y-auto py-0.5">
        {(['high', 'med', 'low'] as const).map((sev) =>
          grouped[sev].length > 0 && (
            <Fragment key={sev}>
              <div className="px-3 pt-2 pb-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 ${sev === 'high' ? 'bg-destructive' : sev === 'med' ? 'bg-orange' : 'bg-primary'}`} />
                {SEVERITY_LABELS[sev]}
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

export function deriveWorkqueue(alerts: string[]): WorkItem[] {
  const items: WorkItem[] = []
  const blocked = alerts.filter((a) => a.toLowerCase().includes('bloqu'))
  const retard = alerts.filter((a) => a.toLowerCase().includes('retard'))
  const other = alerts.filter((a) => !a.toLowerCase().includes('bloqu') && !a.toLowerCase().includes('retard'))

  if (blocked.length > 0) {
    items.push({
      id: 'wq-blocked', severity: 'high',
      title: `${blocked.length} OF bloqués par rupture composants`,
      subtitle: 'Composants manquants empêchent la planification',
      detail: blocked.slice(0, 3).join(' · '),
      action: 'Voir', impact: 'Débloquer',
      refs: {},
    })
  }
  if (retard.length > 0) {
    items.push({
      id: 'wq-retard', severity: 'med',
      title: `${retard.length} OFs en retard sur échéance client`,
      subtitle: 'Planification postérieure à la date demandée',
      detail: retard.slice(0, 3).join(' · '),
      action: 'Voir', impact: 'Réduire le retard',
      refs: {},
    })
  }
  if (other.length > 0) {
    items.push({
      id: 'wq-other', severity: 'low',
      title: `${other.length} alertes diverses`,
      subtitle: 'Recommandations de planification',
      detail: other.slice(0, 3).join(' · '),
      action: 'Voir', impact: 'Optimiser',
      refs: {},
    })
  }
  return items
}

import { Segmented } from '@/components/ui/segmented'
import { formatDateLabel } from '@/lib/format'

interface SchedulerFiltersProps {
  query: string
  onQueryChange: (q: string) => void
  focusLine: string | null
  onFocusLineChange: (v: string | null) => void
  focusDay: string | null
  onFocusDayChange: (v: string | null) => void
  statusFilter: string
  onStatusFilterChange: (v: string) => void
  lines: string[]
  days: string[]
  lineLabels: Record<string, string>
  expandedDays: Set<string>
  onCollapseAll: () => void
  onExpandAll: (days: string[]) => void
  allDays: string[]
}

export function SchedulerFilters({
  query, onQueryChange, focusLine, onFocusLineChange, focusDay, onFocusDayChange,
  statusFilter, onStatusFilterChange, lines, days, lineLabels, onCollapseAll, onExpandAll, allDays,
}: SchedulerFiltersProps) {
  return (
    <div className="px-2 py-1.5 border-b border-border flex items-center gap-2 flex-wrap">
      <input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="OF · article · ligne"
        className="h-7 px-2 text-[11px] border border-border bg-card outline-none focus:border-ring placeholder:text-muted-foreground flex-1 min-w-[160px] max-w-[280px]" />
      <select value={focusLine ?? '__all__'} onChange={e => onFocusLineChange(e.target.value === '__all__' ? null : e.target.value)}
        className="h-7 px-2 text-[11px] border border-border bg-card outline-none min-w-[160px]">
        <option value="__all__">Toutes lignes</option>
        {lines.map(l => <option key={l} value={l}>{lineLabels[l] ? `${l} - ${lineLabels[l]}` : l}</option>)}
      </select>
      <select value={focusDay ?? '__all__'} onChange={e => onFocusDayChange(e.target.value === '__all__' ? null : e.target.value)}
        className="h-7 px-2 text-[11px] border border-border bg-card outline-none min-w-[140px]">
        <option value="__all__">Tous les jours</option>
        {days.map(d => <option key={d} value={d}>{formatDateLabel(d)}</option>)}
      </select>
      <Segmented value={statusFilter} onChange={onStatusFilterChange}
        options={[{ value: 'all', label: 'Tous' }, { value: 'ferme', label: 'Fermes' }, { value: 'planifie', label: 'Planifiés' }, { value: 'sugg', label: 'Suggérés' }]} />
      <div className="ml-auto flex gap-1">
        <button onClick={onCollapseAll} className="h-6 px-2 text-[10px] text-muted-foreground border border-border hover:bg-muted">Déplier</button>
        <button onClick={() => onExpandAll(allDays)} className="h-6 px-2 text-[10px] text-muted-foreground border border-border hover:bg-muted">Plier</button>
      </div>
    </div>
  )
}

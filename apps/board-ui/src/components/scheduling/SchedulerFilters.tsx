import { Search, Save } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  query,
  onQueryChange,
  focusLine,
  onFocusLineChange,
  focusDay,
  onFocusDayChange,
  statusFilter,
  onStatusFilterChange,
  lines,
  days,
  lineLabels,
  expandedDays,
  onCollapseAll,
  onExpandAll,
  allDays,
}: SchedulerFiltersProps) {
  return (
    <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
      <div className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg flex-1 min-w-[220px] max-w-[380px]">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="OF · article · ligne / poste"
          className="flex-1 bg-transparent border-none outline-none text-xs text-foreground"
        />
      </div>
      <Select value={focusLine ?? '__all__'} onValueChange={(v) => onFocusLineChange(v === '__all__' ? null : v)}>
        <SelectTrigger className="h-[30px] w-[260px] text-[11px] font-mono">
          <SelectValue placeholder="Toutes lignes" />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="min-w-[300px]">
          <SelectItem value="__all__">Toutes lignes</SelectItem>
          {lines.map((l) => (
            <SelectItem key={l} value={l}>
              {lineLabels[l] ? `${l} - ${lineLabels[l]}` : l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={focusDay ?? '__all__'} onValueChange={(v) => onFocusDayChange(v === '__all__' ? null : v)}>
        <SelectTrigger className="h-[30px] w-[180px] text-[11px]">
          <SelectValue placeholder="Tous les jours" />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="min-w-[200px]">
          <SelectItem value="__all__">Tous les jours</SelectItem>
          {days.map((d) => (
            <SelectItem key={d} value={d}>{formatDateLabel(d)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Segmented
        value={statusFilter}
        onChange={onStatusFilterChange}
        options={[
          { value: 'all', label: 'Tous' },
          { value: 'ferme', label: 'Fermes' },
          { value: 'planifie', label: 'Planifiés' },
          { value: 'sugg', label: 'Suggérés' },
        ]}
      />
      <div className="ml-auto flex gap-1.5">
        <button className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md inline-flex items-center gap-1.5">
          <Save className="h-2.5 w-2.5" />
          Enregistrer vue
        </button>
        <button
          onClick={onCollapseAll}
          className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md"
        >
          Déplier tout
        </button>
        <button
          onClick={() => onExpandAll(allDays)}
          className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md"
        >
          Plier tout
        </button>
      </div>
    </div>
  )
}

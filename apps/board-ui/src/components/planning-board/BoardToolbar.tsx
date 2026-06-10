import { ChevronLeft, ChevronRight, Search, RotateCcw } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import type { BoardFilters } from '@/hooks/usePlanningBoard'
import { mondayOf } from '@/hooks/usePlanningBoard'

interface BoardToolbarProps {
  weekStart: Date
  onWeekStartChange: (d: Date) => void
  weeks: number
  onWeeksChange: (n: number) => void
  filters: BoardFilters
  onFiltersChange: (f: BoardFilters) => void
  postes: string[]
  nbModified: number
  onResetAll: () => void
}

export function BoardToolbar({
  weekStart,
  onWeekStartChange,
  weeks,
  onWeeksChange,
  filters,
  onFiltersChange,
  postes,
  nbModified,
  onResetAll,
}: BoardToolbarProps) {
  const shiftWeeks = (n: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + n * 7)
    onWeekStartChange(d)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Navigation temporelle */}
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5 shadow-sm">
        <button
          onClick={() => shiftWeeks(-1)}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onWeekStartChange(mondayOf(new Date()))}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Aujourd'hui
        </button>
        <button
          onClick={() => shiftWeeks(1)}
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Segmented
        options={[
          { value: '2', label: '2 sem.' },
          { value: '4', label: '4 sem.' },
          { value: '6', label: '6 sem.' },
        ]}
        value={String(weeks)}
        onChange={(v) => onWeeksChange(Number(v))}
      />

      <Segmented
        options={[
          { value: 'all', label: 'Tous' },
          { value: '1', label: 'Fermes' },
          { value: '2', label: 'Planifiés' },
          { value: '3', label: 'Suggérés' },
        ]}
        value={filters.statut == null ? 'all' : String(filters.statut)}
        onChange={(v) => onFiltersChange({ ...filters, statut: v === 'all' ? null : Number(v) })}
      />

      <select
        value={filters.poste ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, poste: e.target.value || null })}
        className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-sm outline-none"
      >
        <option value="">Tous postes</option>
        {postes.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filters.query}
          onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
          placeholder="OF, article, désignation…"
          className="w-52 rounded-full border border-border bg-card py-1.5 pl-8 pr-3 text-[11px] text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <input
          type="checkbox"
          checked={filters.modifiedOnly}
          onChange={(e) => onFiltersChange({ ...filters, modifiedOnly: e.target.checked })}
          className="accent-[var(--primary)]"
        />
        Modifiés seulement
      </label>

      {nbModified > 0 && (
        <button
          onClick={() => {
            if (window.confirm(`Annuler les ${nbModified} modification(s) locale(s) ?`)) onResetAll()
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Tout annuler ({nbModified})
        </button>
      )}
    </div>
  )
}

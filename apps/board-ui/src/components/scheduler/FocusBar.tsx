import { FilterChip } from '@/components/ui/filter-chip'

interface FocusBarProps {
  focusLine: string | null
  focusDay: string | null
  lensBlocked: boolean
  onFocusLine: (v: string | null) => void
  onFocusDay: (v: string | null) => void
  setLensBlocked: (v: boolean) => void
  count: number
  total: number
}

function formatDay(d: string) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return d }
}

export function FocusBar({
  focusLine, focusDay, lensBlocked,
  onFocusLine, onFocusDay, setLensBlocked,
  count, total,
}: FocusBarProps) {
  const hasFocus = focusLine || focusDay || lensBlocked

  return (
    <div className="flex items-center gap-2 text-[11.5px] py-1 px-1">
      <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-wider">Portée</span>

      {focusLine && (
        <FilterChip label={focusLine} onClear={() => onFocusLine(null)} />
      )}
      {focusDay && (
        <FilterChip label={formatDay(focusDay)} onClear={() => onFocusDay(null)} />
      )}
      {lensBlocked && (
        <FilterChip label="Bloqués seulement" onClear={() => setLensBlocked(false)} tone="danger" />
      )}

      {!hasFocus && (
        <span className="text-muted-foreground/50 text-[11px]">Toute la semaine · toutes lignes</span>
      )}

      <span className="ml-auto text-muted-foreground text-[11px] font-mono">
        {count.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')} OF
      </span>
    </div>
  )
}

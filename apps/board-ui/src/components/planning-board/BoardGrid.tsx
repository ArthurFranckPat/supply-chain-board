import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { isoWeekNumber, parseIso, toIso } from '@/hooks/usePlanningBoard'
import type { FeasibilityEntry, PlanningBoardOF } from '@/types/planningBoard'
import { OfCard } from './OfCard'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']
const NO_POSTE = '__sans_poste__'

interface BoardGridProps {
  workdays: string[]
  ofs: PlanningBoardOF[]
  selectedOf: string | null
  onSelect: (numOf: string) => void
  feasibilityMap?: Record<string, FeasibilityEntry> | null
}

interface RowDef {
  key: string
  label: string
  sublabel: string | null
}

/** Cellule droppable (jour) d'une rangée poste. */
function DayCell({
  rowKey,
  day,
  isToday,
  children,
  count,
}: {
  rowKey: string
  day: string
  isToday: boolean
  children: React.ReactNode
  count: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell|${rowKey}|${day}` })
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex min-h-[72px] min-w-[148px] flex-1 flex-col gap-1 border-l border-border/50 p-1 transition-colors',
        isToday ? 'bg-primary/[0.04]' : '',
        isOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/50' : '',
        count === 0 ? 'bg-transparent' : '',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function BoardGrid({ workdays, ofs, selectedOf, onSelect, feasibilityMap }: BoardGridProps) {
  const today = toIso(new Date())

  /* Regroupement OF par (poste, jour de début effectif) */
  const { rows, cells, hoursByCol } = useMemo(() => {
    const cellMap = new Map<string, PlanningBoardOF[]>()
    const posteLabels = new Map<string, string | null>()
    const colHours = new Map<string, number>()

    for (const of of ofs) {
      const start = of.date_debut ?? of.date_fin
      if (!start) continue
      const poste = of.poste_charge ?? NO_POSTE
      if (!posteLabels.has(poste)) posteLabels.set(poste, of.libelle_poste)
      const key = `${poste}|${start}`
      const bucket = cellMap.get(key)
      if (bucket) bucket.push(of)
      else cellMap.set(key, [of])
      colHours.set(start, (colHours.get(start) ?? 0) + (of.duree_heures ?? 0))
    }

    const rowDefs: RowDef[] = [...posteLabels.entries()]
      .sort(([a], [b]) => (a === NO_POSTE ? 1 : b === NO_POSTE ? -1 : a.localeCompare(b)))
      .map(([key, sublabel]) => ({
        key,
        label: key === NO_POSTE ? 'Sans poste' : key,
        sublabel: key === NO_POSTE ? 'gamme inconnue' : sublabel,
      }))

    return { rows: rowDefs, cells: cellMap, hoursByCol: colHours }
  }, [ofs])

  /* Semaines pour l'en-tête groupé */
  const weekGroups = useMemo(() => {
    const groups: { week: number; days: string[] }[] = []
    for (const day of workdays) {
      const w = isoWeekNumber(parseIso(day))
      const last = groups[groups.length - 1]
      if (last && last.week === w) last.days.push(day)
      else groups.push({ week: w, days: [day] })
    }
    return groups
  }, [workdays])

  if (rows.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        Aucun OF dans cette fenêtre avec ces filtres.
      </div>
    )
  }

  return (
    <div className="max-h-[calc(100vh-240px)] overflow-auto rounded-2xl border border-border bg-card/60 shadow-sm">
      <div className="min-w-max">
        {/* En-têtes figés (semaines + jours) */}
        <div className="sticky top-0 z-30">
          <div className="flex border-b border-border/70 bg-card">
            <div className="sticky left-0 z-40 w-40 shrink-0 border-r border-border/70 bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Poste
            </div>
            {weekGroups.map((g) => (
              <div
                key={g.week}
                style={{ flexGrow: g.days.length, flexBasis: g.days.length * 148 }}
                className="border-l border-border/70 bg-muted/40 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Semaine {g.week}
              </div>
            ))}
          </div>

          <div className="flex border-b border-border/70 bg-card">
            <div className="sticky left-0 z-40 w-40 shrink-0 border-r border-border/70 bg-card" />
            {workdays.map((day) => {
              const d = parseIso(day)
              const hours = hoursByCol.get(day) ?? 0
              return (
                <div
                  key={day}
                  className={[
                    'min-w-[148px] flex-1 border-l border-border/50 bg-muted/20 px-2 py-1 text-center',
                    day === today ? 'bg-primary/[0.08]' : '',
                  ].join(' ')}
                >
                  <div className={`text-[10px] font-semibold ${day === today ? 'text-primary' : 'text-foreground/80'}`}>
                    {DAY_LABELS[(d.getDay() + 6) % 7]} {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    {hours > 0 ? `${hours.toFixed(1)}h` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Rangées postes */}
        {rows.map((row) => (
          <div key={row.key} className="flex border-b border-border/40 last:border-b-0">
            <div className="sticky left-0 z-20 flex w-40 shrink-0 flex-col justify-center border-r border-border/70 bg-card px-3 py-2">
              <span className="text-[11px] font-bold tracking-tight text-foreground">{row.label}</span>
              {row.sublabel && (
                <span className="truncate text-[9px] text-muted-foreground" title={row.sublabel}>
                  {row.sublabel}
                </span>
              )}
            </div>
            {workdays.map((day) => {
              const bucket = cells.get(`${row.key}|${day}`) ?? []
              return (
                <DayCell key={day} rowKey={row.key} day={day} isToday={day === today} count={bucket.length}>
                  {bucket.map((of) => (
                    <OfCard
                      key={of.num_of}
                      of={of}
                      selected={selectedOf === of.num_of}
                      late={Boolean(of.date_fin && of.date_fin < today)}
                      onClick={() => onSelect(of.num_of)}
                      feasibility={feasibilityMap?.[of.num_of] ?? null}
                    />
                  ))}
                </DayCell>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

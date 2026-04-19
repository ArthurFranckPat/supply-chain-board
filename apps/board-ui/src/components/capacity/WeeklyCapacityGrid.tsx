import { useState, useMemo } from 'react'
import type { CapacityConfigResponse, WeeklyOverrideEntry } from '@/types/capacity'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Pill } from '@/components/ui/pill'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, SlidersHorizontal, Check, X, Search, Pencil } from 'lucide-react'

interface WeeklyCapacityGridProps {
  config: CapacityConfigResponse
  onUpdatePoste: (data: { poste: string; default_hours: number; shift_pattern: string; label?: string }) => void
  onSetOverride: (data: { poste: string; key: string; reason: string; pattern?: Record<string, number> }) => void
  onRemoveOverride: (data: { poste: string; key: string }) => void
}

const DAY_LABELS: Record<string, string> = {
  '1': 'Lun', '2': 'Mar', '3': 'Mer', '4': 'Jeu', '5': 'Ven', '6': 'Sam',
}

function presetPattern(hours: number): Record<string, number> {
  return { '1': hours, '2': hours, '3': hours, '4': hours, '5': hours, '6': 0, '7': 0 }
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function getWeeks(offset: number, count: number) {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weeks = []
  for (let i = 0; i < count; i++) {
    const weekMonday = new Date(monday)
    weekMonday.setDate(monday.getDate() + (offset + i) * 7)
    const friday = new Date(weekMonday)
    friday.setDate(weekMonday.getDate() + 4)
    weeks.push({
      key: getISOWeekKey(weekMonday),
      num: offset + i + 1,
      dates: `${weekMonday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - ${friday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`,
    })
  }
  return weeks
}

function getEffectiveInfo(
  config: CapacityConfigResponse,
  poste: string,
  weekKey: string,
): { avgHours: number; isOverride: boolean; pattern: Record<string, number> } {
  const override = config.weekly_overrides?.[weekKey]?.[poste] as WeeklyOverrideEntry | undefined
  const defaultHours = config.postes[poste]?.default_hours ?? 7
  if (override?.pattern) {
    const weekdayHours = [1, 2, 3, 4, 5].map(d => override.pattern[String(d)] ?? 0)
    const avg = weekdayHours.reduce((a, b) => a + b, 0) / weekdayHours.length
    return { avgHours: avg, isOverride: true, pattern: override.pattern }
  }
  return { avgHours: defaultHours, isOverride: false, pattern: presetPattern(defaultHours) }
}

function pillTone(h: number, ov: boolean): 'good' | 'warn' | 'danger' | 'default' {
  if (h === 0) return 'danger'
  if (h <= 7) return 'warn'
  if (ov) return 'good'
  return 'default'
}

export function WeeklyCapacityGrid({ config, onUpdatePoste, onSetOverride, onRemoveOverride }: WeeklyCapacityGridProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [openPoste, setOpenPoste] = useState<string | null>(null)
  const [openCell, setOpenCell] = useState<string | null>(null)
  const [cellMode, setCellMode] = useState<'preset' | 'custom'>('preset')

  const allPostes = useMemo(() => Object.values(config.postes), [config.postes])
  const postes = useMemo(() => {
    if (!search.trim()) return allPostes
    const q = search.toLowerCase()
    return allPostes.filter(p =>
      p.poste.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)
    )
  }, [allPostes, search])
  const weeks = useMemo(() => getWeeks(weekOffset, 5), [weekOffset])
  const cols = `180px repeat(${weeks.length}, minmax(110px, 1fr))`

  function handlePreset(poste: string, weekKey: string, value: string) {
    if (value === 'custom') {
      setCellMode('custom')
      return
    }
    const hours = value === '1x8' ? 7 : value === '2x8' ? 14 : 21
    onSetOverride({ poste, key: weekKey, reason: value, pattern: presetPattern(hours) })
    setOpenCell(null)
    setCellMode('preset')
  }

  function applyCustom(poste: string, weekKey: string, pattern: Record<string, number>) {
    onSetOverride({ poste, key: weekKey, reason: 'custom', pattern })
    setOpenCell(null)
    setCellMode('preset')
  }

  function closeCell() {
    setOpenCell(null)
    setCellMode('preset')
  }

  function applyDefault(poste: string, hours: number) {
    const shift = hours === 7 ? '1x8' : hours === 14 ? '2x8' : '3x8'
    onUpdatePoste({ poste, default_hours: hours, shift_pattern: shift })
    setOpenPoste(null)
  }

  if (allPostes.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Aucun poste detecte. Chargez les donnees ERP d'abord.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <h3 className="text-sm font-semibold shrink-0">Planning hebdomadaire</h3>
          <div className="relative max-w-[200px] flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrer postes..."
              className="w-full border border-border rounded-md pl-7 pr-2 py-1.5 text-[11px] bg-background placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="grid gap-0 bg-muted/50 border-b border-border" style={{ gridTemplateColumns: cols }}>
          <div className="px-3 py-2.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Poste</span>
          </div>
          {weeks.map(w => (
            <div key={w.key} className="px-2 py-2.5 text-center border-l border-border">
              <p className="text-[12px] font-semibold">S+{w.num}</p>
              <p className="text-[9.5px] text-muted-foreground mt-0.5">{w.dates}</p>
            </div>
          ))}
        </div>

        {/* Poste rows */}
        {postes.map(poste => (
          <div key={poste.poste} className="grid gap-0 border-b border-border last:border-b-0" style={{ gridTemplateColumns: cols }}>
            {/* ── Poste name + default config popover ── */}
            <div className="px-3 py-2 min-w-0 flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-mono font-semibold truncate">{poste.poste}</p>
                {poste.label && <p className="text-[10px] text-muted-foreground truncate">{poste.label}</p>}
              </div>
              <Popover
                open={openPoste === poste.poste}
                onOpenChange={(o) => { if (o) setOpenPoste(poste.poste); else setOpenPoste(null) }}
              >
                <PopoverTrigger className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0">
                  <Pencil className="h-3 w-3" />
                </PopoverTrigger>
                <PopoverContent side="right" sideOffset={4} align="start" className="w-[200px]">
                  <p className="text-[11px] font-semibold mb-2">Defaut {poste.poste}</p>
                  <div className="space-y-1">
                    {[
                      { label: '1x8', hours: 7 },
                      { label: '2x8', hours: 14 },
                      { label: '3x8', hours: 21 },
                    ].map(opt => (
                      <button
                        key={opt.hours}
                        onClick={() => applyDefault(poste.poste, opt.hours)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] hover:bg-accent transition-colors ${
                          poste.default_hours === opt.hours ? 'bg-primary/10 text-primary' : ''
                        }`}
                      >
                        <span className="font-semibold">{opt.label}</span>
                        <span className="text-muted-foreground">{opt.hours}h/j</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Week cells ── */}
            {weeks.map(w => {
              const info = getEffectiveInfo(config, poste.poste, w.key)
              const id = `${poste.poste}|${w.key}`
              const isOpen = openCell === id

              return (
                <div key={w.key} className="px-2 py-2 border-l border-border flex items-center justify-center">
                  <Popover
                    open={isOpen}
                    onOpenChange={(o) => { if (o) setOpenCell(id); else closeCell() }}
                  >
                    <PopoverTrigger className="w-full">
                      <Pill tone={pillTone(info.avgHours, info.isOverride)} mono>
                        {info.avgHours === 0 ? 'Ferme' : `${Math.round(info.avgHours)}h`}
                      </Pill>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      sideOffset={4}
                      align="center"
                      className={cellMode === 'custom' ? 'w-[220px]' : 'p-1 min-w-[140px]'}
                    >
                      {cellMode === 'preset' ? (
                        <>
                          <button onClick={() => handlePreset(poste.poste, w.key, '1x8')} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] hover:bg-accent">
                            <span className="font-semibold">1x8</span>
                            <span className="text-muted-foreground">7h/j</span>
                          </button>
                          <button onClick={() => handlePreset(poste.poste, w.key, '2x8')} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] hover:bg-accent">
                            <span className="font-semibold">2x8</span>
                            <span className="text-muted-foreground">14h/j</span>
                          </button>
                          <button onClick={() => handlePreset(poste.poste, w.key, '3x8')} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] hover:bg-accent">
                            <span className="font-semibold">3x8</span>
                            <span className="text-muted-foreground">21h/j</span>
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button onClick={() => handlePreset(poste.poste, w.key, 'custom')} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-blue-600 hover:bg-blue/10">
                            <SlidersHorizontal className="h-3 w-3" /> Custom
                          </button>
                          {info.isOverride && (
                            <>
                              <div className="my-1 border-t border-border" />
                              <button onClick={() => { onRemoveOverride({ poste: poste.poste, key: w.key }); closeCell() }} className="w-full px-2.5 py-1.5 rounded-md text-[11px] text-destructive hover:bg-destructive/10">
                                Reset defaut
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <CustomEditor
                          pattern={info.pattern}
                          onApply={p => applyCustom(poste.poste, w.key, p)}
                          onCancel={closeCell}
                        />
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
          disabled={weekOffset === 0}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[11px] text-muted-foreground font-mono min-w-[100px] text-center">
          {weekOffset === 0 ? 'S+1 \u00e0 S+5' : `S+${weekOffset + 1} \u00e0 S+${weekOffset + 5}`}
        </span>
        <button onClick={() => setWeekOffset(o => o + 1)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Custom day-by-day editor ── */
function CustomEditor({
  pattern,
  onApply,
  onCancel,
}: {
  pattern: Record<string, number>
  onApply: (pattern: Record<string, number>) => void
  onCancel: () => void
}) {
  const [local, setLocal] = useState<Record<string, number>>({ ...pattern })

  return (
    <>
      <p className="text-[11px] font-semibold mb-2">Heures par jour</p>
      <div className="space-y-1">
        {[1, 2, 3, 4, 5, 6].map(d => (
          <div key={d} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-6">{DAY_LABELS[String(d)]}</span>
            <input
              type="number"
              value={local[String(d)] ?? 0}
              onChange={e => setLocal(p => ({ ...p, [d]: parseFloat(e.target.value) || 0 }))}
              className="flex-1 border border-border rounded-md px-2 py-1 text-[11px] bg-background text-center font-mono"
              step="0.5"
              min="0"
              max="24"
            />
            <span className="text-[10px] text-muted-foreground">h</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-3 pt-2 border-t border-border">
        <Button size="sm" className="flex-1 h-7 text-[10px]" onClick={() => onApply(local)}>
          <Check className="h-3 w-3 mr-1" /> Valider
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </>
  )
}

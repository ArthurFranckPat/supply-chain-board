import { useState, useMemo } from 'react'
import type { CapacityConfigResponse, WeeklyOverrideEntry } from '@/types/capacity'
import { Pill } from '@/components/ui/pill'

interface WeeklyCapacityGridProps {
  config: CapacityConfigResponse
  onUpdatePoste: (data: { poste: string; default_hours: number; shift_pattern: string; label?: string }) => void
  onSetOverride: (data: { poste: string; key: string; reason: string; pattern?: Record<string, number> }) => void
  onRemoveOverride: (data: { poste: string; key: string }) => void
}

const DAY_LABELS: Record<string, string> = { '1': 'Lun', '2': 'Mar', '3': 'Mer', '4': 'Jeu', '5': 'Ven', '6': 'Sam' }

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
      key: getISOWeekKey(weekMonday), num: offset + i + 1,
      dates: `${weekMonday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - ${friday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`,
    })
  }
  return weeks
}

function getEffectiveInfo(config: CapacityConfigResponse, poste: string, weekKey: string) {
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
    return allPostes.filter(p => p.poste.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
  }, [allPostes, search])
  const weeks = useMemo(() => getWeeks(weekOffset, 5), [weekOffset])
  const cols = `180px repeat(${weeks.length}, minmax(100px, 1fr))`

  function handlePreset(poste: string, weekKey: string, value: string) {
    if (value === 'custom') { setCellMode('custom'); return }
    const hours = value === '1x8' ? 7 : value === '2x8' ? 14 : 21
    onSetOverride({ poste, key: weekKey, reason: value, pattern: presetPattern(hours) })
    setOpenCell(null); setCellMode('preset')
  }

  function applyCustom(poste: string, weekKey: string, pattern: Record<string, number>) {
    onSetOverride({ poste, key: weekKey, reason: 'custom', pattern })
    setOpenCell(null); setCellMode('preset')
  }

  function applyDefault(poste: string, hours: number) {
    const shift = hours === 7 ? '1x8' : hours === 14 ? '2x8' : '3x8'
    onUpdatePoste({ poste, default_hours: hours, shift_pattern: shift })
    setOpenPoste(null)
  }

  if (allPostes.length === 0) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Aucun poste detecte.</div>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold">Planning hebdomadaire</span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer..."
          className="flex-1 max-w-[200px] h-7 px-2 text-[11px] border border-border bg-card outline-none" />
      </div>

      <div className="border border-border overflow-hidden">
        <div className="grid gap-0 bg-muted border-b border-border" style={{ gridTemplateColumns: cols }}>
          <div className="px-2 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Poste</span>
          </div>
          {weeks.map(w => (
            <div key={w.key} className="px-2 py-1.5 text-center border-l border-border">
              <p className="text-[11px] font-semibold">S+{w.num}</p>
              <p className="text-[9px] text-muted-foreground">{w.dates}</p>
            </div>
          ))}
        </div>

        {postes.map(poste => (
          <div key={poste.poste} className="grid gap-0 border-b border-border last:border-b-0" style={{ gridTemplateColumns: cols }}>
            <div className="px-2 py-1.5 min-w-0 flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-mono font-semibold truncate">{poste.poste}</p>
                {poste.label && <p className="text-[9px] text-muted-foreground truncate">{poste.label}</p>}
              </div>
              <button onClick={() => setOpenPoste(openPoste === poste.poste ? null : poste.poste)} className="text-[10px] text-muted-foreground hover:text-foreground">⚙</button>
              {openPoste === poste.poste && (
                <div className="absolute z-20 bg-card border border-border p-2 shadow-sm" style={{ marginLeft: '160px' }}>
                  <p className="text-[10px] font-semibold mb-1">Défaut</p>
                  {[{ label: '1x8', hours: 7 }, { label: '2x8', hours: 14 }, { label: '3x8', hours: 21 }].map(opt => (
                    <button key={opt.hours} onClick={() => applyDefault(poste.poste, opt.hours)}
                      className={`block w-full text-left px-2 py-1 text-[11px] ${poste.default_hours === opt.hours ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                      {opt.label} — {opt.hours}h/j
                    </button>
                  ))}
                </div>
              )}
            </div>

            {weeks.map(w => {
              const info = getEffectiveInfo(config, poste.poste, w.key)
              const id = `${poste.poste}|${w.key}`
              const isOpen = openCell === id
              return (
                <div key={w.key} className="px-1 py-1 border-l border-border flex items-center justify-center relative">
                  <button onClick={() => setOpenCell(isOpen ? null : id)} className="w-full text-center">
                    <Pill tone={pillTone(info.avgHours, info.isOverride)} mono>{info.avgHours === 0 ? 'Fermé' : `${Math.round(info.avgHours)}h`}</Pill>
                  </button>
                  {isOpen && (
                    <div className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 bg-card border border-border p-1.5 shadow-sm w-[140px]">
                      {cellMode === 'preset' ? (
                        <div className="space-y-0.5">
                          {['1x8', '2x8', '3x8'].map(v => (
                            <button key={v} onClick={() => handlePreset(poste.poste, w.key, v)}
                              className="block w-full text-left px-2 py-1 text-[11px] hover:bg-muted">{v}</button>
                          ))}
                          <button onClick={() => handlePreset(poste.poste, w.key, 'custom')} className="block w-full text-left px-2 py-1 text-[11px] text-primary hover:bg-muted">Custom</button>
                          {info.isOverride && (
                            <button onClick={() => { onRemoveOverride({ poste: poste.poste, key: w.key }); setOpenCell(null); }}
                              className="block w-full text-left px-2 py-1 text-[11px] text-destructive hover:bg-muted">Reset</button>
                          )}
                        </div>
                      ) : (
                        <CustomEditor pattern={info.pattern} onApply={p => applyCustom(poste.poste, w.key, p)} onCancel={() => { setOpenCell(null); setCellMode('preset'); }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0}
          className="h-6 px-2 text-[11px] border border-border hover:bg-muted disabled:opacity-30">←</button>
        <span className="text-[11px] text-muted-foreground font-mono">S+{weekOffset + 1} à S+{weekOffset + 5}</span>
        <button onClick={() => setWeekOffset(o => o + 1)} className="h-6 px-2 text-[11px] border border-border hover:bg-muted">→</button>
      </div>
    </div>
  )
}

function CustomEditor({ pattern, onApply, onCancel }: { pattern: Record<string, number>; onApply: (pattern: Record<string, number>) => void; onCancel: () => void }) {
  const [local, setLocal] = useState<Record<string, number>>({ ...pattern })
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold">Heures/jour</p>
      {[1, 2, 3, 4, 5, 6].map(d => (
        <div key={d} className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-6">{DAY_LABELS[String(d)]}</span>
          <input type="number" value={local[String(d)] ?? 0} step="0.5" min="0" max="24"
            onChange={e => setLocal(p => ({ ...p, [d]: parseFloat(e.target.value) || 0 }))}
            className="flex-1 h-6 px-1 text-[11px] border border-border bg-card text-center font-mono" />
        </div>
      ))}
      <div className="flex gap-1 pt-1">
        <button onClick={() => onApply(local)} className="flex-1 h-6 bg-primary text-primary-foreground text-[10px] font-semibold">OK</button>
        <button onClick={onCancel} className="h-6 px-2 border border-border text-[10px]">Annuler</button>
      </div>
    </div>
  )
}

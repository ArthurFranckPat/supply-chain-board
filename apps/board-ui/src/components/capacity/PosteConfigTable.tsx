import { useState } from 'react'
import type { CapacityConfigResponse, PosteConfig } from '@/types/capacity'
import { Button } from '@/components/ui/button'
import { Pencil, ChevronDown, ChevronRight, Trash2, Plus, ArrowLeft } from 'lucide-react'

interface PosteConfigTableProps {
  config: CapacityConfigResponse
  onUpdatePoste: (data: { poste: string; default_hours: number; shift_pattern: string; label?: string }) => void
  onSetOverride: (data: { poste: string; key: string; hours: number; reason: string }) => void
  onRemoveOverride: (data: { poste: string; key: string }) => void
  onBack?: () => void
}

export function PosteConfigTable({ config, onUpdatePoste, onSetOverride, onRemoveOverride, onBack }: PosteConfigTableProps) {
  const [editingPoste, setEditingPoste] = useState<string | null>(null)
  const [editHours, setEditHours] = useState('')
  const [editPattern, setEditPattern] = useState('2x7')
  const [editLabel, setEditLabel] = useState('')
  const [expandedPoste, setExpandedPoste] = useState<string | null>(null)
  const [showAddOverride, setShowAddOverride] = useState<string | null>(null)
  const [overrideKey, setOverrideKey] = useState('')
  const [overrideHours, setOverrideHours] = useState('')
  const [overrideReason, setOverrideReason] = useState('')

  const postes = Object.values(config.postes)

  function startEditing(poste: PosteConfig) {
    setEditingPoste(poste.poste)
    setEditHours(String(poste.default_hours))
    setEditPattern(poste.shift_pattern)
    setEditLabel(poste.label)
  }

  function saveEditing(posteKey: string) {
    onUpdatePoste({
      poste: posteKey,
      default_hours: parseFloat(editHours) || 14.0,
      shift_pattern: editPattern,
      label: editLabel,
    })
    setEditingPoste(null)
  }

  function addOverride(poste: string) {
    onSetOverride({
      poste,
      key: overrideKey,
      hours: parseFloat(overrideHours) || 7.0,
      reason: overrideReason,
    })
    setShowAddOverride(null)
    setOverrideKey('')
    setOverrideHours('')
    setOverrideReason('')
  }

  // Collect all overrides for a poste (daily + weekly)
  function getOverridesForPoste(posteKey: string) {
    const poste = config.postes[posteKey]
    const daily = poste?.daily_overrides
      ? Object.entries(poste.daily_overrides).map(([date, val]) => ({ key: date, ...val, type: 'day' as const }))
      : []
    const weekly = config.weekly_overrides
      ? Object.entries(config.weekly_overrides)
          .flatMap(([week, postes]) =>
            postes[posteKey] ? [{ key: week, ...postes[posteKey], type: 'week' as const }] : []
          )
      : []
    return [...daily, ...weekly]
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold">Postes de charge</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {postes.length} poste{postes.length > 1 ? 's' : ''} detecte{postes.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid gap-0 bg-muted/50 border-b border-border px-3 py-2" style={{ gridTemplateColumns: '1fr 100px 80px 90px 50px 40px' }}>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Poste</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pattern</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">h/jour</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Overrides</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Edit</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">+</span>
        </div>

        {/* Rows */}
        {postes.map((poste) => {
          const isEditing = editingPoste === poste.poste
          const isExpanded = expandedPoste === poste.poste
          const overrides = getOverridesForPoste(poste.poste)

          return (
            <div key={poste.poste} className="border-b border-border last:border-b-0">
              <div className="grid gap-0 items-center px-3 py-2.5 hover:bg-accent/30 transition-colors" style={{ gridTemplateColumns: '1fr 100px 80px 90px 50px 40px' }}>
                {/* Poste name */}
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setExpandedPoste(isExpanded ? null : poste.poste)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {overrides.length > 0 && (
                      isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className="text-[12px] font-mono font-semibold truncate">{poste.poste}</p>
                    {poste.label && (
                      <p className="text-[10px] text-muted-foreground truncate">{poste.label}</p>
                    )}
                  </div>
                </div>

                {/* Shift pattern */}
                {isEditing ? (
                  <select
                    value={editPattern}
                    onChange={e => setEditPattern(e.target.value)}
                    className="border border-border rounded px-1.5 py-1 text-[11px] bg-background"
                  >
                    <option value="1x8">1x8</option>
                    <option value="2x8">2x8</option>
                  </select>
                ) : (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${poste.shift_pattern === '2x8' ? 'bg-green/10 text-green' : 'bg-blue/10 text-blue-600'}`}>
                    {poste.shift_pattern}
                  </span>
                )}

                {/* Default hours */}
                {isEditing ? (
                  <input
                    type="number"
                    value={editHours}
                    onChange={e => setEditHours(e.target.value)}
                    className="border border-border rounded px-1.5 py-1 text-[11px] w-16 bg-background"
                    step="0.5"
                    min="0"
                    max="24"
                  />
                ) : (
                  <span className="text-[12px] font-mono font-semibold">{poste.default_hours}h</span>
                )}

                {/* Override count */}
                <span className="text-[11px] text-muted-foreground">
                  {overrides.length > 0 ? `${overrides.length} override${overrides.length > 1 ? 's' : ''}` : '-'}
                </span>

                {/* Edit button */}
                {isEditing ? (
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => saveEditing(poste.poste)}>
                    OK
                  </Button>
                ) : (
                  <button onClick={() => startEditing(poste)} className="p-1 text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}

                {/* Add override */}
                <button
                  onClick={() => {
                    setShowAddOverride(showAddOverride === poste.poste ? null : poste.poste)
                    setOverrideKey('')
                    setOverrideHours('')
                    setOverrideReason('')
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {/* Expanded overrides */}
              {isExpanded && overrides.length > 0 && (
                <div className="bg-muted/30 px-3 py-2 space-y-1">
                  {overrides.map((ov) => (
                    <div key={ov.key} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${ov.type === 'week' ? 'bg-blue/10 text-blue-600' : 'bg-orange/10 text-orange'}`}>
                          {ov.type === 'week' ? 'Semaine' : 'Jour'}
                        </span>
                        <span className="font-mono">{ov.key}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-semibold">{ov.hours}h</span>
                        {ov.reason && <span className="text-muted-foreground">({ov.reason})</span>}
                      </div>
                      <button
                        onClick={() => onRemoveOverride({ poste: poste.poste, key: ov.key })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add override inline form */}
              {showAddOverride === poste.poste && (
                <div className="bg-muted/30 px-3 py-2.5 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Date (2025-04-21) ou semaine (2025-W17)"
                    value={overrideKey}
                    onChange={e => setOverrideKey(e.target.value)}
                    className="border border-border rounded px-2 py-1 text-[11px] w-52 bg-background"
                  />
                  <input
                    type="number"
                    placeholder="Heures"
                    value={overrideHours}
                    onChange={e => setOverrideHours(e.target.value)}
                    className="border border-border rounded px-2 py-1 text-[11px] w-16 bg-background"
                    step="0.5"
                    min="0"
                    max="24"
                  />
                  <input
                    type="text"
                    placeholder="Motif"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    className="border border-border rounded px-2 py-1 text-[11px] flex-1 bg-background"
                  />
                  <Button size="sm" className="text-[10px] h-7" onClick={() => addOverride(poste.poste)}>
                    Ajouter
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={() => setShowAddOverride(null)}>
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { type CamionDtl } from '@r/components/expeditions/camion-detail-sheet'
import {
  chargeBgClass,
  chargeText,
  chargeTier,
  fromMinutes,
  pctOf,
  timeBounds,
  toMinutes,
} from '@/components/expeditions/palette-charge'
import { TriangleAlert, Truck } from 'lucide-react'
import { cn } from '@r/lib/utils'

/**
 * Vue « Frise de charge » — port React iso du Solid
 * inertia/components/expeditions/frise-view.tsx. Chaque camion est une barre
 * positionnée sur un axe temporel (auto-calibré), ancrée en bas de sa rangée.
 * Ligne MAINTENANT + histogramme de densité quai. Tooltip au survol.
 */

const ROW_H = 56 // hauteur d'une rangée (px)
const BAR_MIN = 16 // hauteur min barre
const BAR_MAX = 46 // hauteur max barre (pour pal ≤ max)
const PAD_TOP = 4
const NOW_MIN = (function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
})()

export function FriseView({
  rows,
  maxPalettesCamion,
  camionCapacitePalettes,
  selectedCamion,
  onSelect,
}: {
  rows: CamionDtl[]
  maxPalettesCamion: number
  camionCapacitePalettes: number
  selectedCamion: CamionDtl | null
  onSelect: (row: CamionDtl) => void
}) {
  const bounds = useMemo(() => timeBounds(rows.map((c) => [c.debut, c.fin] as const)), [rows])
  const dur = bounds.end - bounds.start

  // La ligne MAINTENANT n'a du sens que si « maintenant » tombe dans la fenêtre.
  const nowPct = useMemo(() => {
    if (NOW_MIN < bounds.start || NOW_MIN > bounds.end) return null
    return pctOf(NOW_MIN, bounds.start, bounds.end)
  }, [bounds])

  /** Taux de remplissage effectif d'un camion (palTheo si dispo, sinon nbPal/capacité). */
  const tauxOf = (c: CamionDtl) =>
    c.palTheo >= 0 ? c.tauxRemplissage : c.nbPalettes / camionCapacitePalettes

  // Hauteur de barre ∝ taux de remplissage (plafonné à 1 pour la hauteur visuelle).
  const barH = (c: CamionDtl) => {
    const ref = Math.min(tauxOf(c), 1)
    return Math.round(BAR_MIN + ref * (BAR_MAX - BAR_MIN))
  }

  // Densité quai : nombre de camions dont le créneau traverse chaque heure.
  const density = useMemo(() => {
    const buckets = new Array(bounds.hours).fill(0)
    for (const c of rows) {
      const ds = Math.floor((toMinutes(c.debut) - bounds.start) / 60)
      const de = Math.floor((toMinutes(c.fin) - bounds.start) / 60)
      for (let h = ds; h <= de && h < bounds.hours; h++) if (h >= 0) buckets[h]++
    }
    const max = Math.max(...buckets, 1)
    return buckets.map((n, i) => ({ n, i, max }))
  }, [rows, bounds])

  // ── Tooltip ──────────────────────────────────────────────────────
  const [hovered, setHovered] = useState<CamionDtl | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hovered) return
    const onMove = (e: MouseEvent) => {
      const tip = tipRef.current
      if (!tip) return
      let x = e.clientX + 14
      let y = e.clientY + 14
      if (x + tip.offsetWidth > window.innerWidth) x = e.clientX - tip.offsetWidth - 14
      tip.style.left = `${x}px`
      tip.style.top = `${y}px`
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [hovered])

  const onEnter = (c: CamionDtl) => setHovered(c)
  const onLeave = () => setHovered(null)

  return (
    <div className="h-full overflow-auto px-5 pb-8 pt-4">
      <div className="overflow-hidden rounded-xl border border-rule bg-card">
        {/* En-tête : label + heures */}
        <div className="sticky top-0 z-[6] grid grid-cols-[210px_1fr] border-b border-rule bg-secondary">
          <div className="border-r border-rule-soft px-4 py-[11px] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Camion
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${bounds.hours}, 1fr)` }}
          >
            {Array.from({ length: bounds.hours }).map((_, i) => (
              <span
                key={i}
                className="border-r border-rule-soft py-[11px] text-center font-mono text-[10px] font-bold text-muted-foreground last:border-r-0"
              >
                {fromMinutes(bounds.start + i * 60)}
              </span>
            ))}
          </div>
        </div>

        {/* Rangées camions */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Truck size={32} strokeWidth={1.75} className="opacity-45" />
            <span className="font-fraunces text-[14px] italic">
              Aucun camion ne correspond au filtre.
            </span>
          </div>
        ) : (
          rows.map((c) => {
            const left = pctOf(toMinutes(c.debut), bounds.start, dur)
            const width = Math.max(pctOf(toMinutes(c.fin), bounds.start, dur) - left, 2.5)
            const taux = tauxOf(c)
            const tier = chargeTier(taux)
            const h = barH(c)
            const isSel = selectedCamion === c
            return (
              <div
                key={`${c.bprnum}-${c.debut}-${c.client}`}
                className="grid grid-cols-[210px_1fr] border-b border-rule-soft last:border-b-0 hover:bg-foreground/[0.03]"
              >
                <div className="flex min-w-0 flex-col gap-0.5 border-r border-rule-soft px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'truncate text-[11.5px] font-bold',
                        c.anomalie ? 'text-destructive' : 'text-foreground'
                      )}
                    >
                      {c.client || '—'}
                    </span>
                    {c.source === 'navette' && (
                      <span className="font-mono text-[8px] font-bold uppercase tracking-wider text-brand">
                        {c.navetteNum}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
                    {c.debut}–{c.fin} · {c.qteUc.toLocaleString('fr-FR')} UC
                  </span>
                  {c.anomalie && (
                    <span className="flex w-fit items-center gap-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.05em] text-destructive">
                      <TriangleAlert size={11} strokeWidth={1.75} />
                      {c.nbPalettes} pal &gt; {maxPalettesCamion}
                    </span>
                  )}
                  {!c.anomalie && taux > 1 && (
                    <span
                      className="flex w-fit items-center gap-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.05em] text-destructive"
                      title="Volume au-delà de la capacité (équivalent-palettes)"
                    >
                      <TriangleAlert size={11} strokeWidth={1.75} />
                      {Math.round(taux * 100)}% rempl.
                    </span>
                  )}
                </div>
                <div className="relative" style={{ height: `${ROW_H}px` }}>
                  {/* Grille de fond (lignes d'heure) */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `linear-gradient(to right, transparent calc(100%/${bounds.hours} - 1px), var(--color-rule-soft) calc(100%/${bounds.hours} - 1px) calc(100%/${bounds.hours}))`,
                      backgroundSize: `calc(100%/${bounds.hours}) 100%`,
                    }}
                  />
                  {/* Ligne MAINTENANT */}
                  {nowPct !== null && (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-brand"
                      style={{ left: `${nowPct}%` }}
                    >
                      <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-brand bg-card px-1 py-px font-mono text-[8px] font-bold tracking-[0.1em] text-brand">
                        MAINTENANT
                      </span>
                    </div>
                  )}
                  {/* Barre camion */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.client} — ${c.debut} à ${c.fin}, ${c.nbPalettes} palettes`}
                    className={cn(
                      'absolute flex cursor-pointer items-center overflow-hidden rounded-[5px] px-2 transition-[filter,box-shadow] duration-150',
                      'hover:brightness-110 focus-visible:bg-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                      isSel && 'ring-2 ring-brand ring-offset-1',
                      chargeBgClass(tier)
                    )}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      top: `${ROW_H - h - PAD_TOP}px`,
                      height: `${h}px`,
                      backgroundImage:
                        'repeating-linear-gradient(90deg, transparent 0 7px, rgba(251,248,239,0.14) 7px 8px)',
                    }}
                    onClick={() => onSelect(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(c)
                      }
                    }}
                    onMouseEnter={() => onEnter(c)}
                    onMouseLeave={onLeave}
                  >
                    {/* Texte uniquement si la barre est assez large */}
                    {width > 8 && (
                      <span className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] font-bold text-card">
                        {c.nbPalettes}
                        {c.anomalie && (
                          <TriangleAlert size={12} strokeWidth={1.75} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Densité quai */}
        <div className="grid grid-cols-[210px_1fr] border-t-2 border-rule bg-secondary">
          <div className="flex flex-col justify-center gap-0.5 border-r border-rule-soft px-4 py-3">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-secondary-foreground">
              Densité quai
            </span>
            <span className="font-mono text-[8px] font-medium italic text-muted-foreground">
              camions simultanés / heure
            </span>
          </div>
          <div className="relative" style={{ height: '64px' }}>
            {nowPct !== null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-brand"
                style={{ left: `${nowPct}%` }}
              />
            )}
            {density.map((d) => {
              const hpct = (d.n / d.max) * 100
              const cls = d.n >= 3 ? 'bg-suggere' : d.n >= 2 ? 'bg-planifie' : 'bg-ferme'
              return (
                <div
                  key={d.i}
                  className={cn(
                    'absolute bottom-0 flex items-start justify-center rounded-t-[4px] pt-1',
                    cls
                  )}
                  style={{
                    left: `${(d.i / bounds.hours) * 100}%`,
                    width: `${(1 / bounds.hours) * 100 - 1}%`,
                    height: `${Math.max(hpct, d.n ? 12 : 0)}%`,
                    backgroundImage:
                      'repeating-linear-gradient(90deg, transparent 0 6px, rgba(251,248,239,0.12) 6px 7px)',
                  }}
                >
                  {d.n > 0 && (
                    <span className="font-mono text-[9px] font-bold text-card">{d.n}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tooltip (portail fixed) */}
      <div
        ref={tipRef}
        className={cn(
          'pointer-events-none fixed z-50 max-w-[240px] rounded-lg border border-rule bg-card p-2.5 text-[11px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]',
          !hovered && 'hidden'
        )}
      >
        {hovered && (
          <>
            <strong className="mb-0.5 block text-[12px]">{hovered.client || '—'}</strong>
            <div className="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Créneau</span>
              <b className="font-bold text-foreground">
                {hovered.debut}–{hovered.fin}
              </b>
            </div>
            <div className="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Palettes</span>
              <b
                className={cn(
                  'font-bold',
                  chargeText(
                    chargeTier(
                      hovered.palTheo >= 0
                        ? hovered.tauxRemplissage
                        : hovered.nbPalettes / camionCapacitePalettes
                    )
                  )
                )}
              >
                {hovered.nbPalettes} pal.
                {hovered.palTheo >= 0 && ` (≈ ${hovered.palTheo.toFixed(1)} théo.)`}
              </b>
            </div>
            {hovered.palTheo >= 0 && (
              <div className="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
                <span>Remplissage</span>
                <b className="font-bold text-foreground">
                  {Math.round(hovered.tauxRemplissage * 100)}% / {camionCapacitePalettes} pal.
                </b>
              </div>
            )}
            <div className="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>UC</span>
              <b className="font-bold text-foreground">{hovered.qteUc.toLocaleString('fr-FR')}</b>
            </div>
            <div className="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Contenants</span>
              <b className="font-bold text-foreground">{hovered.nbContenants}</b>
            </div>
            <div className="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Lignes</span>
              <b className="font-bold text-foreground">{hovered.nbLignes}</b>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FriseView

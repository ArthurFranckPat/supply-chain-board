import { memo, useMemo } from 'react'

import { barY, defineChart } from '@tanstack/charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { Chart } from '@tanstack/charts/react'
import { tooltip } from '@tanstack/charts/tooltip'

import { cn } from '@r/lib/utils'

// Type local (évite import circulaire depuis dashboard.tsx)
export type StockPoint = { periode: string; label: string; valeur: number; qte: number }

/** Encre + vert succès (grammaire dashboard Cursor produit). */
const INK = 'var(--foreground, #26251e)'
const INK_SOFT = 'color-mix(in srgb, var(--foreground, #26251e) 55%, white)'
const PLANIFIE = 'var(--color-ferme, #1f8a65)'
const PLANIFIE_SOFT = 'color-mix(in srgb, var(--color-ferme, #1f8a65) 18%, transparent)'

const periodDated = (p: StockPoint) =>
  p.periode.includes('-W') ? `S${p.periode.slice(-2)} ${p.periode.slice(0, 4)}` : p.label

const printExact = {
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
} as React.CSSProperties

// ── Sparkline Valorisation : colonnes teal, dernière pleine
export const StockSparklineChart = memo(function StockSparklineChart({
  series,
}: {
  series: StockPoint[]
}) {
  const data = useMemo(
    () =>
      series.map((pt, i) => ({
        key: pt.periode,
        label: pt.periode,
        valeur: pt.valeur,
        _fill: i === series.length - 1 ? PLANIFIE : PLANIFIE_SOFT,
        _x: pt.periode,
      })),
    [series]
  )

  const def = useMemo(() => {
    if (data.length === 0) return null
    return defineChart({
      svgAnimation: false,
      marks: [
        barY(data, {
          x: '_x',
          y: 'valeur',
          fill: (d: (typeof data)[number]) => d._fill,
          radius: 2,
          inset: 1,
        }),
      ],
      x: {
        scale: () =>
          scaleBand<string>()
            .domain(data.map((d) => d._x))
            .padding(0.2),
        axis: false,
      },
      y: {
        scale: scaleLinear,
        nice: false,
        grid: false,
        axis: false,
      },
      tooltip,
    })
  }, [data])

  if (series.length === 0 || !def) return null

  return (
    <div className="mt-4" style={printExact}>
      <Chart
        definition={def}
        ariaLabel="Valorisation du stock — sparkline"
        height={56}
        className="w-full"
        style={{ width: '100%' }}
      />
      <div className="mt-1 flex justify-between text-[10px] font-normal tabular-nums text-muted-foreground">
        <span>{series[0] ? periodDated(series[0]) : null}</span>
        <span>{series[series.length - 1] ? periodDated(series[series.length - 1]) : null}</span>
      </div>
    </div>
  )
})

// ── Pills CSS (pas TanStack) — un Chart responsive se re-mesure au mount
//    (largeur 0→N) et donne l'illusion d'un grow. Domaine partagé = width %.

type ChargeRow = { code: string; label: string; heures: number }
type ProfRow = { id: string; label: string; nbLignes: number; heures: number }
type CatRow = { categorie: string; valeur: number; part: number }

const PillRow = memo(function PillRow({
  value,
  max,
  label,
  fill = INK,
}: {
  value: number
  max: number
  label: string
  fill?: string
}) {
  const domainMax = Math.max(1, max)
  const pct = Math.min(100, Math.round((value / domainMax) * 100))
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-foreground/[0.06]"
      style={printExact}
      role="img"
      aria-label={`${label} : ${value} sur ${domainMax} (${pct} %)`}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: fill, ...printExact }}
      />
    </div>
  )
})

export const ChargeBars = memo(function ChargeBars({
  postes,
  onSelectPoste,
  selectedPoste = null,
}: {
  postes: ChargeRow[]
  onSelectPoste?: (code: string) => void
  selectedPoste?: string | null
}) {
  const max = useMemo(() => Math.max(1, ...postes.map((p) => p.heures)), [postes])
  if (postes.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {postes.map((p) => {
        const selected = selectedPoste === p.code
        const rowLabel = `${p.code}${p.label ? ` · ${p.label}` : ''}`
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span
                className="min-w-0 truncate text-xs font-medium text-foreground"
                title={p.label || p.code}
              >
                {rowLabel}
              </span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {p.heures} h
              </span>
            </div>
            <PillRow value={p.heures} max={max} label={rowLabel} fill={INK_SOFT} />
          </>
        )
        if (!onSelectPoste) {
          return <div key={p.code}>{inner}</div>
        }
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onSelectPoste(p.code)}
            className={cn(
              'w-full min-h-9 rounded-lg px-1.5 py-1.5 text-left transition-colors',
              'hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
              selected && 'bg-foreground/[0.04] ring-1 ring-foreground/10'
            )}
            aria-pressed={selected}
            aria-label={`Voir les lignes en retard du poste ${p.code}`}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
})

export const ProfondeurBars = memo(function ProfondeurBars({ buckets }: { buckets: ProfRow[] }) {
  const visible = useMemo(() => buckets.filter((b) => b.nbLignes > 0 || b.heures > 0), [buckets])
  const max = useMemo(() => Math.max(1, ...visible.map((b) => b.heures)), [visible])
  if (visible.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {visible.map((b) => {
        const rowLabel = `${b.label} · ${b.nbLignes} ligne${b.nbLignes > 1 ? 's' : ''}`
        return (
          <div key={b.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {b.label}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {b.nbLignes} ligne{b.nbLignes > 1 ? 's' : ''}
                </span>
              </span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {b.heures} h
              </span>
            </div>
            <PillRow value={b.heures} max={max} label={rowLabel} fill={INK_SOFT} />
          </div>
        )
      })}
    </div>
  )
})

export const CategoriesBars = memo(function CategoriesBars({
  categories,
}: {
  categories: CatRow[]
}) {
  const max = useMemo(() => Math.max(1, ...categories.map((c) => c.valeur)), [categories])
  if (categories.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {categories.map((c) => (
        <div key={c.categorie}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {c.categorie}
            </span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
              {new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(c.valeur)}
              <span className="ml-1 text-[10px] text-muted-foreground">{c.part}%</span>
            </span>
          </div>
          <PillRow value={c.valeur} max={max} label={c.categorie} fill={INK} />
        </div>
      ))}
    </div>
  )
})

import { useMemo } from 'react'

import { barY, defineChart } from '@tanstack/charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { Chart } from '@tanstack/charts/react'
import { tooltip } from '@tanstack/charts/tooltip'

// Type local (évite import circulaire depuis dashboard.tsx)
export type StockPoint = { periode: string; label: string; valeur: number; qte: number }

// Palette Airbnb stricte (même que dashboard.tsx)
const BAR_PALETTE = ['#ff385c', '#222222', '#00a699', '#717171', '#dddddd']

const periodDated = (p: StockPoint) =>
  p.periode.includes('-W') ? `S${p.periode.slice(-2)} ${p.periode.slice(0, 4)}` : p.label

// ── Sparkline Valorisation : colonnes verticales, dernière ink
export function StockSparklineChart({ series }: { series: StockPoint[] }) {
  const data = useMemo(
    () =>
      series.map((pt, i) => ({
        key: pt.periode,
        label: pt.periode,
        valeur: pt.valeur,
        _fill: i === series.length - 1 ? '#222222' : '#dddddd',
        _x: pt.periode,
      })),
    [series]
  )

  const def = useMemo(() => {
    if (data.length === 0) return null
    return defineChart({
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
    <div
      className="mt-5"
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
    >
      <Chart
        definition={def}
        ariaLabel="Valorisation du stock — sparkline"
        height={56}
        className="w-full"
        style={{ width: '100%' }}
      />
      <div className="mt-1 flex justify-between font-mono text-[8.5px] text-muted-foreground/70">
        <span>{series[0] ? periodDated(series[0]) : null}</span>
        <span>{series[series.length - 1] ? periodDated(series[series.length - 1]) : null}</span>
      </div>
    </div>
  )
}

// ── Pills h-2 : libellé 1:1 au-dessus de sa barre — div simple (proportion exacte)
//    On garde TanStack pour la sparkline (vrai graphe) ; les pills sont des barres
//    mono-dimensionnelles où un div width% est plus fiable que barX (évite l'effet
//    lentille + domaine partagé). Le rendu reste identique à la maquette.

type ChargeRow = { code: string; label: string; heures: number }
type ProfRow = { id: string; label: string; nbLignes: number; heures: number }
type CatRow = { categorie: string; valeur: number; part: number }

function Pill({ value, max, fill }: { value: number; max: number; fill: string }) {
  const pct = Math.max(3, (value / Math.max(1, max)) * 100)
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full"
        style={
          {
            width: `${pct}%`,
            background: fill,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          } as React.CSSProperties
        }
      />
    </div>
  )
}

export function ChargeBars({ postes }: { postes: ChargeRow[] }) {
  const max = useMemo(() => Math.max(1, ...postes.map((p) => p.heures)), [postes])
  if (postes.length === 0) return null
  return (
    <div className="flex flex-col gap-3.5">
      {postes.map((p, i) => (
        <div key={p.code}>
          <div className="mb-[5px] flex items-baseline justify-between gap-2">
            <span
              className="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground"
              title={p.label}
            >
              {p.code}
              {p.label ? ` · ${p.label}` : ''}
            </span>
            <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
              {p.heures} h
            </span>
          </div>
          <Pill
            value={p.heures}
            max={max}
            fill={BAR_PALETTE[Math.min(i, BAR_PALETTE.length - 1)]!}
          />
        </div>
      ))}
    </div>
  )
}

export function ProfondeurBars({ buckets }: { buckets: ProfRow[] }) {
  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.heures)), [buckets])
  if (buckets.length === 0) return null
  return (
    <div className="flex flex-col gap-3.5">
      {buckets.map((b, i) => (
        <div key={b.id}>
          <div className="mb-[5px] flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground">
              {b.label}
              <span className="ml-1.5 font-normal text-muted-foreground">
                · {b.nbLignes} ligne{b.nbLignes > 1 ? 's' : ''}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
              {b.heures} h
            </span>
          </div>
          <Pill
            value={b.heures}
            max={max}
            fill={BAR_PALETTE[Math.min(i, BAR_PALETTE.length - 1)]!}
          />
        </div>
      ))}
    </div>
  )
}

export function CategoriesBars({ categories }: { categories: CatRow[] }) {
  const max = useMemo(() => Math.max(1, ...categories.map((c) => c.valeur)), [categories])
  if (categories.length === 0) return null
  return (
    <div className="flex flex-col gap-3.5">
      {categories.map((c, i) => (
        <div key={c.categorie}>
          <div className="mb-[5px] flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground">
              {c.categorie}
            </span>
            <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
              {new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(c.valeur)}
              <span className="ml-1 text-[10px] text-muted-foreground/70">{c.part}%</span>
            </span>
          </div>
          <Pill
            value={c.valeur}
            max={max}
            fill={BAR_PALETTE[Math.min(i, BAR_PALETTE.length - 1)]!}
          />
        </div>
      ))}
    </div>
  )
}

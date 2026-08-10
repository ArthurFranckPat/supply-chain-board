import { useMemo } from 'react'

import { barX, barY, defineChart } from '@tanstack/charts'
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

// ── Barres horizontales génériques (pill arrondi)
type HBarItem = { label: string; heures: number; subLabel?: string }

function HBarChart({
  items,
  ariaLabel,
  palette,
  valueSuffix = ' h',
}: {
  items: HBarItem[]
  ariaLabel: string
  palette: readonly string[]
  valueSuffix?: string
}) {
  const data = useMemo(
    () =>
      items.map((it, i) => ({
        _y: it.label,
        _x: it.heures,
        _fill: palette[Math.min(i, palette.length - 1)] ?? palette[palette.length - 1],
        _label: it.label,
        _heures: it.heures,
      })),
    [items, palette]
  )

  const max = useMemo(() => Math.max(1, ...items.map((i) => i.heures)), [items])

  const def = useMemo(() => {
    if (data.length === 0) return null
    return defineChart({
      marks: [
        barX(data, {
          x: '_x',
          y: '_y',
          fill: (d: (typeof data)[number]) => d._fill,
          radius: 4,
          inset: 0,
          maxThickness: 10,
        }),
      ],
      x: {
        scale: () => scaleLinear().domain([0, max]).nice(2),
        grid: false,
        axis: false,
      },
      y: {
        scale: () =>
          scaleBand<string>()
            .domain(data.map((d) => d._y))
            .padding(0.28),
        axis: false,
      },
      tooltip,
    })
  }, [data, max])

  const h = Math.max(32, data.length * 30)

  if (items.length === 0 || !def) return null

  return (
    <div
      className="mt-1 overflow-hidden rounded-[6px]"
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
    >
      <Chart
        definition={def}
        ariaLabel={ariaLabel}
        height={h}
        className="w-full"
        style={{ width: '100%' }}
      />
      <span className="sr-only">
        {items.map((it) => `${it.label} ${it.heures}${valueSuffix}`).join(', ')}
      </span>
    </div>
  )
}

// ── Charge en retard (par poste)
export function ChargeBars({
  postes,
}: {
  postes: { code: string; label: string; heures: number }[]
}) {
  const items: HBarItem[] = useMemo(
    () =>
      postes.map((p) => ({
        label: p.label ? `${p.code} · ${p.label}` : p.code,
        heures: p.heures,
      })),
    [postes]
  )
  return <HBarChart items={items} ariaLabel="Charge en retard par poste" palette={BAR_PALETTE} />
}

// ── Profondeur (buckets)
export function ProfondeurBars({
  buckets,
}: {
  buckets: { id: string; label: string; nbLignes: number; heures: number }[]
}) {
  const items: HBarItem[] = useMemo(
    () =>
      buckets.map((b) => ({
        label: `${b.label} · ${b.nbLignes} ligne${b.nbLignes > 1 ? 's' : ''}`,
        heures: b.heures,
      })),
    [buckets]
  )
  return <HBarChart items={items} ariaLabel="Profondeur de retard" palette={BAR_PALETTE} />
}

// ── Top catégories valorisation
export function CategoriesBars({
  categories,
}: {
  categories: { categorie: string; valeur: number; part: number }[]
}) {
  const items: HBarItem[] = useMemo(
    () =>
      categories.map((c) => ({
        label: c.categorie,
        heures: c.valeur,
      })),
    [categories]
  )
  return (
    <HBarChart
      items={items}
      ariaLabel="Top catégories valorisation"
      palette={BAR_PALETTE}
      valueSuffix=" €"
    />
  )
}

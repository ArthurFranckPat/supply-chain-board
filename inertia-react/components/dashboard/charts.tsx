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

// ── Une barre fine pill (8× ∞) — un Chart par ligne garantit alignement libellé↔barre
function RowBar({ value, max, fill }: { value: number; max: number; fill: string }) {
  const data = useMemo(() => [{ y: 'r', x: value }], [value])
  const def = useMemo(
    () =>
      defineChart({
        marks: [
          barX(data, {
            x: 'x',
            y: 'y',
            fill,
            radius: 999,
            inset: 0,
          }),
        ],
        x: {
          scale: () => scaleLinear().domain([0, Math.max(1, max)]),
          grid: false,
          axis: false,
        },
        y: {
          scale: () => scaleBand<string>().domain(['r']).padding(0),
          axis: false,
        },
        tooltip,
      }),
    [data, fill, max]
  )
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-secondary"
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
    >
      <Chart
        definition={def}
        ariaLabel={`${value}`}
        height={8}
        className="w-full"
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  )
}

// ── Barres horizontales génériques : libellé au-dessus de chaque barre (aligné 1:1)
type HBarItem = { label: string; heures: number }

function HBarList({ items, palette }: { items: HBarItem[]; palette: readonly string[] }) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.heures)), [items])
  if (items.length === 0) return null
  return (
    <div className="mt-2 flex flex-col gap-3.5">
      {items.map((it, i) => (
        <div key={it.label}>
          <div className="mb-1 hidden" aria-hidden />
          <RowBar value={it.heures} max={max} fill={palette[Math.min(i, palette.length - 1)]!} />
        </div>
      ))}
    </div>
  )
}

// Les libellés (code·label + heures) sont déjà rendus par le parent dashboard.tsx
// juste au-dessus de ce composant, dans le même ordre. On ne les duplique pas ici
// pour éviter double-lecture ; HBarList ne rend que les barres, alignées par index.
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
  return <HBarList items={items} palette={BAR_PALETTE} />
}

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
  return <HBarList items={items} palette={BAR_PALETTE} />
}

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
  return <HBarList items={items} palette={BAR_PALETTE} />
}

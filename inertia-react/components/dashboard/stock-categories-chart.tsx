import { useEffect, useMemo, useRef, useState } from 'react'

import { RULE_SOFT } from '@r/lib/load/chart-math'
import { cn } from '@r/lib/utils'

/**
 * Évolution de la valorisation du stock, une courbe par catégorie.
 *
 * La carte « Stock » ne pouvait lire qu'une photo : la sparkline du total, puis
 * la répartition par catégorie d'UNE période cliquée. Ce graphe lit la même
 * donnée dans l'autre sens — chaque catégorie est suivie dans le temps — ce que
 * le top 5 par période de `StockValuationPoint.categories` ne permettait pas
 * (les rangs changent d'une période à l'autre). La matière vient de
 * `StockValuationKpi.categoriesEvolution`, alignée sur toutes les périodes.
 *
 * SVG inline, comme StockSparkline et DetailChart : la branche n'a pas de
 * librairie de graphes. Géométrie mesurée (ResizeObserver) et viewBox calé sur
 * la taille réelle — pas de `preserveAspectRatio` qui étirerait traits et
 * textes.
 */

export interface StockCategoriesSerie {
  categorie: string
  couleur: string
  /** Valeur (€) de fin de période, alignée sur `periods` (même ordre/longueur). */
  valeurs: number[]
}

interface StockCategoriesChartProps {
  periods: { periode: string; label: string }[]
  series: StockCategoriesSerie[]
  /** Hauteur de repli (et hauteur fixe hors plein écran). */
  hauteur?: number
  /** Plein écran : la carte est une colonne flex, le graphe prend la place libre. */
  remplir?: boolean
}

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const nfEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Euros compacts pour l'axe : « 1,2 M€ », « 340 k€ ». */
function fmtEuroCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${nf1.format(v / 1_000_000)} M€`
  if (abs >= 1_000) return `${nf0.format(v / 1_000)} k€`
  return `${nf0.format(v)} €`
}

/** « S26 2025 » en maille semaine, sinon le libellé fourni (« janv. 26 »). */
function periodLabel(periode: string, label: string): string {
  return periode.includes('-W') ? `S${periode.slice(-2)} ${periode.slice(0, 4)}` : label
}

export function StockCategoriesChart({
  periods,
  series,
  hauteur = 200,
  remplir = false,
}: StockCategoriesChartProps) {
  const padL = 52
  const padR = 14
  const padT = 12
  const padB = 26

  const wrapRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 320, h: hauteur })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDim({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const geom = useMemo(() => {
    const W = dim.w
    const H = dim.h
    const cw = Math.max(1, W - padL - padR)
    const ch = Math.max(1, H - padT - padB)
    const n = periods.length || 1

    const maxV = Math.max(0, ...series.flatMap((s) => s.valeurs)) * 1.08 || 1

    const slot = cw / n
    const x = (i: number) => padL + slot * i + slot / 2
    const y = (v: number) => padT + ch - (v / maxV) * ch

    const grid = [0, 1, 2, 3, 4].map((g) => {
      const val = (maxV * g) / 4
      return { y: y(val), label: fmtEuroCompact(val) }
    })

    const paths = series.map((s) => ({
      categorie: s.categorie,
      couleur: s.couleur,
      d: s.valeurs
        .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v ?? 0).toFixed(1)}`)
        .join(' '),
      // Dernier point : un repère pour « où on en est ».
      lastX: x(Math.min(s.valeurs.length, n) - 1),
      lastY: y(s.valeurs[s.valeurs.length - 1] ?? 0),
    }))

    // Gradue l'axe des périodes : au plus ~7 libellés, toujours le dernier.
    const step = Math.max(1, Math.ceil(n / 7))
    const xLabels = periods
      .map((p, i) => ({ i, text: periodLabel(p.periode, p.label) }))
      .filter(({ i }) => i % step === 0 || i === n - 1)

    return { W, H, cw, ch, x, y, grid, paths, xLabels, slot }
  }, [dim.w, dim.h, periods, series])

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current
    if (!el || periods.length === 0) return
    const r = el.getBoundingClientRect()
    const px = e.clientX - r.left
    const idx = Math.floor((px - padL) / (geom.slot || 1))
    setHoverIndex(Math.max(0, Math.min(periods.length - 1, idx)))
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  if (periods.length === 0 || series.length === 0) {
    return (
      <p className="mt-4 font-fraunces text-[13px] italic text-muted-foreground">
        Aucune catégorie à afficher.
      </p>
    )
  }

  const hoverPeriod = hoverIndex !== null ? periods[hoverIndex] : null
  const hoverValeurs =
    hoverIndex !== null
      ? series
          .map((s) => ({
            categorie: s.categorie,
            couleur: s.couleur,
            valeur: s.valeurs[hoverIndex] ?? 0,
          }))
          .sort((a, b) => b.valeur - a.valeur)
      : []
  const hoverTotal = hoverValeurs.reduce((s, v) => s + v.valeur, 0)

  return (
    <div
      ref={wrapRef}
      className={cn('relative mt-4', remplir && 'min-h-0 flex-1')}
      style={remplir ? undefined : { height: `${hauteur}px` }}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg
        viewBox={`0 0 ${geom.W} ${geom.H}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        role="img"
        aria-label={`Évolution de la valorisation du stock par catégorie — ${series.length} catégorie${series.length > 1 ? 's' : ''}`}
        style={
          { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties
        }
      >
        {/* Grille + axe Y */}
        {geom.grid.map((g, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={padL}
              x2={geom.W - padR}
              y1={g.y}
              y2={g.y}
              stroke={RULE_SOFT}
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={g.y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-muted-foreground)"
              className="font-mono"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Repère vertical de la période survolée */}
        {hoverIndex !== null && (
          <line
            x1={geom.x(hoverIndex)}
            x2={geom.x(hoverIndex)}
            y1={padT}
            y2={padT + geom.ch}
            stroke="var(--color-foreground)"
            strokeOpacity="0.25"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Une courbe par catégorie */}
        {geom.paths.map((p) => (
          <path
            key={p.categorie}
            d={p.d}
            fill="none"
            stroke={p.couleur}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Dernier point de chaque courbe */}
        {geom.paths.map((p) => (
          <circle
            key={`last-${p.categorie}`}
            cx={p.lastX}
            cy={p.lastY}
            r="2.5"
            fill={p.couleur}
            stroke="var(--color-card)"
            strokeWidth="1"
          />
        ))}

        {/* Survol : pastille sur chaque courbe */}
        {hoverIndex !== null &&
          geom.paths.map((p, i) => (
            <circle
              key={`hover-${p.categorie}`}
              cx={geom.x(hoverIndex)}
              cy={geom.y(series[i].valeurs[hoverIndex] ?? 0)}
              r="3.5"
              fill={p.couleur}
              stroke="var(--color-card)"
              strokeWidth="1.5"
            />
          ))}

        {/* Libellés X */}
        {geom.xLabels.map(({ i, text }) => (
          <text
            key={`xlbl-${i}`}
            x={geom.x(i)}
            y={geom.H - padB + 16}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-muted-foreground)"
            className="font-mono"
          >
            {text}
          </text>
        ))}
      </svg>

      {/* Tooltip : toutes les catégories affichées à la période survolée */}
      {hoverPeriod && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-rule bg-card px-3 py-2 shadow-float"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            transform: 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {periodLabel(hoverPeriod.periode, hoverPeriod.label)}
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {hoverValeurs.map((v) => (
              <div key={v.categorie} className="flex items-center gap-2">
                <span
                  className="size-2.5 flex-none rounded-[2px]"
                  style={{ background: v.couleur }}
                />
                <span
                  className={cn(
                    'font-mono text-[11px]',
                    v.valeur === 0 ? 'text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {v.categorie}
                </span>
                <span className="ml-2 font-mono text-[11px] font-bold tabular-nums text-foreground">
                  {nfEuro.format(v.valeur)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 border-t border-rule-soft pt-1 font-mono text-[10.5px] text-muted-foreground">
            total {nfEuro.format(hoverTotal)}
          </div>
        </div>
      )}
    </div>
  )
}

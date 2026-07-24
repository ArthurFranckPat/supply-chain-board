import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleX, Package, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'

/**
 * Sheet « Détail article » du KPI Stock par article (dashboard) : historique
 * hebdomadaire sur 52 semaines glissantes — courbe du stock fin de semaine +
 * barres miroir des entrées/sorties, bascule qté/€. La donnée vient de
 * GET /api/v1/dashboard/stock/article (rembobinage STOJOU depuis le stock
 * actuel, cf. StockValuationRepository.getArticleStockHistory), fetchée à
 * l'ouverture — même motif que poste-engagement-sheet.
 */

interface StockHistoryPoint {
  periode: string
  label: string
  qte: number
  valeur: number
  entreeQte: number
  sortieQte: number
  entreeVal: number
  sortieVal: number
}

interface StockArticleDetail {
  article: string
  designation: string
  categorie: string
  stock: number
  pmp: number
  valeur: number
  grain: 'semaine'
  series: StockHistoryPoint[]
}

interface StockArticleDetailResponse {
  detail: StockArticleDetail | null
  x3Error: string | null
}

type Unit = 'qte' | 'valeur'

interface StockArticleSheetProps {
  /** Article ouvert (null = fermé). */
  article: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

/** Palette Airbnb stricte — cohérente avec le KPI stock (dashboard.tsx). Le
 *  ink vient du thème (foreground) pour rester lisible en sombre. */
const COL_STOCK = 'var(--color-foreground)'
const COL_ENTREE = '#00a699'
const COL_SORTIE = '#ff385c'

const fmtQty = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtQtyDec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const fmtEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Compact pour les axes : 1,2 M€ / 450 k€ / 123 €. */
const fmtEuroCompact = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M€`
  if (abs >= 1_000) return `${Math.round(v / 1_000)} k€`
  return `${Math.round(v)} €`
}

const fmtAxis = (v: number, unit: Unit): string =>
  unit === 'valeur' ? fmtEuroCompact(v) : fmtQty.format(v)

const fmtVal = (v: number, unit: Unit): string =>
  unit === 'valeur' ? fmtEuro.format(v) : fmtQtyDec.format(v)

/** Ratio (0.123) → « 12,3 % ». */
const fmtPct = (v: number): string =>
  `${(Math.round(v * 1000) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '')} %`

/** Graphe stock + flux : courbe du stock fin de semaine (bande haute, axe
 *  gauche) et barres miroir des entrées/sorties (bande basse). SVG inline
 *  responsive (ResizeObserver), légende dessinée dans le graphe. */
function HistoryChart({ series, unit }: { series: StockHistoryPoint[]; unit: Unit }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 900, h: 300 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setDim({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geom = useMemo(() => {
    const W = dim.w
    const H = dim.h
    const padL = 46
    const padR = 14
    const padT = 30 // bande haute réservée à la légende
    const padB = 22
    const innerW = Math.max(10, W - padL - padR)
    const innerH = Math.max(10, H - padT - padB)

    const n = series.length || 1
    const slot = innerW / n
    const x = (i: number) => padL + (i + 0.5) * slot

    const lineVal = (p: StockHistoryPoint) => (unit === 'qte' ? p.qte : p.valeur)
    const inVal = (p: StockHistoryPoint) => (unit === 'qte' ? p.entreeQte : p.entreeVal)
    const outVal = (p: StockHistoryPoint) => (unit === 'qte' ? p.sortieQte : p.sortieVal)

    const lineMax = Math.max(1, ...series.map(lineVal)) * 1.08
    const flowMax = Math.max(1, ...series.map((p) => Math.max(inVal(p), outVal(p))))

    // Courbe : 62 % du haut ; flux : axe miroir à 80 %, amplitude ±17 %.
    const lineBase = padT + innerH * 0.62
    const flowAxis = padT + innerH * 0.8
    const flowAmp = innerH * 0.17

    const yLine = (v: number) => lineBase - (v / lineMax) * (lineBase - padT)

    let linePath = ''
    let areaPath = ''
    if (series.length > 0) {
      const pts = series.map((p, i) => `${x(i)},${yLine(lineVal(p))}`)
      linePath = `M ${pts.join(' L ')}`
      areaPath = `${linePath} L ${x(series.length - 1)},${lineBase} L ${x(0)},${lineBase} Z`
    }

    const barW = Math.max(1.5, slot * 0.58)
    const tickStep = Math.max(1, Math.ceil(n / 7))

    return {
      W,
      H,
      padL,
      padR,
      padT,
      padB,
      innerH,
      slot,
      x,
      lineVal,
      inVal,
      outVal,
      lineMax,
      flowMax,
      lineBase,
      flowAxis,
      flowAmp,
      yLine,
      linePath,
      areaPath,
      barW,
      tickStep,
    }
  }, [dim, series, unit])

  const lastIdx = series.length - 1

  return (
    <div ref={wrapRef} className="h-full w-full">
      <svg viewBox={`0 0 ${geom.W} ${geom.H}`} className="block h-full w-full">
        {/* Légende — dans le graphe, attachée à ce qu'elle décrit (convention
            DetailChart). Décalages mono 9.5px (~5,7 px/caractère). */}
        <g fontFamily="var(--font-mono)" fontSize={9.5} fontWeight={600}>
          <line
            x1={geom.padL}
            y1={14}
            x2={geom.padL + 14}
            y2={14}
            stroke={COL_STOCK}
            strokeWidth={1.5}
          />
          <text x={geom.padL + 20} y={17} fill="var(--color-muted-foreground)">
            Stock fin de semaine
          </text>
          <rect x={geom.padL + 144} y={10} width={8} height={8} rx={1} fill={COL_ENTREE} />
          <text x={geom.padL + 156} y={17} fill="var(--color-muted-foreground)">
            Entrées
          </text>
          <rect x={geom.padL + 206} y={10} width={8} height={8} rx={1} fill={COL_SORTIE} />
          <text x={geom.padL + 218} y={17} fill="var(--color-muted-foreground)">
            Sorties
          </text>
          {/* Plage couverte, à droite */}
          {series.length > 0 && (
            <text
              x={geom.W - geom.padR}
              y={17}
              textAnchor="end"
              fill="var(--color-muted-foreground)"
              opacity={0.75}
            >
              {series[0].label} → {series[lastIdx].label}
            </text>
          )}
        </g>

        {/* Grille + axe gauche (échelle du stock) */}
        <g fontFamily="var(--font-mono)" fontSize={9} fontWeight={600}>
          {[0, 0.5, 1].map((t) => {
            const y = geom.yLine(geom.lineMax * t)
            return (
              <g key={t}>
                <line
                  x1={geom.padL}
                  y1={y}
                  x2={geom.W - geom.padR}
                  y2={y}
                  stroke="var(--color-rule-soft)"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '2 3'}
                />
                <text
                  x={geom.padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-muted-foreground)"
                >
                  {fmtAxis(geom.lineMax * t, unit)}
                </text>
              </g>
            )
          })}
        </g>

        {/* Axe miroir des flux */}
        <line
          x1={geom.padL}
          y1={geom.flowAxis}
          x2={geom.W - geom.padR}
          y2={geom.flowAxis}
          stroke="var(--color-rule-soft)"
          strokeWidth={1}
        />

        {/* Barres de flux (miroir : entrées au-dessus de l'axe, sorties en dessous) */}
        {series.map((p, i) => {
          const inn = geom.inVal(p)
          const out = geom.outVal(p)
          const hIn = (inn / geom.flowMax) * geom.flowAmp
          const hOut = (out / geom.flowMax) * geom.flowAmp
          const bx = geom.x(i) - geom.barW / 2
          return (
            <g key={p.periode}>
              {hIn > 0 && (
                <rect
                  x={bx}
                  y={geom.flowAxis - hIn}
                  width={geom.barW}
                  height={hIn}
                  rx={1}
                  fill={COL_ENTREE}
                  opacity={0.85}
                />
              )}
              {hOut > 0 && (
                <rect
                  x={bx}
                  y={geom.flowAxis}
                  width={geom.barW}
                  height={hOut}
                  rx={1}
                  fill={COL_SORTIE}
                  opacity={0.85}
                />
              )}
            </g>
          )
        })}

        {/* Courbe de stock + aire légère */}
        {series.length > 0 && (
          <>
            <path d={geom.areaPath} fill={COL_STOCK} opacity={0.06} />
            <path
              d={geom.linePath}
              fill="none"
              stroke={COL_STOCK}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dernier point marqué (semaine courante) */}
            <circle
              cx={geom.x(lastIdx)}
              cy={geom.yLine(geom.lineVal(series[lastIdx]))}
              r={3}
              fill={COL_STOCK}
            />
          </>
        )}

        {/* Labels de semaines */}
        <g fontFamily="var(--font-mono)" fontSize={9} fontWeight={600}>
          {series.map((p, i) =>
            i % geom.tickStep === 0 || i === lastIdx ? (
              <text
                key={p.periode}
                x={geom.x(i)}
                y={geom.H - geom.padB + 13}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                opacity={0.75}
              >
                {p.label}
              </text>
            ) : null
          )}
        </g>

        {/* Zones de survol (tooltip natif) — une par semaine, pleine hauteur */}
        {series.map((p, i) => (
          <rect
            key={p.periode}
            x={geom.x(i) - geom.slot / 2}
            y={geom.padT}
            width={geom.slot}
            height={geom.innerH}
            fill="transparent"
          >
            <title>
              {`${p.label} · stock ${fmtVal(geom.lineVal(p), unit)} · entrées ${fmtVal(
                geom.inVal(p),
                unit
              )} · sorties ${fmtVal(geom.outVal(p), unit)}`}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  )
}

/** Bloc métrique d'en-tête : label mono uppercase + valeur tabular. */
function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col items-end" title={title}>
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export function StockArticleSheet(props: StockArticleSheetProps) {
  const [data, setData] = useState<StockArticleDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unit, setUnit] = useState<Unit>('qte')

  // Fetch à l'ouverture + quand l'article change.
  useEffect(() => {
    if (!props.open || !props.article) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/v1/dashboard/stock/article?article=${encodeURIComponent(props.article)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<StockArticleDetailResponse>
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Échec du chargement')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.open, props.article])

  const detail = data?.detail ?? null

  // Variation sur la plage (premier → dernier point), dans l'unité active.
  const delta = useMemo(() => {
    if (!detail || detail.series.length < 2) return null
    const get = (p: StockHistoryPoint) => (unit === 'qte' ? p.qte : p.valeur)
    const first = get(detail.series[0])
    const last = get(detail.series[detail.series.length - 1])
    if (first === 0) return null
    return (last - first) / Math.abs(first)
  }, [detail, unit])

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        // Dimensions redéclarées en variantes `data-[side=bottom]:` : le
        // primitive porte `data-[side=bottom]:h-auto` et
        // `data-[side=bottom]:max-w-[640px]`, dont le sélecteur d'attribut bat
        // toute classe utilitaire nue (même correctif que charge-period-sheet).
        className="flex w-full flex-col gap-0 rounded-t-[16px] p-0 data-[side=bottom]:mx-0 data-[side=bottom]:h-[85vh] data-[side=bottom]:max-w-none"
      >
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <RefreshCw size={26} strokeWidth={1.75} className="animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : !data ? null : (
          <>
            {/* Barre d'identité article + métriques + bascule d'unité. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-5 py-3 pr-14">
              <Package size={18} strokeWidth={1.75} className="self-center text-brand" />
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-[13px] font-bold text-brand">
                  {detail?.article ?? props.article}
                </span>
                <SheetTitle className="truncate font-fraunces text-[14px] font-medium italic text-muted-foreground">
                  {detail?.designation || '—'}
                </SheetTitle>
              </div>
              {detail && (
                <span className="rounded border border-rule bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                  {detail.categorie}
                </span>
              )}
              <span className="flex-1" />
              {detail && (
                <div className="flex items-center gap-3">
                  <Metric label="Stock" value={fmtQtyDec.format(detail.stock)} />
                  <span className="h-6 w-px bg-border" />
                  <Metric label="PMP" value={detail.pmp.toFixed(4)} title="Prix moyen pondéré (€ / unité)" />
                  <span className="h-6 w-px bg-border" />
                  <Metric label="Valeur" value={fmtEuro.format(detail.valeur)} />
                  <span className="h-6 w-px bg-border" />
                  <Metric
                    label="Δ 12 mois"
                    value={delta === null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(delta))}`}
                    title="Variation du stock entre le premier et le dernier point affiché"
                  />
                </div>
              )}
              {/* Bascule qté/€ */}
              <div className="inline-flex rounded-full border border-rule bg-card p-[3px]">
                {(
                  [
                    ['qte', 'Qté'],
                    ['valeur', '€'],
                  ] as [Unit, string][]
                ).map(([u, label]) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                      unit === u ? 'bg-secondary text-brand' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {data.x3Error && (
              <div className="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px] text-foreground">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-brand" />
                <span className="font-mono break-all">{data.x3Error}</span>
              </div>
            )}

            {!detail || detail.series.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                <Package size={26} strokeWidth={1.75} />
                <span className="font-fraunces text-[13px] italic">
                  Aucun mouvement de stock sur 52 semaines.
                </span>
              </div>
            ) : (
              <div className="min-h-0 flex-1 px-5 pb-4 pt-2">
                <HistoryChart series={detail.series} unit={unit} />
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default StockArticleSheet

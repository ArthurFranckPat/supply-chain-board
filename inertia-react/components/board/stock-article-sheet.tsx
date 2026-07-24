import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleX, Package, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'

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

/** Point hebdomadaire de la projection (seaux S+1 … S+52). */
interface StockFuturePoint {
  periode: string
  label: string
  besoinQte: number
  besoinVal: number
  ressourceQte: number
  ressourceVal: number
  stockQte: number // stock projeté fin de semaine (borné ≥ 0)
  stockVal: number
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
  future: StockFuturePoint[]
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
/** PMP : 4 décimales, virgule décimale (toFixed donnerait un point). */
const fmtPmp = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
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

/** La clé `periode` (« 2025-W26 ») porte l'année ISO — on l'extrait pour dater
 *  chaque mention de semaine (axe, tooltip, plage affichée). */
const weekYear = (periode: string) => periode.slice(0, 4)
const weekNo = (periode: string) => periode.slice(-2)
const fmtWeekAxis = (p: { periode: string }) => `S${weekNo(p.periode)} ${weekYear(p.periode)}`
const fmtWeekFull = (p: { periode: string }) =>
  `Semaine ${weekNo(p.periode)} · ${weekYear(p.periode)}`

/** Ligne du tooltip : pastille (trait pour la courbe, carré pour les barres),
 *  label mono uppercase, valeur tabular alignée à droite. */
function TooltipRow({
  swatch = 'square',
  color,
  label,
  value,
  strong,
}: {
  swatch?: 'square' | 'line'
  color: string
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'shrink-0',
          swatch === 'line' ? 'h-[2px] w-3 rounded-full' : 'size-2 rounded-[2px]'
        )}
        style={{ background: color }}
      />
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'ml-auto pl-4 font-mono text-[11px] tabular-nums',
          strong ? 'font-bold text-foreground' : 'text-secondary-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Valeurs lues par le graphe selon l'unité active. */
const lineValOf = (p: StockHistoryPoint, unit: Unit) => (unit === 'qte' ? p.qte : p.valeur)
const inValOf = (p: StockHistoryPoint, unit: Unit) => (unit === 'qte' ? p.entreeQte : p.entreeVal)
const outValOf = (p: StockHistoryPoint, unit: Unit) => (unit === 'qte' ? p.sortieQte : p.sortieVal)

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Interpole les valeurs TRACÉES (fractions 0-1 de leur échelle) vers leur
 * cible — easeOutCubic ~450 ms, requestAnimationFrame.
 *
 * Les échelles restent calculées sur les valeurs cibles (axes stables) ; seule
 * la géométrie s'anime. Deux effets : à l'arrivée, courbe et barres montent
 * depuis leur ligne de base ; au changement d'article, l'ancienne forme MORPHE
 * vers la nouvelle au lieu de disparaître. Saut direct si
 * prefers-reduced-motion.
 */
function useAnimatedFracs(target: number[][]): number[][] {
  const [display, setDisplay] = useState<number[][]>(() =>
    REDUCED_MOTION ? target : target.map((t) => t.map(() => 0))
  )
  const displayRef = useRef(display)
  displayRef.current = display

  useEffect(() => {
    if (REDUCED_MOTION) {
      setDisplay(target)
      return
    }
    const from = displayRef.current
    // Longueurs différentes (cas théorique) : on repart de la ligne de base.
    const start = from.length === target.length ? from : target.map((t) => t.map(() => 0))
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 450)
      const e = 1 - Math.pow(1 - k, 3)
      setDisplay(
        target.map((tv, i) => tv.map((v, j) => (start[i]?.[j] ?? 0) + (v - (start[i]?.[j] ?? 0)) * e))
      )
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return display
}

/** Graphe stock + flux : courbe du stock fin de semaine (bande haute, axe
 *  gauche) et barres miroir des entrées/sorties (bande basse). SVG inline
 *  responsive (ResizeObserver), légende dessinée dans le graphe. Le guide de
 *  survol et le point de lecture glissent en transition CSS ; le tooltip
 *  (HTML) suit l'unité active et les valeurs animées. */
function HistoryChart({ series, unit }: { series: StockHistoryPoint[]; unit: Unit }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 900, h: 300 })
  // Semaine survolée (index dans `series`) — null = aucun. Remis à zéro quand
  // la série change (autre article) pour éviter un index hors bornes.
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => setHover(null), [series])
  // Dernier index survolé : le tooltip reste positionné pendant son fondu.
  const lastHoverRef = useRef(0)
  if (hover !== null) lastHoverRef.current = hover

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

  // ----- Échelles stables (valeurs cibles) + géométrie animée (fractions) -----
  const targets = useMemo(
    () => series.map((p) => [lineValOf(p, unit), inValOf(p, unit), outValOf(p, unit)]),
    [series, unit]
  )
  const lineMax = useMemo(() => Math.max(1, ...targets.map((t) => t[0])) * 1.08, [targets])
  const flowMax = useMemo(
    () => Math.max(1, ...targets.map((t) => Math.max(t[1], t[2]))),
    [targets]
  )
  const targetFracs = useMemo(
    () => targets.map((t) => [t[0] / lineMax, t[1] / flowMax, t[2] / flowMax]),
    [targets, lineMax, flowMax]
  )
  const fracs = useAnimatedFracs(targetFracs)

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

    // Courbe : 62 % du haut ; flux : axe miroir à 80 %, amplitude ±17 %.
    const lineBase = padT + innerH * 0.62
    const flowAxis = padT + innerH * 0.8
    const flowAmp = innerH * 0.17

    // La géométrie lit les FRACTIONS animées (0-1), pas les valeurs brutes :
    // c'est ce qui donne la montée à l'arrivée et le morphing entre articles.
    const yLine = (frac: number) => lineBase - frac * (lineBase - padT)

    let linePath = ''
    let areaPath = ''
    if (fracs.length > 0) {
      const pts = fracs.map((f, i) => `${x(i)},${yLine(f[0] ?? 0)}`)
      linePath = `M ${pts.join(' L ')}`
      areaPath = `${linePath} L ${x(fracs.length - 1)},${lineBase} L ${x(0)},${lineBase} Z`
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
      lineBase,
      flowAxis,
      flowAmp,
      yLine,
      linePath,
      areaPath,
      barW,
      tickStep,
    }
  }, [dim, fracs, series.length])

  const lastIdx = series.length - 1

  // Index lu par le tooltip : le dernier survolé tant que la souris est partie
  // (le fondu de sortie reste positionné au bon endroit).
  const hi = hover ?? lastHoverRef.current
  const hPoint = series[hi]
  const hFrac = fracs[hi] ?? [0, 0, 0]

  // Position du tooltip : ancré à la semaine lue, retourné près des bords pour
  // rester dans le panneau. Le viewBox du SVG vaut les pixels mesurés du
  // conteneur (rapport 1:1) — les coordonnées SVG sont des CSS pixels.
  const tooltipStyle = hPoint
    ? (() => {
        const x = geom.x(hi)
        const nearRight = x > geom.W - 120
        const nearLeft = x < 120
        return {
          left: nearRight ? x - 10 : nearLeft ? x + 10 : x,
          transform: nearRight ? 'translateX(-100%)' : nearLeft ? undefined : 'translateX(-50%)',
        }
      })()
    : undefined

  // Valeurs affichées dans le tooltip = fractions animées × échelles : les
  // chiffres « montent » avec la courbe à l'arrivée.
  const hLineVal = hFrac[0] * lineMax
  const hInVal = hFrac[1] * flowMax
  const hOutVal = hFrac[2] * flowMax

  const lastFrac = fracs[lastIdx] ?? [0, 0, 0]

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${geom.W} ${geom.H}`}
        className="block h-full w-full"
        onMouseLeave={() => setHover(null)}
      >
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
              {fmtWeekAxis(series[0])} → {fmtWeekAxis(series[lastIdx])}
            </text>
          )}
        </g>

        {/* Grille + axe gauche (échelle du stock) */}
        <g fontFamily="var(--font-mono)" fontSize={9} fontWeight={600}>
          {[0, 0.5, 1].map((t) => {
            const y = geom.yLine(t)
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
                  {fmtAxis(lineMax * t, unit)}
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

        {/* Barres de flux (miroir : entrées au-dessus de l'axe, sorties en
            dessous). Hauteurs lues sur les fractions animées — elles poussent
            depuis l'axe à l'arrivée. */}
        {series.map((p, i) => {
          const f = fracs[i] ?? [0, 0, 0]
          const hIn = (f[1] ?? 0) * geom.flowAmp
          const hOut = (f[2] ?? 0) * geom.flowAmp
          const bx = geom.x(i) - geom.barW / 2
          const op = hover === null || hover === i ? 0.85 : 0.4
          return (
            <g key={p.periode}>
              {hIn > 0.25 && (
                <rect
                  x={bx}
                  y={geom.flowAxis - hIn}
                  width={geom.barW}
                  height={hIn}
                  rx={1}
                  fill={COL_ENTREE}
                  opacity={op}
                  style={{ transition: 'opacity 160ms ease-out' }}
                />
              )}
              {hOut > 0.25 && (
                <rect
                  x={bx}
                  y={geom.flowAxis}
                  width={geom.barW}
                  height={hOut}
                  rx={1}
                  fill={COL_SORTIE}
                  opacity={op}
                  style={{ transition: 'opacity 160ms ease-out' }}
                />
              )}
            </g>
          )
        })}

        {/* Courbe de stock + aire en dégradé (profondeur sans bruit) */}
        {series.length > 0 && (
          <>
            <defs>
              <linearGradient id="stock-history-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: COL_STOCK, stopOpacity: 0.16 }} />
                <stop offset="100%" style={{ stopColor: COL_STOCK, stopOpacity: 0.01 }} />
              </linearGradient>
            </defs>
            <path d={geom.areaPath} fill="url(#stock-history-area)" />
            <path
              d={geom.linePath}
              fill="none"
              stroke={COL_STOCK}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Semaine courante : point plein + halo pulsé (SMIL, coupé si
                prefers-reduced-motion) */}
            <circle
              cx={geom.x(lastIdx)}
              cy={geom.yLine(lastFrac[0] ?? 0)}
              r={3}
              fill={COL_STOCK}
            />
            {!REDUCED_MOTION && (
              <circle
                cx={geom.x(lastIdx)}
                cy={geom.yLine(lastFrac[0] ?? 0)}
                r={3}
                fill="none"
                stroke={COL_STOCK}
                strokeWidth={1}
              >
                <animate attributeName="r" values="3;9" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.35;0" dur="2.4s" repeatCount="indefinite" />
              </circle>
            )}
          </>
        )}

        {/* Labels de semaines (année ISO incluse — les 53 points chevauchent
            deux années) */}
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
                {fmtWeekAxis(p)}
              </text>
            ) : null
          )}
        </g>

        {/* Zones de survol — une par semaine, pleine hauteur. Pilotent le
            tooltip HTML (rendu hors SVG, cf. plus bas). */}
        {series.map((p, i) => (
          <rect
            key={p.periode}
            x={geom.x(i) - geom.slot / 2}
            y={geom.padT}
            width={geom.slot}
            height={geom.innerH}
            fill="transparent"
            className="cursor-crosshair"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* Indicateur de survol : guide vertical + point de lecture. Rendus
            dans des groupes translatés en CSS (transition sur transform) pour
            glisser de semaine en semaine au lieu de sauter. */}
        {hover !== null && series[hover] && (
          <>
            <g
              pointerEvents="none"
              style={{
                transform: `translate(${geom.x(hover)}px, 0px)`,
                transition: 'transform 170ms cubic-bezier(0.2, 0.7, 0.2, 1)',
              }}
            >
              <line
                x1={0}
                x2={0}
                y1={geom.padT}
                y2={geom.padT + geom.innerH}
                stroke="var(--color-foreground)"
                opacity={0.28}
                strokeDasharray="3 3"
              />
            </g>
            <g
              pointerEvents="none"
              style={{
                transform: `translate(${geom.x(hover)}px, ${geom.yLine((fracs[hover] ?? [0])[0] ?? 0)}px)`,
                transition: 'transform 170ms cubic-bezier(0.2, 0.7, 0.2, 1)',
              }}
            >
              <circle r={4.5} fill={COL_STOCK} stroke="var(--color-card)" strokeWidth={2} />
            </g>
          </>
        )}
      </svg>

      {/* Tooltip — HTML plutôt que <title> natif : lecture instantanée, mis en
          page, suit l'unité active et les valeurs animées. Toujours monté dès
          qu'il y a une série : il glisse entre semaines (left/transform) et
          apparaît/disparaît en fondu (opacity). */}
      {hPoint && (
        <div
          className={cn(
            'pointer-events-none absolute top-8 z-10 min-w-[10.5rem] rounded-md border border-rule bg-popover px-3 py-2 shadow-float transition-[left,transform,opacity] duration-150 ease-out',
            hover === null && 'opacity-0'
          )}
          style={tooltipStyle}
        >
          <div className="mb-1.5 font-mono text-[10px] font-bold tracking-wide text-foreground">
            {fmtWeekFull(hPoint)}
          </div>
          <div className="space-y-1">
            <TooltipRow
              swatch="line"
              color={COL_STOCK}
              label="Stock"
              value={fmtVal(hLineVal, unit)}
              strong
            />
            <TooltipRow color={COL_ENTREE} label="Entrées" value={`+ ${fmtVal(hInVal, unit)}`} />
            <TooltipRow color={COL_SORTIE} label="Sorties" value={`− ${fmtVal(hOutVal, unit)}`} />
          </div>
        </div>
      )}
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

  // Variation sur la plage, dans l'unité active. Base = première semaine non
  // nulle (pas le premier point brut : les semaines à 0 en bord de fenêtre —
  // article démarré en cours d'année, ou artefact de réconciliation borné par
  // le plancher — feraient disparaître la tendance à tort).
  const delta = useMemo(() => {
    if (!detail || detail.series.length < 2) return null
    const get = (p: StockHistoryPoint) => (unit === 'qte' ? p.qte : p.valeur)
    const base = detail.series.map(get).find((v) => v > 0)
    if (base === undefined) return null
    const last = get(detail.series[detail.series.length - 1])
    return (last - base) / base
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
          <LoadingState
            title="Chargement du stock..."
            description="Calcul des mouvements et projections de stock"
          />
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
                  <Metric label="PMP" value={fmtPmp.format(detail.pmp)} title="Prix moyen pondéré (€ / unité)" />
                  <span className="h-6 w-px bg-border" />
                  <Metric label="Valeur" value={fmtEuro.format(detail.valeur)} />
                  <span className="h-6 w-px bg-border" />
                  <Metric
                    label="Δ 12 mois"
                    value={delta === null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(delta))}`}
                    title="Variation du stock entre la première semaine non nulle et la dernière semaine affichée"
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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarClock, CircleX, Package, ShieldCheck, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import { X3Link } from '@r/components/x3-link'

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

/** Paramètres de pilotage — tous optionnels côté X3 (fiche site ou fournisseur
 *  par défaut absents). `null` = donnée non renseignée, distinct d'un vrai 0. */
interface StockArticleLogistique {
  famille: string | null
  delaiReapproJours: number | null
  lotTechnique: number | null
  lotEconomique: number | null
  stockSecurite: number | null
  fournisseurCode: string | null
  fournisseurNom: string | null
}

/** Indicateurs dérivés de l'historique (calculés par stock_detail_loader).
 *  `null` = calcul sans objet (diviseur nul), pas « zéro ». */
interface StockArticleIndicateurs {
  sorties12m: number
  joursFenetre: number
  cmj: number | null
  couvertureJours: number | null // régime moyen passé — non affiché, cf. LogistiqueBar
  stockMoyen: number
  rotation: number | null
  couvertureProspectiveJours: number | null
  ruptureSemaine: string | null
  ruptureDateIso: string | null
  ratioProspectifDelai: number | null
}

interface StockArticleDetail {
  article: string
  designation: string
  categorie: string
  stock: number
  stockA: number
  stockQ: number
  pmp: number
  valeur: number
  logistique: StockArticleLogistique
  indicateurs: StockArticleIndicateurs
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

/** Plancher de hauteur des barres de flux, en px : un flux non nul reste
 *  visible même quand il pèse une fraction de pourcent du maximum de sa
 *  moitié. */
const MIN_BAR = 1.75

const fmtQty = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtQtyDec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const fmtEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
/** PMP : prix unitaire en euros, 4 décimales (un composant à 0,01 € doit rester
 *  distinguable d'un composant à 0,0099 €). */
const fmtPmp = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
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

/**
 * Borne d'axe « ronde » immédiatement au-dessus de `v` : 1, 2, 2,5 ou 5 × 10^k.
 * Sans ça, un maximum de 25 800 donnait une graduation à 27 865 et une médiane
 * à 13 933 — des nombres qu'on ne lit pas.
 */
const niceCeil = (v: number): number => {
  if (!Number.isFinite(v) || v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const pow = Math.pow(10, exp)
  const mant = v / pow
  const step = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 2.5 ? 2.5 : mant <= 5 ? 5 : 10
  return step * pow
}

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
        target.map((tv, i) =>
          tv.map((v, j) => (start[i]?.[j] ?? 0) + (v - (start[i]?.[j] ?? 0)) * e)
        )
      )
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return display
}

/** Point tracé — historique (stock réel + flux passés) ou futur (stock
 *  projeté + besoins/ressources). Même géométrie pour les deux moitiés :
 *  `line` = niveau de stock, `inn` = barre au-dessus de l'axe, `out` = barre
 *  en dessous. */
interface ChartPoint {
  periode: string
  kind: 'hist' | 'fut'
  line: number
  inn: number
  out: number
}

/** Graphe stock + flux sur 105 semaines : 53 semaines d'historique (courbe
 *  pleine + entrées/sorties) puis 52 semaines de projection (courbe pointillée
 *  + ressources attendues/besoins), séparées par la ligne « auj. ». SVG inline
 *  responsive (ResizeObserver), légende dessinée dans le graphe. Le guide de
 *  survol et le point de lecture glissent en transition CSS ; le tooltip
 *  (HTML) suit l'unité active, les valeurs animées, et adapte ses libellés à
 *  la moitié survolée. */
function HistoryChart({
  series,
  future,
  unit,
  rupturePeriode,
}: {
  series: StockHistoryPoint[]
  future: StockFuturePoint[]
  unit: Unit
  /** Semaine ISO de rupture calculée par le verdict — repérée sur la courbe
   *  pour relier les deux lectures. */
  rupturePeriode?: string | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 900, h: 300 })
  // Semaine survolée (index dans `points`) — null = aucun. Remis à zéro quand
  // les données changent (autre article) pour éviter un index hors bornes.
  const [hover, setHover] = useState<number | null>(null)
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

  // ----- Points combinés (historique + projection) -----
  const points = useMemo<ChartPoint[]>(() => {
    const hist: ChartPoint[] = series.map((p) => ({
      periode: p.periode,
      kind: 'hist',
      line: lineValOf(p, unit),
      inn: inValOf(p, unit),
      out: outValOf(p, unit),
    }))
    const fut: ChartPoint[] = future.map((p) => ({
      periode: p.periode,
      kind: 'fut',
      line: unit === 'qte' ? p.stockQte : p.stockVal,
      inn: unit === 'qte' ? p.ressourceQte : p.ressourceVal,
      out: unit === 'qte' ? p.besoinQte : p.besoinVal,
    }))
    return [...hist, ...fut]
  }, [series, future, unit])

  const histLen = series.length
  useEffect(() => setHover(null), [points])

  // ----- Échelles stables (valeurs cibles) + géométrie animée (fractions) -----
  const targets = useMemo(() => points.map((p) => [p.line, p.inn, p.out]), [points])
  // Borne ronde plutôt que « max × 1,08 » : elle sert de graduation lisible et
  // fournit la même marge haute.
  const lineMax = useMemo(() => niceCeil(Math.max(1, ...targets.map((t) => t[0]))), [targets])
  // Deux échelles de flux, une par moitié. Le journal de stock (mouvements
  // hebdomadaires réels : réceptions, sorties de production) et le carnet à
  // venir (demande client, besoin matière, réceptions attendues) sont deux
  // populations d'ordres de grandeur très différents — typiquement 30 000
  // pièces brassées par semaine côté passé face à 200 pièces de besoin
  // composant côté futur. Avec une échelle unique, la projection tombe sous le
  // pixel et se lit « besoins à 0 » alors que la donnée existe.
  const flowMaxHist = useMemo(
    () => Math.max(1, ...targets.slice(0, histLen).map((t) => Math.max(t[1], t[2]))),
    [targets, histLen]
  )
  const flowMaxFut = useMemo(
    () => Math.max(1, ...targets.slice(histLen).map((t) => Math.max(t[1], t[2]))),
    [targets, histLen]
  )
  const targetFracs = useMemo(
    () =>
      targets.map((t, i) => {
        const fm = i < histLen ? flowMaxHist : flowMaxFut
        return [t[0] / lineMax, t[1] / fm, t[2] / fm]
      }),
    [targets, lineMax, flowMaxHist, flowMaxFut, histLen]
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

    const n = points.length || 1
    const slot = innerW / n
    const x = (i: number) => padL + (i + 0.5) * slot

    // Courbe : 62 % du haut ; flux : axe miroir à 80 %, amplitude ±17 %.
    const lineBase = padT + innerH * 0.62
    const flowAxis = padT + innerH * 0.8
    const flowAmp = innerH * 0.17

    // La géométrie lit les FRACTIONS animées (0-1), pas les valeurs brutes :
    // c'est ce qui donne la montée à l'arrivée et le morphing entre articles.
    const yLine = (frac: number) => lineBase - frac * (lineBase - padT)

    // Courbe historique (pleine) + aire, puis projection (pointillée) qui
    // démarre du dernier point réel pour la continuité visuelle.
    let histPath = ''
    let histArea = ''
    let futPath = ''
    if (fracs.length > 0 && histLen > 0) {
      const hpts = fracs.slice(0, histLen).map((f, i) => `${x(i)},${yLine(f[0] ?? 0)}`)
      histPath = `M ${hpts.join(' L ')}`
      histArea = `${histPath} L ${x(histLen - 1)},${lineBase} L ${x(0)},${lineBase} Z`
      const fpts = fracs
        .slice(histLen - 1)
        .map((f, j) => `${x(histLen - 1 + j)},${yLine(f[0] ?? 0)}`)
      if (fpts.length > 1) futPath = `M ${fpts.join(' L ')}`
    }

    const barW = Math.max(1.5, slot * 0.58)
    const tickStep = Math.max(1, Math.ceil(n / 7))
    // Charnière passé/futur : bord gauche du premier seau futur.
    const nowX = padL + histLen * slot

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
      histPath,
      histArea,
      futPath,
      barW,
      tickStep,
      nowX,
    }
  }, [dim, fracs, points.length, histLen])

  const lastIdx = points.length - 1

  // Index lu par le tooltip : le dernier survolé tant que la souris est partie
  // (le fondu de sortie reste positionné au bon endroit).
  const hi = hover ?? lastHoverRef.current
  const hPoint = points[hi]
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
  const hFlowMax = hi < histLen ? flowMaxHist : flowMaxFut
  const hLineVal = hFrac[0] * lineMax
  const hInVal = hFrac[1] * hFlowMax
  const hOutVal = hFrac[2] * hFlowMax

  // Point « maintenant » (dernier point réel) — ancre du pulse et de la
  // charnière passé/futur.
  const nowFrac = fracs[histLen - 1] ?? [0, 0, 0]
  const hasFuture = future.length > 0

  // Index du seau de rupture dans `points` — cherché côté futur uniquement,
  // les clés de semaine ISO pouvant se répéter entre passé et projection.
  const ruptureIdx = useMemo(() => {
    if (!rupturePeriode) return null
    const i = points.findIndex((p) => p.kind === 'fut' && p.periode === rupturePeriode)
    return i >= 0 ? i : null
  }, [points, rupturePeriode])

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${geom.W} ${geom.H}`}
        className="block h-full w-full"
        onMouseLeave={() => setHover(null)}
      >
        {/* Légende — dans le graphe, attachée à ce qu'elle décrit (convention
            DetailChart). Décalages mono 9.5px (~5,7 px/caractère). Avec la
            projection : 4 items (stock réel/projeté, ressources, besoins). */}
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
            {hasFuture ? 'Stock' : 'Stock fin de semaine'}
          </text>
          {hasFuture ? (
            <>
              <line
                x1={geom.padL + 62}
                y1={14}
                x2={geom.padL + 76}
                y2={14}
                stroke={COL_STOCK}
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
              <text x={geom.padL + 82} y={17} fill="var(--color-muted-foreground)">
                Projeté
              </text>
              <rect x={geom.padL + 132} y={10} width={8} height={8} rx={1} fill={COL_ENTREE} />
              <text x={geom.padL + 144} y={17} fill="var(--color-muted-foreground)">
                Entrées &amp; ressources
              </text>
              <rect x={geom.padL + 266} y={10} width={8} height={8} rx={1} fill={COL_SORTIE} />
              <text x={geom.padL + 278} y={17} fill="var(--color-muted-foreground)">
                Sorties &amp; besoins
              </text>
            </>
          ) : (
            <>
              <rect x={geom.padL + 144} y={10} width={8} height={8} rx={1} fill={COL_ENTREE} />
              <text x={geom.padL + 156} y={17} fill="var(--color-muted-foreground)">
                Entrées
              </text>
              <rect x={geom.padL + 206} y={10} width={8} height={8} rx={1} fill={COL_SORTIE} />
              <text x={geom.padL + 218} y={17} fill="var(--color-muted-foreground)">
                Sorties
              </text>
            </>
          )}
          {/* Plage couverte (historique + projection), à droite */}
          {points.length > 0 && (
            <text
              x={geom.W - geom.padR}
              y={17}
              textAnchor="end"
              fill="var(--color-muted-foreground)"
              opacity={0.75}
            >
              {fmtWeekAxis(points[0])} → {fmtWeekAxis(points[lastIdx])}
              {hasFuture && ' · flux : une échelle par moitié'}
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

        {/* Barres de flux (miroir : entrées/ressources au-dessus de l'axe,
            sorties/besoins en dessous). Hauteurs lues sur les fractions
            animées — elles poussent depuis l'axe à l'arrivée. */}
        {points.map((p, i) => {
          const f = fracs[i] ?? [0, 0, 0]
          // Présence décidée sur la valeur CIBLE, hauteur lue sur la valeur
          // animée : un flux non nul garde un plancher visible (MIN_BAR) au
          // lieu de disparaître sous l'antialiasing quand il est petit face au
          // maximum de sa moitié. Une barre absente signifie donc « zéro », pas
          // « trop petit pour être tracé ».
          const t = targetFracs[i] ?? [0, 0, 0]
          const hIn = t[1] > 0 ? Math.max(MIN_BAR, (f[1] ?? 0) * geom.flowAmp) : 0
          const hOut = t[2] > 0 ? Math.max(MIN_BAR, (f[2] ?? 0) * geom.flowAmp) : 0
          const bx = geom.x(i) - geom.barW / 2
          const op = hover === null || hover === i ? 0.85 : 0.4
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
                  opacity={op}
                  style={{ transition: 'opacity 160ms ease-out' }}
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
                  opacity={op}
                  style={{ transition: 'opacity 160ms ease-out' }}
                />
              )}
            </g>
          )
        })}

        {/* Courbe de stock : historique plein + aire en dégradé (profondeur
            sans bruit), projection en pointillés dans son prolongement. */}
        {histLen > 0 && (
          <>
            <defs>
              <linearGradient id="stock-history-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: COL_STOCK, stopOpacity: 0.16 }} />
                <stop offset="100%" style={{ stopColor: COL_STOCK, stopOpacity: 0.01 }} />
              </linearGradient>
            </defs>
            <path d={geom.histArea} fill="url(#stock-history-area)" />
            <path
              d={geom.histPath}
              fill="none"
              stroke={COL_STOCK}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {geom.futPath && (
              <path
                d={geom.futPath}
                fill="none"
                stroke={COL_STOCK}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.75}
              />
            )}
            {/* Point « maintenant » (dernier réel) : plein + halo pulsé (SMIL,
                coupé si prefers-reduced-motion) */}
            <circle
              cx={geom.x(histLen - 1)}
              cy={geom.yLine(nowFrac[0] ?? 0)}
              r={3}
              fill={COL_STOCK}
            />
            {!REDUCED_MOTION && (
              <circle
                cx={geom.x(histLen - 1)}
                cy={geom.yLine(nowFrac[0] ?? 0)}
                r={3}
                fill="none"
                stroke={COL_STOCK}
                strokeWidth={1}
              >
                <animate attributeName="r" values="3;9" dur="2.4s" repeatCount="indefinite" />
                <animate
                  attributeName="opacity"
                  values="0.35;0"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </>
        )}

        {/* Repère de rupture — ancre visuelle du verdict sur la courbe.
            Nécessaire parce que le stock projeté est borné à 0 : le plateau
            plat qui suit se lit « on se maintient » alors qu'il masque un
            manque non servi. */}
        {ruptureIdx !== null && (
          <g pointerEvents="none">
            <line
              x1={geom.x(ruptureIdx)}
              x2={geom.x(ruptureIdx)}
              y1={geom.padT}
              y2={geom.flowAxis}
              stroke={COL_SORTIE}
              strokeWidth={1.25}
              strokeDasharray="4 3"
              opacity={0.85}
            />
            <text
              x={geom.x(ruptureIdx)}
              y={geom.padT - 4}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={8.5}
              fontWeight={700}
              letterSpacing="0.08em"
              fill={COL_SORTIE}
            >
              RUPTURE
            </text>
          </g>
        )}

        {/* Charnière passé/futur — ligne verticale « auj. » */}
        {hasFuture && (
          <g pointerEvents="none">
            <line
              x1={geom.nowX}
              x2={geom.nowX}
              y1={geom.padT}
              y2={geom.padT + geom.innerH}
              stroke="var(--color-muted-foreground)"
              opacity={0.5}
              strokeDasharray="2 3"
            />
            <text
              x={geom.nowX}
              y={geom.H - geom.padB + 13}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fontWeight={700}
              fill="var(--color-muted-foreground)"
            >
              auj.
            </text>
          </g>
        )}

        {/* Labels de semaines (année ISO incluse — les 105 points couvrent
            ~2 ans, passés et futurs) */}
        <g fontFamily="var(--font-mono)" fontSize={9} fontWeight={600}>
          {points.map((p, i) =>
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
        {points.map((p, i) => (
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
        {hover !== null && points[hover] && (
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
            {hPoint.kind === 'fut' && (
              <span className="ml-1.5 font-medium italic text-muted-foreground">· proj.</span>
            )}
          </div>
          <div className="space-y-1">
            <TooltipRow
              swatch="line"
              color={COL_STOCK}
              label={hPoint.kind === 'fut' ? 'Stock projeté' : 'Stock'}
              value={fmtVal(hLineVal, unit)}
              strong
            />
            <TooltipRow
              color={COL_ENTREE}
              label={hPoint.kind === 'fut' ? 'Ressources' : 'Entrées'}
              value={`+ ${fmtVal(hInVal, unit)}`}
            />
            <TooltipRow
              color={COL_SORTIE}
              label={hPoint.kind === 'fut' ? 'Besoins' : 'Sorties'}
              value={`− ${fmtVal(hOutVal, unit)}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Entrée du bandeau logistique : label mono uppercase puis valeur. Rendue
 *  seulement si la donnée existe — un paramètre non renseigné dans X3 ne doit
 *  pas occuper une case pour y afficher « — ». */
function LogItem({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-secondary-foreground">
        {value}
      </span>
    </div>
  )
}

/** Jours entiers — « 140 j ». */
const fmtJours = (v: number): string => `${fmtQty.format(Math.round(v))} j`

/** ISO machine → jj/mm/aaaa, seul format de date affiché dans ce projet. */
const fmtDateFr = (iso: string): string => iso.split('-').reverse().join('/')

/**
 * Verdict d'approvisionnement — l'élément le plus visible de la sheet.
 *
 * C'est le seul chiffre qui appelle une décision : jusqu'à quand le stock
 * tient face au délai de réapprovisionnement. Il était noyé parmi une douzaine
 * d'items de poids visuel identique ; il a désormais sa propre bande, son icône
 * et sa couleur de statut.
 *
 * Les totaux de l'horizon (besoins / ressources) l'accompagnent : ils portent
 * sur la même fenêtre à venir et donnent l'ordre de grandeur que l'échelle du
 * graphe ne permet pas de lire.
 */
function VerdictBar({
  detail,
  unit,
  totaux,
}: {
  detail: StockArticleDetail
  unit: Unit
  totaux: { besoin: number; ressource: number } | null
}) {
  const ind = detail.indicateurs
  const delai = detail.logistique.delaiReapproJours
  const sousDelai = ind.ratioProspectifDelai !== null && ind.ratioProspectifDelai < 1

  // Sans projection, il n'y a pas de verdict à rendre. « Couvert au-delà de 52
  // semaines » signifierait « aucun besoin à venir », alors qu'ici la donnée
  // manque — deux choses très différentes pour qui décide.
  if (detail.future.length === 0) return null

  // Trois états : rupture avant le délai (on ne peut plus réapprovisionner à
  // temps), rupture datée mais joignable, ou aucune rupture sur l'horizon.
  let Icon = ShieldCheck
  let titre: string
  let detailTexte: string

  if (ind.couvertureProspectiveJours === null) {
    titre = 'Couvert au-delà de 52 semaines'
    detailTexte = 'Aucune rupture sur l’horizon, réceptions à venir exclues.'
  } else {
    const date = ind.ruptureDateIso ? fmtDateFr(ind.ruptureDateIso) : '—'
    titre = `Tient jusqu’au ${date}`
    // « hors réceptions » est explicite : la courbe projetée, elle, LES
    // intègre, donc elle remonte après le plancher à 0. Sans cette mention les
    // deux lectures paraissent se contredire.
    const couv = `${fmtJours(ind.couvertureProspectiveJours)} de couverture hors réceptions`
    if (delai !== null && delai > 0) {
      Icon = sousDelai ? TriangleAlert : ShieldCheck
      detailTexte = sousDelai
        ? `${couv}, pour ${fmtJours(delai)} de délai — commander maintenant n’arrive plus à temps.`
        : `${couv}, pour ${fmtJours(delai)} de délai — commander maintenant arrive encore à temps.`
    } else {
      Icon = CalendarClock
      detailTexte = `${couv}. Aucun délai de réapprovisionnement paramétré.`
    }
  }

  return (
    <div
      className={cn(
        'flex flex-none flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-5 py-2.5',
        sousDelai ? 'border-destructive/30 bg-destructive/10' : 'border-rule bg-secondary'
      )}
    >
      <Icon
        size={17}
        strokeWidth={1.9}
        className={cn('shrink-0', sousDelai ? 'text-destructive' : 'text-brand')}
      />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span
          className={cn(
            'font-mono text-[13px] font-bold tabular-nums',
            sousDelai ? 'text-destructive' : 'text-foreground'
          )}
        >
          {titre}
        </span>
        <span className="text-[11.5px] text-secondary-foreground">{detailTexte}</span>
      </div>
      <span className="flex-1" />
      {totaux && (
        <div
          className="flex items-baseline gap-x-4"
          title="Totaux sur l'horizon de projection — les barres du graphe ont une échelle par moitié, ces deux nombres donnent les ordres de grandeur réels."
        >
          {/* Étiquetés, pas seulement colorés : la couleur seule oblige à
              faire l'aller-retour avec la légende du graphe. */}
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Besoins 52 s.
            </span>
            <span
              className="font-mono text-[11px] font-semibold tabular-nums"
              style={{ color: COL_SORTIE }}
            >
              {fmtVal(totaux.besoin, unit)}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Ressources
            </span>
            <span
              className="font-mono text-[11px] font-semibold tabular-nums"
              style={{ color: COL_ENTREE }}
            >
              {fmtVal(totaux.ressource, unit)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Groupe nommé du pied de sheet : un intitulé discret puis ses items. */
function ParamGroup({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
      {/* Volontairement PAS en `text-brand` : ce rouge sert déjà au verdict et
          aux sorties du graphe. Un intitulé de groupe n'est pas une alerte. */}
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
        {titre}
      </span>
      {children}
    </div>
  )
}

/**
 * Pied de sheet : ce qui explique la courbe, sous la courbe.
 *
 * Deux groupes nommés plutôt qu'une bande unique de douze items — les
 * paramètres se règlent (fiche article), les indicateurs se constatent
 * (historique). Un délai de 140 jours et un lot économique de 7 392 expliquent
 * des entrées massives et espacées ; les mettre à plat à côté d'une rotation
 * empêchait de faire la différence.
 *
 * La couverture au régime moyen passé n'y figure pas : elle contredit la
 * couverture prospective du verdict dès que la demande n'est pas plate. Elle
 * reste dans le payload pour `stock:audit`.
 */
function ParamsBar({ detail }: { detail: StockArticleDetail }) {
  const l = detail.logistique
  const ind = detail.indicateurs
  const fournisseur = l.fournisseurNom ?? l.fournisseurCode
  const anneeGlissante = `sur ${fmtQty.format(ind.joursFenetre)} jours glissants`

  const appro: ReactNode[] = []
  if (fournisseur)
    appro.push(
      <LogItem
        key="four"
        label="Fournisseur"
        value={fournisseur}
        title={l.fournisseurCode ? `Code fournisseur ${l.fournisseurCode}` : undefined}
      />
    )
  if (l.delaiReapproJours !== null)
    appro.push(
      <LogItem
        key="delai"
        label="Délai"
        value={fmtJours(l.delaiReapproJours)}
        title="Délai de réapprovisionnement paramétré sur la fiche site (ITMFACILIT.OFS)"
      />
    )
  if (l.lotEconomique !== null)
    appro.push(
      <LogItem
        key="lotEco"
        label="Lot éco."
        value={fmtQty.format(l.lotEconomique)}
        title="Quantité minimale de réapprovisionnement (ITMFACILIT.REOMINQTY)"
      />
    )
  if (l.lotTechnique !== null)
    appro.push(
      <LogItem
        key="lotTech"
        label="Lot techn."
        value={fmtQty.format(l.lotTechnique)}
        title="Lot technique de fabrication (ITMFACILIT.MFGLOTQTY)"
      />
    )
  if (l.stockSecurite !== null)
    appro.push(
      <LogItem
        key="secu"
        label="Stock sécu."
        value={fmtQty.format(l.stockSecurite)}
        title="Stock de sécurité paramétré (ITMFACILIT.SAFSTO)"
      />
    )
  if (l.famille)
    appro.push(
      <LogItem key="fam" label="Famille" value={l.famille} title="Famille d'usage (YFAMSTAT7)" />
    )

  const conso: ReactNode[] = []
  if (ind.sorties12m > 0)
    conso.push(
      <LogItem
        key="sorties"
        label="Sorties"
        value={fmtQty.format(ind.sorties12m)}
        title={`Total des sorties physiques nettes ${anneeGlissante} — consommation de fabrication, ventes, retours et rebuts confondus. C'est par là que le stock s'écoule.`}
      />
    )
  if (ind.cmj !== null)
    conso.push(
      <LogItem
        key="cmj"
        label="CMJ"
        value={fmtQtyDec.format(ind.cmj)}
        title={`Consommation moyenne par jour CALENDAIRE (sorties ÷ ${ind.joursFenetre} jours). Descriptif du régime passé — la couverture affichée en haut vient, elle, de la demande réelle à venir.`}
      />
    )
  if (ind.stockMoyen > 0)
    conso.push(
      <LogItem
        key="stkmoy"
        label="Stock moyen"
        value={fmtQty.format(ind.stockMoyen)}
        title={`Moyenne du stock de fin de semaine ${anneeGlissante}.`}
      />
    )
  if (ind.rotation !== null)
    conso.push(
      <LogItem
        key="rota"
        label="Rotation"
        value={`${fmtQtyDec.format(ind.rotation)} ×`}
        title={`Sorties ÷ stock moyen ${anneeGlissante} — nombre de fois où le stock s'est renouvelé.`}
      />
    )

  if (appro.length === 0 && conso.length === 0) return null

  return (
    <div className="flex flex-none flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rule bg-card px-5 py-2.5">
      {appro.length > 0 && <ParamGroup titre="Approvisionnement">{appro}</ParamGroup>}
      {conso.length > 0 && <ParamGroup titre="Consommation 12 m">{conso}</ParamGroup>}
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

  // Totaux de la projection sur l'horizon. Le graphe trace deux moitiés à des
  // échelles différentes : ces deux chiffres donnent les ordres de grandeur
  // réels du carnet à venir, indépendamment de la lecture visuelle.
  const totauxFuturs = useMemo(() => {
    const fut = detail?.future ?? []
    if (fut.length === 0) return null
    let besoin = 0
    let ressource = 0
    for (const p of fut) {
      besoin += unit === 'qte' ? p.besoinQte : p.besoinVal
      ressource += unit === 'qte' ? p.ressourceQte : p.ressourceVal
    }
    if (besoin === 0 && ressource === 0) return null
    return { besoin, ressource }
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
            variant="orb"
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
                {(() => {
                  const article = detail?.article ?? props.article
                  return article ? (
                    <X3Link
                      fonction="GESITM"
                      cle={article}
                      title={`Ouvrir l'article ${article} dans Sage X3`}
                      className="font-mono text-[13px] font-bold text-brand"
                    >
                      {article}
                    </X3Link>
                  ) : (
                    <span className="font-mono text-[13px] font-bold text-brand" />
                  )
                })()}
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
                  {/* Stock, et sa part en contrôle réception quand il y en a :
                      un stock à moitié bloqué en Q ne se pilote pas comme un
                      stock entièrement disponible. */}
                  <Metric
                    label="Stock"
                    value={
                      detail.stockQ > 0
                        ? `${fmtQtyDec.format(detail.stock)} · Q ${fmtQty.format(detail.stockQ)}`
                        : fmtQtyDec.format(detail.stock)
                    }
                    title={
                      detail.stockQ > 0
                        ? `${fmtQty.format(detail.stockA)} en statut A (disponible), ${fmtQty.format(detail.stockQ)} en statut Q (contrôle réception). Le Q est compté disponible par la faisabilité — contacter le contrôle réception s'il bloque.`
                        : undefined
                    }
                  />
                  <span className="h-6 w-px bg-border" />
                  <Metric
                    label="PMP"
                    value={fmtPmp.format(detail.pmp)}
                    title="Prix moyen pondéré (€ / unité)"
                  />
                  <span className="h-6 w-px bg-border" />
                  <Metric label="Valeur" value={fmtEuro.format(detail.valeur)} />
                  <span className="h-6 w-px bg-border" />
                  <Metric
                    label="Δ 12 mois"
                    value={
                      delta === null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(delta))}`
                    }
                    title="Variation du stock entre la première semaine non nulle et la dernière semaine affichée"
                  />
                  {/* Les totaux 52 semaines ont rejoint le verdict : ils
                      portent sur la fenêtre à venir, pas sur l'état actuel. */}
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

            {/* Verdict d'appro juste sous l'identité : c'est la première
                question du planificateur, elle passe avant la courbe. */}
            {detail && <VerdictBar detail={detail} unit={unit} totaux={totauxFuturs} />}

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
              <>
                <div className="min-h-0 flex-1 px-5 pb-3 pt-2">
                  <HistoryChart
                    series={detail.series}
                    future={detail.future ?? []}
                    unit={unit}
                    rupturePeriode={detail.indicateurs.ruptureSemaine}
                  />
                </div>
                {/* Ce qui explique la courbe, sous la courbe : on ne le lit
                    qu'après avoir vu la forme, et jamais avant le verdict. */}
                <ParamsBar detail={detail} />
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default StockArticleSheet

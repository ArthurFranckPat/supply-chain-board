import { memo, useMemo } from 'react'

import { barX, barY, defineChart, lineY, ruleX, ruleY, stack } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { portal } from '@tanstack/charts/tooltip/portal'

import {
  AXE,
  PALIER,
  SERIE,
  fmtDecimal,
  fmtNombre,
  fmtPeriodeLongue,
  fmtPourcent,
  palierSaturation,
  type NomPalier,
  type NomSerie,
} from '@r/lib/charts/theme'
import { cn } from '@r/lib/utils'

/**
 * Graphiques du produit — les six formes qui couvrent tout le domaine.
 *
 * Règle : aucune visualisation ne se dessine plus à la main. Ni SVG écrit
 * à la main, ni div en `width: %`. Tout passe par `@tanstack/charts`, qui
 * possède les échelles, les axes, la mesure du conteneur et le survol.
 *
 * Deux pièges valent d'être connus avant de composer une septième forme :
 *
 * 1. **Le domaine se déclare, il ne se devine pas.** Une échelle inférée se
 *    cale sur le maximum observé — deux barres de 6,8 h et 3,7 h finissent
 *    presque identiques. Toute primitive de comparaison ci-dessous fixe son
 *    domaine à `[0, max]` explicite.
 * 2. **`initialWidth` vaut 640 px par défaut.** Dans une tuile de 200 px, le
 *    premier rendu est calculé pour 640 px puis re-mesuré : la barre semble
 *    « pousser » au montage. Chaque primitive passe une largeur initiale
 *    cohérente avec l'endroit où elle vit.
 */

/* ── Socle ───────────────────────────────────────────────────── */

/**
 * Le tooltip natif, habillé par `.chart-tooltip` (voir `app.css`).
 *
 * `portal` est systématique : les graphiques du produit vivent dans des cartes
 * à `overflow: hidden`, qui rogneraient la bulle sans lui.
 *
 * À noter : par défaut, la librairie formate les dates en ISO UTC. Toute
 * primitive ci-dessous surcharge donc `format` ou `formatGroup` — la règle
 * jj/mm/aaaa ne survit pas à un oubli.
 */
const TOOLTIP_FR = { use: tooltip, portal, className: 'chart-tooltip' } as const

/** Graduations : micro-texte atténué, à la densité produit. */
const TICKS = {
  fontSize: AXE.tickFontSize,
  opacity: AXE.tickOpacity,
} as const

type SocleProps = {
  /** Nom accessible du graphique. Obligatoire : il porte tout le sens pour un lecteur d'écran. */
  ariaLabel: string
  /** Description longue — la lecture chiffrée que l'œil fait d'un coup. */
  ariaDescription?: string
  className?: string
}

/* ── 1. Sparkline ────────────────────────────────────────────── */

export type PointSerie = {
  /** Identité stable du point — conserve l'animation et le survol entre deux rendus. */
  cle: string
  label: string
  valeur: number
}

export type SparklineProps = SocleProps & {
  points: PointSerie[]
  /** Hauteur en pixels. 56 dans une tuile KPI, 28 dans une ligne de tableau. */
  hauteur?: number
  /** Met la dernière valeur en avant — la lecture d'une sparkline va vers « où on en est ». */
  accentuerDernier?: boolean
  couleur?: string
  format?: (valeur: number) => string
}

/**
 * Tendance d'une série courte, sans axe ni graduation.
 *
 * Volontairement muette : une sparkline se lit par sa forme. Les valeurs
 * extrêmes vivent dans le texte qui l'entoure, pas dans le graphique.
 */
export const Sparkline = memo(function Sparkline({
  points,
  hauteur = 56,
  accentuerDernier = true,
  couleur = SERIE.ferme,
  format = fmtNombre,
  ariaLabel,
  ariaDescription,
  className,
}: SparklineProps) {
  const definition = useMemo(() => {
    if (points.length === 0) return null
    const dernier = points.length - 1
    return defineChart({
      svgAnimation: false,
      guides: false,
      margin: 0,
      marks: [
        barY(points, {
          x: 'cle',
          y: 'valeur',
          radius: 2,
          inset: 1,
          fill: (d: PointSerie) =>
            accentuerDernier && d.cle === points[dernier]?.cle
              ? couleur
              : `color-mix(in oklab, ${couleur} 22%, transparent)`,
        }),
      ],
      x: { scale: () => scaleBand<string>().padding(0.2), axis: false },
      y: { scale: scaleLinear, nice: false, grid: false, axis: false },
      tooltip: {
        ...TOOLTIP_FR,
        format: (point: { datum: PointSerie }) =>
          `${point.datum.label} · ${format(point.datum.valeur)}`,
      },
    })
  }, [points, accentuerDernier, couleur, format])

  if (!definition) return null

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      height={hauteur}
      initialWidth={220}
      className={cn('w-full', className)}
    />
  )
})

/* ── 2. Jauge ────────────────────────────────────────────────── */

export type JaugeProps = SocleProps & {
  valeur: number
  /** Borne haute de l'échelle. C'est elle qui rend deux jauges comparables. */
  max: number
  /** Repère : capacité, objectif, seuil de sécurité. Tracé en trait plein sur la piste. */
  seuil?: number | null
  /** Force un palier. Par défaut, il se déduit du taux `valeur / max`. */
  palier?: NomPalier
  /**
   * Encre explicite, qui court-circuite les paliers. À utiliser dès que toutes
   * les jauges d'une liste portent le même statut : peindre en vert des lignes
   * « en retard » alerte à contresens.
   */
  couleur?: string
  epaisseur?: number
}

/**
 * Une valeur contre une borne — saturation d'un poste, avancement d'un OF,
 * remplissage d'un camion, part d'une catégorie.
 *
 * C'est la forme la plus dupliquée du produit : elle remplaçait douze
 * implémentations locales en `width: %`. La différence n'est pas cosmétique —
 * le domaine `[0, max]` est ici réellement partagé, donc deux jauges côte à
 * côte sont enfin comparables.
 */
export const Jauge = memo(function Jauge({
  valeur,
  max,
  seuil = null,
  palier,
  couleur,
  epaisseur = 6,
  ariaLabel,
  ariaDescription,
  className,
}: JaugeProps) {
  const borne = Math.max(max, 1)
  const pct = Math.round((valeur / borne) * 100)
  const encre = couleur ?? PALIER[palier ?? palierSaturation(pct)]

  const definition = useMemo(
    () =>
      defineChart({
        svgAnimation: false,
        guides: false,
        margin: 0,
        marks: [
          // La piste : le reste à parcourir doit rester lisible, même à 4 %.
          barX([{ cle: 'piste', valeur: borne }], {
            x: 'valeur',
            y: 'cle',
            fill: 'var(--serie-piste)',
            radius: epaisseur / 2,
          }),
          barX([{ cle: 'piste', valeur: Math.max(0, Math.min(valeur, borne)) }], {
            x: 'valeur',
            y: 'cle',
            fill: encre,
            radius: epaisseur / 2,
          }),
          ...(seuil !== null && seuil > 0 && seuil <= borne
            ? [
                ruleX([seuil], {
                  stroke: 'var(--foreground)',
                  strokeWidth: 1.5,
                  strokeOpacity: 0.55,
                }),
              ]
            : []),
        ],
        // Domaine fixe : c'est tout l'intérêt de la primitive.
        x: { scale: () => scaleLinear().domain([0, borne]), axis: false },
        y: { scale: () => scaleBand<string>().padding(0), axis: false },
      }),
    [valeur, borne, seuil, encre, epaisseur]
  )

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={
        ariaDescription ?? `${fmtDecimal(valeur)} sur ${fmtDecimal(borne)} — ${fmtPourcent(pct)}`
      }
      height={epaisseur}
      initialWidth={160}
      className={cn('w-full', className)}
    />
  )
})

/* ── 3. Barres de classement ─────────────────────────────────── */

export type LigneClassement = PointSerie & {
  /** Marque une valeur hors échelle (rupture infaisable, retard sentinelle 9999 j). */
  horsEchelle?: boolean
  couleur?: string
}

export type BarresClassementProps = SocleProps & {
  lignes: LigneClassement[]
  format?: (valeur: number) => string
  /** Hauteur d'une ligne. 28 px — la hauteur de contrôle par défaut du produit. */
  hauteurLigne?: number
  couleur?: string
}

/**
 * Un classement : postes en retard, ruptures par sévérité, top catégories.
 *
 * Les valeurs hors échelle sont écrêtées au maximum des valeurs réelles et
 * hachurées, plutôt que de tasser tout le reste du classement contre zéro.
 */
export const BarresClassement = memo(function BarresClassement({
  lignes,
  format = fmtNombre,
  hauteurLigne = 28,
  couleur = SERIE.reel,
  ariaLabel,
  ariaDescription,
  className,
}: BarresClassementProps) {
  const definition = useMemo(() => {
    if (lignes.length === 0) return null
    const reelles = lignes.filter((l) => !l.horsEchelle).map((l) => l.valeur)
    const borne = Math.max(1, ...reelles)
    const rows = lignes.map((l) => ({
      ...l,
      tracee: l.horsEchelle ? borne : Math.min(l.valeur, borne),
    }))

    return defineChart({
      svgAnimation: false,
      marks: [
        barX(rows, {
          x: 'tracee',
          y: 'cle',
          radius: 2,
          inset: hauteurLigne > 20 ? 5 : 2,
          // `fillOpacity` est une constante, pas un canal : la nuance des
          // valeurs hors échelle passe donc par la couleur elle-même.
          fill: (d: (typeof rows)[number]) =>
            d.horsEchelle
              ? 'color-mix(in oklab, var(--serie-alerte) 45%, transparent)'
              : (d.couleur ?? couleur),
        }),
      ],
      x: { scale: () => scaleLinear().domain([0, borne]), axis: false, grid: false },
      y: {
        scale: () => scaleBand<string>().padding(0.12),
        axis: {
          line: false,
          ticks: {
            size: 0,
            format: (cle: string) => rows.find((r) => r.cle === cle)?.label ?? cle,
          },
          tickLabels: TICKS,
        },
      },
      tooltip: {
        ...TOOLTIP_FR,
        format: (point: { datum: (typeof rows)[number] }) =>
          `${point.datum.label} · ${format(point.datum.valeur)}${point.datum.horsEchelle ? ' (hors échelle)' : ''}`,
      },
    })
  }, [lignes, format, hauteurLigne, couleur])

  if (!definition) return null

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      height={Math.max(lignes.length * hauteurLigne, hauteurLigne)}
      initialWidth={320}
      className={cn('w-full', className)}
    />
  )
})

/* ── 4. Histogramme de charge ────────────────────────────────── */

export type SegmentCharge = {
  serie: NomSerie
  label: string
}

export type PeriodeCharge = {
  cle: string
  label: string
  /** Valeur par série, dans l'ordre de la pile. */
  valeurs: Partial<Record<NomSerie, number>>
  capacite?: number | null
}

export type HistogrammeChargeProps = SocleProps & {
  periodes: PeriodeCharge[]
  /** Ordre de la pile, du bas vers le haut. Porte aussi la légende. */
  segments: SegmentCharge[]
  hauteur?: number
  /** Trace le plafond de capacité et surligne le dépassement. */
  afficherCapacite?: boolean
  unite?: string
  format?: (valeur: number) => string
  onSelectPeriode?: (cle: string) => void
}

/**
 * Charge empilée dans le temps, avec plafond de capacité.
 *
 * Cette forme existait en six exemplaires dans le produit — SVG à la main,
 * divs empilées, widgets MCP — chacun avec sa propre arithmétique d'échelle.
 * Un seul moteur désormais : l'empilement est déduit des `x` répétés, le
 * plafond est une règle horizontale, le dépassement se lit à la couleur.
 */
export const HistogrammeCharge = memo(function HistogrammeCharge({
  periodes,
  segments,
  hauteur = 240,
  afficherCapacite = true,
  format = fmtDecimal,
  ariaLabel,
  ariaDescription,
  className,
  onSelectPeriode,
}: HistogrammeChargeProps) {
  const definition = useMemo(() => {
    if (periodes.length === 0) return null

    // Format long : une ligne par (période × série). Les `x` répétés empilent.
    const rows = periodes.flatMap((p) =>
      segments
        .map((s) => ({
          cle: p.cle,
          label: p.label,
          serie: s.serie,
          serieLabel: s.label,
          valeur: p.valeurs[s.serie] ?? 0,
          capacite: p.capacite ?? null,
        }))
        .filter((r) => r.valeur > 0)
    )

    const capacites = periodes
      .map((p) => p.capacite)
      .filter((c): c is number => typeof c === 'number' && c > 0)
    const capacite = capacites.length > 0 ? Math.max(...capacites) : null

    return defineChart({
      marks: [
        barY(rows, {
          x: 'cle',
          y: 'valeur',
          z: 'serie',
          radius: 2,
          inset: 1,
          // L'ordre de la pile est déclaré, jamais laissé au hasard des
          // données : c'est lui qui rend deux périodes comparables à l'œil.
          layout: stack({ order: segments.map((s) => s.serie) }),
          fill: (d: (typeof rows)[number]) => SERIE[d.serie],
        }),
        ...(afficherCapacite && capacite !== null
          ? [
              ruleY([capacite], {
                stroke: SERIE.capacite,
                strokeWidth: 1.5,
                strokeDasharray: '4 3',
                // Sans ça, la règle hérite d'une opacité de 0,5 et le plafond
                // se lit moins bien que la grille.
                strokeOpacity: 1,
              }),
            ]
          : []),
      ],
      x: {
        scale: () => scaleBand<string>().padding(0.24),
        axis: {
          line: false,
          ticks: {
            size: 0,
            format: (cle: string) => periodes.find((p) => p.cle === cle)?.label ?? cle,
          },
          tickLabels: { ...TICKS, thin: { minGap: 8, priority: 'ends' } },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { line: false, ticks: { size: 0, format: format }, tickLabels: TICKS },
      },
      tooltip: {
        ...TOOLTIP_FR,
        formatGroup: (points: readonly { datum: (typeof rows)[number] }[]) => {
          const premier = points[0]?.datum
          if (!premier) return ''
          const total = points.reduce((somme, p) => somme + p.datum.valeur, 0)
          const lignes = points.map((p) => `${p.datum.serieLabel} ${format(p.datum.valeur)}`)
          const plafond = premier.capacite !== null ? ` · capacité ${format(premier.capacite)}` : ''
          return `${fmtPeriodeLongue(premier.label)} — ${format(total)}${plafond}\n${lignes.join(' · ')}`
        },
      },
    })
  }, [periodes, segments, afficherCapacite, format])

  if (!definition) return null

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      height={hauteur}
      initialWidth={640}
      className={cn('w-full', className)}
      onSelect={
        onSelectPeriode
          ? (point) => {
              if (point) onSelectPeriode(String(point.xValue))
            }
          : undefined
      }
    />
  )
})

/* ── 5. Courbe de projection ─────────────────────────────────── */

export type PointProjection = PointSerie & {
  /** `true` = calculé, au-delà d'aujourd'hui. Rendu en pointillé. */
  projete?: boolean
}

export type CourbeProjectionProps = SocleProps & {
  points: PointProjection[]
  /** Seuil de sécurité, point de commande, zéro de rupture. */
  seuil?: number | null
  /** Clé du point où bascule la projection — trace la charnière « aujourd'hui ». */
  charniere?: string | null
  hauteur?: number
  format?: (valeur: number) => string
}

/**
 * Un niveau dans le temps : stock constaté puis projeté, carnet, encours.
 *
 * Le passé est plein, le futur est pointillé — la distinction est portée par
 * deux marques et non par une couleur, pour rester lisible à l'impression.
 */
export const CourbeProjection = memo(function CourbeProjection({
  points,
  seuil = null,
  charniere = null,
  hauteur = 200,
  format = fmtNombre,
  ariaLabel,
  ariaDescription,
  className,
}: CourbeProjectionProps) {
  const definition = useMemo(() => {
    if (points.length === 0) return null

    const passe = points.filter((p) => !p.projete)
    // Le futur reprend le dernier point constaté : sans lui, la courbe saute.
    const dernierPasse = passe[passe.length - 1]
    const futur = points.filter((p) => p.projete)
    const futurContinu = dernierPasse ? [dernierPasse, ...futur] : futur

    return defineChart({
      marks: [
        ...(passe.length > 0
          ? [lineY(passe, { x: 'cle', y: 'valeur', stroke: SERIE.reel, strokeWidth: 1.75 })]
          : []),
        ...(futurContinu.length > 1
          ? [
              lineY(futurContinu, {
                x: 'cle',
                y: 'valeur',
                stroke: SERIE.projete,
                strokeWidth: 1.75,
                strokeDasharray: '4 3',
              }),
            ]
          : []),
        ...(seuil !== null
          ? [
              ruleY([seuil], {
                stroke: SERIE.alerte,
                strokeWidth: 1.25,
                strokeDasharray: '3 3',
                strokeOpacity: 1,
              }),
            ]
          : []),
        ...(charniere !== null ? [ruleX([charniere], { stroke: AXE.grille, strokeWidth: 1 })] : []),
      ],
      x: {
        scale: () => scaleBand<string>().padding(0.1),
        axis: {
          line: false,
          ticks: {
            size: 0,
            format: (cle: string) => points.find((p) => p.cle === cle)?.label ?? cle,
          },
          tickLabels: { ...TICKS, thin: { minGap: 10, priority: 'ends' } },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { line: false, ticks: { size: 0, format: format }, tickLabels: TICKS },
      },
      tooltip: {
        ...TOOLTIP_FR,
        format: (point: { datum: PointProjection }) =>
          `${point.datum.label} · ${format(point.datum.valeur)}${point.datum.projete ? ' (projeté)' : ''}`,
      },
    })
  }, [points, seuil, charniere, format])

  if (!definition) return null

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      height={hauteur}
      initialWidth={640}
      className={cn('w-full', className)}
    />
  )
})

/* ── 6. Légende ──────────────────────────────────────────────── */

export type LegendeProps = {
  segments: SegmentCharge[]
  className?: string
}

/**
 * Légende du produit, en HTML plutôt qu'en SVG : elle reste sélectionnable,
 * traduisible et à la typographie du reste de l'interface.
 */
export function Legende({ segments, className }: LegendeProps) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {segments.map((s) => (
        <li
          key={s.serie}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: SERIE[s.serie] }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

import { memo, useMemo } from 'react'

import { barX, barY, defineChart, dot, lineY, ruleX, ruleY, stack, text } from '@tanstack/charts'
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
 * `sticky: false` n'est pas un détail de confort. La valeur par défaut de la
 * librairie est VRAIE (`renderer.js` : `sticky !== false`), et un tooltip
 * sticky s'ÉPINGLE au clic — `canPin = tooltipIsSticky() || …`. Une fois
 * épinglé, il survit à `pointerleave`, et seul un second clic au même endroit
 * le relâche. Dans ce produit, cliquer un graphe sélectionne un poste ou ouvre
 * un panneau : ce second clic n'arrive jamais, et la bulle reste à l'écran —
 * en s'accumulant, une par graphe cliqué. Aucun de nos graphes n'a besoin d'un
 * tooltip persistant : ils se lisent au survol.
 *
 * À noter : par défaut, la librairie formate les dates en ISO UTC. Toute
 * primitive ci-dessous surcharge donc `format` ou `formatGroup` — la règle
 * jj/mm/aaaa ne survit pas à un oubli.
 */
const TOOLTIP_FR = { use: tooltip, portal, className: 'chart-tooltip', sticky: false } as const

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
 *
 * **La largeur vient du parent, pas d'ici.** L'hôte de `Chart` porte un
 * `width: 100%` EN LIGNE : une classe de largeur passée en `className` ne le
 * bat pas. Dans une rangée flex, la jauge prend donc toute la place libre et se
 * ré-étire à chaque changement de layout — poser la largeur sur un conteneur
 * (`<span className="w-40 shrink-0">`) est le seul réglage qui tienne. Une
 * largeur proche de l'`initialWidth` ci-dessous évite en plus la frame de
 * re-mesure au montage.
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
  /** Clé de pile — identité du segment pour l'empilement. Par défaut : `serie`. */
  cle?: string
  serie: NomSerie
  label: string
  /** Encre du segment — court-circuite SERIE[serie] (hachure, série dérivée). */
  couleur?: string
}

export type PeriodeCharge = {
  cle: string
  label: string
  /** Valeur par segment, indexée par la clé du segment (`cle` ?? `serie`). */
  valeurs: Partial<Record<string, number>>
  capacite?: number | null
}

/** Ligne longue du format : une (période × segment), l'empilement se déduit des clés répétées. */
export type LigneCharge = {
  cle: string
  label: string
  segment: string
  serie: NomSerie
  serieLabel: string
  valeur: number
  capacite: number | null
  couleur?: string
}

export type HistogrammeChargeProps = SocleProps & {
  periodes: PeriodeCharge[]
  /** Ordre de la pile, du bas vers le haut. Porte aussi la légende. */
  segments: SegmentCharge[]
  hauteur?: number
  /**
   * Borne haute de l'échelle y. À déclarer dès que plusieurs graphiques doivent
   * être comparables (board, annuaire MCP) : deux histogrammes côte à côte
   * finissent sinon chacun sur son propre maximum. Passé, le domaine est
   * `[0, max]` exact — la marge haute (totaux au sommet, pastille de pic)
   * reste à la charge de l'appelant.
   */
  max?: number | null
  /** Trace le plafond de capacité — courbe quand il varie d'une période à l'autre. */
  afficherCapacite?: boolean
  /** Inscrit la valeur dans chaque segment — seulement s'il dépasse ~15 % du total. */
  labelsEnBarre?: boolean
  /** Inscrit le total au sommet de chaque barre (encre d'alerte au-delà de la capacité). */
  totaux?: boolean
  /** Fenêtre de la moyenne mobile (en périodes), tracée en SERIE.tendance. */
  moyenneMobile?: number | null
  /** Pastille sur le total maximum — le pic à anticiper. */
  pic?: boolean
  /** Axes et grille — `false` pour une tuile (mini-carte, en-tête de board). */
  afficherAxes?: boolean
  /** Taille des graduations d'axe. 8 pour un axe semaine dense, 11 par défaut. */
  tailleTicks?: number
  /** Règles horizontales supplémentaires (moyenne, seuil…), en SERIE.tendance. */
  regles?: { valeur: number; serie?: NomSerie }[]
  /** Repère vertical à la période `cle` (aujourd'hui, rupture, livraison…). */
  regleX?: string | null
  /** Surcharge le libellé d'axe d'une période (totaux, unités). */
  libelleAxe?: (periode: PeriodeCharge) => string
  /** Surcharge le contenu du tooltip de groupe. */
  formatTooltip?: (points: readonly { datum: LigneCharge }[]) => string
  unite?: string
  format?: (valeur: number) => string
  /** Largeur au premier rendu — une tuile de 190 px ne doit pas être mesurée à 640. */
  largeurInitiale?: number
  onSelectPeriode?: (cle: string) => void
}

/** Moyenne mobile centrée-tronquée sur `fenetre` points — le lissage de la charge. */
function mobileAvg(totaux: number[], fenetre: number): number[] {
  const r: number[] = []
  for (let i = 0; i < totaux.length; i++) {
    let s = 0
    let c = 0
    for (let k = i - fenetre + 1; k <= i; k++)
      if (k >= 0) {
        s += totaux[k]
        c++
      }
    r.push(c ? s / c : 0)
  }
  return r
}

/** Halo carte + trait coloré : la courbe reste lisible au-dessus des barres. */
function courbeOverlay(
  points: { cle: string; valeur: number }[],
  stroke: string,
  width: number,
  opts: { halo?: number; dash?: string } = {}
) {
  const shared = {
    x: 'cle' as const,
    y: 'valeur' as const,
    strokeOpacity: 1,
    ...(opts.dash ? { strokeDasharray: opts.dash } : {}),
  }
  const halo = opts.halo ?? 0
  return [
    ...(halo > 0
      ? [
          lineY(points, {
            ...shared,
            stroke: 'var(--color-card, #fff)',
            strokeWidth: halo,
          }),
        ]
      : []),
    lineY(points, { ...shared, stroke, strokeWidth: width }),
  ]
}

/**
 * Charge empilée dans le temps, avec plafond de capacité.
 *
 * Cette forme existait en six exemplaires dans le produit — SVG à la main,
 * divs empilées, widgets MCP — chacun avec sa propre arithmétique d'échelle.
 * Un seul moteur désormais : l'empilement est déduit des `x` répétés, le
 * plafond est une courbe, le dépassement se lit au total inscrit.
 */
export const HistogrammeCharge = memo(function HistogrammeCharge({
  periodes,
  segments,
  hauteur = 240,
  max = null,
  afficherCapacite = true,
  labelsEnBarre = false,
  totaux = false,
  moyenneMobile = null,
  pic = false,
  afficherAxes = true,
  tailleTicks = AXE.tickFontSize,
  regles = [],
  regleX = null,
  libelleAxe,
  formatTooltip,
  format = fmtDecimal,
  ariaLabel,
  ariaDescription,
  className,
  largeurInitiale = 640,
  onSelectPeriode,
}: HistogrammeChargeProps) {
  const definition = useMemo(() => {
    if (periodes.length === 0) return null

    const cleSeg = (s: SegmentCharge) => s.cle ?? s.serie

    // Format long : une ligne par (période × segment). Les `x` répétés empilent.
    //
    // Une période à zéro garde UNE ligne, de valeur nulle. Le domaine de la
    // bande x est déduit des données : filtrée entièrement, une semaine vide
    // disparaissait de l'échelle et les bandes restantes se répartissaient sur
    // toute la largeur. Les barres ne tombaient alors plus sous l'axe que
    // l'appelant rend en HTML dessous (en-tête de poste du board : trois
    // libellés de semaine, deux bandes, tout décalé d'un tiers de colonne).
    const rows: LigneCharge[] = periodes.flatMap((p) => {
      const toutes = segments.map((s) => ({
        cle: p.cle,
        label: p.label,
        segment: cleSeg(s),
        serie: s.serie,
        serieLabel: s.label,
        couleur: s.couleur,
        valeur: p.valeurs[cleSeg(s)] ?? 0,
        capacite: p.capacite ?? null,
      }))
      const dessinees = toutes.filter((r) => r.valeur > 0)
      return dessinees.length > 0 ? dessinees : toutes.slice(0, 1)
    })

    // Totaux par période — la somme des segments DESSINÉS, pas des données.
    const totauxParCle = new Map<string, { total: number; cap: number | null }>()
    for (const r of rows) {
      const t = totauxParCle.get(r.cle)
      if (t) t.total += r.valeur
      else totauxParCle.set(r.cle, { total: r.valeur, cap: r.capacite })
    }

    const remplissage = (d: LigneCharge) => d.couleur ?? SERIE[d.serie]

    // Capacité : courbe quand elle varie, ligne plate sinon — un seul rendu.
    const capPoints = afficherCapacite
      ? periodes
          .filter((p) => p.capacite != null && p.capacite > 0)
          .map((p) => ({
            cle: p.cle,
            label: p.label,
            valeur: p.capacite as number,
          }))
      : []

    // Valeurs inscrites dans les segments — cumul bas→haut, même ordre que la pile.
    const labels = labelsEnBarre
      ? periodes.flatMap((p) => {
          const total = totauxParCle.get(p.cle)?.total ?? 0
          let acc = 0
          const out: {
            cle: string
            label: string
            valeur: number
            texte: string
            sombre: boolean
          }[] = []
          for (const s of segments) {
            const v = p.valeurs[cleSeg(s)] ?? 0
            if (v <= 0) continue
            if (v / total >= 0.15)
              out.push({
                cle: p.cle,
                label: p.label,
                valeur: acc + v / 2,
                texte: format(v),
                // Encre sombre sur les segments clairs (suggéré, induit) :
                // blanc sur ambre ne se lit pas.
                sombre: s.serie === 'suggere' || s.serie === 'induit',
              })
            acc += v
          }
          return out
        })
      : []

    /* `totauxAuSommet` et non `totaux` : la locale portait le nom de la prop
       booléenne et l'ombrait. Le garde `totaux.length > 0` plus bas testait
       donc un tableau — toujours vrai dès qu'il y a une barre — et la marque
       s'affichait chez les cinq appelants qui ne l'avaient jamais demandée.
       Sur l'en-tête de poste du board, chaque semaine imprimait sa charge
       deux fois : une fois au sommet de la barre, une fois sous l'axe HTML.
       Périodes à zéro écartées : « 0,00 h » posé sur une bande vide n'est pas
       un total, c'est du bruit. */
    const totauxAuSommet = totaux
      ? [...totauxParCle.entries()]
          .filter(([, t]) => t.total > 0)
          .map(([cle, t]) => ({
            cle,
            label: periodes.find((p) => p.cle === cle)?.label ?? cle,
            valeur: t.total,
            depasse: t.cap !== null && t.total > t.cap,
          }))
      : []

    const moy = moyenneMobile
      ? mobileAvg(
          periodes.map((p) => totauxParCle.get(p.cle)?.total ?? 0),
          moyenneMobile
        ).map((v, i) => ({ cle: periodes[i].cle, label: periodes[i].label, valeur: v }))
      : []

    /* La pastille de pic se calcule sur TOUTES les périodes, pas seulement sur
       celles dont le total est inscrit : elle dépendait de `totaux` par le
       même effet d'ombre, et `pic` sans `totaux` ne montrait rien. */
    const picPoint = pic
      ? [...totauxParCle.entries()]
          .filter(([, t]) => t.total > 0)
          .reduce<{ cle: string; label: string; valeur: number } | null>((m, [cle, t]) => {
            if (m !== null && t.total <= m.valeur) return m
            return {
              cle,
              label: periodes.find((p) => p.cle === cle)?.label ?? cle,
              valeur: t.total,
            }
          }, null)
      : null

    return defineChart({
      // Sans axes ni grille, la zone de tracé EST le conteneur : les overlays
      // HTML calés en pourcentages (coupure, pastilles, trous) tombent juste.
      margin: afficherAxes ? undefined : 0,
      marks: [
        /* Angles vifs : joints nets entre segments, assise franche sur l'axe.
           `barY.radius` est un scalaire appliqué aux quatre coins de CHAQUE
           segment, et aucun canal ne permet de viser le seul segment de tête —
           en rayon 2, chaque jointure de la pile laissait une encoche claire.

           Une coiffe arrondie sur le seul sommet a été tentée (12/08/2026) :
           seconde marque `barY`, mêmes lignes, même `layout`, transparente
           partout sauf sur le segment de tête. Même géométrie en théorie, sans
           effet à l'écran. Retirée — elle ne laissait qu'un doublon de cibles
           de survol. Ne pas la refaire à l'identique. */
        barY(rows, {
          x: 'cle',
          y: 'valeur',
          z: 'segment',
          radius: 0,
          inset: 1,
          // L'ordre de la pile est déclaré, jamais laissé au hasard des
          // données : c'est lui qui rend deux périodes comparables à l'œil.
          layout: stack({ order: segments.map(cleSeg) }),
          fill: remplissage,
        }),
        ...(capPoints.length > 0
          ? courbeOverlay(capPoints, SERIE.capacite, afficherAxes ? 3 : 2, {
              halo: afficherAxes ? 7 : 0,
              dash: afficherAxes ? '7 5' : '5 4',
            })
          : []),
        ...regles.flatMap((r, i) => [
          ruleY([r.valeur], {
            stroke: SERIE[r.serie ?? 'tendance'],
            strokeWidth: 1.25,
            strokeDasharray: '4 3',
            strokeOpacity: 1,
            id: `regle-${i}`,
          }),
        ]),
        ...(regleX !== null
          ? [ruleX([regleX], { stroke: AXE.grille, strokeWidth: 1, id: 'regle-x' })]
          : []),
        ...(moy.length > 1
          ? [
              ...courbeOverlay(moy, SERIE.tendance, afficherAxes ? 3.5 : 2, {
                halo: afficherAxes ? 8 : 0,
              }),
              ...(afficherAxes
                ? [
                    dot(moy, {
                      x: 'cle',
                      y: 'valeur',
                      r: 6,
                      fill: 'var(--color-card, #fff)',
                    }),
                    dot(moy, {
                      x: 'cle',
                      y: 'valeur',
                      r: 4,
                      fill: SERIE.tendance,
                    }),
                  ]
                : []),
            ]
          : []),
        ...(labels.length > 0
          ? [
              text(labels, {
                x: 'cle',
                y: 'valeur',
                text: 'texte',
                anchor: 'middle',
                fontSize: 9,
                fontWeight: 700,
                fill: (d: (typeof labels)[number]) =>
                  d.sombre ? 'currentColor' : 'var(--color-card, #fff)',
              }),
            ]
          : []),
        ...(totauxAuSommet.length > 0
          ? [
              text(totauxAuSommet, {
                x: 'cle',
                y: 'valeur',
                text: (d: (typeof totauxAuSommet)[number]) => format(d.valeur),
                anchor: 'middle',
                dy: -5,
                fontSize: 10,
                fontWeight: 700,
                fill: (d: (typeof totauxAuSommet)[number]) =>
                  d.depasse ? SERIE.alerte : 'currentColor',
              }),
            ]
          : []),
        ...(picPoint !== null
          ? [
              dot([picPoint], {
                x: 'cle',
                y: 'valeur',
                r: 4,
                fill: SERIE.tendance,
              }),
            ]
          : []),
      ],
      x: {
        scale: () => scaleBand<string>().padding(0.24),
        axis: afficherAxes
          ? {
              line: false,
              ticks: {
                size: 0,
                format: (cle: string) => {
                  const p = periodes.find((pr) => pr.cle === cle)
                  if (!p) return cle
                  if (libelleAxe) return libelleAxe(p)
                  return p.label.replace(/\n/g, ' ')
                },
              },
              tickLabels: {
                ...TICKS,
                fontSize: tailleTicks,
                thin: { minGap: 8, priority: 'ends' },
              },
            }
          : false,
      },
      y: {
        scale: max !== null ? () => scaleLinear().domain([0, max]) : scaleLinear,
        nice: max === null,
        grid: afficherAxes,
        axis: afficherAxes
          ? {
              line: false,
              ticks: { size: 0, format: format },
              tickLabels: { ...TICKS, fontSize: tailleTicks },
            }
          : false,
      },
      tooltip: {
        ...TOOLTIP_FR,
        // Une marque décorative (valeur inscrite, plafond, moyenne) reste un
        // point survolable : ce repli lui donne un contenu plutôt qu'un trou.
        format: (point: { datum: unknown }) => {
          const d = point.datum as Partial<LigneCharge>
          if (typeof d === 'object' && d !== null && d.label && d.valeur !== undefined)
            return `${fmtPeriodeLongue(String(d.label))} · ${format(Number(d.valeur))}`
          return ''
        },
        formatGroup: (points: readonly { datum: unknown }[]) => {
          if (formatTooltip) return formatTooltip(points as readonly { datum: LigneCharge }[])
          const premier = points[0]?.datum as LigneCharge | undefined
          if (!premier) return ''
          /* Le groupe survolé mélange les segments de la pile et les marques
             décoratives — capacité, pic, moyenne mobile, valeurs inscrites.
             Ces dernières n'ont ni `serieLabel` ni `capacite` : les traiter
             comme des segments affichait « undefined 150 · capacité NaN ». Le
             type ment ici, il décrit la pile et pas ce que la scène remonte.
             D'où : le détail ne liste que les vrais segments, et le total
             comme le plafond se lisent sur la PÉRIODE (`totauxParCle`), qui
             les connaît quelle que soit la marque sous le pointeur. */
          const segs = points
            .map((p) => p.datum as LigneCharge)
            .filter((d) => typeof d?.serieLabel === 'string' && d.serieLabel.length > 0)
          const periode = totauxParCle.get(premier.cle)
          const total = periode?.total ?? segs.reduce((somme, d) => somme + (d.valeur ?? 0), 0)
          const lignes = segs.map((d) => `${d.serieLabel} ${format(d.valeur)}`)
          const cap = periode?.cap ?? null
          const plafond = cap != null && cap > 0 ? ` · capacité ${format(cap)}` : ''
          const sat =
            cap != null && cap > 0
              ? ` · saturation ${fmtPourcent(Math.round((total / cap) * 100))}`
              : ''
          const clic = onSelectPeriode ? '\nClic : détail de la période' : ''
          const detail = lignes.length > 0 ? `\n${lignes.join(' · ')}` : ''
          return `${fmtPeriodeLongue(premier.label)} — ${format(total)}${plafond}${sat}${detail}${clic}`
        },
      },
    })
  }, [
    periodes,
    segments,
    max,
    afficherCapacite,
    labelsEnBarre,
    // Absent jusqu'ici parce que la locale homonyme masquait la prop : la règle
    // exhaustive-deps voyait une valeur du scope, pas une entrée du composant.
    totaux,
    moyenneMobile,
    pic,
    afficherAxes,
    tailleTicks,
    regles,
    regleX,
    libelleAxe,
    formatTooltip,
    format,
    onSelectPeriode,
  ])

  if (!definition) return null

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      height={hauteur}
      initialWidth={largeurInitiale}
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
  /** Repère vertical à la clé d'un point (rupture prévue, livraison…). */
  regleX?: string | null
  /**
   * Flux du point (entrées / sorties) — enrichit le tooltip quand la courbe
   * n'est que le niveau : le mouvement qui l'explique.
   */
  flux?: (cle: string) => { entree: number; sortie: number } | null
  /**
   * Barres miroir des flux : entrées/ressources au-dessus de l'axe, sorties/
   * besoins en dessous. Une échelle de flux PAR MOITIÉ (passé et projection
   * brassent des ordres de grandeur sans rapport) — les valeurs d'affichage
   * sont normalisées par moitié, les valeurs réelles vivent dans le tooltip.
   */
  afficherFluxMiroir?: boolean
  couleurEntree?: string
  couleurSortie?: string
  hauteur?: number
  format?: (valeur: number) => string
  /** Largeur au premier rendu — une vignette MCP n'est pas mesurée à 640 px. */
  largeurInitiale?: number
}

/** Borne « ronde » immédiatement au-dessus de `v` (1, 2, 2,5 ou 5 × 10^k) —
 *  l'axe reste gradué en valeurs que l'œil lit. */
function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const pow = Math.pow(10, exp)
  const mant = v / pow
  const step = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 2.5 ? 2.5 : mant <= 5 ? 5 : 10
  return step * pow
}

/** Ligne de flux du miroir — même coordonnées que le tracé : les barres
 *  d'entrée/sortie sont des données normées, les réelles vivent dans le datum. */
type LigneFlux = { cle: string; label: string; valeur: number; dispo: number }

/**
 * Un niveau dans le temps : stock constaté puis projeté, carnet, encours.
 *
 * Le passé est plein, le futur est pointillé — la distinction est portée par
 * deux marques et non par une couleur, pour rester lisible à l'impression.
 *
 * Avec `afficherFluxMiroir`, la courbe occupe le haut et les flux le bas, sur
 * le modèle de HistoryChart : le zéro du stock à 62 % de la hauteur, l'axe des
 * flux à 80 %, l'amplitude ±17 %. Une seule échelle porte le tout — les flux
 * y entrent normés par moitié (chacune à son maximum), et c'est la lecture
 * d'une moitié contre l'autre qui serait fausse si on les mélangeait.
 */
export const CourbeProjection = memo(function CourbeProjection({
  points,
  seuil = null,
  charniere = null,
  regleX = null,
  flux,
  afficherFluxMiroir = false,
  couleurEntree = SERIE.ferme,
  couleurSortie = SERIE.alerte,
  hauteur = 200,
  format = fmtNombre,
  largeurInitiale = 640,
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

    const miroir = afficherFluxMiroir && flux !== undefined

    // Le miroir impose un domaine déclaré : le zéro du stock monte à 62 %, la
    // plage négative reçoit les flux (voir la note de la primitive).
    const maxStock = miroir
      ? niceCeil(Math.max(1, ...points.map((p) => p.valeur), seuil ?? 0))
      : null
    const x0 = maxStock !== null ? -(maxStock * 0.62) / 0.38 : 0
    const x1 = maxStock ?? 0
    const flowZero = miroir ? 0.8 * (x1 - x0) + x0 : 0
    const flowAmp = miroir ? (0.8 + 0.17) * (x1 - x0) + x0 - flowZero : 0

    // Maximum de flux par moitié : le journal passé (dizaines de milliers de
    // pièces) et le carnet à venir (quelques centaines) n'ont rien à voir.
    const fluxParMoitie = (projete: boolean) => {
      let m = 1
      for (const p of points)
        if (p.projete === projete) {
          const f = flux!(p.cle)
          if (f) m = Math.max(m, f.entree, f.sortie)
        }
      return m
    }
    const fluxMaxPasse = miroir ? fluxParMoitie(false) : 0
    const fluxMaxFutur = miroir ? fluxParMoitie(true) : 0

    const lignesFlux = (sens: 'entree' | 'sortie'): LigneFlux[] => {
      if (!miroir) return []
      const out: LigneFlux[] = []
      for (const p of points) {
        const f = flux!(p.cle)
        if (!f) continue
        const v = f[sens]
        if (v <= 0) continue
        const moitie = p.projete ? fluxMaxFutur : fluxMaxPasse
        out.push({
          cle: p.cle,
          label: `${p.label} · ${sens === 'entree' ? 'Entrées' : 'Sorties'}`,
          valeur: v,
          dispo: flowZero + (sens === 'entree' ? 1 : -1) * (v / moitie) * flowAmp,
        })
      }
      return out
    }

    return defineChart({
      marks: [
        ...(miroir
          ? [
              barY(lignesFlux('entree'), {
                x: 'cle',
                y: 'dispo',
                radius: 1,
                inset: 0.5,
                fill: couleurEntree,
              }),
              barY(lignesFlux('sortie'), {
                x: 'cle',
                y: 'dispo',
                radius: 1,
                inset: 0.5,
                fill: couleurSortie,
              }),
              ruleY([flowZero], { stroke: AXE.grille, strokeWidth: 1, id: 'axe-flux' }),
            ]
          : []),
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
        ...(regleX !== null
          ? [
              ruleX([regleX], {
                stroke: SERIE.alerte,
                strokeWidth: 1.25,
                strokeDasharray: '4 3',
                strokeOpacity: 0.85,
                id: 'rupture',
              }),
            ]
          : []),
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
        // Sans miroir, l'échelle est inférée. Avec, le domaine est exact —
        // les constantes de mise en page (62 %/80 %/±17 %) en dépendent.
        scale: miroir ? () => scaleLinear().domain([x0, x1]) : scaleLinear,
        nice: !miroir,
        grid: true,
        axis: {
          line: false,
          ticks: {
            size: 0,
            // La plage négative porte les flux, pas du stock : pas d'étiquette.
            format: (v: number) => (miroir && v < 0 ? '' : format(v)),
          },
          tickLabels: TICKS,
        },
      },
      tooltip: {
        ...TOOLTIP_FR,
        format: (point: { datum: PointProjection | LigneFlux }) => {
          const d = point.datum
          if ('dispo' in d) {
            const projete = points.find((p) => p.cle === d.cle)?.projete
            return `${d.label} · ${format(d.valeur)}${projete ? ' (projeté)' : ''}`
          }
          const fluxLigne = flux
            ? (() => {
                const f = flux(d.cle)
                if (!f) return ''
                return `\nentrées ${format(f.entree)} · sorties ${format(f.sortie)}`
              })()
            : ''
          return `${d.label} · ${format(d.valeur)}${d.projete ? ' (projeté)' : ''}${fluxLigne}`
        },
      },
    })
  }, [
    points,
    seuil,
    charniere,
    regleX,
    flux,
    afficherFluxMiroir,
    couleurEntree,
    couleurSortie,
    format,
  ])

  if (!definition) return null

  return (
    <Chart
      data-slot="chart"
      definition={definition}
      ariaLabel={ariaLabel}
      ariaDescription={ariaDescription}
      height={hauteur}
      initialWidth={largeurInitiale}
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
            style={{ background: s.couleur ?? SERIE[s.serie] }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

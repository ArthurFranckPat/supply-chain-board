import { useEffect, useMemo, useRef, useState } from 'react'
import {
  HistogrammeCharge,
  Legende,
  type PeriodeCharge,
  type SegmentCharge,
} from '@r/components/ui/chart'
import { SERIE, fmtHeures } from '@r/lib/charts/theme'
import type { LoadPeriod, LoadView } from '@r/lib/load/types'
import { type Gran, type LoadSegOption, segmentDeCle, satRate, total } from '@r/lib/load/chart-math'

/**
 * Histogramme de détail (poste sélectionné) de la vue « Projection de charge »
 * (issue #52 — extrait de scheduler/load.tsx).
 *
 * Tout passe par HistogrammeCharge (@tanstack/charts) : empilement déclaré,
 * domaine `[0, max]` avec marge haute pour les totaux, capacité en courbe
 * (elle varie d'une période à l'autre), moyenne mobile, pic. La légende est
 * du HTML à côté du graphe — plus rien n'est dessiné dans le SVG à la main.
 *
 * Hauteur : `HistogrammeCharge` prend un nombre de pixels, pas un `100%` —
 * la page étant `dense scrollable={false}`, une valeur en dur laissait tout
 * le bas du panneau vide sur un écran haut. On mesure donc la place réellement
 * offerte par le conteneur et on la passe au graphe.
 */

/** Plancher de lisibilité : sous ~180 px les ticks et les totaux se marchent dessus. */
const HAUTEUR_MIN = 180

interface DetailChartProps {
  items: { label: string; d: LoadPeriod; cap: number }[]
  gran: Gran
  view: LoadView
  showCapacity: boolean
  showAvg: boolean
  /** Segments effectivement tracés (filtre statut/nature appliqué) — légende. */
  segs: LoadSegOption[]
  /** Clic sur une période : ouvre le détail de la barre (index dans `items`). */
  onSelectPeriod?: (index: number) => void
}

export function DetailChart({
  items,
  gran,
  view,
  showCapacity,
  showAvg,
  segs,
  onSelectPeriod,
}: DetailChartProps) {
  /** Segments de la pile, limités aux options actives — la légende ne montre
   *  que ce qui est réellement peint. */
  const segments = useMemo<SegmentCharge[]>(
    () => segs.flatMap((o) => o.keys.map((k) => segmentDeCle(k, view))),
    [segs, view]
  )

  const periodes = useMemo<PeriodeCharge[]>(
    () =>
      items.map((it, i) => ({
        cle: `p${i}`,
        label: it.label,
        valeurs: Object.fromEntries(
          segments.map((s) => {
            const k = s.cle ?? s.serie
            return [k, k in it.d ? it.d[k as keyof LoadPeriod] : 0]
          })
        ),
        capacite: it.cap > 0 ? it.cap : null,
      })),
    [items, segments]
  )

  // Domaine déclaré : le max charge/capacité, avec marge haute pour que les
  // totaux inscrits au sommet des barres ne soient pas rognés.
  const max = useMemo(() => {
    const T = items.map((it) => total(it.d))
    const C = items.map((it) => it.cap)
    return Math.max(...T, ...C, 0) * 1.18 || 1
  }, [items])

  /* La place restante sous la légende. `ResizeObserver` et non une mesure au
     montage : le panneau change de hauteur au repli de la sidebar, au passage
     Mois ↔ Semaine (la légende peut passer sur deux lignes) et au redimension-
     nement de la fenêtre. */
  const zone = useRef<HTMLDivElement>(null)
  const [hauteur, setHauteur] = useState(240)

  useEffect(() => {
    const el = zone.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entree]) => {
      const h = entree.contentRect.height
      if (h > 0) setHauteur(Math.max(HAUTEUR_MIN, Math.round(h)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Légende au-dessus du graphe, attachée à ce qu'elle décrit — en HTML,
          sélectionnable et imprimable (règle design-system § 22). */}
      <div className="mb-1.5 flex flex-none flex-wrap items-center gap-x-4 gap-y-1">
        <Legende segments={segments} />
        {showCapacity && (
          <span className="inline-flex items-center gap-1.5 text-1.5xs text-muted-foreground">
            <span
              aria-hidden
              className="inline-block h-0 w-3.5 border-t-2 border-dashed"
              style={{ borderColor: SERIE.capacite }}
            />
            Capacité
          </span>
        )}
        {showAvg && (
          <span className="inline-flex items-center gap-1.5 text-1.5xs text-muted-foreground">
            <span
              aria-hidden
              className="inline-block h-0 w-3.5 border-t-2 border-dashed"
              style={{ borderColor: SERIE.tendance }}
            />
            Moyenne mobile
          </span>
        )}
      </div>

      {/* `flex-1 min-h-0` : la hauteur vient du parent, jamais du contenu —
          sinon le graphe qu'on dimensionne d'après cette boîte la
          redimensionnerait à son tour, et l'observateur boucherait. */}
      <div ref={zone} className="min-h-0 flex-1 overflow-hidden">
        <HistogrammeCharge
          periodes={periodes}
          segments={segments}
          max={max}
          hauteur={hauteur}
          afficherCapacite={showCapacity}
          labelsEnBarre
          totaux
          moyenneMobile={gran === 'week' ? 8 : 2}
          pic
          tailleTicks={gran === 'week' ? 8 : 12}
          largeurInitiale={760}
          format={(v) => Math.round(v).toLocaleString('fr-FR')}
          formatTooltip={(points) => {
            const premier = points[0]?.datum
            if (!premier) return ''
            const tot = points.reduce((s, p) => s + p.datum.valeur, 0)
            const lignes = points
              .map((p) => {
                const part = tot > 0 ? Math.round((p.datum.valeur / tot) * 100) : 0
                return `${p.datum.serieLabel} ${fmtHeures(p.datum.valeur)} · ${part} % du total`
              })
              .join(' · ')
            const plafond =
              premier.capacite !== null && premier.capacite > 0
                ? ` · capacité ${fmtHeures(premier.capacite)}`
                : ''
            const sat =
              premier.capacite !== null && premier.capacite > 0
                ? ` · saturation ${Math.round(satRate(tot, premier.capacite))} %`
                : ''
            const clic = onSelectPeriod ? '\nClic : détail de la période' : ''
            return `${premier.label.replace(/\n/g, ' · ')} — ${fmtHeures(tot)}${plafond}${sat}\n${lignes}${clic}`
          }}
          onSelectPeriode={
            onSelectPeriod ? (cle) => onSelectPeriod(Number(cle.slice(1))) : undefined
          }
          ariaLabel={`Charge de la période — ${items[0]?.label.replace(/\n/g, ' ')} à ${items[items.length - 1]?.label.replace(/\n/g, ' ')}`}
          ariaDescription={`Total de l'horizon : ${fmtHeures(items.reduce((s, it) => s + total(it.d), 0))}`}
        />
      </div>
    </div>
  )
}

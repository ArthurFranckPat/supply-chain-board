import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { TriangleAlert, Search } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'
import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import type {
  LoadPageProps,
  LoadLine,
  LoadPeriod,
  LoadQtyMode,
  LoadUnit,
  LoadView,
} from '@r/lib/load/types'
import {
  CMD_SEG_OPTIONS,
  type Gran,
  maskPeriod,
  OF_SEG_OPTIONS,
  satColor,
  satRate,
  segKeys,
  segOptions,
  total,
} from '@r/lib/load/chart-math'
import { HatchDefs } from '@r/components/load/hatch-defs'
import { MiniCard } from '@r/components/load/mini-card'
import { DetailChart } from '@r/components/load/detail-chart'
import { ChargePeriodSheet } from '@r/components/load/charge-period-sheet'
import { MaterialCheck } from '@r/components/load/material-check'
import {
  FilterMenu,
  FilterMenuSectionLabel,
  PILL,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'

/**
 * Page « Projection de charge » — vision long terme, variante 3 « Charge par ligne »
 * (design/mockups/forecast/3-overview.html).
 *
 * Grille de mini-graphes (un par poste de charge) pour comparer d'un coup d'œil, +
 * panneau de détail (histogramme empilé Ferme/Planifié/Suggéré, moyenne mobile, pic)
 * sur le poste sélectionné, avec bascule de maille Mois ↔ Semaine. Données calculées
 * serveur (LoadController) ; ici, pure présentation SVG réactive.
 *
 * Shell (état + toolbar + composition) — dérivations et rendu des graphes vivent
 * dans lib/load/chart-math.ts et components/load/*.tsx (issue #52).
 */

/**
 * Les trois crans de quantité, dans l'ordre de la chaîne de déduction :
 * brut → net → reste. Les libellés d'aide sont volontairement explicites : sans
 * eux, « Net » et « Reste » se ressemblent trop pour qu'on devine ce qui a été
 * retiré, et un chiffre plus petit sans justification est pire qu'un chiffre faux.
 */
const QTY_MODES: { id: LoadQtyMode; label: string; hint: string }[] = [
  { id: 'brut', label: 'Brut', hint: 'Besoin explosé depuis les commandes, avant toute déduction' },
  {
    id: 'net',
    label: 'Net',
    hint: "Brut − stock disponible (physique + CQ), consommé FIFO sur l'horizon",
  },
  {
    id: 'reste',
    label: 'Reste à produire',
    hint: 'Net − pièces déjà produites sur les OF en cours et pas encore déclarées',
  },
]

/**
 * Modes d'affichage de la page — relais de session (sessionStorage).
 *
 * Vue, unité, cran de quantité, maille, filtres : rien de tout cela n'est une
 * donnée, c'est la façon dont on regarde la page. Or Inertia remonte le
 * composant à chaque visite (`preserveState` vaut `false` par défaut), et un
 * simple rafraîchissement fait de même : sans relais, le planificateur qui
 * vient de basculer en Pièces retrouve des Heures dès qu'il touche à la fenêtre
 * des OF ou revient sur la page.
 *
 * Même patron que les filtres du séquenceur (`sequenceur:filters`). Périmètre
 * restreint aux MODES : la recherche texte et le poste sélectionné restent
 * locaux — une recherche retrouvée à l'ouverture filtrerait la page sans qu'on
 * l'ait demandé, et `selected` se recale de lui-même sur le premier poste
 * visible.
 */
const MODES_STORAGE_KEY = 'charge:modes'

type StoredModes = {
  view: LoadView
  unit: LoadUnit
  qtyMode: LoadQtyMode
  gran: Gran
  /** Ids des options de segment actives, par vue (`OF_SEG_OPTIONS` / `CMD_SEG_OPTIONS`). */
  ofStatus: string[]
  cmdNature: string[]
  /** Ateliers (STOLOC) cochés dans le filtre transverse. */
  ateliers: string[]
  showCapacity: boolean
  showAvg: boolean
}

const STORED_MODES_DEFAULTS: StoredModes = {
  view: 'of',
  unit: 'h',
  qtyMode: 'reste',
  gran: 'month',
  ofStatus: OF_SEG_OPTIONS.map((o) => o.id),
  cmdNature: CMD_SEG_OPTIONS.map((o) => o.id),
  ateliers: [],
  showCapacity: true,
  showAvg: false,
}

/**
 * Relit les modes stockés. Chaque champ est validé contre ses valeurs
 * admissibles : une entrée écrite par une version antérieure (ou tronquée) ne
 * doit jamais pouvoir produire un filtre impossible — tout décocher donnerait
 * une page vide sans bouton pour en sortir.
 */
function readStoredModes(): StoredModes {
  const ofIds = OF_SEG_OPTIONS.map((o) => o.id)
  const cmdIds = CMD_SEG_OPTIONS.map((o) => o.id)
  try {
    const raw = sessionStorage.getItem(MODES_STORAGE_KEY)
    if (!raw) return STORED_MODES_DEFAULTS
    const p = JSON.parse(raw) as Partial<StoredModes>
    // Aucun segment coché n'a de sens (graphes vides) : on retombe sur le tout-actif.
    const segs = (v: unknown, allowed: string[]): string[] => {
      const kept = Array.isArray(v) ? v.filter((x) => allowed.includes(x as string)) : []
      return kept.length ? (kept as string[]) : allowed
    }
    return {
      view: p.view === 'commande' ? 'commande' : 'of',
      unit: p.unit === 'u' ? 'u' : 'h',
      qtyMode: p.qtyMode === 'brut' || p.qtyMode === 'net' ? p.qtyMode : 'reste',
      gran: p.gran === 'week' ? 'week' : 'month',
      ofStatus: segs(p.ofStatus, ofIds),
      cmdNature: segs(p.cmdNature, cmdIds),
      ateliers: Array.isArray(p.ateliers)
        ? (p.ateliers.filter((c) => typeof c === 'string') as string[])
        : [],
      showCapacity: p.showCapacity !== false,
      showAvg: p.showAvg === true,
    }
  } catch {
    return STORED_MODES_DEFAULTS
  }
}

function writeStoredModes(modes: StoredModes) {
  try {
    sessionStorage.setItem(MODES_STORAGE_KEY, JSON.stringify(modes))
  } catch {
    // sessionStorage indisponible (quota, navigation restreinte) — état React seul.
  }
}

export default function Load(props: LoadPageProps) {
  /** Modes relus une seule fois : ils n'amorcent que les `useState` ci-dessous. */
  const stored = useMemo(() => readStoredModes(), [])

  const [view, setView] = useState<LoadView>(stored.view)
  const [selected, setSelected] = useState(props.ofLines[0]?.code ?? '')
  const [gran, setGran] = useState<Gran>(stored.gran)
  const [query, setQuery] = useState('')
  const [showCapacity, setShowCapacity] = useState(stored.showCapacity)
  const [showAvg, setShowAvg] = useState(stored.showAvg)
  // Un atelier stocké qui n'est plus dans le payload (changement de site, de
  // périmètre) filtrerait tout sans que sa chip existe à l'écran : on l'écarte.
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(
    () => new Set(stored.ateliers.filter((c) => props.ateliers.some((a) => a.code === c)))
  )

  const toggleAtelier = (code: string) => {
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  // Défaut « reste » : un planificateur ouvre la page pour savoir ce qu'il reste à
  // faire, pas ce que les commandes demandaient avant déduction. Les deux autres
  // crans restent accessibles — le brut sert à voir la demande nue, le net à
  // isoler ce que le stock absorbe.
  const [qtyMode, setQtyMode] = useState<LoadQtyMode>(stored.qtyMode)
  const viewNet = useCallback(
    (l: LoadLine): LoadLine =>
      qtyMode === 'net'
        ? { ...l, monthly: l.monthlyNet, weekly: l.weeklyNet }
        : qtyMode === 'reste'
          ? { ...l, monthly: l.monthlyReste, weekly: l.weeklyReste }
          : l,
    [qtyMode]
  )

  /**
   * Unité d'affichage de la charge : heures de poste (défaut, historique) ou
   * pièces opérées. Transverse aux deux vues et aux trois crans — les séries en
   * pièces viennent du serveur (`monthlyQty`…), on ne les recalcule JAMAIS depuis
   * les heures : l'efficience poste pondère le temps et pas la quantité.
   */
  const [unit, setUnit] = useState<LoadUnit>(stored.unit)
  const unitActive = unit === 'u'
  /**
   * La capacité est un temps : en pièces elle n'a ni axe ni sens. On la masque
   * (plafond, zones de surcharge, pourcentage) au lieu de la comparer à des
   * pièces — cf. `MiniCard` / `DetailChart`, qui reçoivent `capacityOn`.
   */
  const capacityOn = showCapacity && !unitActive

  /**
   * Série TRACÉE d'un poste : les heures déjà mises au cran choisi (`lines`),
   * ou la série en pièces correspondante quand l'unité active est « u ».
   *
   * On ne substitue pas `monthly`/`weekly` sur la ligne : la capacité et la
   * saturation restent lues sur ces séries-là (temps ÷ temps), et un poste ne
   * doit pas se retrouver avec deux unités sous le même nom de champ.
   */
  const seriesOf = useCallback(
    (l: LoadLine, g: Gran): LoadPeriod[] => {
      if (!unitActive) return g === 'month' ? l.monthly : l.weekly
      if (g === 'month') {
        return qtyMode === 'net'
          ? l.monthlyNetQty
          : qtyMode === 'reste'
            ? l.monthlyResteQty
            : l.monthlyQty
      }
      return qtyMode === 'net'
        ? l.weeklyNetQty
        : qtyMode === 'reste'
          ? l.weeklyResteQty
          : l.weeklyQty
    },
    [unitActive, qtyMode]
  )

  // Filtre de segments — un jeu par vue : la vue OF filtre des STATUTS
  // (Ferme/Planifié/Suggéré), la vue Commande des NATURES (Commande/Prévision).
  // Deux états séparés pour qu'une bascule de vue ne perde pas la sélection.
  const [ofStatus, setOfStatus] = useState<Set<string>>(new Set(stored.ofStatus))
  const [cmdNature, setCmdNature] = useState<Set<string>>(new Set(stored.cmdNature))
  const activeSegs = view === 'of' ? ofStatus : cmdNature
  const setActiveSegs = view === 'of' ? setOfStatus : setCmdNature

  /**
   * Relais de session : les modes rendus sont recopiés dans sessionStorage à
   * chaque changement. Un effet plutôt que des écritures dans chaque setter —
   * les filtres se modifient en place (`new Set(prev)`), et un point d'écriture
   * unique suffit à garantir qu'aucune bascule n'échappe au relais.
   */
  useEffect(() => {
    writeStoredModes({
      view,
      unit,
      qtyMode,
      gran,
      ofStatus: [...ofStatus],
      cmdNature: [...cmdNature],
      ateliers: [...atelierFilter],
      showCapacity,
      showAvg,
    })
  }, [view, unit, qtyMode, gran, ofStatus, cmdNature, atelierFilter, showCapacity, showAvg])

  const toggleSeg = (id: string) => {
    setActiveSegs((prev) => {
      // Tout décocher n'a pas de sens (graphes vides) : le dernier actif est verrouillé.
      if (prev.has(id) && prev.size === 1) return prev
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const segFiltered = activeSegs.size < segOptions(view).length
  /** Segments réellement tracés — alimente la légende intégrée au graphe. */
  const visibleSegs = useMemo(
    () => segOptions(view).filter((o) => activeSegs.has(o.id)),
    [view, activeSegs]
  )

  // Filtres secondaires uniquement (hors recherche, toujours visible dans la
  // rangée) — pilote la pastille du déclencheur FilterMenu.
  const filtersActive = segFiltered || atelierFilter.size > 0

  /**
   * Charge par poste, en HEURES, masque de segments appliqué. La capacité et la
   * saturation (charge ÷ capacité) se lisent sur cette série quelle que soit
   * l'unité affichée : elles comparent un temps à un temps.
   */
  const lines = useMemo(() => {
    const keep = segKeys(view, activeSegs)
    const base = (view === 'of' ? props.ofLines : props.cmdLines).map(viewNet)
    if (!segFiltered) return base
    return (
      base
        .map((l) => ({
          ...l,
          monthly: l.monthly.map((p) => maskPeriod(p, keep)),
          weekly: l.weekly.map((p) => maskPeriod(p, keep)),
          // Les séries en pièces portent les mêmes segments : sans ce masque,
          // une bascule « Ferme » seule laisserait le planifié dans les pièces
          // et le graphe se contredirait entre les deux unités.
          monthlyQty: l.monthlyQty.map((p) => maskPeriod(p, keep)),
          weeklyQty: l.weeklyQty.map((p) => maskPeriod(p, keep)),
          monthlyNetQty: l.monthlyNetQty.map((p) => maskPeriod(p, keep)),
          weeklyNetQty: l.weeklyNetQty.map((p) => maskPeriod(p, keep)),
          monthlyResteQty: l.monthlyResteQty.map((p) => maskPeriod(p, keep)),
          weeklyResteQty: l.weeklyResteQty.map((p) => maskPeriod(p, keep)),
        }))
        // Un poste sans charge restante n'a plus rien à montrer : on le sort du
        // slider plutôt que d'afficher une carte plate à 0 h.
        .filter((l) => l.monthly.some((p) => total(p) > 0))
    )
  }, [view, props.ofLines, props.cmdLines, activeSegs, segFiltered, viewNet])

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ats = atelierFilter
    return lines.filter((l) => {
      if (ats.size && !ats.has(l.atelier)) return false
      if (q && !`${l.code} ${l.name} ${l.articles.join(' ')}`.toLowerCase().includes(q))
        return false
      return true
    })
  }, [lines, query, atelierFilter])

  // Si la sélection sort du filtre, bascule sur le premier poste visible.
  useEffect(() => {
    const fl = filteredLines
    if (fl.length && !fl.some((l) => l.code === selected)) {
      setSelected(fl[0].code)
    }
  }, [filteredLines, selected])

  const selLine = useMemo(
    () => lines.find((l) => l.code === selected) ?? filteredLines[0],
    [lines, selected, filteredLines]
  )

  // ── Slider sans barre : molette → défilé horizontal LISSÉ (inertie rAF) ──
  const sliderRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = () => {
    const el = sliderRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }

  const onSliderWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = sliderRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  useEffect(() => {
    requestAnimationFrame(updateEdges)
    const onResize = () => updateEdges()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    filteredLines
    requestAnimationFrame(updateEdges)
  }, [filteredLines])

  const detailItems = useMemo(() => {
    const line = selLine
    if (!line) return []
    // Capacité en pièces : aucune (cf. `capacityOn`) — on n'alimente pas l'axe
    // d'un plafond en heures, qui écraserait l'échelle.
    const caps = gran === 'month' ? line.capacity.monthly : line.capacity.weekly
    return seriesOf(line, gran).map((d, i) => ({
      label: (gran === 'month' ? props.months[i] : props.weeks[i]) ?? '',
      d,
      cap: capacityOn ? (caps[i] ?? 0) : 0,
    }))
  }, [selLine, gran, props.months, props.weeks, capacityOn, seriesOf])

  // Détail d'une période : le clic passe la CLÉ du bucket (pas son index), pour
  // que la demande reste valide même si l'horizon a glissé entre-temps.
  const [periodTarget, setPeriodTarget] = useState<{
    poste: string
    bucketKey: string
    gran: Gran
    periodLabel: string
  } | null>(null)

  const openPeriod = (index: number) => {
    if (!selLine) return
    const key = gran === 'month' ? props.monthKeys[index] : props.weekKeys[index]
    if (!key) return
    const label = (gran === 'month' ? props.months[index] : props.weeks[index]) ?? ''
    setPeriodTarget({
      poste: selLine.code,
      bucketKey: key,
      gran,
      periodLabel: label.replace('\n', ' '),
    })
  }

  const selSaturation = useMemo(() => {
    const line = selLine
    if (!line) return { charge: 0, cap: 0, rate: 0 }
    const periods = gran === 'month' ? line.monthly : line.weekly
    const caps = gran === 'month' ? line.capacity.monthly : line.capacity.weekly
    const charge = periods.reduce((a, p) => a + total(p), 0)
    const cap = caps.reduce((a, c) => a + c, 0)
    return { charge, cap, rate: satRate(charge, cap) }
  }, [selLine, gran])

  return (
    <AppLayout
      title="Charge · Projection"
      active="load"
      subtitle="Charge · vision long terme"
      theme="airbnb"
      dense
      scrollable={false}
    >
      <HatchDefs />

      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1`/`h-full` de
          la toolbar et du contenu en dessous ne se dimensionnent contre rien
          et débordent hors de l'écran sans scroll possible. */}
      <div className="flex h-full min-h-0 flex-col">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* D9 — la troncature depth-4 était silencieuse : on la chiffre, sinon
            une barre plus basse qu'attendu n'a aucune explication à l'écran. */}
        {view === 'commande' && (props.depthCut?.truncated ?? 0) > 0 && (
          <div className="flex flex-none items-center gap-2 border-b border-border bg-muted/40 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-secondary-foreground" />
            <span className="font-bold">Charge tronquée :</span>
            <span>
              {props.depthCut!.truncated} besoin(s) fabriqué(s) au-delà du niveau 4 ne sont pas
              chargés
              {props.depthCut!.parents.length > 0 &&
                ` — ${props.depthCut!.parents.slice(0, 3).join(', ')}${
                  props.depthCut!.parents.length > 3 ? '…' : ''
                }`}
            </span>
          </div>
        )}

        {/* Sélecteur de vue + filtres + recherche (la légende vit dans le graphe) */}
        <ToolbarRow className="text-xs font-semibold text-secondary-foreground">
          {/* Bascule OF ↔ Commande */}
          <Segment role="radiogroup" ariaLabel="Vue">
            {(['of', 'commande'] as const).map((v) => (
              <SegmentButton key={v} role="radio" active={view === v} onClick={() => setView(v)}>
                {v === 'of' ? 'OF' : 'Commande'}
              </SegmentButton>
            ))}
          </Segment>
          {/* Bascule Heures ↔ Pièces — transverse aux deux vues et aux trois
              crans. Le libellé porte l'unité en clair (pas une icône) : c'est un
              changement de ce que le chiffre VEUT DIRE, pas un réglage cosmétique. */}
          <Segment role="radiogroup" ariaLabel="Unité affichée">
            <SegmentButton
              role="radio"
              active={unit === 'h'}
              title="Heures de poste — Σ (qté / cadence), l'unité de la capacité"
              onClick={() => setUnit('h')}
            >
              Heures
            </SegmentButton>
            <SegmentButton
              role="radio"
              active={unit === 'u'}
              title="Pièces opérées sur le poste — la quantité qui traverse la gamme. La capacité reste en heures : elle n'a pas d'équivalent pièces."
              onClick={() => setUnit('u')}
            >
              Pièces
            </SegmentButton>
          </Segment>
          {/* Bascule Brut / Net / Reste à produire (vue commande) */}
          {view === 'commande' && (
            <Segment role="radiogroup" ariaLabel="Quantité affichée">
              {QTY_MODES.map((m) => (
                <SegmentButton
                  key={m.id}
                  role="radio"
                  active={qtyMode === m.id}
                  title={m.hint}
                  onClick={() => setQtyMode(m.id)}
                >
                  {m.label}
                </SegmentButton>
              ))}
            </Segment>
          )}
          {view === 'of' && (
            <Segment role="radiogroup" ariaLabel="Date de rattachement des OF">
              <SegmentButton
                role="radio"
                active={props.ofDate === 'start'}
                onClick={() => {
                  if (props.ofDate === 'start') return
                  const url = new URL(window.location.href)
                  url.searchParams.set('ofDate', 'start')
                  router.visit(`${url.pathname}?${url.searchParams.toString()}`, {
                    preserveScroll: true,
                    // Même page, même composant : sans cela Inertia le remonte
                    // (`preserveState` vaut false par défaut) et la bascule
                    // Heures/Pièces repart de son défaut sous les yeux de
                    // l'utilisateur.
                    preserveState: true,
                  })
                }}
              >
                Début OF
              </SegmentButton>
              <SegmentButton
                role="radio"
                active={props.ofDate === 'end'}
                onClick={() => {
                  if (props.ofDate === 'end') return
                  const url = new URL(window.location.href)
                  url.searchParams.set('ofDate', 'end')
                  router.visit(`${url.pathname}?${url.searchParams.toString()}`, {
                    preserveScroll: true,
                    preserveState: true,
                  })
                }}
              >
                Fin OF
              </SegmentButton>
            </Segment>
          )}
          {/* Filtres — déclencheur unique (Statut ou Nature selon la vue +
              Atelier). Même grammaire que Suivi/Ruptures : pas de chips
              empilées dans la rangée, pas de rangée dédiée sous la toolbar. */}
          <FilterMenu
            label="Filtres"
            indicators={
              filtersActive ? (
                <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" />
              ) : null
            }
          >
            <div className="flex items-center justify-between">
              {/* La vue OF ventile par STATUT d'ordre, la vue Commande par
                  NATURE de demande : même filtre, deux vocabulaires métier. */}
              <FilterMenuSectionLabel>{view === 'of' ? 'Statut' : 'Nature'}</FilterMenuSectionLabel>
              {segFiltered && (
                <button
                  type="button"
                  className="rounded-md px-1.5 py-1 font-mono text-2xs font-bold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setActiveSegs(new Set(segOptions(view).map((o) => o.id)))}
                  title={`Réinitialiser le filtre ${view === 'of' ? 'statut' : 'nature'}`}
                >
                  ✕
                </button>
              )}
            </div>
            <Segment className="w-full flex-wrap">
              {segOptions(view).map((o) => (
                <SegmentButton
                  key={o.id}
                  active={activeSegs.has(o.id)}
                  onClick={() => toggleSeg(o.id)}
                  title={o.label}
                >
                  {o.label}
                </SegmentButton>
              ))}
            </Segment>
            {/* Filtre atelier (#36) — chips STOLOC, transverse aux 2 vues.
                Vivait dans sa propre rangée sous la toolbar : consolidé ici. */}
            {props.ateliers.length > 0 && (
              <>
                <div className="my-2.5 border-t border-rule-soft" />
                <div className="flex items-center justify-between">
                  <FilterMenuSectionLabel>Atelier</FilterMenuSectionLabel>
                  {atelierFilter.size > 0 && (
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-1 font-mono text-2xs font-bold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setAtelierFilter(new Set())}
                      title="Réinitialiser le filtre atelier"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <Segment className="w-full flex-wrap">
                  {props.ateliers.map((a) => (
                    <SegmentButton
                      key={a.code}
                      active={atelierFilter.has(a.code)}
                      onClick={() => toggleAtelier(a.code)}
                      title={a.code}
                    >
                      {a.label.replace(/^ATELIER\s+/i, '')}
                    </SegmentButton>
                  ))}
                </Segment>
              </>
            )}
            {/* Couches d'affichage — pas des filtres (elles ne retirent aucune
                donnée), mais même déclencheur : la rangée n'a pas à porter des
                coches ad hoc. Elles ne pilotent donc PAS la pastille du
                déclencheur, sinon « Capacité » (activée par défaut) la
                laisserait allumée en permanence. */}
            <div className="my-2.5 border-t border-rule-soft" />
            <FilterMenuSectionLabel>Affichage</FilterMenuSectionLabel>
            <Segment className="w-full flex-wrap">
              <SegmentButton
                active={capacityOn}
                disabled={unitActive}
                onClick={() => setShowCapacity((v) => !v)}
                title={
                  unitActive
                    ? 'Indisponible en pièces : la capacité d’un poste est un temps (heures), elle ne se convertit pas en quantité'
                    : 'Plafond de capacité nette + zones de surcharge'
                }
              >
                Capacité
              </SegmentButton>
              <SegmentButton
                active={showAvg}
                onClick={() => setShowAvg((v) => !v)}
                title="Moyenne mobile de la charge totale"
              >
                Moyenne mobile
              </SegmentButton>
            </Segment>
          </FilterMenu>
          {/* Pas de légende ici : elle est dessinée DANS le graphe de détail
              (DetailChart), attachée à ce qu'elle décrit. */}
          <ToolbarSpacer />
          {/* Recherche — systématiquement à droite, jamais consolidée derrière
              un clic (convention toolbar). */}
          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[190px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Poste, article…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
            />
          </div>
        </ToolbarRow>

        {lines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            {segFiltered
              ? `Aucune charge ${segOptions(view)
                  .filter((o) => activeSegs.has(o.id))
                  .map((o) => o.label.toLowerCase())
                  .join(' / ')} sur l'horizon.`
              : view === 'of'
                ? "Aucune charge OF sur l'horizon."
                : "Aucune charge commande sur l'horizon."}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-7 py-5">
            {/* Vue d'ensemble : slider horizontal de mini-cartes */}
            {filteredLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-rule px-4 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
                Aucun poste ne correspond à « {query} ».
              </div>
            ) : (
              <div className="relative flex-none">
                <div
                  ref={sliderRef}
                  onWheel={onSliderWheel}
                  onScroll={updateEdges}
                  className="no-scrollbar flex gap-3 overflow-x-auto pb-2"
                >
                  {filteredLines.map((line) => (
                    <MiniCard
                      key={line.code}
                      line={line}
                      series={seriesOf(line, 'month')}
                      months={props.months}
                      selected={selected === line.code}
                      showCapacity={capacityOn}
                      unit={unit}
                      onSelect={() => setSelected(line.code)}
                    />
                  ))}
                </div>
                {/* Dégradés de bord */}
                <div
                  className={cn(
                    'pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent transition-opacity duration-200',
                    atStart && 'opacity-0'
                  )}
                />
                <div
                  className={cn(
                    'pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-200',
                    atEnd && 'opacity-0'
                  )}
                />
              </div>
            )}

            {/* Détail du poste sélectionné */}
            {selLine && (
              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-rule bg-card p-4">
                <div className="mb-2.5 flex flex-none flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 font-fraunces text-[20px] font-extrabold tracking-tight">
                    <span className="size-3 rounded-[3px]" style={{ background: selLine.color }} />
                    {selLine.code}
                    <span className="font-sans text-[14px] font-medium text-muted-foreground">
                      · {selLine.name}
                    </span>
                  </div>
                  {selLine.atelier && (
                    <span className="rounded-full border border-rule bg-secondary px-2.5 py-1 font-mono text-[10px] font-semibold text-secondary-foreground">
                      {selLine.atelierLabel}
                    </span>
                  )}
                  {/* Badge saturation (#35) */}
                  {selSaturation.cap > 0 && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                      style={{
                        color: satColor(selSaturation.charge, selSaturation.cap),
                        backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
                      }}
                    >
                      <DynamicIcon
                        name={selSaturation.rate > 100 ? 'warning' : 'speed'}
                        size={14}
                      />
                      Saturation {Math.round(selSaturation.rate)}%
                      <span className="font-sans font-medium opacity-70">
                        ({selSaturation.charge} / {selSaturation.cap} h)
                      </span>
                    </span>
                  )}
                  <div className="ml-auto inline-flex rounded-full border border-rule bg-secondary p-[3px]">
                    <button
                      type="button"
                      onClick={() => setGran('month')}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                        gran === 'month' ? 'bg-card text-brand' : 'text-muted-foreground'
                      )}
                    >
                      Mois
                    </button>
                    <button
                      type="button"
                      onClick={() => setGran('week')}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                        gran === 'week' ? 'bg-card text-brand' : 'text-muted-foreground'
                      )}
                    >
                      Semaine
                    </button>
                  </div>
                </div>
                <DetailChart
                  items={detailItems}
                  gran={gran}
                  view={view}
                  showCapacity={capacityOn}
                  showAvg={showAvg}
                  unit={unit}
                  segs={visibleSegs}
                  onSelectPeriod={openPeriod}
                />
                {/* Le graphe dit les heures ; ce panneau dit si elles sont
                    tenables. Calcul à la demande — cf. `MaterialCheck`. */}
                <MaterialCheck
                  poste={selLine.code}
                  gran={gran}
                  monthKeys={props.monthKeys}
                  weekKeys={props.weekKeys}
                  startIso={props.startIso}
                  view={view}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Détail de la période cliquée. `activeSegs`/`qtyMode` sont passés tels
          quels : la table applique le MÊME masque et le MÊME cran que le graphe,
          donc son total suit la hauteur de la barre sans re-fetch au changement
          de filtre. */}
      <ChargePeriodSheet
        open={!!periodTarget}
        onOpenChange={(v) => !v && setPeriodTarget(null)}
        target={periodTarget}
        view={view}
        start={props.startIso}
        version={props.version}
        activeSegs={activeSegs}
        qtyMode={qtyMode}
        unit={unit}
        ofDate={props.ofDate}
      />
    </AppLayout>
  )
}

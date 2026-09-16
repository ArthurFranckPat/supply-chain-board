import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import {
  TriangleAlert,
  Search,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'
import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import { useReplayEnter } from '@r/lib/use-replay-enter'
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

/** Flèche du carrousel de postes (panneau de détail) — même facture que les
 *  pastilles d'icône de la toolbar, en plus petit : elle vit dans l'entête du
 *  panneau, pas dans une rangée de filtres. */
const CAROUSEL_BTN =
  'inline-flex size-[26px] flex-none items-center justify-center rounded-full border border-rule bg-card text-muted-foreground transition-colors hover:border-brand hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-rule disabled:hover:text-muted-foreground'

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
  /**
   * Rangée de cartes. Un ÉTAT (ref de rappel) plutôt qu'un `useRef` : la rangée
   * n'existe pas toujours — aucun poste ne correspond au filtre, ou l'atelier
   * restauré de la session ne couvre rien — et la molette comme le centrage
   * doivent s'y raccrocher au moment où elle apparaît, pas au montage de la page.
   */
  const [sliderEl, setSliderEl] = useState<HTMLDivElement | null>(null)
  /** Rangée complète (cartes + dégradés de bord) — cible de l'animation d'entrée. */
  const sliderRowRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = useCallback(() => {
    if (!sliderEl) return
    setAtStart(sliderEl.scrollLeft <= 1)
    setAtEnd(sliderEl.scrollLeft + sliderEl.clientWidth >= sliderEl.scrollWidth - 1)
  }, [sliderEl])

  /**
   * Amorce une glissade vers une position — renseignée par l'effet qui pose la
   * molette (une seule boucle rAF, donc un seul écrivain de `scrollLeft` : un
   * défilement natif « smooth » lancé en parallèle se battrait avec elle).
   */
  const glideToRef = useRef<(left: number) => void>(() => {})

  /**
   * Défilé à inertie. La molette ne pousse plus `scrollLeft` en direct — un cran
   * de souris vaut ~100 px, donc un saut — mais une CIBLE que chaque frame
   * rapproche d'un facteur constant. Le trackpad, qui émet déjà des deltas fins,
   * ne s'en trouve presque pas changé.
   *
   * Écouteur NATIF `passive: false` : le `onWheel` de React est posé passif sur
   * la racine, son `preventDefault()` ne faisait donc rien (et la console le
   * signalait) — le geste vertical restait consommé par le navigateur.
   */
  useEffect(() => {
    if (!sliderEl) return

    let target = sliderEl.scrollLeft
    let raf: number | null = null

    const step = () => {
      const delta = target - sliderEl.scrollLeft
      if (Math.abs(delta) < 0.5) {
        sliderEl.scrollLeft = target
        raf = null
        return
      }
      sliderEl.scrollLeft += delta * 0.2
      raf = requestAnimationFrame(step)
    }

    const glideTo = (left: number) => {
      const max = sliderEl.scrollWidth - sliderEl.clientWidth
      target = Math.min(max, Math.max(0, left))
      if (raf === null) raf = requestAnimationFrame(step)
    }
    glideToRef.current = glideTo

    const onWheel = (e: WheelEvent) => {
      if (sliderEl.scrollWidth <= sliderEl.clientWidth) return
      // Ctrl+molette = zoom du navigateur : on ne le détourne pas.
      if (e.ctrlKey) return
      // Geste horizontal natif (trackpad) : on le laisse au navigateur.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      // Recalage quand aucune glissade n'est en cours : un scroll venu d'ailleurs
      // (drag, centrage du carrousel) laisserait sinon une cible périmée.
      if (raf === null) target = sliderEl.scrollLeft
      glideTo(target + e.deltaY)
    }

    sliderEl.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      sliderEl.removeEventListener('wheel', onWheel)
      if (raf !== null) cancelAnimationFrame(raf)
      glideToRef.current = () => {}
    }
  }, [sliderEl])

  useEffect(() => {
    if (!sliderEl) return
    const raf = requestAnimationFrame(updateEdges)
    const onResize = () => updateEdges()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [sliderEl, updateEdges])

  useEffect(() => {
    if (!sliderEl) return
    // `filteredLines` ne sert qu'à rejouer la mesure : la rangée vient de changer
    // de contenu, donc de largeur.
    const raf = requestAnimationFrame(updateEdges)
    return () => cancelAnimationFrame(raf)
  }, [sliderEl, filteredLines, updateEdges])

  /**
   * Centre la carte d'un poste dans le slider. Base rects plutôt qu'`offsetLeft` :
   * la rangée a un ancêtre positionné, `offsetLeft` s'y rapporterait.
   */
  const centerCard = useCallback(
    (index: number) => {
      const card = sliderEl?.children[index] as HTMLElement | undefined
      if (!sliderEl || !card) return
      const left =
        sliderEl.scrollLeft +
        (card.getBoundingClientRect().left - sliderEl.getBoundingClientRect().left) -
        (sliderEl.clientWidth - card.clientWidth) / 2
      glideToRef.current(left)
    },
    [sliderEl]
  )

  // Carrousel : la sélection commande, le défilement suit. Recentrage sur
  // changement de SÉLECTION uniquement — pas à chaque frappe dans la recherche,
  // où `filteredLines` change aussi mais où le slider n'a pas à bouger tout seul.
  const centeredFor = useRef<string | null>(null)
  useEffect(() => {
    if (centeredFor.current === selected) return
    centeredFor.current = selected
    centerCard(filteredLines.findIndex((l) => l.code === selected))
  }, [selected, filteredLines, centerCard])

  /** Position du poste sélectionné dans le périmètre affiché (−1 : hors filtre). */
  const selIndex = useMemo(
    () => filteredLines.findIndex((l) => l.code === selected),
    [filteredLines, selected]
  )
  const hasPrev = selIndex > 0
  const hasNext = selIndex >= 0 && selIndex < filteredLines.length - 1

  const stepPoste = useCallback(
    (delta: number) => {
      const i = filteredLines.findIndex((l) => l.code === selected)
      const next = filteredLines[i + delta]
      if (next) setSelected(next.code)
    },
    [filteredLines, selected]
  )

  /** Ce qui change la SILHOUETTE des cartes (rien de la recherche, rien du scroll). */
  const sliderSignature = [
    unit,
    view,
    qtyMode,
    [...atelierFilter].sort().join(','),
    [...activeSegs].sort().join(','),
    props.version,
  ].join('|')
  useReplayEnter(sliderRowRef, sliderSignature)

  // ── Plein écran du panneau de détail ──
  /**
   * Le graphe d'un poste se lit mal dans la moitié basse de l'écran : sur un
   * poste chargé, barres, totaux et courbe de capacité se serrent. Le panneau
   * entier part donc en plein écran — entête, bandeau, graphe ET matières :
   * agrandir le seul SVG ferait perdre le poste, la maille et l'unité qu'on est
   * venu lire.
   *
   * Ce qu'un plein écran doit encore laisser faire : lire autrement. Le bandeau
   * du graphe porte donc l'unité, le cran et la maille (dans les deux modes), et
   * en plein écran le périmètre (vue, filtres) vient s'y poser — cf.
   * `graphControls` / `perimeterControls`. Changer d'avis ne coûte donc pas une
   * sortie du plein écran ; et quand la lecture ne veut plus que le graphe, `F`
   * efface le bandeau entier.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  /**
   * Le bandeau de lecture — unité, cran, maille, et en plein écran le périmètre
   * (vue, filtres) — peut s'effacer : en lecture pure il ne sert à rien et coûte
   * au graphe la hauteur qu'il occupe. `F` le masque et le rappelle. Hors plein
   * écran il reste en place : il porte les réglages du graphe qu'on lit, et rien
   * ne le rappellerait.
   */
  const [barHidden, setBarHidden] = useState(false)
  /** Rappel « F » après un masquage — effacé au premier mouvement de souris. */
  const [barHint, setBarHint] = useState(false)

  /**
   * On écoute `fullscreenchange` plutôt que de suivre nos propres clics : Échap
   * (ou la sortie par le système, F11, un changement de fenêtre) sort du plein
   * écran sans passer par le bouton, et l'icône doit suivre. Le bandeau masqué ne
   * survit pas à la sortie : au-delà du plein écran, plus rien ne le rappelle.
   */
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === panelRef.current
      setFullscreen(on)
      if (!on) {
        setBarHidden(false)
        setBarHint(false)
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  /**
   * Le rappel s'efface au premier mouvement de souris : il a dit ce qu'il avait à
   * dire dès l'instant où la main reprend le geste.
   */
  useEffect(() => {
    if (!fullscreen || !barHidden || !barHint) return
    const dismiss = () => setBarHint(false)
    document.addEventListener('mousemove', dismiss, { once: true })
    return () => document.removeEventListener('mousemove', dismiss)
  }, [fullscreen, barHidden, barHint])

  const toggleFullscreen = useCallback(() => {
    const el = panelRef.current
    // API absente (vieux navigateur) : le bouton existe mais ne fait rien.
    if (!el?.requestFullscreen) return
    // Les deux promesses rejettent dans des cas légitimes (sortie demandée sans
    // plein écran actif, iframe sans `allowfullscreen`) : on les absorbe, l'état
    // restera simplement celui du navigateur — que `fullscreenchange` reflétera.
    if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {})
    else void el.requestFullscreen().catch(() => {})
  }, [])

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

  /** Déclencheur de filtres — ouvert/fermé par le raccourci `F`. */
  const filterRef = useRef<HTMLDetailsElement>(null)

  /**
   * Raccourcis clavier de la page :
   *   ← / →  poste précédent / suivant (mêmes pas que le carrousel) ;
   *   F      en plein écran, masque/rappelle le bandeau de lecture (unité, cran,
   *          maille, vue, filtres) ; ailleurs, ouvre/ferme les filtres ;
   *   P      entre et sort du plein écran (Échap en sort aussi).
   *
   * Trois gardes, sans quoi ils volent des frappes légitimes : aucune touche de
   * commande (Ctrl/⌘/Alt), pas d'écriture en cours (recherche, champ de saisie,
   * contenu éditable), et rien tant qu'un panneau modal est ouvert — le détail de
   * période a ses propres touches.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || periodTarget) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        stepPoste(e.key === 'ArrowRight' ? 1 : -1)
        return
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        toggleFullscreen()
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        // En plein écran, `F` gouverne le bandeau qui PORTE les filtres : le
        // masquer, c'est éteindre ce qui les ouvre à la souris. La touche suit
        // donc le bandeau, pas la liste — rouverte d'un clic à l'écran.
        if (fullscreen) {
          e.preventDefault()
          if (barHidden) {
            setBarHidden(false)
            setBarHint(false)
          } else {
            setBarHidden(true)
            setBarHint(true)
          }
          return
        }
        const details = filterRef.current
        if (!details) return
        // L'événement `toggle` natif repart vers React : l'état du panneau (et
        // donc la fermeture au clic extérieur et à Échap) reste juste.
        e.preventDefault()
        details.open = !details.open
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [periodTarget, stepPoste, toggleFullscreen, fullscreen, barHidden])

  /**
   * Ce que le graphe RACONTE — unité, cran de quantité, maille. Ces trois
   * réglages vivaient dans la toolbar de page, à l'autre bout de l'écran du
   * graphe qu'ils décrivent ; et en plein écran, il fallait les y réimporter.
   * Ils tiennent maintenant dans le bandeau de l'entête du panneau, dans les
   * deux modes, une fois pour toutes.
   */
  const graphControls = (
    <>
      {/* Bascule Heures ↔ Pièces — transverse aux deux vues et aux trois crans.
          Le libellé porte l'unité en clair (pas une icône) : c'est un changement
          de ce que le chiffre VEUT DIRE, pas un réglage cosmétique. */}
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
      {/* Bascule Mois ↔ Semaine — même grammaire que les autres segments.
          C'était un pill rond ad hoc (`rounded-full`, `font-sans`) : seul de son
          espèce dans cette entête, et un deuxième vocabulaire de contrôle sur le
          même écran. */}
      <Segment role="radiogroup" ariaLabel="Maille affichée">
        <SegmentButton role="radio" active={gran === 'month'} onClick={() => setGran('month')}>
          Mois
        </SegmentButton>
        <SegmentButton role="radio" active={gran === 'week'} onClick={() => setGran('week')}>
          Semaine
        </SegmentButton>
      </Segment>
    </>
  )

  /**
   * Le PÉRIMÈTRE — la vue (OF ↔ Commande) et les filtres. Monté UNE fois,
   * posé soit dans la toolbar de page, soit dans le bandeau du graphe quand le
   * plein écran est actif : le navigateur ne rend que le sous-arbre de
   * l'élément plein écran, donc une toolbar restée dehors serait hors
   * d'atteinte. Une seule instance, donc une seule `filterRef` — c'est elle que
   * la touche `F` ouvre hors plein écran ; en plein écran, `F` gouverne le
   * bandeau qui la porte, donc l'indication de touche disparaît.
   */
  const perimeterControls = (
    <>
      {/* Bascule OF ↔ Commande */}
      <Segment role="radiogroup" ariaLabel="Vue">
        {(['of', 'commande'] as const).map((v) => (
          <SegmentButton key={v} role="radio" active={view === v} onClick={() => setView(v)}>
            {v === 'of' ? 'OF' : 'Commande'}
          </SegmentButton>
        ))}
      </Segment>
      <FilterMenu
        detailsRef={filterRef}
        hotkey={fullscreen ? undefined : 'F'}
        label="Filtres"
        indicators={
          filtersActive ? (
            <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" />
          ) : null
        }
      >
        <div className="flex items-center justify-between">
          {/* La vue OF ventile par STATUT d'ordre, la vue Commande par NATURE
              de demande : même filtre, deux vocabulaires métier. */}
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
    </>
  )

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

        {/* Barre de contrôles de la page : le périmètre (vue, filtres) et ce qui
            choisit la POPULATION — fenêtre des OF, recherche. Ce que le graphe
            raconte (unité, cran, maille) vit dans son entête, pas ici. */}
        {!fullscreen && (
          <ToolbarRow className="text-xs font-semibold text-secondary-foreground">
            {perimeterControls}
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
            <ToolbarSpacer />
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setQuery(e.currentTarget.value)
                }
              />
            </div>
          </ToolbarRow>
        )}

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
              <div ref={sliderRowRef} className="relative flex-none">
                <div
                  ref={setSliderEl}
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
              <div
                ref={panelRef}
                className={cn(
                  'flex min-h-0 flex-1 flex-col rounded-lg border border-rule bg-card p-4',
                  // En plein écran, l'agent utilisateur pose l'élément en
                  // `position: fixed; inset: 0` (top layer) : on ne redéfinit que
                  // ce qui se voit — le fond opaque qui masque le backdrop, les
                  // angles, et l'air laissé au graphe.
                  fullscreen && 'fixed inset-0 rounded-none p-6'
                )}
              >
                <div className="mb-2.5 flex flex-none flex-wrap items-center gap-3">
                  {/* Carrousel de postes — même pas que les flèches ← / →. Les
                      deux sont désactivées aux extrémités du périmètre affiché :
                      le défilement des cartes suit la sélection (cf. centerCard). */}
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => stepPoste(-1)}
                      disabled={!hasPrev}
                      aria-label="Poste précédent"
                      title="Poste précédent (←)"
                      className={CAROUSEL_BTN}
                    >
                      <ChevronLeft size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => stepPoste(1)}
                      disabled={!hasNext}
                      aria-label="Poste suivant"
                      title="Poste suivant (→)"
                      className={CAROUSEL_BTN}
                    >
                      <ChevronRight size={16} strokeWidth={1.75} />
                    </button>
                  </div>
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
                  {/* Plein écran du panneau — à l'extrémité de l'entête, à
                      l'opposé de la navigation : entrer, c'est quitter la page
                      pour la lecture. */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-pressed={fullscreen}
                    aria-label={
                      fullscreen ? 'Quitter le plein écran' : 'Afficher le poste en plein écran'
                    }
                    title={
                      fullscreen
                        ? 'Quitter le plein écran (Échap)'
                        : 'Plein écran — le poste, son graphe et ses matières (P)'
                    }
                    className="ml-auto inline-flex size-[30px] flex-none items-center justify-center rounded-full border border-rule bg-secondary text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                  >
                    {fullscreen ? (
                      <Minimize2 size={15} strokeWidth={1.75} />
                    ) : (
                      <Maximize2 size={15} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
                {/* Bandeau de lecture. À gauche ce que le graphe raconte (unité,
                    cran, maille) ; en plein écran, à droite le périmètre (vue,
                    filtres) — sans quoi ces décisions seraient hors d'atteinte.
                    Dans le flux, jamais en surimpression : le graphe se remesure
                    par son ResizeObserver, rien n'est masqué. Hors plein écran
                    il ne s'efface pas : c'est lui qui porte les réglages du
                    graphe qu'on lit (cf. `barHidden`). */}
                {!(fullscreen && barHidden) && (
                  <div className="mb-2.5 flex flex-none flex-wrap items-center gap-2.5">
                    {graphControls}
                    {fullscreen && (
                      <>
                        <ToolbarSpacer />
                        {perimeterControls}
                      </>
                    )}
                  </div>
                )}
                {/* Le bandeau masqué est un état sans bouton : sans ce rappel, la
                    seule sortie serait de rouvrir la documentation de la page.
                    Il ne survit pas au premier geste de souris — la main qui
                    reprend n'a plus besoin qu'on lui dise où est la touche.
                    `absolute` s'ancre sur le panneau, que le plein écran pose en
                    `fixed` : il est donc le bloc conteneur de cet absolu. */}
                {fullscreen && barHidden && barHint && (
                  <div className="pointer-events-none absolute bottom-6 right-6 z-10 inline-flex items-center gap-2 rounded-full border border-rule bg-secondary px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider text-secondary-foreground">
                    Bandeau
                    <kbd className="rounded border border-rule bg-card px-1.5 py-0.5 text-[10px] text-foreground">
                      F
                    </kbd>
                  </div>
                )}
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
        // En plein écran, le panneau est porté DANS l'élément plein écran :
        // resté dans `<body>`, il ne serait pas rendu par le navigateur (cf.
        // `panelRef`).
        overlayContainer={fullscreen ? panelRef.current : null}
      />
    </AppLayout>
  )
}

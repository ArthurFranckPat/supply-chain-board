import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, router } from '@inertiajs/react'
import { route } from '@r/lib/routes'
import { useVisibleSubviews } from '@r/lib/view-prefs/store'
import { PRODUCED_HOURS_POSTE_KEY } from '@r/lib/produced-hours/types'
import {
  TriangleAlert,
  Search,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  Download,
} from 'lucide-react'
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
  bucketPosOf,
  CMD_SEG_OPTIONS,
  type Gran,
  maskPeriod,
  OF_SEG_OPTIONS,
  segKeys,
  segOptions,
  total,
} from '@r/lib/load/chart-math'
import { HatchDefs } from '@r/components/load/hatch-defs'
import { MiniCard } from '@r/components/load/mini-card'
import { DetailChart } from '@r/components/load/detail-chart'
import { ChargePeriodSheet } from '@r/components/load/charge-period-sheet'
import { SubAssemblyClpView } from '@r/components/load/sub-assembly-clp-view'
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@r/components/base/dropdown/dropdown'
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

type PosteSelectorMode = 'cards' | 'compact'

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
  applyDemandHorizon: boolean
  posteSelector: PosteSelectorMode
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
  applyDemandHorizon: true,
  posteSelector: 'cards',
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
      view:
        p.view === 'commande' ? 'commande' : p.view === 'sous_ensembles' ? 'sous_ensembles' : 'of',
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
      applyDemandHorizon: p.applyDemandHorizon !== false,
      posteSelector: p.posteSelector === 'compact' ? 'compact' : 'cards',
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
  // Sous-vues masquées dans /configuration/vues : repli sur la première visible
  // si la vue restaurée de session a été masquée depuis.
  const visibleViews = useVisibleSubviews('load')
  useEffect(() => {
    if (visibleViews.length > 0 && !visibleViews.includes(view)) {
      setView(visibleViews[0] as LoadView)
    }
  }, [visibleViews, view])
  const [selected, setSelected] = useState(props.ofLines[0]?.code ?? '')
  const [gran, setGran] = useState<Gran>(stored.gran)
  const [query, setQuery] = useState('')
  const [showCapacity, setShowCapacity] = useState(stored.showCapacity)
  const [showAvg, setShowAvg] = useState(stored.showAvg)
  const [applyDemandHorizon, setApplyDemandHorizon] = useState(stored.applyDemandHorizon)
  const [posteSelector, setPosteSelector] = useState<PosteSelectorMode>(stored.posteSelector)
  const [posteDropdownOpen, setPosteDropdownOpen] = useState(false)
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
   * On ne substitue pas `monthly`/`weekly` sur la ligne : la capacité reste
   * lue sur ces séries-là (temps ÷ temps), et un poste ne
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
      applyDemandHorizon,
      posteSelector,
    })
  }, [
    view,
    unit,
    qtyMode,
    gran,
    ofStatus,
    cmdNature,
    atelierFilter,
    showCapacity,
    showAvg,
    applyDemandHorizon,
    posteSelector,
  ])

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
  const filtersActive =
    segFiltered || atelierFilter.size > 0 || (view === 'commande' && !applyDemandHorizon)

  /**
   * Charge par poste, en HEURES, masque de segments appliqué. La capacité se lit
   * sur cette série quelle que soit l'unité affichée : un temps face à un temps.
   */
  const lines = useMemo(() => {
    const keep = segKeys(view, activeSegs)
    const source =
      view === 'of'
        ? props.ofLines
        : applyDemandHorizon
          ? props.cmdLines
          : props.cmdLinesWithoutDemandHorizon
    const base = source.map(viewNet)
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
  }, [
    view,
    props.ofLines,
    props.cmdLines,
    props.cmdLinesWithoutDemandHorizon,
    applyDemandHorizon,
    activeSegs,
    segFiltered,
    viewNet,
  ])

  /**
   * Pertinence d'un poste pour la recherche — plus petit = plus pertinent,
   * `null` = hors résultat. Les articles produits sont cherchables (recherche
   * client), mais un « 830 » trouvé dans une référence article d'un autre poste
   * ne doit pas passer devant le poste PP_830 : le code prime, puis le libellé,
   * puis les articles. Dans le code, un segment entier (`830` dans `PP_830`)
   * bat une simple sous-chaîne.
   */
  const searchRank = useCallback((l: LoadLine, q: string): number | null => {
    const code = l.code.toLowerCase()
    if (code === q) return 0
    if (code.split(/[^a-z0-9]+/).includes(q)) return 1
    if (code.startsWith(q)) return 2
    if (code.includes(q)) return 3
    if (l.name.toLowerCase().includes(q)) return 4
    if (l.articles.some((a) => a.toLowerCase().includes(q))) return 5
    return null
  }, [])

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ats = atelierFilter
    const scoped = ats.size ? lines.filter((l) => ats.has(l.atelier)) : lines
    if (!q) return scoped
    // Tri stable : à pertinence égale, l'ordre de la page est conservé.
    return scoped
      .map((l) => ({ l, r: searchRank(l, q) }))
      .filter((x): x is { l: LoadLine; r: number } => x.r !== null)
      .sort((a, b) => a.r - b.r)
      .map((x) => x.l)
  }, [lines, query, atelierFilter, searchRank])

  // Valeur toujours présente dans le <select>, y compris pendant le rendu
  // intermédiaire où un filtre vient de retirer le poste sélectionné.
  const selectedVisibleCode = useMemo(
    () => filteredLines.find((l) => l.code === selected)?.code ?? filteredLines[0]?.code ?? '',
    [filteredLines, selected]
  )
  const selectedVisibleLine = filteredLines.find((l) => l.code === selectedVisibleCode)

  /**
   * URL d'export CSV — reconstruite à chaque changement de filtre pour rester le
   * miroir exact de l'écran : vue, maille, cran, segments actifs, et surtout la
   * liste des postes VISIBLES (ateliers + recherche déjà appliqués) et les
   * périodes affichées (`monthKeys`/`weekKeys`, semaines déjà tronquées par le
   * payload). Le serveur ne reçoit QUE cet état : il n'a pas à redécouvrir ce
   * que l'écran montre, et ne peut donc pas exporter autre chose.
   */
  const exportBuckets = gran === 'month' ? props.monthKeys : props.weekKeys
  const exportHref = useMemo(() => {
    const qs = new URLSearchParams({
      view,
      gran,
      qtyMode,
      ofDate: props.ofDate,
      applyDemandHorizon: applyDemandHorizon ? '1' : '0',
    })
    if (props.startIso) qs.set('start', props.startIso)
    if (props.version) qs.set('v', props.version)
    qs.set(
      'segments',
      segOptions(view)
        .filter((o) => activeSegs.has(o.id))
        .map((o) => o.id)
        .join(',')
    )
    qs.set('postes', filteredLines.map((l) => l.code).join(','))
    qs.set('buckets', exportBuckets.join(','))
    return `${route('charge.export')}?${qs.toString()}`
  }, [
    view,
    gran,
    qtyMode,
    props.ofDate,
    props.startIso,
    props.version,
    applyDemandHorizon,
    activeSegs,
    filteredLines,
    exportBuckets,
  ])
  const canExport =
    view !== 'sous_ensembles' && filteredLines.length > 0 && exportBuckets.length > 0

  // Chaque frappe dans la recherche sélectionne le MEILLEUR résultat : sans
  // ça, un poste déjà sélectionné qui matche encore (par un de ses articles)
  // restait affiché alors que le poste cherché venait de passer en tête.
  // Seulement au changement de la saisie — un rechargement des données ne
  // doit pas voler la sélection faite ensuite à la main.
  const lastQueryRef = useRef(query)
  useEffect(() => {
    if (lastQueryRef.current === query) return
    lastQueryRef.current = query
    if (query.trim() && filteredLines[0]) setSelected(filteredLines[0].code)
  }, [query, filteredLines])

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

  // ── Sélecteur de postes : cartes ou liste compacte ────────────────────────
  /**
   * Rangée de cartes. Un ÉTAT (ref de rappel) plutôt qu'un `useRef` : la rangée
   * n'existe pas toujours — aucun poste ne correspond au filtre, ou l'atelier
   * restauré de la session ne couvre rien — et la molette comme le centrage
   * doivent s'y raccrocher au moment où elle apparaît, pas au montage de la page.
   */
  const [sliderEl, setSliderEl] = useState<HTMLDivElement | null>(null)
  /** Rangée complète — cible de l'animation d'entrée. */
  const sliderRowRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = useCallback(() => {
    if (!sliderEl) return
    setAtStart(sliderEl.scrollLeft <= 1)
    setAtEnd(sliderEl.scrollLeft + sliderEl.clientWidth >= sliderEl.scrollWidth - 1)
  }, [sliderEl])

  /**
   * Une molette verticale doit faire avancer la rangée horizontalement, mais sans
   * maintenir une cible animée en parallèle du scroll natif. Cette cible pouvait
   * rester périmée après un scroll trackpad, un centrage ou un rerender et donner
   * l'impression que le carrousel refusait parfois de bouger.
   *
   * L'écouteur natif `passive: false` est conservé pour détourner uniquement les
   * gestes verticaux. Chaque événement écrit directement la position courante :
   * un seul état de scroll, aucune boucle rAF à désynchroniser.
   */
  useEffect(() => {
    if (!sliderEl) return

    const onWheel = (e: WheelEvent) => {
      if (sliderEl.scrollWidth <= sliderEl.clientWidth) return
      // Ctrl+molette = zoom du navigateur : on ne le détourne pas.
      if (e.ctrlKey) return
      // Geste horizontal natif (trackpad) : on le laisse au navigateur.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (e.deltaY === 0) return

      // Les événements en lignes/pages sont rares, mais les normaliser évite un
      // scroll quasi nul selon le périphérique ou le navigateur.
      const delta =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? e.deltaY * 16
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? e.deltaY * sliderEl.clientWidth
            : e.deltaY
      const max = Math.max(0, sliderEl.scrollWidth - sliderEl.clientWidth)
      const next = Math.min(max, Math.max(0, sliderEl.scrollLeft + delta))

      // À une extrémité, ne pas voler l'événement : le navigateur peut encore
      // laisser remonter le geste vers un conteneur parent scrollable.
      if (next === sliderEl.scrollLeft) return
      e.preventDefault()
      sliderEl.scrollLeft = next
    }

    sliderEl.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      sliderEl.removeEventListener('wheel', onWheel)
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
      const max = Math.max(0, sliderEl.scrollWidth - sliderEl.clientWidth)
      sliderEl.scrollTo({ left: Math.min(max, Math.max(0, left)), behavior: 'smooth' })
    },
    [sliderEl]
  )

  // Carrousel : la sélection commande, le défilement suit. Recentrage sur
  // changement de SÉLECTION uniquement — pas à chaque frappe dans la recherche,
  // où `filteredLines` change aussi mais où le slider n'a pas à bouger tout seul.
  const centeredFor = useRef<string | null>(null)
  useEffect(() => {
    // Le slider peut être remonté après le premier rendu (ou après le retour du
    // mode compact). Ne mémorise la sélection qu'une fois la cible disponible.
    if (!sliderEl) return
    if (centeredFor.current === selected) return
    centeredFor.current = selected
    centerCard(filteredLines.findIndex((l) => l.code === selected))
  }, [selected, filteredLines, centerCard, sliderEl])

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
    posteSelector,
    props.version,
  ].join('|')
  useReplayEnter(sliderRowRef, sliderSignature)

  // ── Plein écran du panneau de détail ──
  /**
   * Le graphe d'un poste se lit mal dans la moitié basse de l'écran : sur un
   * poste chargé, barres, totaux et courbe de capacité se serrent. Le panneau
   * entier part donc en plein écran — entête, bandeau et graphe : agrandir le
   * seul SVG ferait perdre le poste, la maille et l'unité qu'on est venu lire.
   *
   * Plein écran DANS LA PAGE (`fixed inset-0` + z) plutôt que l'API native :
   * l'API native place l'élément dans le top-layer, sur son propre calque
   * composite, où le texte perd le lissage macOS (rendu gris, adouci) — la
   * police semblait dégradée une fois le zoom posé. Posé dans la page, le
   * panneau revient au chemin de rendu normal dès la fin du vol, les overlays
   * (détail de période) restent portés par `<body>` sans portage spécial, et
   * Échap est de la page (cf. raccourcis clavier).
   *
   * Ce qu'un plein écran doit encore laisser faire : lire autrement. La
   * toolbar de page est démontée pendant le plein écran, le bandeau du panneau
   * reprend donc ce qu'elle porte — unité, cran, maille à gauche, périmètre
   * (vue, filtres) à droite — cf. `graphControls` / `perimeterControls`.
   * Changer d'avis ne coûte donc pas une sortie du plein écran ; et quand la
   * lecture ne veut plus que le graphe, `F` efface le bandeau entier.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  /**
   * Géométrie d'OÙ part le zoom d'entrée — le rect du panneau capturé au clic,
   * alors qu'il est encore dans le flux. La sortie, elle, part toujours du
   * viewport que le panneau remplissait — y compris quand c'est Échap qui l'a
   * quitté : rien à capturer pour elle.
   */
  const zoomFromRef = useRef<DOMRect | null>(null)
  /** Rayon du panneau dans le flux, capturé avec `zoomFromRef` — le plein
   *  écran le remet à 0, il ne se relit plus après la bascule. */
  const zoomFromRadiusRef = useRef(0)

  /**
   * Drapeau « un zoom est attendu », posé à chaque bascule. Sans lui, le vol
   * jourait aussi AU MONTAGE (état initial `false`, effet parcouru une fois) :
   * le panneau aurait rétréci du viewport vers sa place à l'ouverture de la
   * page.
   */
  const zoomPendingRef = useRef(false)

  /**
   * Le bandeau du plein écran — unité, cran, maille, périmètre (vue, filtres) —
   * peut s'effacer : en lecture pure il ne sert à rien et coûte au graphe la
   * hauteur qu'il occupe. `F` le masque et le rappelle. Il n'existe qu'en plein
   * écran — hors plein écran, la toolbar de page porte ces réglages — et ne
   * survit donc pas à la sortie.
   */
  const [barHidden, setBarHidden] = useState(false)
  /** Rappel « F » après un masquage — effacé au premier mouvement de souris. */
  const [barHint, setBarHint] = useState(false)

  /**
   * Le zoom du plein écran — un vol FLIP par-dessus la bascule. Sans lui, le
   * panneau sauterait de sa place au viewport entre deux frames. Ici, dès que
   * la géométrie finale existe et AVANT la première peinture
   * (`useLayoutEffect`), une animation WAAPI fait passer le panneau de SA
   * géométrie d'origine à celle qu'il occupe déjà : le layout est final dès la
   * première frame — le graphe ne se remesure qu'une fois, à sa taille
   * d'arrivée — seul le regard glisse. La sortie rejoue le même chemin en
   * sens inverse, depuis le viewport.
   *
   * Durées par USAGE (échelle de motion, styles/app.css) : ouvrir est une
   * révélation (`--duration-slow`), fermer dégage le passage
   * (`--duration-medium`) ; `--ease-smooth-out` porte les deux. Rejouer la
   * bascule pendant le vol annule l'animation en cours — le FLIP suivant part
   * de la géométrie réelle, pas d'un reste. `prefers-reduced-motion` coupe
   * tout : le panneau change de place sans spectacle.
   */
  useLayoutEffect(() => {
    // Seulement les bascules réelles : le parcours au montage consomme un
    // drapeau à `false` et ne vole pas.
    if (!zoomPendingRef.current) return
    zoomPendingRef.current = false

    const el = panelRef.current
    if (!el || typeof el.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const from = fullscreen
      ? (zoomFromRef.current ?? el.getBoundingClientRect())
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    zoomFromRef.current = null

    // Last : la boîte d'arrivée, mesurée après commit (plein écran = viewport,
    // retour au flux = rect en page). Le style ne doit PAS être en vol au
    // moment de la mesure : une animation WAAPI ne touche pas au layout.
    const to = el.getBoundingClientRect()

    const rootStyle = getComputedStyle(document.documentElement)
    const duration = parseFloat(
      rootStyle.getPropertyValue(fullscreen ? '--duration-slow' : '--duration-medium')
    )
    const easing =
      rootStyle.getPropertyValue('--ease-smooth-out').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)'

    // Rayon du panneau DANS le flux (`rounded-lg`) : c'est lui qu'on lit au
    // départ de l'entrée et à l'arrivée de la sortie. Le panneau plein écran
    // n'en a pas — l'élément mesuré ici, à l'arrivée d'une sortie, si.
    const flowRadius = fullscreen
      ? zoomFromRadiusRef.current
      : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0

    // Échelle UNIFORME : un `scale(sx, sy)` distinct par axe écrase le texte
    // et les barres pendant tout le vol (le panneau n'a jamais le ratio du
    // viewport). On prend la plus grande des deux — le panneau couvre alors
    // la boîte de départ — et un `clip-path` rogne le surplus pour n'en
    // montrer que la silhouette. Rognage centré en X, calé en haut en Y :
    // l'entête (poste, bouton de plein écran) reste lisible pendant le vol.
    // Le clip-path s'exprime dans le repère local de l'élément (avant
    // transform), d'où les divisions par `s`.
    const s = Math.max(from.width / to.width, from.height / to.height)
    const visW = from.width / s
    const visH = from.height / s
    const insetX = (to.width - visW) / 2
    const insetB = to.height - visH
    const tx = from.left - to.left - s * insetX
    const ty = from.top - to.top
    const startRadius = fullscreen ? flowRadius / s : 0
    const endRadius = fullscreen ? 0 : flowRadius

    const anim = el.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
          clipPath: `inset(0px ${insetX}px ${insetB}px ${insetX}px round ${startRadius}px)`,
        },
        {
          transformOrigin: '0 0',
          transform: 'none',
          clipPath: `inset(0px 0px 0px 0px round ${endRadius}px)`,
        },
      ],
      { duration: Number.isFinite(duration) ? duration : 350, easing }
    )
    // Vol terminé : on RETIRE l'animation au lieu de la laisser finie sur
    // l'élément. Tant qu'une animation reste attachée, certains moteurs
    // maintiennent le panneau sur son propre calque composite — et le texte y
    // perd le lissage natif (rendu gris, adouci) : la police semble dégradée
    // une fois le zoom posé. cancel() sur une animation finie ne change rien
    // au rendu (fill « none »), il libère le calque.
    anim.finished.then(() => anim.cancel()).catch(() => {})
    return () => anim.cancel()
  }, [fullscreen])

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

  /** Sortie de plein écran — le bandeau masqué ne survit pas à la sortie :
   *  au-delà du plein écran, plus rien ne le rappelle. */
  const exitFullscreen = useCallback(() => {
    zoomPendingRef.current = true
    setFullscreen(false)
    setBarHidden(false)
    setBarHint(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      exitFullscreen()
      return
    }
    const el = panelRef.current
    if (!el) return
    // Géométrie de départ du zoom FLIP : à capturer MAINTENANT, avant que le
    // panneau ne quitte le flux.
    zoomFromRef.current = el.getBoundingClientRect()
    zoomFromRadiusRef.current = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
    zoomPendingRef.current = true
    setFullscreen(true)
  }, [fullscreen, exitFullscreen])

  /**
   * Barre « Retard » (1er bucket hebdo, clé `début~fin`) : le serveur l'émet
   * dès qu'UN poste a du retard. Pour le poste affiché, elle n'apparaît que
   * s'il en a lui-même — dans la série tracée (unité, cran, filtres). Sinon
   * elle est retirée et les index du graphe sont décalés d'autant.
   */
  const retardOffset = useMemo(() => {
    if (!selLine || gran !== 'week' || !props.weekKeys[0]?.includes('~')) return 0
    const first = seriesOf(selLine, gran)[0]
    return first && total(first) > 0 ? 0 : 1
  }, [selLine, gran, props.weekKeys, seriesOf])
  const hasRetardBar = gran === 'week' && !!props.weekKeys[0]?.includes('~') && retardOffset === 0

  const detailItems = useMemo(() => {
    const line = selLine
    if (!line) return []
    // Capacité en pièces : aucune (cf. `capacityOn`) — on n'alimente pas l'axe
    // d'un plafond en heures, qui écraserait l'échelle.
    const caps = gran === 'month' ? line.capacity.monthly : line.capacity.weekly
    return seriesOf(line, gran)
      .map((d, i) => ({
        label: (gran === 'month' ? props.months[i] : props.weeks[i]) ?? '',
        d,
        cap: capacityOn ? (caps[i] ?? 0) : 0,
        retard: i === 0 && hasRetardBar,
      }))
      .slice(retardOffset)
  }, [selLine, gran, props.months, props.weeks, capacityOn, seriesOf, retardOffset, hasRetardBar])

  /**
   * Horizon demande X3 du poste, projeté sur l'axe du graphe. Vue commande
   * seulement : c'est la demande que l'horizon filtre (les prévisions en deçà
   * sont écartées, cf. « Appliquer horizon demande ») — la vue OF n'en dépend
   * pas. Tracé que le filtre soit actif ou non : il dit OÙ les deux lectures
   * divergent.
   */
  const detailHorizon = useMemo(() => {
    // Maille semaine seulement : l'horizon (2-3 semaines) tiendrait dans la
    // première barre mensuelle, où il ne se lit pas.
    if (view !== 'commande' || gran !== 'week' || !selLine) return null
    const h = props.demandHorizonByPoste?.[selLine.code]
    if (!h) return null
    const keys = props.weekKeys.slice(retardOffset)
    const from = bucketPosOf(h.from, keys, gran)
    const to = bucketPosOf(h.to, keys, gran)
    if (from === null || to === null) return null
    // Début de la zone : aujourd'hui à minuit, l'origine de l'horizon X3.
    // `bucketPosOf` borne à la fin d'un jour INCLUS — on lui passe donc la
    // veille. Hors fenêtre (mois de départ futur) : bord gauche du graphe.
    const eve = new Date()
    eve.setDate(eve.getDate() - 1)
    const eveIso = `${eve.getFullYear()}-${String(eve.getMonth() + 1).padStart(2, '0')}-${String(eve.getDate()).padStart(2, '0')}`
    const start = Math.min(bucketPosOf(eveIso, keys, gran) ?? 0, from)
    return { start, from, to, fromIso: h.from, toIso: h.to }
  }, [view, selLine, gran, props.demandHorizonByPoste, props.weekKeys, retardOffset])

  // Détail d'une période : le clic passe la CLÉ du bucket (pas son index), pour
  // que la demande reste valide même si l'horizon a glissé entre-temps.
  const [periodTarget, setPeriodTarget] = useState<{
    poste: string
    bucketKey: string
    gran: Gran
    periodLabel: string
  } | null>(null)

  const openPeriod = (shown: number) => {
    if (!selLine) return
    // Index du graphe → index du payload (barre Retard éventuellement retirée).
    const index = shown + (gran === 'week' ? retardOffset : 0)
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
      if (e.key === 'Escape' && fullscreen) {
        // Sans l'API native, Échap est de la page : c'est le raccourci qui sort
        // du plein écran. Feuille de période ouverte, la garde ci-dessus rend
        // la main à son propre Échap (fermer la table) d'abord.
        e.preventDefault()
        exitFullscreen()
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
  }, [periodTarget, stepPoste, toggleFullscreen, exitFullscreen, fullscreen, barHidden])

  /**
   * Ce que le graphe RACONTE — unité, cran de quantité, maille. Portés par la
   * toolbar de page ; en plein écran, la toolbar est démontée, le bandeau du
   * panneau les reprend donc tels quels (décrits une fois, montés là où ils
   * restent accessibles).
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
   * Le PÉRIMÈTRE — la vue (OF ↔ Commande) et les filtres. Décrits UNE fois,
   * montés dans la toolbar de page ; en plein écran, le bandeau du panneau les
   * reprend (la toolbar est démontée pendant le plein écran). Une seule
   * instance, donc une seule `filterRef` — c'est elle que la touche `F` ouvre
   * hors plein écran ; en plein écran, `F` gouverne le bandeau qui la porte,
   * donc l'indication de touche disparaît.
   */

  /** Bascule OF ↔ Commande ↔ Sous-ensembles CLP — posée seule dans la toolbar, regroupée dans
   *  `perimeterControls` pour le plein écran. */
  const viewSegment = (
    <Segment role="radiogroup" ariaLabel="Vue">
      {(['of', 'commande', 'sous_ensembles'] as const)
        .filter((v) => visibleViews.includes(v))
        .map((v) => (
          <SegmentButton key={v} role="radio" active={view === v} onClick={() => setView(v)}>
            {v === 'of' ? 'OF' : v === 'commande' ? 'Commande' : 'Sous-ensembles CLP'}
          </SegmentButton>
        ))}
    </Segment>
  )

  const filtersMenu = (
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
      {view !== 'sous_ensembles' && (
        <>
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
        </>
      )}
      {(view === 'commande' || view === 'sous_ensembles') && (
        <>
          <div className="my-2.5 border-t border-rule-soft" />
          <FilterMenuSectionLabel>Demande</FilterMenuSectionLabel>
          <Segment className="w-full flex-wrap">
            <SegmentButton
              active={applyDemandHorizon}
              onClick={() => setApplyDemandHorizon((v) => !v)}
              title="Ignorer les prévisions situées dans l'horizon demande X3 de leur article"
            >
              Appliquer horizon demande
            </SegmentButton>
          </Segment>
        </>
      )}
      {/* Filtre atelier (#36) — chips STOLOC, transverse aux 2 vues.
                Vivait dans sa propre rangée sous la toolbar : consolidé ici. */}
      {view !== 'sous_ensembles' && props.ateliers.length > 0 && (
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
  )

  /** Les deux ensemble — c'est ce bloc que le plein écran reprend. */
  const perimeterControls = (
    <>
      {viewSegment}
      {filtersMenu}
    </>
  )

  const posteSelectorControls = (
    <Segment role="radiogroup" ariaLabel="Présentation des postes de charge">
      <SegmentButton
        role="radio"
        active={posteSelector === 'cards'}
        onClick={() => {
          setPosteDropdownOpen(false)
          setPosteSelector('cards')
        }}
        title="Comparer les postes avec leurs mini-graphiques"
      >
        Cartes
      </SegmentButton>
      <SegmentButton
        role="radio"
        active={posteSelector === 'compact'}
        onClick={() => setPosteSelector('compact')}
        title="Choisir un poste dans une liste compacte"
      >
        Liste
      </SegmentButton>
    </Segment>
  )

  const postePicker = (
    <Dropdown isOpen={posteDropdownOpen} onOpenChange={setPosteDropdownOpen}>
      <DropdownTrigger
        aria-label={`Poste de charge : ${selectedVisibleLine?.code ?? 'aucun'}`}
        className={cn(PILL, 'w-[280px] max-w-full justify-between text-left')}
      >
        <span className="min-w-0 truncate">
          {selectedVisibleLine
            ? `${selectedVisibleLine.code} · ${selectedVisibleLine.name}`
            : 'Choisir un poste de charge'}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </DropdownTrigger>
      <DropdownPopover
        aria-label="Postes de charge"
        placement="bottom end"
        className="w-[min(520px,calc(100vw-32px))]"
      >
        <div className="max-h-[280px] overflow-y-auto">
          {filteredLines.map((line) => (
            <DropdownItem
              key={line.code}
              selected={line.code === selectedVisibleCode}
              onSelect={() => {
                setSelected(line.code)
                setPosteDropdownOpen(false)
              }}
              className="justify-between gap-3"
            >
              <span className="min-w-0 truncate">
                <span className="font-mono font-semibold">{line.code}</span>
                <span className="ml-1.5 text-muted-foreground">{line.name}</span>
              </span>
              {line.atelierLabel && (
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {line.atelierLabel}
                </span>
              )}
            </DropdownItem>
          ))}
        </div>
      </DropdownPopover>
    </Dropdown>
  )

  return (
    <AppLayout
      desktopOnly
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
      <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* Barre de contrôles de la page : le périmètre (vue, filtres), ce qui
            choisit la POPULATION (fenêtre des OF), ce que le graphe raconte
            (unité, cran, maille) et la recherche. */}
        {!fullscreen && (
          <ToolbarRow className="text-xs font-semibold text-secondary-foreground">
            {viewSegment}
            {graphControls}
            {view === 'of' && (
              <Segment role="radiogroup" ariaLabel="Date de rattachement des OF">
                <SegmentButton
                  role="radio"
                  active={props.ofDate === 'start'}
                  onClick={() => {
                    if (props.ofDate === 'start') return
                    // `?ofDate=` n'est qu'un message au serveur : il le range en
                    // session et redirige vers l'URL sans lui.
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
            {filtersMenu}
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
            {/* Export CSV — action de sortie placée en bout de rangée (ordre
                canonique toolbar : recherche → refresh → actions). Le fichier
                suit les filtres affichés ; sans poste visible (ou sans période)
                il n'y aurait rien à exporter, d'où l'état désactivé plutôt qu'un
                fichier vide qu'on croirait complet. */}
            <button
              type="button"
              className={cn(PILL, 'shrink-0 disabled:cursor-not-allowed disabled:opacity-50')}
              disabled={!canExport}
              title={
                canExport
                  ? `Exporter en CSV le détail de ${filteredLines.length} poste${filteredLines.length > 1 ? 's' : ''} sur les périodes affichées`
                  : 'Aucun poste à exporter avec les filtres actuels'
              }
              onClick={() => window.location.assign(exportHref)}
            >
              <Download size={15} strokeWidth={1.75} className="text-muted-foreground" />
              Exporter
            </button>
          </ToolbarRow>
        )}

        {view === 'sous_ensembles' ? (
          <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden px-7 py-5">
            <SubAssemblyClpView
              groups={
                (applyDemandHorizon ? props.seClpGroups : props.seClpGroupsWithoutDemandHorizon) ??
                []
              }
              months={props.months}
              weeks={props.weeks}
              gran={gran}
              unit={unit}
              qtyMode={qtyMode}
              query={query}
            />
          </div>
        ) : lines.length === 0 ? (
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
            {/* Sélecteur de poste : comparaison visuelle ou choix compact. */}
            {filteredLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-rule px-4 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
                Aucun poste ne correspond à « {query} ».
              </div>
            ) : (
              <div ref={sliderRowRef} className="relative flex-none">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-3xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Postes de charge
                    </span>
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {filteredLines.length} visible{filteredLines.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                    {posteSelector === 'compact' && postePicker}
                    {posteSelectorControls}
                  </div>
                </div>

                {posteSelector === 'cards' && (
                  <div className="relative">
                    <div
                      ref={setSliderEl}
                      onScroll={updateEdges}
                      className="no-scrollbar flex gap-3 overscroll-x-contain overflow-x-auto pb-2"
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
              </div>
            )}

            {/* Détail du poste sélectionné */}
            {selLine && (
              <div
                ref={panelRef}
                className={cn(
                  'flex min-h-0 flex-1 flex-col rounded-lg border border-rule bg-card p-4',
                  // Plein écran « dans la page » : fixed au-dessus du reste,
                  // sous les overlays (backdrop z-55, sheet z-60) — et surtout
                  // SUR LE CALQUE DE RENDU PRINCIPAL, où le texte garde son
                  // lissage natif, contrairement au top-layer de l'API native.
                  fullscreen && 'fixed inset-0 z-40 rounded-none p-6'
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
                    {/* Pont discret vers le réalisé : la charge dit ce qui
                        reste à faire, /heures-produites ce qui a été fait sur
                        le même poste. Le poste passe par un relais de session
                        à usage unique (`PRODUCED_HOURS_POSTE_KEY`), pas par
                        l'URL : elle reste celle de la page. */}
                    <Link
                      href={route('heures_produites.index')}
                      onClick={() => {
                        try {
                          sessionStorage.setItem(PRODUCED_HOURS_POSTE_KEY, selLine.code)
                        } catch {
                          // Stockage indisponible : la page s'ouvre non filtrée.
                        }
                      }}
                      title="Heures réellement produites sur ce poste"
                      className="inline-flex items-center gap-0.5 self-center font-mono text-[10px] font-semibold tracking-wider text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      réalisé
                      <ArrowUpRight size={11} strokeWidth={2} />
                    </Link>
                  </div>
                  {selLine.atelier && (
                    <span className="rounded-full border border-rule bg-secondary px-2.5 py-1 font-mono text-[10px] font-semibold text-secondary-foreground">
                      {selLine.atelierLabel}
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
                {/* Bandeau du plein écran. La toolbar de page est démontée
                    pendant le plein écran : il reprend ce qu'elle porte — à
                    gauche ce que le graphe raconte (unité, cran, maille), à
                    droite le périmètre (vue, filtres). Dans le flux, jamais en
                    surimpression : le graphe se remesure par son
                    ResizeObserver, rien n'est masqué ; `F` l'efface en lecture
                    pure (cf. `barHidden`). */}
                {fullscreen && !barHidden && (
                  <div className="mb-2.5 flex flex-none flex-wrap items-center gap-2.5">
                    {graphControls}
                    <ToolbarSpacer />
                    {perimeterControls}
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
                  demandHorizon={detailHorizon}
                  onSelectPeriod={openPeriod}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Détail de la période cliquée. `activeSegs`/`qtyMode` sont passés tels
          quels : la table applique le MÊME masque et le MÊME cran que le graphe,
          donc son total suit la hauteur de la barre sans re-fetch au changement
          de filtre. Portée par `<body>` (z-60), elle passe au-dessus du panneau
          plein écran (z-40) sans portage spécial. */}
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
        applyDemandHorizon={applyDemandHorizon}
        // Une date de ligne repositionnée change l'empreinte des overrides,
        // donc TOUTES les clés de cache de la chaîne /charge — et avec elles la
        // `version` du snapshot. Recharger les props est ce qui fait retomber
        // le graphe et la table du panneau sur le même nouvel état ; sans ça,
        // l'écran resterait sur le snapshot d'avant
        // le déplacement, sans erreur visible.
        onOverridesChanged={() => router.reload()}
      />
    </AppLayout>
  )
}

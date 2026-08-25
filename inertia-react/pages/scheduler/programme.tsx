/**
 * Page /programme — orchestrateur Vue unifiée OF ↔ commandes.
 * Port React du Solid inertia/pages/scheduler/programme.tsx (1255 l.).
 *
 * Issue #21 — Vue unifiée OF ↔ commandes.
 *
 * Le board est STRICTEMENT celui de /ordonnancement : on réutilise le composant
 * <BoardGrid> sur le même payload BoardData (charge par jour, histogramme hebdo
 * par poste, recherche multi-scope, drag&drop). Programme n'ajoute que deux calques :
 *  • des marqueurs « commande » posés dans la cellule de leur poste/jour
 *    d'expédition (slot cellExtra) ;
 *  • un overlay SVG reliant chaque OF à sa commande à l'horizontale (mesuré au DOM
 *    via data-num-of / data-link-cmd).
 *
 * Shell (état + composition) — marqueur commande et overlay de liens vivent
 * dans components/programme/*.tsx ; la géométrie pure dans lib/programme/ (issue #52).
 *
 * Migrée sur le design system (vitrine `/design-system`) :
 * • `AppLayout theme="cursor" dense scrollable={false}` au lieu du couple
 *   `theme-airbnb` + <Masthead> monté à la main ;
 * • la barre passe par la prop `toolbar` d'AppLayout — c'est elle qui porte le
 *   filet, le fond, l'axe `px-6` du TopBar et la règle d'impression ;
 * • standard §17 : la rangée ne garde que la portée (mode + fenêtre), le
 *   déclencheur unique « Filtres », la recherche et l'état/actions. Statut d'OF,
 *   nature de poste et portée de recherche descendent SOUS le déclencheur — ils
 *   occupaient trois pills permanentes (`FilterMenu` maison + <Select>) dans une
 *   rangée qui n'avait plus de place pour la recherche.
 * • plus de `components/vision/programme-toolbar` (supprimé) ni de menu
 *   « Actions » en <details> : les trois actions sont des Pill du design system,
 *   visibles là où elles s'appliquent.
 *
 * Pas de `meta` sur le TopBar : « 125 OF · 12 postes » ne bougeait pas d'un
 * filtre à l'autre et contredisait le compteur de la rangée dès qu'on en posait
 * un. Seul le volume filtré reste, en zone 04, et seulement sous filtre.
 */

import type * as React from 'react'
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { usePage, router } from '@inertiajs/react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Popover } from '@base-ui/react/popover'
import {
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Layers,
  ListChecks,
  RefreshCw,
  TriangleAlert,
  Wand2,
} from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { DynamicIcon } from '@r/components/ui/dynamic-icon'
import { Pill } from '@r/components/ui/pill'
import { Separator } from '@r/components/ui/separator'
import {
  ToolbarDateWindow,
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarMetric,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'

import { useBoardStore, cardMatches, lineVisible } from '@r/lib/board/store'
import { useOrderBoardStore } from '@r/lib/orders/orders-store'
import { useScenarioStore } from '@r/lib/scenario/store'

import type { BoardData, PosteNatureFilterKey, SearchScope } from '@r/lib/board/types'
import type { OrderBoardData, OrderSearchScope } from '@r/lib/orders/types'
import type { ProgrammeCommande, ProgrammeLink, ProgrammeMode } from '@r/lib/programme/types'
import type { PlanMutation } from '@r/lib/scenarios/types'

import { parseIso, toIso, startOfDay, DAY_MS, fmtDay } from '@r/lib/programme/date-utils'
import { buildLinkPath, pathMid, type PathSpec } from '@r/lib/programme/link-overlay'
import { buildCmdCells } from '@r/lib/programme/cmd-cells'
import {
  computeImpacts,
  worstVerdict,
  deltaLabel,
  linkKey,
  type ImpactVerdict,
} from '@r/lib/programme/impact'

import { CommandeMarker } from '@r/components/programme/commande-marker'
import { LinksOverlay, type LinkMode } from '@r/components/programme/links-overlay'
import { TriageRail, type TriageItem } from '@r/components/programme/triage-rail'
import { ScenarioBar } from '@r/components/scenario/scenario-bar'
import { ScenarioDiffSheet } from '@r/components/scenario/scenario-diff-sheet'

import BoardGrid from '@r/components/board/board-grid'
import BatchFirmBar from '@r/components/board/batch-firm-bar'
import OrderGrid from '@r/components/board/order-grid'
import OfDetailSheet from '@r/components/of/of-detail-sheet'
import PosteEngagementSheet from '@r/components/board/poste-engagement-sheet'

import { useShortcuts } from '@r/lib/a11y/shortcuts'
import { toast } from 'sonner'
import { virtualOrdersFrom } from '@r/lib/scenarios/types'
import { route } from '@r/lib/routes'
import { cn } from '@r/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProgrammeProps = {
  mode: ProgrammeMode
  board: BoardData | null
  commandes: ProgrammeCommande[]
  links: ProgrammeLink[]
  orderBoard: OrderBoardData | null
  windowFrom: string
  windowTo: string
  horizon: number
  dateRange: string
  weekLabel: string
  prevHref: string
  nextHref: string
  todayHref: string
  totalOf: number
  lineCount: number
  x3Error: string | null
  cached: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_BOARD: BoardData = {
  days: [],
  lines: [],
  weekSpans: [],
  cols: 0,
  colWeek: [],
  weekCaps: {},
}

const EMPTY_ORDER_BOARD: OrderBoardData = {
  days: [],
  lines: [],
  ateliers: [],
  weekSpans: [],
  cols: 0,
  colWeek: [],
  weekCaps: {},
}

const MODE_LABELS: Record<ProgrammeMode, string> = {
  ordonnancement: 'OF',
  combined: 'Combiné',
  planification: 'Cmdes',
}

const MODE_TITLES: Record<ProgrammeMode, string> = {
  ordonnancement: 'Mode Ordonnancement — OF seuls',
  combined: 'Mode Combiné — OF + liens commandes + impacts',
  planification: 'Mode Commandes — planification par ligne de commande',
}

/* Portée de recherche. Le libellé sert la chip du panneau ; le placeholder dit
   dans la rangée ce que la portée cherche — sans ça, le champ reste visible
   mais muet sur ce qu'il interroge, et la portée n'est plus qu'un réglage
   enterré. */
const OF_SCOPES = [
  { v: 'poste' as const, label: 'Poste', placeholder: 'Chercher un poste…' },
  { v: 'of' as const, label: 'OF', placeholder: 'Chercher un n° d’OF…' },
  { v: 'pf' as const, label: 'PF', placeholder: 'Chercher un produit fini…' },
  { v: 'composant' as const, label: 'Composant', placeholder: 'Chercher un composant…' },
] as const

const ORDER_SCOPES = [
  { v: 'poste' as const, label: 'Poste', placeholder: 'Chercher un poste…' },
  { v: 'commande' as const, label: 'Commande', placeholder: 'Chercher une commande…' },
  { v: 'article' as const, label: 'Article', placeholder: 'Chercher un article…' },
  { v: 'client' as const, label: 'Client', placeholder: 'Chercher un client…' },
] as const

/** Portée par défaut des deux stores — le repère de « ce filtre est actif ». */
const DEFAULT_SCOPE = 'poste'

/* Chips du panneau de filtres. La gravité du point suit la sémantique board :
   ferme = acquis, planifié = neutre, suggéré = à décider. */
const STATUS_CHIPS: {
  k: 'ferme' | 'planifie' | 'suggere'
  label: string
  tone: 'ok' | 'neutral' | 'warning'
}[] = [
  { k: 'ferme', label: 'Ferme', tone: 'ok' },
  { k: 'planifie', label: 'Planifié', tone: 'neutral' },
  { k: 'suggere', label: 'Suggéré', tone: 'warning' },
]

const POSTE_NATURE_CHIPS: { k: PosteNatureFilterKey; label: string }[] = [
  { k: 'assemblage_pf', label: 'Assemblage PF' },
  { k: 'assemble_sous_ensemble', label: 'Sous-ensemble' },
]

/**
 * Traduction de portée au changement de mode (les deux boards n'indexent pas les mêmes
 * choses). Seuls « poste » et l'article (PF côté OF) ont un équivalent exact ; les portées
 * sans contrepartie retombent sur « poste », qui existe des deux côtés — plutôt que de
 * garder une portée qui ne matcherait rien et donnerait un board vide sans explication.
 */
const OF_TO_ORDER_SCOPE: Record<SearchScope, OrderSearchScope> = {
  poste: 'poste',
  pf: 'article',
  of: 'poste',
  composant: 'poste',
}

const ORDER_TO_OF_SCOPE: Record<OrderSearchScope, SearchScope> = {
  poste: 'poste',
  article: 'pf',
  commande: 'poste',
  client: 'poste',
}

type ScopeOption = {
  v: SearchScope | OrderSearchScope
  label: string
  placeholder: string
}

// ---------------------------------------------------------------------------
// Programme Component
// ---------------------------------------------------------------------------

export default function Programme(props: ProgrammeProps) {
  const page = usePage<ProgrammeProps>()

  // Stores
  const boardStore = useBoardStore()
  const orderStore = useOrderBoardStore()

  // Scénario : sélecteurs fins pour ce qui se rend, `getState()` dans les handlers.
  // S'abonner à l'état entier (`useScenarioStore()`) donnait une identité neuve à
  // chaque `set()` : tous les callbacks qui le listaient en dépendance se recréaient,
  // et l'effet de montage — qui rejoue le deep-link `?open_scenario_id` — repartait
  // en boucle sur le `set()` de sa propre ouverture.
  const scenarioActive = useScenarioStore((st) => st.active)
  const scenarioDiff = useScenarioStore((st) => st.diff)
  const scenarioDiffLoading = useScenarioStore((st) => st.diffLoading)
  const scenarioEvaluatedAt = useScenarioStore((st) => st.current.evaluatedAt)
  const scenarioDataAt = useScenarioStore((st) => st.current.dataAt)

  const measureScheduled = useRef(false)
  /**
   * Pointe toujours sur le `measure` du rendu courant.
   *
   * `requestMeasure` DOIT rester stable (`[]`) : quatre callbacks définis plus
   * haut l'appellent, et le relister partout le recréerait à chaque changement
   * de `contentEl` / `impacts` / `props.links`. Mais un `useCallback([])` qui
   * appelle `measure()` directement fige le `measure` du PREMIER rendu, celui où
   * `contentEl` vaut encore null — il sortait donc immédiatement sur son garde
   * `if (!content) return`. Résultat : l'effet de redessin (board, cmdMoved,
   * ofShift) ne faisait rien, et l'overlay de liens ne se remettait à jour qu'au
   * redimensionnement de la fenêtre, seul chemin qui passe par `measure` direct.
   */
  const measureRef = useRef<() => void>(() => {})
  const requestMeasure = useCallback(() => {
    if (measureScheduled.current) return
    measureScheduled.current = true
    requestAnimationFrame(() => {
      measureScheduled.current = false
      measureRef.current()
    })
  }, [])

  // ── Issue #57 — mode scénario ──
  const [diffOpen, setDiffOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  // Mode local (plus de round-trip serveur au switch)
  const [mode, setMode] = useState<ProgrammeMode>(props.mode)

  // Re-sync stores après navigation Inertia (keyé sur windowFrom)
  useEffect(() => {
    boardStore.reset(page.props.board ?? EMPTY_BOARD)
    orderStore.reset(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
  }, [page.props.windowFrom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switch de mode → toggle local + URL (replaceState)
  const switchMode = useCallback(
    (newMode: ProgrammeMode) => {
      if (newMode === mode) return
      // Les modes OF/Combiné lisent le boardStore, le mode Cmdes l'orderStore : sans report
      // explicite, franchir cette frontière vidait la recherche en cours. On reporte la
      // requête et on traduit la portée (vocabulaires distincts) ; scope d'abord, query
      // ensuite — l'inverse relancerait une recherche avec l'ancienne portée.
      const wasOrderMode = mode === 'planification'
      const willBeOrderMode = newMode === 'planification'
      if (wasOrderMode !== willBeOrderMode) {
        // `getState()` plutôt que l'objet abonné : un handler veut l'état AU
        // MOMENT DU CLIC. `useBoardStore()` sans sélecteur renvoie l'état
        // entier, dont l'identité change à chaque `set()` — le lister en deps
        // recréerait ce callback à chaque mutation du board, y compris pendant
        // un drag.
        const b = useBoardStore.getState()
        const o = useOrderBoardStore.getState()
        if (willBeOrderMode) {
          o.onScopeChange(OF_TO_ORDER_SCOPE[b.scope])
          o.onQueryInput(b.query)
        } else {
          b.onScopeChange(ORDER_TO_OF_SCOPE[o.scope])
          b.onQueryInput(o.query)
        }
      }
      // Le mode scénario est une capacité du board combiné (bandeau, rangée virtuelle,
      // intercepteur). Quitter Combiné le suspend explicitement plutôt que de le laisser
      // actif sans aucune UI. Les mutations restent en mémoire : revenir en Combiné et
      // rouvrir le mode les retrouve — mais le board, lui, est repassé à l'état réel,
      // donc on le dit.
      if (newMode !== 'combined' && useScenarioStore.getState().active) {
        useScenarioStore.getState().setActive(false)
        const pending = useScenarioStore.getState().current.mutations.length
        toast.info(
          pending > 0
            ? `Mode scénario suspendu — ${pending} mutation${pending > 1 ? 's' : ''} conservée${pending > 1 ? 's' : ''}, repassez en Combiné pour reprendre.`
            : 'Mode scénario suspendu — disponible en vue Combiné.'
        )
      }

      setMode(newMode)
      const url = new URL(window.location.href)
      if (newMode === 'combined') {
        url.searchParams.delete('mode')
      } else {
        url.searchParams.set('mode', newMode)
      }
      window.history.replaceState({}, '', url)
    },
    [mode]
  )

  // Store « actif » selon le mode
  const isOrderMode = mode === 'planification'
  const scopeOptions: readonly ScopeOption[] = isOrderMode ? ORDER_SCOPES : OF_SCOPES
  const activeScope = isOrderMode ? orderStore.scope : boardStore.scope
  const activeQuery = isOrderMode ? orderStore.query : boardStore.query
  const onQueryInput = isOrderMode ? orderStore.onQueryInput : boardStore.onQueryInput
  const onScopeChange = useCallback(
    (v: SearchScope | OrderSearchScope) => {
      if (isOrderMode) useOrderBoardStore.getState().onScopeChange(v as OrderSearchScope)
      else useBoardStore.getState().onScopeChange(v as SearchScope)
    },
    [isOrderMode]
  )
  const feasLoading = () => (isOrderMode ? orderStore.feasLoading : boardStore.feasLoading)
  const runFeasibility = useCallback(() => {
    if (isOrderMode) {
      useOrderBoardStore.getState().runFeasibility(props.windowFrom, props.windowTo)
    } else {
      useBoardStore.getState().runFeasibility(props.windowFrom, props.windowTo)
    }
  }, [isOrderMode, props.windowFrom, props.windowTo])
  const feasMode = () => (isOrderMode ? orderStore.mode : boardStore.mode)
  const setFeasMode = useCallback(
    (m: 'immediate' | 'sequential') => {
      if (isOrderMode) {
        useOrderBoardStore.getState().setMode(m)
      } else {
        useBoardStore.getState().setMode(m)
      }
    },
    [isOrderMode]
  )

  // Drawer détail OF
  const [selectedOf, setSelectedOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const onSelectOf = useCallback((num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }, [])

  // Panneau « Engagement » par poste (#46)
  const [engagementPoste, setEngagementPoste] = useState<string | null>(null)
  const [engagementOpen, setEngagementOpen] = useState(false)
  const onLineEngagement = useCallback((lineCode: string) => {
    setEngagementPoste(lineCode)
    setEngagementOpen(true)
  }, [])

  // Résolution commande → OF (contremarque)
  const findOrderCard = useCallback(
    (cardId: string) => {
      for (const line of orderStore.board.lines) {
        for (const dc of line.dayCells) {
          const c = dc.cards.find((x) => x.id === cardId)
          if (c) return c
        }
      }
      return undefined
    },
    [orderStore.board.lines]
  )

  const onSelectOrderLine = useCallback(
    (key: string) => {
      const card = findOrderCard(key)
      const ofNum = card?.contremarque?.trim() || null
      if (ofNum) {
        setSelectedOf(ofNum)
        setDetailOpen(true)
      } else {
        toast.error('Aucun OF rattaché à cette ligne de commande.')
      }
    },
    [findOrderCard]
  )

  // ── Refresh ──
  const [refreshing, setRefreshing] = useState(false)
  const [cmdMoved, setCmdMoved] = useState<Map<string, { col: number; iso: string }>>(new Map())
  const [ofShift, setOfShift] = useState<Map<string, number>>(new Map())
  const [ofDateFinOverride, setOfDateFinOverride] = useState<Map<string, string>>(new Map())

  const doRefresh = useCallback(() => {
    if (refreshing) return
    setRefreshing(true)
    router.reload({
      data: {
        start: props.windowFrom,
        days: props.horizon,
        refresh: '1',
        ...(mode !== 'combined' && { mode: mode }),
      },
      only: [
        'board',
        'orderBoard',
        'commandes',
        'links',
        'x3Error',
        'cached',
        'totalOf',
        'lineCount',
        'weekLabel',
      ],
      onSuccess: () => {
        setCmdMoved(new Map())
        setOfShift(new Map())
        setOfDateFinOverride(new Map())
        boardStore.updateData(page.props.board ?? EMPTY_BOARD)
        orderStore.updateData(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
        requestMeasure()
      },
      onFinish: () => setRefreshing(false),
    })
  }, [
    refreshing,
    props.windowFrom,
    props.horizon,
    mode,
    boardStore,
    orderStore,
    page.props,
    requestMeasure,
  ])

  // ── Fenêtre de dates ──
  // Plus de `calOpen` : `ToolbarDateWindow` porte son propre état d'ouverture et
  // ne rappelle `onCommit` qu'avec une plage complète (deux clics).
  const [range, setRange] = useState<DayPickerRange | undefined>(() => ({
    from: parseIso(props.windowFrom) ?? undefined,
    to: parseIso(props.windowTo) ?? undefined,
  }))

  const applyRange = useCallback(
    (r: DayPickerRange) => {
      setRange(r)
      if (r.from && r.to) {
        const days =
          Math.round((startOfDay(r.to).getTime() - startOfDay(r.from).getTime()) / DAY_MS) + 1
        router.visit(route('scheduler.programme'), {
          data: {
            start: toIso(r.from),
            days: String(days),
            ...(mode !== 'combined' && { mode: mode }),
          },
          preserveScroll: true,
        })
      }
    },
    [mode]
  )

  // ── Overrides drag ──
  const cmdCol = useCallback(
    (l: ProgrammeLink) => cmdMoved.get(l.commandeId)?.col ?? l.cmdCol,
    [cmdMoved]
  )
  const cmdIso = useCallback(
    (cmd: ProgrammeCommande) => cmdMoved.get(cmd.id)?.iso ?? cmd.dateExpeditionIso,
    [cmdMoved]
  )

  const cmdBesoinOverride = useCallback(() => {
    const m = new Map<string, string>()
    cmdMoved.forEach((v, k) => m.set(k, v.iso))
    return m
  }, [cmdMoved])

  // ── Impacts (#23) ──
  const effectiveLinks = useMemo(() => {
    if (ofDateFinOverride.size === 0) return props.links
    return props.links.map((l) => {
      const override = ofDateFinOverride.get(l.ofId)
      return override ? { ...l, ofDateFinIso: override } : l
    })
  }, [props.links, ofDateFinOverride])

  const linksByOf = useMemo(() => {
    const m = new Map<string, ProgrammeLink>()
    for (const l of effectiveLinks) m.set(l.ofId, l)
    return m
  }, [effectiveLinks])

  const impacts = useMemo(
    () => computeImpacts(effectiveLinks, ofShift, cmdBesoinOverride()),
    [effectiveLinks, ofShift, cmdBesoinOverride]
  )

  const verdictByOf = useMemo(() => {
    const byOf = new Map<string, ImpactVerdict[]>()
    for (const [, imp] of impacts) {
      if (imp.verdict === null) continue
      const arr = byOf.get(imp.ofId) ?? []
      arr.push(imp.verdict)
      byOf.set(imp.ofId, arr)
    }
    const out = new Map<string, ImpactVerdict | null>()
    for (const [ofId, vs] of byOf) out.set(ofId, worstVerdict(vs))
    return out
  }, [impacts])

  const verdictByCmd = useMemo(() => {
    const byCmd = new Map<string, { verdicts: ImpactVerdict[]; delta: number | null }>()
    for (const [, imp] of impacts) {
      if (imp.verdict === null) continue
      const e = byCmd.get(imp.commandeId) ?? { verdicts: [], delta: null }
      e.verdicts.push(imp.verdict)
      if (imp.delta !== null && (e.delta === null || imp.delta > e.delta)) e.delta = imp.delta
      byCmd.set(imp.commandeId, e)
    }
    const out = new Map<string, { verdict: ImpactVerdict | null; delta: number | null }>()
    for (const [cmdId, e] of byCmd)
      out.set(cmdId, { verdict: worstVerdict(e.verdicts), delta: e.delta })
    return out
  }, [impacts])

  const retardByOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const [, imp] of impacts) {
      if (imp.verdict !== 'retard' || imp.delta === null) continue
      const cur = m.get(imp.ofId)
      if (cur === undefined || imp.delta > cur) m.set(imp.ofId, imp.delta)
    }
    return m
  }, [impacts])

  const retardJoursOf = useCallback(
    (ofId: string): number | null => retardByOf.get(ofId) ?? null,
    [retardByOf]
  )

  const nbCmdRetard = useMemo(() => {
    let n = 0
    for (const [, e] of verdictByCmd) if (e.verdict === 'retard') n++
    return n
  }, [verdictByCmd])

  const nbCmdLimite = useMemo(() => {
    let n = 0
    for (const [, e] of verdictByCmd) if (e.verdict === 'limite') n++
    return n
  }, [verdictByCmd])

  const nbCmdSansLien = useMemo(() => {
    let n = 0
    for (const cmd of props.commandes) {
      const v = verdictByCmd.get(cmd.id)
      if (!v || v.verdict === null) n++
    }
    return n
  }, [props.commandes, verdictByCmd])

  const nbOfSansLien = useMemo(() => {
    const linked = linksByOf
    let n = 0
    for (const line of boardStore.board.lines) {
      for (const dc of line.dayCells) {
        for (const c of dc.cards) if (!linked.has(c.id)) n++
      }
    }
    return n
  }, [boardStore.board.lines, linksByOf])

  // ── Link mode ──
  // Fixé à 'problems' : les liens retard+limite restent visibles. Le segment
  // de réglage a été retiré (trop d'options). Modifier ici si besoin.
  const linkMode: 'none' | 'problems' | 'all' = 'problems'

  // ── Rail de triage ──
  const [railOpen, setRailOpen] = useState(false)
  const [railSelected, setRailSelected] = useState<string | null>(null)

  // ── Positions OF + drag progress (#23) ──
  const ofPositions = useMemo(() => {
    const m = new Map<string, number>()
    for (const line of boardStore.board.lines) {
      line.dayCells.forEach((dc, col) => {
        for (const c of dc.cards) m.set(c.id, col)
      })
    }
    return m
  }, [boardStore.board.lines])

  const ofColOrigine = useCallback(
    (ofId: string): number | null => {
      return ofPositions.get(ofId) ?? linksByOf.get(ofId)?.ofCol ?? null
    },
    [ofPositions, linksByOf]
  )

  const dayShiftFor = useCallback(
    (ofId: string, targetIso: string): number | null => {
      const origine = ofColOrigine(ofId)
      if (origine === null) return null
      const fromIso = boardStore.board.lines[0]?.dayCells[origine]?.iso
      if (!fromIso) return null
      const fromD = parseIso(fromIso)
      const toD = parseIso(targetIso)
      if (!fromD || !toD) return null
      return Math.round((toD.getTime() - fromD.getTime()) / DAY_MS)
    },
    [ofColOrigine, boardStore.board.lines]
  )

  // ── Tooltip drag OF ──
  const [dragTooltip, setDragTooltip] = useState<string | null>(null)

  const updateDragTooltip = useCallback(
    (ofId: string) => {
      const v = verdictByOf.get(ofId)
      const finOrigine = ofDateFinOverride.get(ofId) ?? linksByOf.get(ofId)?.ofDateFinIso ?? null
      const finD = finOrigine ? parseIso(finOrigine) : null

      if (v === 'retard' && finD) {
        const shift = ofShift.get(ofId) ?? 0
        const shifted = new Date(finD)
        shifted.setDate(shifted.getDate() + shift)
        const delta = retardJoursOf(ofId)
        setDragTooltip(
          `Dispo estimée le ${fmtDay(toIso(shifted))} · ${delta ? deltaLabel(delta) : 'en retard'}`
        )
      } else if (v === 'retard') {
        setDragTooltip('OF en retard sur sa commande')
      } else if (v === 'limite') {
        setDragTooltip('OF limite (J)')
      } else if (v === 'ok') {
        setDragTooltip("OF à l'heure")
      } else {
        setDragTooltip(null)
      }
    },
    [verdictByOf, ofDateFinOverride, linksByOf, ofShift, retardJoursOf]
  )

  const onOfDragProgress = useCallback(
    (ofId: string, _toLineCode: string, _toCol: number, targetIso: string) => {
      const shift = dayShiftFor(ofId, targetIso)
      if (shift === null) return
      setOfShift((m) => {
        if (shift === 0) {
          if (!m.has(ofId)) return m
          const n = new Map(m)
          n.delete(ofId)
          return n
        }
        if (m.get(ofId) === shift) return m
        return new Map(m).set(ofId, shift)
      })
      updateDragTooltip(ofId)
    },
    [dayShiftFor, updateDragTooltip]
  )

  const onOfDragCancelled = useCallback(() => {
    setOfShift(new Map())
    setDragTooltip(null)
  }, [])

  const ofDateFinOrigine = useCallback(
    (ofId: string): string | null => {
      return ofDateFinOverride.get(ofId) ?? linksByOf.get(ofId)?.ofDateFinIso ?? null
    },
    [ofDateFinOverride, linksByOf]
  )

  const translateOfDateFin = useCallback(
    (ofId: string, targetIso: string): string | null => {
      const finOrigine = ofDateFinOrigine(ofId)
      const finD = finOrigine ? parseIso(finOrigine) : null
      const shift = dayShiftFor(ofId, targetIso)
      if (!finD || shift === null) return null
      const shifted = new Date(finD)
      shifted.setDate(shifted.getDate() + shift)
      return toIso(shifted)
    },
    [ofDateFinOrigine, dayShiftFor]
  )

  const onOfDropped = useCallback((ofId: string, _toIso: string, dateFinIso?: string) => {
    if (dateFinIso) {
      setOfDateFinOverride((m) => new Map(m).set(ofId, dateFinIso))
    }
    setOfShift(new Map())
    setDragTooltip(null)
  }, [])

  // ── Intercepteur PATCH OF (#57) ──
  // Gate sur `mode` autant que sur `active` : le bandeau scénario n'est rendu qu'en mode
  // Combiné, mais l'intercepteur, lui, restait posé après un changement de mode — les
  // drags partaient alors en mutations invisibles, sans bandeau ni PATCH. Silencieux.
  // Le démontage de la page relâche aussi l'intercepteur (store module-level, il survit).
  useEffect(() => {
    if (scenarioActive && mode === 'combined') {
      boardStore.setMoveInterceptor(({ numOf, toLineCode, toIso, dateFinIso }) => {
        useScenarioStore.getState().upsertMutation({
          type: 'shift_of',
          numOf,
          dateDebut: toIso,
          dateFin: dateFinIso ?? null,
          poste: toLineCode,
        })
      })
    } else {
      boardStore.setMoveInterceptor(null)
    }
    return () => boardStore.setMoveInterceptor(null)
  }, [scenarioActive, mode, boardStore])

  // ── Colonne du board par ISO ──
  const colOfIso = useCallback(
    (iso: string): number => {
      return boardStore.board.lines[0]?.dayCells.findIndex((dc) => dc.iso === iso) ?? -1
    },
    [boardStore.board.lines]
  )

  // ── Articles connus (#58) ──
  const articleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const line of boardStore.board.lines) {
      for (const dc of line.dayCells) {
        for (const c of dc.cards) if (c.article) set.add(c.article)
      }
    }
    return [...set].sort()
  }, [boardStore.board.lines])

  // ── Commandes virtuelles (#58) ──
  // Sélecteurs fins : ici `getState()` serait FAUX — c'est une valeur dérivée
  // qui doit provoquer un rendu quand elle change. Un sélecteur n'abonne qu'à
  // sa tranche et donne une dépendance que la règle sait suivre.
  const scenarioMutations = useScenarioStore((st) => st.current.mutations)

  const virtualOrders = useMemo(() => {
    return virtualOrdersFrom(scenarioMutations, scenarioDiff)
  }, [scenarioMutations, scenarioDiff])

  const virtualOrdersByCol = useMemo(() => {
    const map = new Map<number, typeof virtualOrders>()
    for (const o of virtualOrders) {
      const col = colOfIso(o.date)
      if (col === -1) continue
      const arr = map.get(col) ?? []
      arr.push(o)
      map.set(col, arr)
    }
    return map
  }, [virtualOrders, colOfIso])

  const injectVirtualOrder = useCallback(
    (m: Extract<PlanMutation, { type: 'inject_demand' }>) => {
      const sc = useScenarioStore.getState()
      sc.upsertMutation(m)
      sc.computeDiff(props.windowFrom, props.windowTo).catch((err: Error) => {
        toast.error(`Impacts indisponibles : ${err.message}`)
      })
    },
    [props.windowFrom, props.windowTo]
  )

  const moveVirtualOrder = useCallback(
    (id: string, _col: number, iso: string) => {
      const sc = useScenarioStore.getState()
      const existing = sc.current.mutations.find(
        (m): m is Extract<PlanMutation, { type: 'inject_demand' }> =>
          m.type === 'inject_demand' && m.id === id
      )
      if (!existing) return
      sc.upsertMutation({ ...existing, date: iso })
      sc.computeDiff(props.windowFrom, props.windowTo).catch((err: Error) => {
        toast.error(`Impacts indisponibles : ${err.message}`)
      })
    },
    [props.windowFrom, props.windowTo]
  )

  const removeVirtualOrder = useCallback(
    (id: string) => {
      const sc = useScenarioStore.getState()
      sc.removeMutation(`inject:${id}`)
      sc.computeDiff(props.windowFrom, props.windowTo).catch((err: Error) => {
        toast.error(`Impacts indisponibles : ${err.message}`)
      })
    },
    [props.windowFrom, props.windowTo]
  )

  // ── Scénario (#57) ──
  const toggleScenario = useCallback(() => {
    const sc = useScenarioStore.getState()
    sc.setActive(!sc.active)
  }, [])

  const applyScenario = useCallback(async () => {
    if (applying) return
    setApplying(true)
    try {
      let total = 0
      let failed = 0
      let horsPerimetre = 0
      for (const m of useScenarioStore.getState().current.mutations) {
        let r: Response | null = null
        if (m.type === 'shift_of') {
          total++
          r = await fetch(route('planning_board.update', { of: m.numOf }), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workstation: m.poste ?? undefined,
              dateDebut: m.dateDebut ?? undefined,
              ...(m.dateFin ? { dateFin: m.dateFin } : {}),
            }),
          }).catch(() => null)
        } else if (m.type === 'shift_demand' && m.ligne) {
          total++
          r = await fetch(route('order_planning.update', { order: m.numCommande, line: m.ligne }), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateLivraison: m.date }),
          }).catch(() => null)
        } else {
          // inject_demand / suspend_supply : what-if pur, jamais écrit (une commande
          // client s'enregistre dans X3, pas ici). Compté pour ne pas annoncer
          // « appliqué » sur un scénario qui n'en contient que.
          horsPerimetre++
          continue
        }
        if (!r?.ok) failed++
      }

      if (total === 0) {
        toast.info(
          horsPerimetre > 0
            ? 'Rien à appliquer : commandes virtuelles et ruptures simulées restent dans le scénario.'
            : 'Rien à appliquer.'
        )
        return
      }

      if (failed > 0) {
        // Pas de rollback : les PATCHs réussis sont déjà partis. Le dire explicitement
        // plutôt que de laisser croire que le scénario est resté sans effet.
        toast.warning(
          `${total - failed}/${total} mutation${total > 1 ? 's' : ''} déjà appliquée${total - failed > 1 ? 's' : ''} en base — ${failed} échec${failed > 1 ? 's' : ''}. Scénario conservé, à rejouer sur les seules mutations restantes.`
        )
        router.reload()
        return
      }
      await useScenarioStore.getState().markApplied()
      useScenarioStore.getState().setActive(false)
      toast.success('Scénario appliqué.')
      router.reload()
    } catch (err) {
      toast.error(`Application échouée : ${(err as Error).message}`)
    } finally {
      setApplying(false)
    }
  }, [applying])

  const discardScenario = useCallback(() => {
    boardStore.updateData(page.props.board ?? EMPTY_BOARD)
    orderStore.updateData(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
    setCmdMoved(new Map())
    setOfShift(new Map())
    setOfDateFinOverride(new Map())
    const sc = useScenarioStore.getState()
    sc.reset()
    sc.setActive(false)
    requestMeasure()
  }, [boardStore, orderStore, page.props, requestMeasure])

  const openScenario = useCallback(
    async (id: number) => {
      const sc = useScenarioStore.getState()
      sc.setActive(true)
      const mutations = await sc.open(id)
      for (const m of mutations) {
        if (m.type === 'shift_of' && m.dateDebut && m.poste) {
          boardStore.moveCardToIso(m.numOf, m.poste, m.dateDebut)
          if (m.dateFin) {
            setOfDateFinOverride((mm) => new Map(mm).set(m.numOf, m.dateFin!))
          }
        } else if (m.type === 'shift_demand') {
          const col = colOfIso(m.date)
          if (col !== -1) {
            setCmdMoved((mm) =>
              new Map(mm).set(`${m.numCommande}#${m.ligne ?? ''}`, { col, iso: m.date })
            )
          }
        }
      }
      requestMeasure()
    },
    [boardStore, colOfIso, requestMeasure]
  )

  // ── Commandes regroupées par poste × colonne ──
  const cmdCells = useMemo(() => {
    return buildCmdCells(props.commandes, props.links, cmdCol)
  }, [props.commandes, props.links, cmdCol])

  // ── Drop commande ──
  const onCommandeDrop = useCallback(
    (_lineCode: string, col: number, iso: string, e: DragEvent) => {
      const raw = e.dataTransfer?.getData('application/x-cmd')
      if (!raw) return
      let parsed: { id: string; numCommande: string; ligne: string | null }
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      if (!parsed.ligne) return

      setCmdMoved((m) => new Map(m).set(parsed.id, { col, iso }))
      requestMeasure()

      // #57 — mode scénario
      if (useScenarioStore.getState().active) {
        useScenarioStore.getState().upsertMutation({
          type: 'shift_demand',
          numCommande: parsed.numCommande,
          ligne: parsed.ligne,
          date: iso,
        })
        return
      }

      fetch(route('order_planning.update', { order: parsed.numCommande, line: parsed.ligne }), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateLivraison: iso }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
        })
        .catch((err) => {
          setCmdMoved((m) => {
            const n = new Map(m)
            n.delete(parsed.id)
            return n
          })
          requestMeasure()
          toast.error(`Déplacement commande échoué : ${err.message}`)
        })
    },
    [requestMeasure]
  )

  // ── Overlay liens ──
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  const [paths, setPaths] = useState<PathSpec[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const isActive = useCallback(
    (p: PathSpec) => {
      const id = activeId
      return id !== null && (p.ofId === id || p.commandeId === id)
    },
    [activeId]
  )

  const measure = useCallback(() => {
    const content = contentEl
    if (!content) return
    const cRect = content.getBoundingClientRect()
    const imps = impacts
    const out: PathSpec[] = []
    for (const link of props.links) {
      const ofEl = content.querySelector(`[data-num-of="${link.ofId}"]`)
      const cmdEl = content.querySelector(`[data-link-cmd="${link.posteCode}:${link.commandeId}"]`)
      if (!ofEl || !cmdEl) continue
      const or = (ofEl as HTMLElement).getBoundingClientRect()
      const cr = (cmdEl as HTMLElement).getBoundingClientRect()
      const d = buildLinkPath(cRect, or, cr)
      if (!d) continue
      const imp = imps.get(linkKey(link.ofId, link.commandeId))
      out.push({
        d,
        suggere: link.suggere,
        ofId: link.ofId,
        commandeId: link.commandeId,
        verdict: imp?.verdict ?? null,
        deltaJours: imp?.delta ?? null,
        mid: pathMid(cRect, or, cr),
      })
    }
    setPaths(out)
  }, [contentEl, impacts, props.links])

  // Déclaré AVANT l'effet de montage ci-dessous : les effets s'exécutent dans
  // l'ordre de déclaration, donc la ref est à jour quand le premier
  // `requestMeasure()` part.
  useEffect(() => {
    measureRef.current = measure
  }, [measure])

  // ── ResizeObserver ──
  useEffect(() => {
    const el = contentEl
    if (!el) return
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    window.addEventListener('resize', measure)
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {})
    }

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, contentEl])

  // ── Amorçage one-shot : deep-link scénario (#57) ──
  // Séparé de l'effet ResizeObserver ci-dessus : celui-ci se réexécute à chaque
  // changement de `measure` (donc à chaque recalcul d'impacts), et rejouait alors
  // l'ouverture du scénario en boucle — chaque ouverture modifiant le store, qui
  // redéclenchait l'effet. Ici : au montage, une fois, garde explicite.
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const openId = new URLSearchParams(window.location.search).get('open_scenario_id')
    if (openId) {
      const numId = Number.parseInt(openId, 10)
      if (!Number.isNaN(numId)) openScenario(numId)
    }
  }, [openScenario])

  useEffect(() => {
    requestMeasure()
  }, [props.board, cmdMoved, ofShift, requestMeasure])

  // ── Raccourcis clavier (#62) ──
  useShortcuts(
    {
      'r': () => doRefresh(),
      'f': () => runFeasibility(),
      '1': () => switchMode('ordonnancement'),
      '2': () => switchMode('combined'),
      '3': () => switchMode('planification'),
      's': () => {
        if (mode === 'combined') toggleScenario()
      },
      't': () => {
        if (mode === 'combined') setRailOpen((v) => !v)
      },
    },
    () => {
      if (detailOpen) setDetailOpen(false)
      else if (engagementOpen) setEngagementOpen(false)
      else if (diffOpen) setDiffOpen(false)
    }
  )

  // ---------------------------------------------------------------------------
  // Barre d'outils — standard §17 du design system
  // ---------------------------------------------------------------------------

  /* Statut d'OF : le board OF/Combiné est seul à en porter un. Les stores sont
     déjà souscrits en entier plus haut (`useBoardStore()`), on lit leurs
     tranches directement plutôt que d'ajouter des sélecteurs redondants. */
  const statuses = boardStore.statusFilter
  const toggleStatus = boardStore.toggleStatus

  /* Nature de poste : les deux boards en ont une, chacun la sienne. */
  const posteNatures = isOrderMode ? orderStore.posteNatureFilter : boardStore.posteNatureFilter
  const togglePosteNature = isOrderMode
    ? orderStore.togglePosteNature
    : boardStore.togglePosteNature

  /* Ce qui S'ÉCARTE du défaut — pas ce qui est coché. Statut et nature partent
     tous filtres actifs : les compter « actifs » afficherait un 3 permanent sur
     le déclencheur et ne dirait plus rien. */
  const activeFilterCount =
    (activeScope !== DEFAULT_SCOPE ? 1 : 0) +
    (!isOrderMode && statuses.size !== STATUS_CHIPS.length ? 1 : 0) +
    (posteNatures.size !== POSTE_NATURE_CHIPS.length ? 1 : 0)

  const isFiltered = activeFilterCount > 0 || activeQuery.trim().length > 0

  /* Volume filtré (zone 04). Rendu seulement sous filtre : un total qui ne
     bouge pas occupe la rangée sans rien apprendre. Le comptage traverse le
     board en mémoire (quelques centaines de cartes), jamais X3. */
  const filteredCount = useMemo(() => {
    if (!isFiltered) return 0
    if (isOrderMode) {
      let n = 0
      for (const line of orderStore.board.lines) {
        if (!orderStore.lineVisible(line.code)) continue
        for (const dc of line.dayCells) {
          for (const c of dc.cards) if (orderStore.cardMatches(c, line.code)) n++
        }
      }
      return n
    }
    let n = 0
    for (const line of boardStore.board.lines) {
      if (!lineVisible(boardStore, line.code)) continue
      for (const dc of line.dayCells) {
        for (const c of dc.cards) if (cardMatches(boardStore, c, line.code)) n++
      }
    }
    return n
    // `boardStore` / `orderStore` en dépendance, et l'état souscrit plutôt que
    // `getState()` : leur identité change à chaque `set()`, ce qui est
    // exactement quand ce compte doit être refait.
  }, [isFiltered, isOrderMode, boardStore, orderStore])

  const totalCount = isOrderMode
    ? orderStore.board.lines.reduce(
        (s, l) => s + l.dayCells.reduce((t, dc) => t + dc.cards.length, 0),
        0
      )
    : props.totalOf

  const toolbar = (
    <>
      {/* ── Zone 01 · Portée : ce que la page montre ────────────────────── */}
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Mode d'affichage">
          {(['ordonnancement', 'combined', 'planification'] as const).map((m) => (
            <ToolbarSegment
              key={m}
              active={mode === m}
              title={MODE_TITLES[m]}
              onClick={() => switchMode(m)}
            >
              {MODE_LABELS[m]}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>

        <ToolbarDateWindow
          value={range}
          onCommit={applyRange}
          title="Fenêtre du programme : OF dont le démarrage tombe dans la plage"
        />

        {/* ── Zone 02 · Filtres : un déclencheur, rien d'autre ──────────── */}
        <ToolbarFilterMenu activeCount={activeFilterCount} width={300}>
          <ToolbarFilterSection>Portée de la recherche</ToolbarFilterSection>
          <ToolbarSegmented semantics="tabs" flat className="w-full flex-wrap">
            {scopeOptions.map((s) => (
              <ToolbarSegment
                key={s.v}
                active={activeScope === s.v}
                onClick={() => onScopeChange(s.v)}
              >
                {s.label}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>

          {/* Le mode Commandes n'a pas de statut d'OF à filtrer : la section
              disparaît plutôt que d'offrir trois chips sans effet. */}
          {!isOrderMode && (
            <>
              <Separator className="my-2" />
              <ToolbarFilterSection>Statut d’OF</ToolbarFilterSection>
              <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                {STATUS_CHIPS.map(({ k, label, tone }) => (
                  <ToolbarFilterChip
                    key={k}
                    label={label}
                    tone={tone}
                    active={statuses.has(k)}
                    onClick={() => toggleStatus(k)}
                  />
                ))}
              </ToolbarSegmented>
            </>
          )}

          <Separator className="my-2" />
          <ToolbarFilterSection>Nature de poste</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full">
            {POSTE_NATURE_CHIPS.map(({ k, label }) => (
              <ToolbarSegment
                key={k}
                active={posteNatures.has(k)}
                onClick={() => togglePosteNature(k)}
              >
                {label}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      {/* ── Zone 03 · Interrogation : jamais repliée ────────────────────── */}
      <ToolbarSearch
        value={activeQuery}
        onChange={onQueryInput}
        placeholder={scopeOptions.find((s) => s.v === activeScope)?.placeholder ?? 'Rechercher…'}
      />

      {/* ── Zone 04 · État puis actions ─────────────────────────────────── */}
      {isFiltered && (
        <ToolbarMetric emphasis title={`sur ${totalCount} ${isOrderMode ? 'lignes' : 'OF'}`}>
          {filteredCount}{' '}
          <span className="font-normal text-muted-foreground">{isOrderMode ? 'lignes' : 'OF'}</span>
        </ToolbarMetric>
      )}

      <ToolbarRefresh loading={refreshing} onClick={doRefresh} />

      {/* Action primaire. Les trois actions vivaient sous un menu « Actions »
          en <details> maison — deux implémentations d'accessibilité pour un
          rôle déjà couvert par le design system. */}
      <Pill
        variant="outline"
        className="gap-1.5"
        onClick={runFeasibility}
        disabled={feasLoading()}
        title="Calculer la faisabilité matières des OF de la fenêtre (F)"
      >
        {feasLoading() ? (
          <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <Wand2 size={14} strokeWidth={1.75} />
        )}
        {feasLoading() ? 'Calcul…' : 'Faisabilité'}
      </Pill>

      {/* Scénario, triage et sélection ne sont pas des actions : ce sont des
          MODES, chacun avec sa propre UI persistante une fois entré (bandeau
          scénario, rail, BatchFirmBar). Trois pills permanentes pour trois
          entrées occasionnelles saturaient le bord droit — un déclencheur
          unique suffit, et il porte l'état de ce qui tourne. */}
      <ModesMenu
        combined={mode === 'combined'}
        showSelect={!isOrderMode}
        scenarioActive={scenarioActive}
        onToggleScenario={toggleScenario}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((v) => !v)}
        selectMode={boardStore.selectMode}
        onToggleSelect={() => {
          const s = useBoardStore.getState()
          if (s.selectMode) s.exitSelect()
          else s.enterSelect()
        }}
      />
    </>
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppLayout
      title="Programme"
      active="programme"
      subtitle="Programme de fabrication"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1` du board en
          dessous ne se dimensionnent contre rien et la grille déborde hors de
          l'écran sans scroll possible. */}
      <div className="flex h-full min-h-0 flex-col">
        {/* #57 — bandeau du mode scénario */}
        {mode === 'combined' && scenarioActive && (
          <ScenarioBar
            windowFrom={props.windowFrom}
            windowTo={props.windowTo}
            applying={applying}
            articleOptions={articleOptions}
            onApply={applyScenario}
            onDiscard={discardScenario}
            onOpenScenario={openScenario}
            onShowDiff={() => setDiffOpen(true)}
            onInjectDemand={injectVirtualOrder}
          />
        )}

        {/* Bandeau d'erreur : ton `destructive`, comme /ruptures et /sequenceur.
            Le brand marquait un échec de chargement de la même couleur que les
            actions de la page. */}
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground print:hidden">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Erreur chargement :</span>
            <span className="truncate font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* ═══ Board ═══ */}
        {mode === 'planification' ? (
          orderStore.board.lines.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <OrderGrid
                board={orderStore.board}
                onSelectCard={onSelectOrderLine}
                lineVisible={orderStore.lineVisible}
                cardMatches={orderStore.cardMatches}
                dayLoadSplit={orderStore.dayLoadSplit}
                lineWeekLoads={orderStore.lineWeekLoads}
                feasOf={orderStore.feasOf}
                moveCard={orderStore.moveCard}
                resetOverride={orderStore.resetOverride}
              />
            </div>
          ) : (
            <EmptyBoard label="Aucune ligne de commande dans l'horizon." />
          )
        ) : props.lineCount > 0 ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              <BoardGrid
                store={boardStore}
                onSelectOf={onSelectOf}
                onCardHover={(num) => setActiveId(num)}
                onCellDrop={onCommandeDrop}
                onLineEngagement={onLineEngagement}
                contentRef={setContentEl}
                cardRetard={mode === 'combined' ? retardJoursOf : undefined}
                onOfDragProgress={mode === 'combined' ? onOfDragProgress : undefined}
                onOfDropped={mode === 'combined' ? onOfDropped : undefined}
                onOfDragCancelled={mode === 'combined' ? onOfDragCancelled : undefined}
                translateOfDateFin={mode === 'combined' ? translateOfDateFin : undefined}
                virtualOrdersByCol={
                  mode === 'combined' && scenarioActive ? virtualOrdersByCol : undefined
                }
                onVirtualDrop={moveVirtualOrder}
                onVirtualRemove={removeVirtualOrder}
                cellExtra={
                  mode === 'combined'
                    ? (lineCode, col) => {
                        const cmds = cmdCells.get(lineCode)?.[col] ?? []
                        return (
                          <>
                            {cmds.map((cmd) => (
                              <CommandeMarker
                                key={cmd.id}
                                lineCode={lineCode}
                                cmd={cmd}
                                cmdIso={cmdIso}
                                verdict={verdictByCmd.get(cmd.id)?.verdict ?? null}
                                deltaJours={verdictByCmd.get(cmd.id)?.delta ?? null}
                              />
                            ))}
                          </>
                        )
                      }
                    : undefined
                }
                overlay={
                  mode === 'combined' ? (
                    <LinksOverlay paths={paths} isActive={isActive} linkMode={linkMode} />
                  ) : undefined
                }
              />
            </div>

            {/* Rail de triage */}
            {mode === 'combined' && railOpen && (
              <TriageRail
                commandes={props.commandes}
                links={props.links}
                verdictByCmd={verdictByCmd}
                counts={{
                  retards: nbCmdRetard,
                  limites: nbCmdLimite,
                  sanslien: nbCmdSansLien,
                }}
                onSelect={(item: TriageItem) => {
                  setRailSelected(item.commandeId)
                  setActiveId(item.commandeId)
                  if (item.ofId) {
                    const el = document.querySelector(`[data-num-of="${item.ofId}"]`)
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
                  }
                }}
                onDetailOf={(ofId) => onSelectOf(ofId)}
                onClose={() => setRailOpen(false)}
              />
            )}
          </div>
        ) : (
          <EmptyBoard label="Aucun OF dans l'horizon." />
        )}

        {/* #23 — tooltip flottant pendant le drag OF */}
        {mode === 'combined' && dragTooltip && (
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-1.5 font-mono text-xs font-bold text-foreground shadow-float">
            {dragTooltip}
          </div>
        )}

        {/* BatchFirmBar (OF seulement) */}
        {mode !== 'planification' && <BatchFirmBar />}
      </div>

      {/* Drawer détail OF */}
      <OfDetailSheet
        num={selectedOf}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onFirmed={(oldId, newId) => boardStore.transformCard(oldId, newId)}
      />

      {/* Panneau Engagement */}
      <PosteEngagementSheet
        posteCode={engagementPoste}
        open={engagementOpen}
        onOpenChange={setEngagementOpen}
      />

      {/* ScenarioDiffSheet */}
      <ScenarioDiffSheet
        diff={scenarioDiff}
        open={diffOpen}
        onOpenChange={setDiffOpen}
        loading={scenarioDiffLoading}
        evaluatedAt={scenarioEvaluatedAt}
        dataAt={scenarioDataAt}
      />
    </AppLayout>
  )
}

/**
 * Déclencheur unique des modes du board — zone 04, après l'action primaire.
 *
 * Composé des primitives du design system (Popover Base UI + Pill + le panneau
 * `filter-menu-panel`), et non d'un `<details>` maison : le standard §17
 * relève déjà deux implémentations d'accessibilité concurrentes pour ce rôle,
 * inutile d'en réintroduire une troisième. Le point sur le déclencheur dit
 * qu'un mode tourne ; le panneau dit lequel.
 */
function ModesMenu(props: {
  combined: boolean
  showSelect: boolean
  scenarioActive: boolean
  onToggleScenario: () => void
  railOpen: boolean
  onToggleRail: () => void
  selectMode: boolean
  onToggleSelect: () => void
}) {
  const actifs =
    (props.combined && props.scenarioActive ? 1 : 0) +
    (props.combined && props.railOpen ? 1 : 0) +
    (props.showSelect && props.selectMode ? 1 : 0)

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Pill
            variant={actifs > 0 ? 'active' : 'outline'}
            className="gap-1.5"
            title="Modes du board — scénario, triage, sélection"
          >
            <Layers size={14} strokeWidth={1.75} />
            Modes
            {actifs > 0 && (
              <span className="rounded-full bg-card px-1.5 py-px text-3xs font-semibold leading-none tabular-nums text-foreground">
                {actifs}
              </span>
            )}
            <ChevronDown size={16} strokeWidth={1.75} className="opacity-60" />
          </Pill>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup data-slot="filter-menu-panel" className="w-[260px] p-2">
            <ToolbarFilterSection>Modes du board</ToolbarFilterSection>
            <div className="flex flex-col">
              {props.combined && (
                <>
                  <ModeRow
                    icon={<FlaskConical size={14} strokeWidth={1.75} />}
                    label="Scénario"
                    hint="Simuler des déplacements sans écrire dans X3"
                    shortcut="S"
                    active={props.scenarioActive}
                    onClick={props.onToggleScenario}
                  />
                  <ModeRow
                    icon={<ListChecks size={14} strokeWidth={1.75} />}
                    label="Rail de triage"
                    hint="Commandes en retard, limites et sans lien"
                    shortcut="T"
                    active={props.railOpen}
                    onClick={props.onToggleRail}
                  />
                </>
              )}
              {props.showSelect && (
                <ModeRow
                  icon={<ClipboardList size={14} strokeWidth={1.75} />}
                  label="Sélection multiple"
                  hint="Affermir plusieurs OF d’un coup"
                  active={props.selectMode}
                  onClick={props.onToggleSelect}
                />
              )}
            </div>
            {/* Le mode Commandes n'offre aucun de ces modes : le dire plutôt que
                de présenter un panneau vide. */}
            {!props.combined && !props.showSelect && (
              <p className="px-1.5 py-2 text-2xs leading-snug text-muted-foreground">
                Scénario, triage et sélection sont des capacités des vues OF et Combiné.
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Une ligne du panneau Modes : bascule à `aria-pressed`, état lisible sans survol. */
function ModeRow(props: {
  icon: React.ReactNode
  label: string
  hint: string
  shortcut?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted',
        props.active && 'bg-muted'
      )}
    >
      <span className={cn('mt-px shrink-0', props.active ? 'text-brand' : 'text-muted-foreground')}>
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">{props.label}</span>
          {props.active && (
            <span className="font-mono text-3xs font-bold uppercase tracking-wider text-brand">
              on
            </span>
          )}
        </span>
        <span className="mt-px block text-2xs leading-snug text-muted-foreground">
          {props.hint}
        </span>
      </span>
      {props.shortcut && (
        <kbd className="mt-px shrink-0 rounded border border-border px-1 font-mono text-3xs font-bold uppercase text-muted-foreground">
          {props.shortcut}
        </kbd>
      )}
    </button>
  )
}

/** État vide du board — même grammaire que /ruptures (icône muette + phrase). */
function EmptyBoard({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <DynamicIcon name="calendar_month" size={32} className="text-muted-foreground/50" />
        {label}
      </div>
    </div>
  )
}

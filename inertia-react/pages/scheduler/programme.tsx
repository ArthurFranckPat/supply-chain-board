/**
 * Page /programme — orchestrateur Vue unifiée OF ↔ commandes.
 * Port React du Solid inertia/pages/scheduler/programme.tsx (1255 l.).
 *
 * Issue #21 — Vue unifiée OF ↔ commandes.
 *
 * Le board est STRICTEMENT celui de /ordonnancement : on réutilise le composant
 * <BoardGrid> sur le même payload BoardData (charge par jour, histogramme hebdo
 * par poste, recherche multi-scope, drag&drop). Vision n'ajoute que deux calques :
 *  • des marqueurs « commande » posés dans la cellule de leur poste/jour
 *    d'expédition (slot cellExtra) ;
 *  • un overlay SVG reliant chaque OF à sa commande à l'horizontale (mesuré au DOM
 *    via data-num-of / data-link-cmd).
 *
 * Shell (état + composition) — toolbar, marqueur commande et overlay de liens
 * vivent dans components/vision/*.tsx ; la géométrie pure dans lib/vision/
 * (issue #52).
 */

import { useEffect, useMemo, useState, useRef, useCallback, type JSX } from 'react'
import { Head, usePage, router } from '@inertiajs/react'

import Masthead from '@r/components/masthead'
import { TextField, TextFieldInput } from '@r/components/ui/text-field'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@r/components/ui/select'

import { useBoardStore, statusActive } from '@r/lib/board/store'
import { useOrderBoardStore } from '@r/lib/orders/orders-store'
import { useScenarioStore } from '@r/lib/scenario/store'

import type { BoardData, SearchScope } from '@/lib/board/types'
import type { OrderBoardData, OrderSearchScope } from '@/lib/orders/types'
import type { VisionCommande, VisionLink } from '@/lib/vision/types'
import type { PlanMutation } from '@/lib/scenarios/types'

import { parseIso, toIso, startOfDay, DAY_MS, fmtDay } from '@r/lib/vision/date-utils'
import { buildLinkPath, pathMid, type PathSpec } from '@r/lib/vision/link-overlay'
import { buildCmdCells } from '@r/lib/vision/cmd-cells'
import {
  computeImpacts,
  worstVerdict,
  deltaLabel,
  linkKey,
  type ImpactVerdict,
} from '@r/lib/vision/impact'

import { ProgrammeToolbar, ProgrammeContextBar, type VisionMode } from '@r/components/vision/programme-toolbar'
import { CommandeMarker } from '@r/components/vision/commande-marker'
import { LinksOverlay, type LinkMode } from '@r/components/vision/links-overlay'
import { PlanHealth, type HealthCategory } from '@r/components/vision/plan-health'
import { TriageRail, type TriageItem } from '@r/components/vision/triage-rail'
import { ScenarioBar } from '@r/components/scenario/scenario-bar'
import { ScenarioDiffSheet } from '@r/components/scenario/scenario-diff-sheet'

import BoardGrid from '@r/components/board/board-grid'
import BatchFirmBar from '@r/components/board/batch-firm-bar'
import OrderGrid from '@r/components/board/order-grid'
import OfDetailSheet from '@r/components/of/of-detail-sheet'
import PosteEngagementSheet from '@r/components/board/poste-engagement-sheet'

import { useShortcuts } from '@r/lib/a11y/shortcuts'
import { toast } from 'sonner'
import { virtualOrdersFrom } from '@/lib/scenarios/types'
import { route } from '@/lib/routes'
import { cn } from '@r/lib/utils'
import type { DateRange } from '@r/components/vision/programme-toolbar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisionProps = {
  mode: VisionMode
  board: BoardData | null
  commandes: VisionCommande[]
  links: VisionLink[]
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

const OF_SCOPES = [
  { v: 'poste' as const, label: 'Poste' },
  { v: 'of' as const, label: 'OF' },
  { v: 'pf' as const, label: 'PF' },
  { v: 'composant' as const, label: 'Composant' },
] as const

const ORDER_SCOPES = [
  { v: 'poste' as const, label: 'Poste' },
  { v: 'commande' as const, label: 'Commande' },
  { v: 'article' as const, label: 'Article' },
  { v: 'client' as const, label: 'Client' },
] as const

type ScopeOption = { v: SearchScope | OrderSearchScope; label: string }

// ---------------------------------------------------------------------------
// Programme Component
// ---------------------------------------------------------------------------

export default function Programme(props: VisionProps) {
  const page = usePage<VisionProps>()

  // Stores
  const boardStore = useBoardStore()
  const orderStore = useOrderBoardStore()
  const scenarioStore = useScenarioStore()

  // ── Issue #57 — mode scénario ──
  const [diffOpen, setDiffOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  // Mode local (plus de round-trip serveur au switch)
  const [mode, setMode] = useState<VisionMode>(props.mode)

  // Re-sync stores après navigation Inertia (keyé sur windowFrom)
  useEffect(() => {
    boardStore.reset(page.props.board ?? EMPTY_BOARD)
    orderStore.reset(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
  }, [page.props.windowFrom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switch de mode → toggle local + URL (replaceState)
  const switchMode = useCallback((newMode: VisionMode) => {
    if (newMode === mode) return
    setMode(newMode)
    const url = new URL(window.location.href)
    if (newMode === 'combined') {
      url.searchParams.delete('mode')
    } else {
      url.searchParams.set('mode', newMode)
    }
    window.history.replaceState({}, '', url)
  }, [mode])

  // Store « actif » selon le mode
  const isOrderMode = mode === 'planification'
  const scopeOptions = (): readonly ScopeOption[] => (isOrderMode ? ORDER_SCOPES : OF_SCOPES)
  const feasLoading = () => (isOrderMode ? orderStore.feasLoading : boardStore.feasLoading)
  const runFeasibility = useCallback(() => {
    if (isOrderMode) {
      orderStore.runFeasibility(props.windowFrom, props.windowTo)
    } else {
      boardStore.runFeasibility(props.windowFrom, props.windowTo)
    }
  }, [isOrderMode, props.windowFrom, props.windowTo])
  const feasMode = () => (isOrderMode ? orderStore.mode : boardStore.mode)
  const setFeasMode = useCallback((m: 'immediate' | 'sequential') => {
    if (isOrderMode) {
      orderStore.setMode(m)
    } else {
      boardStore.setMode(m)
    }
  }, [isOrderMode])

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
  const findOrderCard = useCallback((cardId: string) => {
    for (const line of orderStore.board.lines) {
      for (const dc of line.dayCells) {
        const c = dc.cards.find((x) => x.id === cardId)
        if (c) return c
      }
    }
    return undefined
  }, [orderStore.board.lines])

  const onSelectOrderLine = useCallback((key: string) => {
    const card = findOrderCard(key)
    const ofNum = card?.contremarque?.trim() || null
    if (ofNum) {
      setSelectedOf(ofNum)
      setDetailOpen(true)
    } else {
      toast.error('Aucun OF rattaché à cette ligne de commande.')
    }
  }, [findOrderCard])

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
  }, [refreshing, props.windowFrom, props.horizon, mode, boardStore, orderStore, page.props])

  // ── Calendrier ──
  const [calOpen, setCalOpen] = useState(false)
  const [range, setRange] = useState<DateRange>(() => ({
    from: parseIso(props.windowFrom) ?? undefined,
    to: parseIso(props.windowTo) ?? undefined,
  }))

  const applyRange = useCallback((r: DateRange) => {
    setRange(r)
    if (r.from && r.to) {
      setCalOpen(false)
      const days = Math.round((startOfDay(r.to).getTime() - startOfDay(r.from).getTime()) / DAY_MS) + 1
      router.visit(route('scheduler.programme'), {
        data: {
          start: toIso(r.from),
          days: String(days),
          ...(mode !== 'combined' && { mode: mode }),
        },
        preserveScroll: true,
      })
    }
  }, [mode])

  // ── Overrides drag ──
  const cmdCol = useCallback((l: VisionLink) => cmdMoved.get(l.commandeId)?.col ?? l.cmdCol, [cmdMoved])
  const cmdIso = useCallback((cmd: VisionCommande) => cmdMoved.get(cmd.id)?.iso ?? cmd.dateExpeditionIso, [cmdMoved])

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
    const m = new Map<string, VisionLink>()
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

  const retardJoursOf = useCallback((ofId: string): number | null => retardByOf.get(ofId) ?? null, [retardByOf])

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
  const [linkMode, setLinkMode] = useState<'none' | 'problems' | 'all'>('problems')

  // ── Rail de triage ──
  const [railOpen, setRailOpen] = useState(false)
  const [railTab, setRailTab] = useState<'retards' | 'limites' | 'sanslien'>('retards')
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

  const ofColOrigine = useCallback((ofId: string): number | null => {
    return ofPositions.get(ofId) ?? linksByOf.get(ofId)?.ofCol ?? null
  }, [ofPositions, linksByOf])

  const dayShiftFor = useCallback((ofId: string, targetIso: string): number | null => {
    const origine = ofColOrigine(ofId)
    if (origine === null) return null
    const fromIso = boardStore.board.lines[0]?.dayCells[origine]?.iso
    if (!fromIso) return null
    const fromD = parseIso(fromIso)
    const toD = parseIso(targetIso)
    if (!fromD || !toD) return null
    return Math.round((toD.getTime() - fromD.getTime()) / DAY_MS)
  }, [ofColOrigine, boardStore.board.lines])

  // ── Tooltip drag OF ──
  const [dragTooltip, setDragTooltip] = useState<string | null>(null)

  const updateDragTooltip = useCallback((ofId: string) => {
    const v = verdictByOf.get(ofId)
    const finOrigine = ofDateFinOverride.get(ofId) ?? linksByOf.get(ofId)?.ofDateFinIso ?? null
    const finD = finOrigine ? parseIso(finOrigine) : null

    if (v === 'retard' && finD) {
      const shift = ofShift.get(ofId) ?? 0
      const shifted = new Date(finD)
      shifted.setDate(shifted.getDate() + shift)
      const delta = retardJoursOf(ofId)
      setDragTooltip(`Dispo estimée le ${fmtDay(toIso(shifted))} · ${delta ? deltaLabel(delta) : 'en retard'}`)
    } else if (v === 'retard') {
      setDragTooltip('OF en retard sur sa commande')
    } else if (v === 'limite') {
      setDragTooltip('OF limite (J)')
    } else if (v === 'ok') {
      setDragTooltip("OF à l'heure")
    } else {
      setDragTooltip(null)
    }
  }, [verdictByOf, ofDateFinOverride, linksByOf, ofShift, retardJoursOf])

  const onOfDragProgress = useCallback((ofId: string, _toLineCode: string, _toCol: number, targetIso: string) => {
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
  }, [dayShiftFor, updateDragTooltip])

  const onOfDragCancelled = useCallback(() => {
    setOfShift(new Map())
    setDragTooltip(null)
  }, [])

  const ofDateFinOrigine = useCallback((ofId: string): string | null => {
    return ofDateFinOverride.get(ofId) ?? linksByOf.get(ofId)?.ofDateFinIso ?? null
  }, [ofDateFinOverride, linksByOf])

  const translateOfDateFin = useCallback((ofId: string, targetIso: string): string | null => {
    const finOrigine = ofDateFinOrigine(ofId)
    const finD = finOrigine ? parseIso(finOrigine) : null
    const shift = dayShiftFor(ofId, targetIso)
    if (!finD || shift === null) return null
    const shifted = new Date(finD)
    shifted.setDate(shifted.getDate() + shift)
    return toIso(shifted)
  }, [ofDateFinOrigine, dayShiftFor])

  const onOfDropped = useCallback((ofId: string, _toIso: string, dateFinIso?: string) => {
    if (dateFinIso) {
      setOfDateFinOverride((m) => new Map(m).set(ofId, dateFinIso))
    }
    setOfShift(new Map())
    setDragTooltip(null)
  }, [])

  // ── Intercepteur PATCH OF (#57) ──
  useEffect(() => {
    if (scenarioStore.active) {
      boardStore.setMoveInterceptor(({ numOf, toLineCode, toIso, dateFinIso }) => {
        scenarioStore.upsertMutation({
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
  }, [scenarioStore.active, boardStore, scenarioStore])

  // ── Colonne du board par ISO ──
  const colOfIso = useCallback((iso: string): number => {
    return boardStore.board.lines[0]?.dayCells.findIndex((dc) => dc.iso === iso) ?? -1
  }, [boardStore.board.lines])

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
  const virtualOrders = useMemo(() => {
    return virtualOrdersFrom(scenarioStore.current.mutations, scenarioStore.diff)
  }, [scenarioStore.current.mutations, scenarioStore.diff])

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

  const injectVirtualOrder = useCallback((m: Extract<PlanMutation, { type: 'inject_demand' }>) => {
    scenarioStore.upsertMutation(m)
    scenarioStore.computeDiff(props.windowFrom, props.windowTo)
  }, [scenarioStore, props.windowFrom, props.windowTo])

  const moveVirtualOrder = useCallback((id: string, _col: number, iso: string) => {
    const existing = scenarioStore.current.mutations.find(
      (m): m is Extract<PlanMutation, { type: 'inject_demand' }> =>
        m.type === 'inject_demand' && m.id === id
    )
    if (!existing) return
    scenarioStore.upsertMutation({ ...existing, date: iso })
    scenarioStore.computeDiff(props.windowFrom, props.windowTo)
  }, [scenarioStore.current.mutations, props.windowFrom, props.windowTo])

  const removeVirtualOrder = useCallback((id: string) => {
    scenarioStore.removeMutation(`inject:${id}`)
    scenarioStore.computeDiff(props.windowFrom, props.windowTo)
  }, [scenarioStore, props.windowFrom, props.windowTo])

  // ── Scénario (#57) ──
  const toggleScenario = useCallback(() => {
    scenarioStore.setActive(!scenarioStore.active)
  }, [scenarioStore.active])

  const applyScenario = useCallback(async () => {
    if (applying) return
    setApplying(true)
    try {
      let total = 0
      let failed = 0
      for (const m of scenarioStore.current.mutations) {
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
          continue
        }
        if (!r?.ok) failed++
      }
      if (failed > 0) {
        toast.warning(
          `${total - failed}/${total} mutation${total > 1 ? 's' : ''} appliquée${total - failed > 1 ? 's' : ''} — ${failed} échec${failed > 1 ? 's' : ''}. Scénario conservé.`
        )
        return
      }
      await scenarioStore.markApplied()
      scenarioStore.setActive(false)
      toast.success('Scénario appliqué.')
      router.reload()
    } catch (err) {
      toast.error(`Application échouée : ${(err as Error).message}`)
    } finally {
      setApplying(false)
    }
  }, [applying, scenarioStore])

  const discardScenario = useCallback(() => {
    boardStore.updateData(page.props.board ?? EMPTY_BOARD)
    orderStore.updateData(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
    setCmdMoved(new Map())
    setOfShift(new Map())
    setOfDateFinOverride(new Map())
    scenarioStore.reset()
    scenarioStore.setActive(false)
    requestMeasure()
  }, [boardStore, orderStore, scenarioStore, page.props])

  const openScenario = useCallback(async (id: number) => {
    scenarioStore.setActive(true)
    const mutations = await scenarioStore.open(id)
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
  }, [scenarioStore, boardStore, colOfIso])

  // ── Commandes regroupées par poste × colonne ──
  const cmdCells = useMemo(() => {
    return buildCmdCells(props.commandes, props.links, cmdCol)
  }, [props.commandes, props.links, cmdCol])

  // ── Drop commande ──
  const onCommandeDrop = useCallback((_lineCode: string, col: number, iso: string, e: DragEvent) => {
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
    if (scenarioStore.active) {
      scenarioStore.upsertMutation({
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
  }, [scenarioStore])

  // ── Overlay liens ──
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  const [paths, setPaths] = useState<PathSpec[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const isActive = useCallback((p: PathSpec) => {
    const id = activeId
    return id !== null && (p.ofId === id || p.commandeId === id)
  }, [activeId])

  const measureScheduled = useRef(false)
  const requestMeasure = useCallback(() => {
    if (measureScheduled.current) return
    measureScheduled.current = true
    requestAnimationFrame(() => {
      measureScheduled.current = false
      measure()
    })
  }, [])

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

    // #57 — deep-link ?open_scenario_id=N
    const params = new URLSearchParams(window.location.search)
    const openId = params.get('open_scenario_id')
    if (openId) {
      const numId = Number.parseInt(openId, 10)
      if (!Number.isNaN(numId)) {
        openScenario(numId)
      }
    }

    // #58/CTP — pont depuis /promesse
    const bridge = sessionStorage.getItem('promesse:bridge')
    if (bridge) {
      sessionStorage.removeItem('promesse:bridge')
      try {
        const { article, quantity, date } = JSON.parse(bridge) as {
          article: string
          quantity: number
          date: string
        }
        scenarioStore.setActive(true)
        injectVirtualOrder({
          type: 'inject_demand',
          id: `CTP-${Date.now().toString(36)}`,
          article,
          quantity,
          date: date.slice(0, 10),
          earliest: true,
        })
      } catch {
        /* payload corrompu — silencieux */
      }
    }

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, openScenario, scenarioStore, injectVirtualOrder])

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
      if (calOpen) setCalOpen(false)
      else if (detailOpen) setDetailOpen(false)
      else if (engagementOpen) setEngagementOpen(false)
      else if (diffOpen) setDiffOpen(false)
    }
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Head title="Programme" />
      <div className="theme-airbnb flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Masthead
          subtitle="Programme · Flux OF ↔ commandes"
          active="programme"
          variant="airbnb"
          meta={
            <>
              <div className="font-fraunces text-xs font-bold not-italic text-brand">
                {props.weekLabel}
              </div>
              <div>
                Fenêtre <b className="font-bold text-foreground">{props.horizon} j</b> ·{' '}
                <b className="font-bold text-foreground">{props.totalOf}</b> OF ·{' '}
                <b className="font-bold text-foreground">{props.lineCount}</b> postes ·{' '}
                <b className="font-bold text-foreground">{props.commandes.length}</b> commandes
              </div>
            </>
          }
        />

        <ProgrammeToolbar
          mode={mode}
          switchMode={switchMode}
          feasLoading={feasLoading()}
          runFeasibility={runFeasibility}
          refreshing={refreshing}
          doRefresh={doRefresh}
          dateRange={props.dateRange}
          calOpen={calOpen}
          setCalOpen={setCalOpen}
          range={range}
          applyRange={applyRange}
          scenarioActive={scenarioStore.active}
          onToggleScenario={toggleScenario}
          search={
            <>
              <div className="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                <span className="material-symbols-outlined text-[17px] text-muted-foreground">
                  search
                </span>
                <input
                  className="w-[180px] border-0 bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0 outline-none"
                  placeholder={
                    mode === 'planification'
                      ? 'Commande, article, client…'
                      : 'OF, article, poste…'
                  }
                  aria-label="Rechercher"
                  type="text"
                  autoComplete="off"
                  value={mode === 'planification' ? orderStore.query : boardStore.query}
                  onInput={(e) =>
                    mode === 'planification'
                      ? orderStore.onQueryInput(e.currentTarget.value)
                      : boardStore.onQueryInput(e.currentTarget.value)
                  }
                />
              </div>
              <Select
                value={mode === 'planification' ? orderStore.scope : boardStore.scope}
                onValueChange={(v) => {
                  if (!v) return
                  if (mode === 'planification') orderStore.onScopeChange(v as OrderSearchScope)
                  else boardStore.onScopeChange(v as SearchScope)
                }}
              >
                <SelectTrigger
                  className="h-[30px] w-[110px] rounded-full border border-rule bg-card px-3 text-xs font-semibold"
                  aria-label="Portée de la recherche"
                >
                  <SelectValue placeholder="Portée" />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions().map((s) => (
                    <SelectItem key={s.v} value={s.v}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />

        <ProgrammeContextBar mode={mode} feasMode={feasMode()} setFeasMode={setFeasMode}>
          {mode === 'combined' && (
            <>
              <div
                className="inline-flex items-center gap-0.5 rounded-lg border border-rule bg-card p-0.5"
                role="radiogroup"
                aria-label="Visibilité des liens"
              >
                <span className="px-1.5 font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                  Liens
                </span>
                {(['none', 'problems', 'all'] as const).map((lm) => (
                  <button
                    key={lm}
                    type="button"
                    role="radio"
                    aria-checked={linkMode === lm}
                    className={cn(
                      'min-h-[28px] rounded-md px-2.5 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
                      linkMode === lm
                        ? 'bg-brand-soft text-brand'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setLinkMode(lm)}
                  >
                    {lm === 'none' ? 'Aucun' : lm === 'problems' ? 'Problèmes' : 'Tous'}
                  </button>
                ))}
              </div>
              <PlanHealth
                nbRetards={nbCmdRetard}
                nbLimites={nbCmdLimite}
                nbRuptures={((): number => {
                  let n = 0
                  for (const f of Object.values(boardStore.feasibility)) if (f.st === 'blocked') n++
                  return n
                })()}
                rupturesAvailable={Object.keys(boardStore.feasibility).length > 0}
                nbSansLien={nbCmdSansLien}
                onSelect={(cat: HealthCategory) => {
                  setRailTab(cat === 'ruptures' ? 'retards' : cat)
                  setRailOpen(true)
                }}
              />
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setRailOpen((v) => !v)}
                aria-pressed={railOpen}
                className={cn(
                  'inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  railOpen
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-rule bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="material-symbols-outlined text-sm">queue</span>
                Rail
              </button>
            </>
          )}
        </ProgrammeContextBar>

        {/* #57 — bandeau du mode scénario */}
        {mode === 'combined' && scenarioStore.active && (
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

        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-xs text-foreground print:hidden">
            <span className="material-symbols-outlined text-[16px] text-brand">warning</span>
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* ═══ Board ═══ */}
        {mode === 'planification' ? (
          orderStore.board.lines.length > 0 ? (
            <div className="flex-1 overflow-hidden">
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
            <div className="flex flex-1 items-center justify-center p-10 font-fraunces text-sm italic text-muted-foreground">
              Aucune ligne de commande dans l'horizon.
            </div>
          )
        ) : props.lineCount > 0 ? (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
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
                  mode === 'combined' && scenarioStore.active ? virtualOrdersByCol : undefined
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
          <div className="flex flex-1 items-center justify-center p-10 font-fraunces text-sm italic text-muted-foreground">
            Aucun OF dans l'horizon.
          </div>
        )}

        {/* #23 — tooltip flottant pendant le drag OF */}
        {mode === 'combined' && dragTooltip && (
          <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rule bg-card px-4 py-1.5 font-mono text-xs font-bold text-foreground shadow-lg">
            {dragTooltip}
          </div>
        )}

        {/* BatchFirmBar (OF seulement) */}
        {mode !== 'planification' && <BatchFirmBar />}

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
          diff={scenarioStore.diff}
          open={diffOpen}
          onOpenChange={setDiffOpen}
          loading={scenarioStore.diffLoading}
          evaluatedAt={scenarioStore.current.evaluatedAt}
          dataAt={scenarioStore.current.dataAt}
        />
      </div>
    </>
  )
}

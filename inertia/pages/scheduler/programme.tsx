import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js'
import { router, usePage } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'
import { cx } from '@/libs/cva'
import { createBoardStore } from '@/lib/board/store'
import type { BoardData, SearchScope } from '@/lib/board/types'
import { createOrderBoardStore } from '@/lib/orders/store'
import type { OrderBoardData, OrderSearchScope } from '@/lib/orders/types'
import type { VisionCommande, VisionLink } from '@/lib/vision/types'
import { parseIso, toIso, startOfDay, DAY_MS, fmtDay } from '@/lib/vision/date-utils'
import { buildLinkPath, pathMid, type PathSpec } from '@/lib/vision/link-overlay'
import { buildCmdCells } from '@/lib/vision/cmd-cells'
import { computeImpacts, worstVerdict, deltaLabel, linkKey, type ImpactVerdict } from '@/lib/vision/impact'
import BoardGrid from '@/components/board/board-grid'
import BatchFirmBar from '@/components/board/batch-firm-bar'
import OrderGrid from '@/components/board/order-grid'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import PosteEngagementSheet from '@/components/board/poste-engagement-sheet'
import { CommandeMarker } from '@/components/vision/commande-marker'
import { LinksOverlay } from '@/components/vision/links-overlay'
import { PlanHealth, type HealthCategory } from '@/components/vision/plan-health'
import { TriageRail, type TriageItem } from '@/components/vision/triage-rail'
import { ProgrammeToolbar, type VisionMode } from '@/components/vision/programme-toolbar'
import { createScenarioStore } from '@/lib/scenarios/store'
import { ScenarioBar } from '@/components/scenario/scenario-bar'
import { ScenarioDiffSheet } from '@/components/scenario/scenario-diff-sheet'
import { useShortcuts } from '@/lib/a11y/shortcuts'
import { toast } from 'solid-sonner'
import { virtualOrdersFrom, type PlanMutation } from '@/lib/scenarios/types'
import { Masthead } from '@/components/masthead'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { type DateRange } from '@/components/ui/calendar'

/**
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

const EMPTY_BOARD: BoardData = { days: [], lines: [], weekSpans: [], cols: 0, colWeek: [], weekCaps: {} }
const EMPTY_ORDER_BOARD: OrderBoardData = { days: [], lines: [], ateliers: [], weekSpans: [], cols: 0, colWeek: [], weekCaps: {} }

const OF_SCOPES = [
  { v: 'poste', label: 'Poste' },
  { v: 'of', label: 'OF' },
  { v: 'pf', label: 'PF' },
  { v: 'composant', label: 'Composant' },
] as const satisfies { v: SearchScope; label: string }[]

const ORDER_SCOPES = [
  { v: 'poste', label: 'Poste' },
  { v: 'commande', label: 'Commande' },
  { v: 'article', label: 'Article' },
  { v: 'client', label: 'Client' },
] as const satisfies { v: OrderSearchScope; label: string }[]

const Programme: Component<VisionProps> = (props) => {
  const store = createBoardStore(props.board ?? EMPTY_BOARD)
  const orderStore = createOrderBoardStore(props.orderBoard ?? EMPTY_ORDER_BOARD)

  // ── Issue #57 — mode scénario ──
  // État data + I/O (mutations, CRUD, diff) dans le store dédié ; le couplage visuel
  // (intercepteur PATCH, rejeu au drop, retour à l'état réel) est orchestré ici, seul
  // détenteur des board stores.
  const scenario = createScenarioStore()
  const [diffOpen, setDiffOpen] = createSignal(false)
  const [applying, setApplying] = createSignal(false)

  // Mode = signal LOCAL (plus de round-trip serveur au switch). Les 2 boards (OF + Cmdes)
  // sont toujours dans le payload → toggle purement client, instantané, zéro cold-start.
  // Initialisé depuis props.mode (deep-link / redirection /planification). L'URL est mise à
  // jour via history.replaceState (sans fetch) pour préserver deep-link + back/forward.
  const [mode, setMode] = createSignal<VisionMode>(props.mode)

  // Re-sync stores après navigation Inertia (switch mode OU changement de fenêtre).
  // On clé le reset sur des PRIMITIFS fiables (mode + windowFrom) plutôt que sur les objets
  // board/orderBoard : `reconcile` (adapter inertia-solid) met à jour le contenu nested mais
  // garde la référence des objets stable → `on(() => props.board)` ne se déclenche pas (===),
  // le store ne se reset pas → board vide au cold start jusqu'au reload. Les primitifs, eux,
  // changent toujours de valeur → fire garanti. Le contenu à jour est lu via usePage().props
  // (store réactif, pas le spread snapshot).
  const page = usePage<VisionProps>()
  createEffect(
    on(
      () => page.props.windowFrom,
      () => {
        store.reset(page.props.board ?? EMPTY_BOARD)
        orderStore.reset(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
      },
      { defer: true }
    )
  )

  // Switch de mode → toggle local + URL (replaceState, zéro fetch).
  const switchMode = (newMode: VisionMode) => {
    if (newMode === mode()) return
    setMode(newMode)
    const url = new URL(window.location.href)
    if (newMode === 'combined') url.searchParams.delete('mode')
    else url.searchParams.set('mode', newMode)
    window.history.replaceState({}, '', url)
  }

  // Store « actif » selon le mode : orderStore en planification (commandes), sinon
  // store OF. Centralise la bascule pour la toolbar Faisabilité / Stock afin que les
  // badges, le sélecteur de mode d'allocation et le bouton de calcul pilotent le
  // bon board — sans dupliquer les ternaires dans le JSX (issue #21).
  const isOrderMode = () => mode() === 'planification'
  const feasLoading = () => (isOrderMode() ? orderStore.feasLoading() : store.feasLoading())
  const runFeasibility = () =>
    isOrderMode()
      ? orderStore.runFeasibility(props.windowFrom, props.windowTo)
      : store.runFeasibility(props.windowFrom, props.windowTo)
  const feasMode = () => (isOrderMode() ? orderStore.mode() : store.mode())
  const setFeasMode = (m: 'immediate' | 'sequential') =>
    isOrderMode() ? orderStore.setMode(m) : store.setMode(m)

  // Drawer détail OF (parité /ordonnancement). RÉUTILISÉ en mode planification :
  // au clic sur une carte commande (lineId = numCommande#ligne), on résout la
  // contremarque (FMINUM_0 = n° OF rattaché via le matcher hard-peg) depuis le
  // détail ligne, puis on ouvre le même <OfDetailSheet> — composant unique pour
  // les deux vues (OF direct OU commande → OF via contremarque).
  const [selectedOf, setSelectedOf] = createSignal<string | null>(null)
  const [detailOpen, setDetailOpen] = createSignal(false)
  const onSelectOf = (num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }

  // Panneau « Engagement » par poste (#46) : tous les OF fermes de la ligne +
  // commandes liées, via l'endpoint dédié (hors limite de fenêtre board).
  const [engagementPoste, setEngagementPoste] = createSignal<string | null>(null)
  const [engagementOpen, setEngagementOpen] = createSignal(false)
  const onLineEngagement = (lineCode: string) => {
    setEngagementPoste(lineCode)
    setEngagementOpen(true)
  }

  // Résolution commande → OF : la carte porte déjà la contremarque (FMINUM_0 = n° OF
  // rattaché via le matcher hard-peg), propagée depuis le flow jusqu'au payload board.
  // Lecture synchrone dans orderStore → zéro fetch, zéro 404. Au clic, on retrouve la
  // carte par son id (numCommande#ligne) puis on ouvre le même <OfDetailSheet>.
  const findOrderCard = (cardId: string) => {
    for (const line of orderStore.board.lines) {
      for (const dc of line.dayCells) {
        const c = dc.cards.find((x) => x.id === cardId)
        if (c) return c
      }
    }
    return undefined
  }
  const onSelectOrderLine = (key: string) => {
    const card = findOrderCard(key)
    const ofNum = card?.contremarque?.trim() || null
    if (ofNum) {
      setSelectedOf(ofNum)
      setDetailOpen(true)
    } else {
      toast.error('Aucun OF rattaché à cette ligne de commande.')
    }
  }

  // Calendrier de fenêtre (identique /ordonnancement).
  // Actualisation données (bouton refresh /programme) : rechargement PARTIEL des props via
  // router.reload({ only }), pas de navigation ni de re-render de page complète. windowFrom ne
  // change pas → l'effet de reset (keyé sur windowFrom) ne se redéclenche pas ; on met donc à
  // jour les stores nous-mêmes via updateData() (contenu seul, garde recherche/scope/filtres/
  // statut/sélection actifs — contrairement à reset() utilisé au changement de fenêtre).
  const [refreshing, setRefreshing] = createSignal(false)
  const doRefresh = () => {
    if (refreshing()) return
    setRefreshing(true)
    router.reload({
      data: {
        start: props.windowFrom,
        days: props.horizon,
        refresh: '1',
        ...(mode() !== 'combined' && { mode: mode() }),
      },
      only: ['board', 'orderBoard', 'commandes', 'links', 'x3Error', 'cached', 'totalOf', 'lineCount', 'weekLabel'],
      onSuccess: () => {
        // #62 (lot 0) : le payload frais fait foi — purge des overrides optimistes
        // (déplacements/dates locaux), sinon ils continueraient de masquer l'état serveur.
        setCmdMoved(new Map())
        setOfShift(new Map())
        setOfDateFinOverride(new Map())
        store.updateData(page.props.board ?? EMPTY_BOARD)
        orderStore.updateData(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
        requestMeasure()
      },
      onFinish: () => setRefreshing(false),
    })
  }

  const [calOpen, setCalOpen] = createSignal(false)
  const [range, setRange] = createSignal<DateRange>({
    start: parseIso(props.windowFrom),
    end: parseIso(props.windowTo),
  })
  const applyRange = (r: DateRange) => {
    setRange(r)
    if (r.start && r.end) {
      setCalOpen(false)
      const days =
        Math.round((startOfDay(r.end).getTime() - startOfDay(r.start).getTime()) / DAY_MS) + 1
      router.visit(route('scheduler.programme'), {
        data: {
          start: toIso(r.start),
          days: String(days),
          ...(mode() !== 'combined' && { mode: mode() }),
        },
        preserveScroll: true,
      })
    }
  }

  // Déplacement OPTIMISTE d'une commande (drag → autre date) : lineId → { col, iso }
  // appliqué localement avant le retour serveur ; le PATCH persiste en tâche de fond
  // (même esprit que store.moveCard pour les OF).
  const [cmdMoved, setCmdMoved] = createSignal<Map<string, { col: number; iso: string }>>(new Map())
  const cmdCol = (l: VisionLink) => cmdMoved().get(l.commandeId)?.col ?? l.cmdCol
  const cmdIso = (cmd: VisionCommande) => cmdMoved().get(cmd.id)?.iso ?? cmd.dateExpeditionIso

  // ── Issue #23 — couche d'impact ──
  // ofShift : décalage en jours appliqué à un OF pendant/après un drag (optimiste).
  // Alimenté par le drag OF (col cible − col origine) ; durée de l'OF préservée →
  // dateFin translatée du même écart dans computeImpacts.
  const [ofShift, setOfShift] = createSignal<Map<string, number>>(new Map())

  // Besoin commande provisoire pendant un drag commande = la map cmdMoved (iso).
  const cmdBesoinOverride = () => {
    const m = new Map<string, string>()
    cmdMoved().forEach((v, k) => m.set(k, v.iso))
    return m
  }

  // #23 : override client de la date de fin d'un OF, posé après un drop réussi —
  // évite que le badge/lien reviennent à l'ancien verdict tant que le payload
  // serveur (props.links) n'a pas été rafraîchi (reload manuel). Clé = ofId.
  const [ofDateFinOverride, setOfDateFinOverride] = createSignal<Map<string, string>>(new Map())

  // Liens effectifs = props.links, dateFin substituée par l'override post-drop s'il
  // existe. Dérivation unique, réutilisée par impacts() et par les lookups par OF.
  const effectiveLinks = createMemo(() =>
    ofDateFinOverride().size === 0
      ? props.links
      : props.links.map((l) => {
          const override = ofDateFinOverride().get(l.ofId)
          return override ? { ...l, ofDateFinIso: override } : l
        }),
  )
  // Index ofId → lien, construit une fois par changement de links — remplace les
  // scans linéaires répétés (ofColOrigine/ofDateFinOrigine) à chaque dragover.
  const linksByOf = createMemo(() => {
    const m = new Map<string, VisionLink>()
    for (const l of effectiveLinks()) m.set(l.ofId, l)
    return m
  })

  // Impacts (delta + verdict par lien) — dérivés des dates effectives + overrides drag.
  const impacts = createMemo(() =>
    computeImpacts(effectiveLinks(), ofShift(), cmdBesoinOverride()),
  )
  // Verdict le plus grave par OF et par commande (pour badge carte + marqueur).
  const verdictByOf = createMemo(() => {
    const byOf = new Map<string, ImpactVerdict[]>()
    for (const [, imp] of impacts()) {
      if (imp.verdict === null) continue
      const arr = byOf.get(imp.ofId) ?? []
      arr.push(imp.verdict)
      byOf.set(imp.ofId, arr)
    }
    const out = new Map<string, ImpactVerdict | null>()
    for (const [ofId, vs] of byOf) out.set(ofId, worstVerdict(vs))
    return out
  })
  const verdictByCmd = createMemo(() => {
    const byCmd = new Map<string, { verdicts: ImpactVerdict[]; delta: number | null }>()
    for (const [, imp] of impacts()) {
      if (imp.verdict === null) continue
      const e = byCmd.get(imp.commandeId) ?? { verdicts: [], delta: null }
      e.verdicts.push(imp.verdict)
      // delta du pire lien (le plus grand) pour le badge marqueur.
      if (imp.delta !== null && (e.delta === null || imp.delta > e.delta)) e.delta = imp.delta
      byCmd.set(imp.commandeId, e)
    }
    const out = new Map<string, { verdict: ImpactVerdict | null; delta: number | null }>()
    for (const [cmdId, e] of byCmd) out.set(cmdId, { verdict: worstVerdict(e.verdicts), delta: e.delta })
    return out
  })
  // Delta max par OF en retard (badge carte) — un seul passage O(links), comme
  // verdictByCmd, au lieu d'un scan par carte rendue.
  const retardByOf = createMemo(() => {
    const m = new Map<string, number>()
    for (const [, imp] of impacts()) {
      if (imp.verdict !== 'retard' || imp.delta === null) continue
      const cur = m.get(imp.ofId)
      if (cur === undefined || imp.delta > cur) m.set(imp.ofId, imp.delta)
    }
    return m
  })
  const retardJoursOf = (ofId: string): number | null => retardByOf().get(ofId) ?? null

  // Compteur toolbar — nombre de COMMANDES en retard (une commande = 1 même si 2 liens).
  const nbCmdRetard = createMemo(() => {
    let n = 0
    for (const [, e] of verdictByCmd()) if (e.verdict === 'retard') n++
    return n
  })
  // Programme v2 — santé du plan. 4 compteurs toujours rendus (zéro CLS) :
  // retards, limites, sans-lien commandes, sans-lien OF. Les ruptures restent
  // opt-in (feasibility doit tourner d'abord).
  const nbCmdLimite = createMemo(() => {
    let n = 0
    for (const [, e] of verdictByCmd()) if (e.verdict === 'limite') n++
    return n
  })
  const nbCmdSansLien = createMemo(() => {
    let n = 0
    for (const cmd of props.commandes) {
      const v = verdictByCmd().get(cmd.id)
      if (!v || v.verdict === null) n++
    }
    return n
  })
  const nbOfSansLien = createMemo(() => {
    const linked = linksByOf()
    let n = 0
    for (const line of store.board.lines) {
      for (const dc of line.dayCells) {
        for (const c of dc.cards) if (!linked.has(c.id)) n++
      }
    }
    return n
  })

  // Programme v2 — segment « Liens » (Aucun / Problèmes / Tous) remplace le
  // toggle binaire highlightRetards. 'problems' = défaut (retard + limite visibles).
  const [linkMode, setLinkMode] = createSignal<'none' | 'problems' | 'all'>('problems')

  // Programme v2 — rail de triage repliable (mode Combiné seulement).
  const [railOpen, setRailOpen] = createSignal(false)
  const [railTab, setRailTab] = createSignal<'retards' | 'limites' | 'sanslien'>('retards')
  const [railSelected, setRailSelected] = createSignal<string | null>(null)

  // ── Issue #23 — recalcul d'impact LIVE pendant le drag OF ──
  // ofShift (ofId → delta jours) alimenté au dragover ; les impacts se recalculent
  // (dateFin translatée = durée préservée), les liens/cartes se recolorent.
  // Position courante de l'OF sur le board (store.board — pas props.links, payload
  // serveur figé) : un 2e drag du même OF dans la session doit repartir de sa
  // position réelle, pas de l'origine périmée du dernier chargement.
  const ofPositions = createMemo(() => {
    const m = new Map<string, number>()
    for (const line of store.board.lines) {
      line.dayCells.forEach((dc, col) => {
        for (const c of dc.cards) m.set(c.id, col)
      })
    }
    return m
  })
  const ofColOrigine = (ofId: string): number | null =>
    ofPositions().get(ofId) ?? linksByOf().get(ofId)?.ofCol ?? null

  // Écart calendaire réel entre la colonne d'origine et `targetIso`, calculé depuis
  // les dates effectives des colonnes — PAS un delta de colonnes : les colonnes du
  // board sont des jours OUVRÉS (week-ends exclus), un delta de colonnes ne vaut donc
  // pas un delta de jours calendaires dès qu'un drag traverse un week-end. Même
  // formule utilisée en live (onOfDragProgress) et au drop (translateOfDateFin) →
  // zéro divergence entre l'aperçu et la valeur persistée.
  const dayShiftFor = (ofId: string, targetIso: string): number | null => {
    const origine = ofColOrigine(ofId)
    if (origine === null) return null
    const fromIso = store.board.lines[0]?.dayCells[origine]?.iso
    if (!fromIso) return null
    const fromD = parseIso(fromIso)
    const toD = parseIso(targetIso)
    if (!fromD || !toD) return null
    return Math.round((toD.getTime() - fromD.getTime()) / DAY_MS)
  }

  const onOfDragProgress = (ofId: string, _toLineCode: string, _toCol: number, targetIso: string) => {
    const shift = dayShiftFor(ofId, targetIso)
    if (shift === null) return
    setOfShift((m) => {
      if (shift === 0) {
        if (!m.has(ofId)) return m
        const n = new Map(m)
        n.delete(ofId)
        return n
      }
      // Shift inchangé depuis le tick précédent → même Map (évite de redéclencher
      // impacts()/verdictByOf()/verdictByCmd() + la remesure DOM des liens à chaque
      // pixel de dragover natif).
      if (m.get(ofId) === shift) return m
      return new Map(m).set(ofId, shift)
    })
    // #23 : tooltip prévisionnel — verdict du pire lien de cet OF après translation.
    updateDragTooltip(ofId)
  }

  // Tooltip flottant pendant le drag OF (verdict prévisionnel de la mise à dispo).
  const [dragTooltip, setDragTooltip] = createSignal<string | null>(null)
  const updateDragTooltip = (ofId: string) => {
    const v = verdictByOf().get(ofId)
    if (v === 'retard') {
      const finOrigine = ofDateFinOrigine(ofId)
      const finD = finOrigine ? parseIso(finOrigine) : null
      if (finD) {
        const shift = ofShift().get(ofId) ?? 0
        const shifted = new Date(finD)
        shifted.setDate(shifted.getDate() + shift)
        const delta = retardJoursOf(ofId)
        setDragTooltip(
          `Dispo estimée le ${fmtDay(toIso(shifted))} · ${delta ? deltaLabel(delta) : 'en retard'}`,
        )
        return
      }
      setDragTooltip('OF en retard sur sa commande')
    } else if (v === 'limite') {
      setDragTooltip('OF limite (J)')
    } else if (v === 'ok') {
      setDragTooltip('OF à l\'heure')
    } else {
      setDragTooltip(null)
    }
  }
  // Drag annulé (relâché hors grille, aucun `drop` n'a capté l'évènement) → clear le
  // shift/tooltip live SANS toucher l'override de date (rien n'a été déposé).
  const onOfDragCancelled = () => {
    setOfShift(new Map())
    setDragTooltip(null)
  }
  const onOfDropped = (ofId: string, _toIso: string, dateFinIso?: string) => {
    // Le store.moveCard a déjà déplacé la carte + lancé le PATCH. On fige la dateFin
    // traduite dans l'override : sans ça, impacts() retombe sur l'ancienne dateFin de
    // props.links dès que ofShift est vidé → le badge/lien reviendrait au verdict
    // pré-drag jusqu'au prochain reload. L'override sera rejoint/remplacé par la
    // valeur serveur confirmée au reload suivant.
    if (dateFinIso) setOfDateFinOverride((m) => new Map(m).set(ofId, dateFinIso))
    setOfShift(new Map())
    setDragTooltip(null)
  }

  // #23 (gap n°4) : date de fin translatée d'un OF droppé. La durée de l'OF est
  // préservée → dateFin = ofDateFinOrigine + dayShiftFor(targetIso). Calculée depuis
  // les dates effectives (+ override), indépendamment de l'ofShift (déjà cleared au drop).
  const ofDateFinOrigine = (ofId: string): string | null =>
    ofDateFinOverride().get(ofId) ?? linksByOf().get(ofId)?.ofDateFinIso ?? null
  const translateOfDateFin = (ofId: string, targetIso: string): string | null => {
    const finOrigine = ofDateFinOrigine(ofId)
    const finD = finOrigine ? parseIso(finOrigine) : null
    const shift = dayShiftFor(ofId, targetIso)
    if (!finD || shift === null) return null
    const shifted = new Date(finD)
    shifted.setDate(shifted.getDate() + shift)
    return toIso(shifted)
  }

  // #57 — intercepteur de PATCH OF : en mode scénario, le drop d'un OF empile une
  // mutation shift_of au lieu de PATCHer (le déplacement optimiste est déjà appliqué
  // à l'écran par store.moveCard). Bascule pilotée par scenario.active().
  createEffect(() => {
    if (scenario.active()) {
      store.setMoveInterceptor(({ numOf, toLineCode, toIso, dateFinIso }) => {
        scenario.upsertMutation({
          type: 'shift_of',
          numOf,
          dateDebut: toIso,
          dateFin: dateFinIso ?? null,
          poste: toLineCode,
        })
      })
    } else {
      store.setMoveInterceptor(null)
    }
  })

  // Colonne du board (jour ouvré) correspondant à une date ISO — pour rejeu commande.
  const colOfIso = (iso: string): number =>
    store.board.lines[0]?.dayCells.findIndex((dc) => dc.iso === iso) ?? -1

  // #58 — articles connus dans la fenêtre affichée (suggestion, pas de validation
  // stricte : le moteur d'impact tolère un article hors catalogue, sans BOM à charger).
  const articleOptions = createMemo(() => {
    const set = new Set<string>()
    for (const line of store.board.lines) {
      for (const dc of line.dayCells) {
        for (const c of dc.cards) if (c.article) set.add(c.article)
      }
    }
    return [...set].sort()
  })

  // #58 — commandes virtuelles courantes (mutations inject_demand) + verdict de
  // servabilité résolu dans le dernier diff calculé. Regroupées par colonne pour
  // la rangée dédiée du board (VirtualCell).
  const virtualOrders = createMemo(() => virtualOrdersFrom(scenario.current.mutations, scenario.diff()))
  const virtualOrdersByCol = createMemo(() => {
    const map = new Map<number, ReturnType<typeof virtualOrdersFrom>>()
    for (const o of virtualOrders()) {
      const col = colOfIso(o.date)
      if (col === -1) continue
      const arr = map.get(col) ?? []
      arr.push(o)
      map.set(col, arr)
    }
    return map
  })

  // #58 — ajout d'une commande virtuelle : empile la mutation inject_demand puis
  // réévalue immédiatement le diff (le verdict de servabilité est le but premier).
  const injectVirtualOrder = (m: Extract<PlanMutation, { type: 'inject_demand' }>) => {
    scenario.upsertMutation(m)
    scenario.computeDiff(props.windowFrom, props.windowTo)
  }

  // #58 — drop d'un chip virtuel sur une autre colonne → nouvelle date de besoin.
  const moveVirtualOrder = (id: string, _col: number, iso: string) => {
    const existing = scenario.current.mutations.find(
      (m): m is Extract<PlanMutation, { type: 'inject_demand' }> => m.type === 'inject_demand' && m.id === id
    )
    if (!existing) return
    scenario.upsertMutation({ ...existing, date: iso })
    scenario.computeDiff(props.windowFrom, props.windowTo)
  }

  // #58 — retire une commande virtuelle du scénario.
  const removeVirtualOrder = (id: string) => {
    scenario.removeMutation(`inject:${id}`)
    scenario.computeDiff(props.windowFrom, props.windowTo)
  }

  // #57 — activer/désactiver le mode scénario. À l'extinction sans « Jeter » explicite,
  // on garde l'état visuel courant (le toggle est un simple régime de capture).
  const toggleScenario = () => scenario.setActive(!scenario.active())

  // #57 — Appliquer : rejoue les mutations en PATCHs réels (mécanisme unitaire existant),
  // marque le scénario appliqué, puis recharge pour réconcilier board ↔ serveur.
  // #62 (lot 0) : chaque PATCH est vérifié (r.ok) — un 422/500 ne doit plus produire un
  // faux « Scénario appliqué ». Sur échec (même partiel) : pas de markApplied(), le
  // scénario reste ouvert pour retenter, et le toast détaille appliquées vs échecs.
  const applyScenario = async () => {
    if (applying()) return
    setApplying(true)
    try {
      let total = 0
      let failed = 0
      for (const m of scenario.current.mutations) {
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
          `${total - failed}/${total} mutation${total > 1 ? 's' : ''} appliquée${total - failed > 1 ? 's' : ''} — ${failed} échec${failed > 1 ? 's' : ''}. Scénario conservé.`,
        )
        return
      }
      await scenario.markApplied()
      scenario.setActive(false)
      toast.success('Scénario appliqué.')
      router.reload()
    } catch (err) {
      toast.error(`Application échouée : ${(err as Error).message}`)
    } finally {
      setApplying(false)
    }
  }

  // #57 — Jeter : retour à l'état réel SANS reload complet. Aucun PATCH n'est parti en
  // mode scénario → le payload serveur (props) est encore l'état réel : on y réaligne
  // les board stores (reconcile) et on vide tous les overrides visuels.
  const discardScenario = () => {
    store.updateData(page.props.board ?? EMPTY_BOARD)
    orderStore.updateData(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
    setCmdMoved(new Map())
    setOfShift(new Map())
    setOfDateFinOverride(new Map())
    scenario.reset()
    scenario.setActive(false)
    requestMeasure()
  }

  // #57 — Rouvrir un scénario : charge ses mutations puis les rejoue VISUELLEMENT sur
  // les données fraîches (le diff exact reste réévalué côté serveur via « Impacts »).
  const openScenario = async (id: number) => {
    scenario.setActive(true)
    const mutations = await scenario.open(id)
    for (const m of mutations) {
      if (m.type === 'shift_of' && m.dateDebut && m.poste) {
        store.moveCardToIso(m.numOf, m.poste, m.dateDebut)
        if (m.dateFin) setOfDateFinOverride((mm) => new Map(mm).set(m.numOf, m.dateFin!))
      } else if (m.type === 'shift_demand') {
        const col = colOfIso(m.date)
        if (col !== -1) {
          setCmdMoved((mm) => new Map(mm).set(`${m.numCommande}#${m.ligne ?? ''}`, { col, iso: m.date }))
        }
      }
    }
    requestMeasure()
  }

  // Commandes regroupées par poste (= rangée du board) × colonne d'expédition.
  const cmdCells = createMemo(() => buildCmdCells(props.commandes, props.links, cmdCol))

  // Drop d'un marqueur commande dans une cellule → nouvelle date d'expédition.
  const onCommandeDrop = (_lineCode: string, col: number, iso: string, e: DragEvent) => {
    const raw = e.dataTransfer?.getData('application/x-cmd')
    if (!raw) return
    let parsed: { id: string; numCommande: string; ligne: string | null }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!parsed.ligne) return // prévision sans n° de ligne → non persistable
    setCmdMoved((m) => new Map(m).set(parsed.id, { col, iso }))
    requestMeasure()

    // #57 — mode scénario : empile une mutation shift_demand, aucun PATCH réel.
    if (scenario.active()) {
      scenario.upsertMutation({
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
  }

  // ── Overlay liens : coordonnées mesurées au DOM ──
  const [contentEl, setContentEl] = createSignal<HTMLDivElement | null>(null)
  const [paths, setPaths] = createSignal<PathSpec[]>([])
  const [activeId, setActiveId] = createSignal<string | null>(null)
  const isActive = (p: PathSpec) => {
    const id = activeId()
    return id !== null && (p.ofId === id || p.commandeId === id)
  }

  const measure = () => {
    const content = contentEl()
    if (!content) return
    const cRect = content.getBoundingClientRect()
    const imps = impacts()
    const out: PathSpec[] = []
    for (const link of props.links) {
      const ofEl = content.querySelector(`[data-num-of="${link.ofId}"]`)
      const cmdEl = content.querySelector(`[data-link-cmd="${link.posteCode}:${link.commandeId}"]`)
      if (!ofEl || !cmdEl) continue
      const or = (ofEl as HTMLElement).getBoundingClientRect()
      const cr = (cmdEl as HTMLElement).getBoundingClientRect()
      const d = buildLinkPath(cRect, or, cr)
      if (!d) continue
      // #23 : verdict + delta + point médian pour le badge « +N j ».
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
  }

  // #62 (lot 7) — coalescing des rAF de remesure. Les 5 sites qui déclenchent
  // une remesure (refresh, discardScenario, openScenario, onCommandeDrop x2)
  // passent tous par requestMeasure() au lieu de requestMeasure()
  // direct. Un flag évite de programmer plusieurs rAF dans le même cycle → une
  // seule passe de mesure (2×N querySelector) au lieu de jusqu'à 5.
  let measureScheduled = false
  const requestMeasure = () => {
    if (measureScheduled) return
    measureScheduled = true
    requestAnimationFrame(() => {
      measureScheduled = false
      measure()
    })
  }

  // #62 (lot 1) — raccourcis clavier. Ignore les champs de saisie et les
  // modificateurs (Ctrl/Meta/Alt). Échap ferme le calendrier puis les drawers.
  useShortcuts(
    {
      r: () => doRefresh(),
      f: () => runFeasibility(),
      '1': () => switchMode('ordonnancement'),
      '2': () => switchMode('combined'),
      '3': () => switchMode('planification'),
      s: () => {
        if (mode() === 'combined') toggleScenario()
      },
      t: () => {
        if (mode() === 'combined') setRailOpen((v) => !v)
      },
    },
    () => {
      if (calOpen()) setCalOpen(() => false)
      else if (detailOpen()) setDetailOpen(false)
      else if (engagementOpen()) setEngagementOpen(false)
      else if (diffOpen()) setDiffOpen(false)
    },
  )

  let ro: ResizeObserver | null = null
  onMount(() => {
    measure()
    const el = contentEl()
    if (el && typeof ResizeObserver !== 'undefined') {
      // La grille change de hauteur quand la recherche masque des rangées → remesure.
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    window.addEventListener('resize', measure)
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {})
    onCleanup(() => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    })
  })
  createEffect(
    on(
      () => [props.board, cmdMoved(), ofShift()] as const,
      () => requestMeasure(),
      { defer: true }
    )
  )

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Programme · Flux OF ↔ commandes"
        active="programme"
        meta={
          <>
            <div class="font-fraunces text-xs font-bold not-italic text-brand">
              {props.weekLabel}
            </div>
            <div>
              Fenêtre <b class="font-bold text-foreground">{props.horizon} j</b> ·{' '}
              <b class="font-bold text-foreground">{props.totalOf}</b> OF ·{' '}
              <b class="font-bold text-foreground">{props.lineCount}</b> postes ·{' '}
              <b class="font-bold text-foreground">{props.commandes.length}</b> commandes
            </div>
          </>
        }
        actions={
          <>
            <TextField class="contents">
              <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                <span class="material-symbols-outlined text-[17px] text-muted-foreground">
                  search
                </span>
                {/* Recherche : pilote le store du board affiché — orderStore en mode
                    « Cmdes » (planification), sinon le store OF (ordonnancement/combiné). */}
                <TextFieldInput
                  class="w-[180px] border-0 bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0"
                  placeholder={
                    mode() === 'planification' ? 'Commande, article, client…' : 'OF, article, poste…'
                  }
                  aria-label="Rechercher"
                  type="text"
                  autocomplete="off"
                  value={mode() === 'planification' ? orderStore.query() : store.query()}
                  onInput={(e) =>
                    mode() === 'planification'
                      ? orderStore.onQueryInput(e.currentTarget.value)
                      : store.onQueryInput(e.currentTarget.value)
                  }
                />
              </div>
            </TextField>
            <Show
              when={mode() === 'planification'}
              fallback={
                <Select<string>
                  title="Portée de la recherche"
                  value={store.scope()}
                  onChange={(v) => v && store.onScopeChange(v as SearchScope)}
                  options={OF_SCOPES.map((s) => s.v)}
                  disallowEmptySelection
                  optionTextValue={(o) => OF_SCOPES.find((s) => s.v === o)?.label ?? o}
                  itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item}>
                      {OF_SCOPES.find((s) => s.v === itemProps.item.rawValue)?.label ??
                        itemProps.item.rawValue}
                    </SelectItem>
                  )}
                >
                  <SelectTrigger
                    class="h-[30px] w-[92px] rounded-full border border-rule bg-card px-3 text-xs font-semibold"
                    aria-label="Portée de la recherche"
                  >
                    <SelectValue<string>>
                      {(state) => OF_SCOPES.find((s) => s.v === state.selectedOption())?.label ?? 'Portée'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              }
            >
              <Select<string>
                title="Portée de la recherche"
                value={orderStore.scope()}
                onChange={(v) => v && orderStore.onScopeChange(v as OrderSearchScope)}
                options={ORDER_SCOPES.map((s) => s.v)}
                disallowEmptySelection
                optionTextValue={(o) => ORDER_SCOPES.find((s) => s.v === o)?.label ?? o}
                itemComponent={(itemProps) => (
                  <SelectItem item={itemProps.item}>
                    {ORDER_SCOPES.find((s) => s.v === itemProps.item.rawValue)?.label ??
                      itemProps.item.rawValue}
                  </SelectItem>
                )}
              >
                <SelectTrigger
                  class="h-[30px] w-[110px] rounded-full border border-rule bg-card px-3 text-xs font-semibold"
                  aria-label="Portée de la recherche"
                >
                  <SelectValue<string>>
                    {(state) => ORDER_SCOPES.find((s) => s.v === state.selectedOption())?.label ?? 'Portée'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </Show>
          </>
        }
      />

      <ProgrammeToolbar
        mode={mode}
        switchMode={switchMode}
        store={store}
        orderStore={orderStore}
        feasMode={feasMode}
        setFeasMode={setFeasMode}
        feasLoading={feasLoading}
        runFeasibility={runFeasibility}
        refreshing={refreshing}
        doRefresh={doRefresh}
        dateRange={props.dateRange}
        calOpen={calOpen}
        setCalOpen={setCalOpen}
        range={range}
        applyRange={applyRange}
        scenarioActive={scenario.active}
        onToggleScenario={toggleScenario}
      />

      {/* Programme v2 — rangée contexte (40 px fixe) : segment Liens + santé du plan
          + bouton rail. Mode Combiné seulement (les liens n'existent qu'en Combiné). */}
      <Show when={mode() === 'combined'}>
        <div class="flex flex-none items-center gap-2.5 border-b border-rule bg-muted/30 px-7 py-1.5 min-h-[40px]">
          {/* Segment Liens : Aucun / Problèmes / Tous */}
          <span class="font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground">Liens</span>
          <div class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5" role="radiogroup" aria-label="Visibilité des liens">
            <For each={['none', 'problems', 'all'] as const}>
              {(lm) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={linkMode() === lm}
                  class={cx(
                    'min-h-[24px] rounded-[4px] px-2 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
                    linkMode() === lm ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setLinkMode(lm)}
                >
                  {lm === 'none' ? 'Aucun' : lm === 'problems' ? 'Problèmes' : 'Tous'}
                </button>
              )}
            </For>
          </div>
          <div class="w-px h-5 bg-rule" />
          {/* Santé du plan : 4 badges toujours rendus */}
          <PlanHealth
            nbRetards={nbCmdRetard}
            nbLimites={nbCmdLimite}
            nbRuptures={() => {
              let n = 0
              for (const f of Object.values(store.feasibility())) if (f.st === 'blocked') n++
              return n
            }}
            rupturesAvailable={() => Object.keys(store.feasibility()).length > 0}
            nbSansLien={nbCmdSansLien}
            onSelect={(cat: HealthCategory) => {
              setRailTab(cat === 'ruptures' ? 'retards' : cat)
              setRailOpen(true)
            }}
          />
          <div class="flex-1" />
          {/* Bouton rail de triage */}
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-pressed={railOpen()}
            class={cx(
              'inline-flex min-h-[24px] items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-2xs font-bold transition-colors',
              railOpen() ? 'border-brand bg-brand-soft text-brand' : 'border-rule bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <span class="material-symbols-outlined text-sm">queue</span>
            Rail <span class="kbd ml-0.5">T</span>
          </button>
        </div>
      </Show>

      {/* #57 — bandeau du mode scénario (combiné) : nom, N mutations, Impacts /
          Enregistrer / Appliquer / Jeter, liste des scénarios enregistrés. */}
      <Show when={mode() === 'combined' && scenario.active()}>
        <ScenarioBar
          scenario={scenario}
          windowFrom={props.windowFrom}
          windowTo={props.windowTo}
          applying={applying}
          articleOptions={articleOptions()}
          onApply={applyScenario}
          onDiscard={discardScenario}
          onOpenScenario={openScenario}
          onShowDiff={() => setDiffOpen(true)}
          onInjectDemand={injectVirtualOrder}
        />
      </Show>

      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-xs text-foreground print:hidden">
          <span class="material-symbols-outlined text-[16px] text-brand">warning</span>
          <span class="font-bold">Erreur chargement :</span>
          <span class="font-mono">{props.x3Error}</span>
        </div>
      </Show>

      {/* ═══ Board : OrderGrid (planification) ou BoardGrid (combined/ordonnancement) ═══ */}
      {/* #62 (lot 0) : l'empty state planification se juge sur les rangées du board
          commandes — props.lineCount compte les postes du board OF, pas les commandes. */}
      <Show when={mode() === 'planification'}>
        <Show
          when={orderStore.board.lines.length > 0}
          fallback={
            <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-sm italic text-muted-foreground">
              Aucune ligne de commande dans l'horizon.
            </div>
          }
        >
          <div class="flex-1 overflow-hidden">
            <OrderGrid
              store={orderStore}
              onSelectCard={onSelectOrderLine}
            />
          </div>
        </Show>
      </Show>

      <Show when={mode() !== 'planification'}>
      <Show
        when={props.lineCount > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-sm italic text-muted-foreground">
            Aucun OF dans l'horizon.
          </div>
        }
      >
        <div class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <BoardGrid
            store={store}
            onSelectOf={onSelectOf}
            onCardHover={(num) => setActiveId(num)}
            onCellDrop={onCommandeDrop}
            onLineEngagement={onLineEngagement}
            contentRef={setContentEl}
            cardRetard={mode() === 'combined' ? retardJoursOf : undefined}
            onOfDragProgress={mode() === 'combined' ? onOfDragProgress : undefined}
            onOfDropped={mode() === 'combined' ? onOfDropped : undefined}
            onOfDragCancelled={mode() === 'combined' ? onOfDragCancelled : undefined}
            translateOfDateFin={mode() === 'combined' ? translateOfDateFin : undefined}
            virtualOrdersByCol={mode() === 'combined' && scenario.active() ? virtualOrdersByCol() : undefined}
            onVirtualDrop={moveVirtualOrder}
            onVirtualRemove={removeVirtualOrder}
            cellExtra={mode() === 'combined' ? (lineCode, col) => (
              <For each={cmdCells().get(lineCode)?.[col] ?? []}>
                {(cmd) => (
                  <CommandeMarker
                    lineCode={lineCode}
                    cmd={cmd}
                    cmdIso={cmdIso}
                    activeId={activeId}
                    onActivate={setActiveId}
                    verdict={verdictByCmd().get(cmd.id)?.verdict ?? null}
                    deltaJours={verdictByCmd().get(cmd.id)?.delta ?? null}
                  />
                )}
              </For>
            ) : undefined}
            overlay={mode() === 'combined' ? (
              <LinksOverlay paths={paths} isActive={isActive} linkMode={linkMode} />
            ) : undefined}
          />
        </div>

        {/* Programme v2 — rail de triage repliable (mode Combiné seulement) */}
        <Show when={mode() === 'combined' && railOpen()}>
          <TriageRail
            commandes={props.commandes}
            links={props.links}
            verdictByCmd={verdictByCmd}
            activeTab={railTab}
            setActiveTab={setRailTab}
            selectedId={railSelected}
            onSelect={(item: TriageItem) => {
              setRailSelected(item.commandeId)
              setActiveId(item.commandeId)
              // Scroll vers l'OF sur le board
              if (item.ofId) {
                const el = document.querySelector(`[data-num-of="${item.ofId}"]`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
              }
            }}
            onDetailOf={(ofId) => onSelectOf(ofId)}
            onClose={() => setRailOpen(false)}
            counts={() => ({
              retards: nbCmdRetard(),
              limites: nbCmdLimite(),
              sanslien: nbCmdSansLien(),
            })}
          />
        </Show>
        </div>

        {/* #62 (lot 0) : dans le <Show lineCount> — la barre d'affermissement n'a pas
            à flotter sous l'empty state « Aucun OF dans l'horizon ». */}
        <BatchFirmBar store={store} />
      </Show>
      </Show>

      {/* #23 — tooltip flottant pendant le drag OF : verdict prévisionnel de la
          mise à dispo. Positionné en bas-centre, disparaît au drop. */}
      <Show when={mode() === 'combined' && dragTooltip()}>
        <div class="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rule bg-card px-4 py-1.5 font-mono text-xs font-bold text-foreground shadow-lg">
          {dragTooltip()}
        </div>
      </Show>

      {/* Drawer détail OF — RÉUTILISÉ dans les deux modes :
          • ordonnancement/combined : clic carte OF → selectedOf direct ;
          • planification : clic carte commande → résolution contremarque (FMINUM_0)
            via ofFromOrder, puis selectedOf. Composant unique, comportement identique.
          onFirmed (affermissement) : store.transformCard ne fait rien si l'OF n'est
          pas dans le board OF (cas planification) — le reload réconcilie. */}
      <OfDetailSheet
        num={selectedOf()}
        open={detailOpen()}
        onOpenChange={setDetailOpen}
        onFirmed={(oldId, newId) => store.transformCard(oldId, newId)}
      />

      {/* Panneau « Engagement » par poste (#46) — endpoint dédié (tous les OF
          fermes du poste, sans limite de fenêtre board). */}
      <PosteEngagementSheet
        posteCode={engagementPoste()}
        open={engagementOpen()}
        onOpenChange={setEngagementOpen}
      />

      {/* #57 — constat d'impact du scénario courant (moteur étage 2, 3 axes). */}
      <ScenarioDiffSheet
        diff={scenario.diff()}
        open={diffOpen()}
        onOpenChange={setDiffOpen}
        loading={scenario.diffLoading()}
        evaluatedAt={scenario.current.evaluatedAt}
        dataAt={scenario.current.dataAt}
      />
    </div>
  )
}

export default Programme

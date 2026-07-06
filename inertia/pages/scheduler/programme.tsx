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
import { createBoardStore } from '@/lib/board/store'
import type { BoardData, SearchScope } from '@/lib/board/types'
import { createOrderBoardStore } from '@/lib/orders/store'
import type { OrderBoardData, OrderSearchScope } from '@/lib/orders/types'
import type { VisionCommande, VisionLink } from '@/lib/vision/types'
import { cx } from '@/libs/cva'
import BoardGrid from '@/components/board/board-grid'
import BatchFirmBar from '@/components/board/batch-firm-bar'
import OrderGrid from '@/components/board/order-grid'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import PosteEngagementSheet from '@/components/board/poste-engagement-sheet'
import { Masthead } from '@/components/masthead'
import { Button } from '@/components/ui/button'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Calendar, type DateRange } from '@/components/ui/calendar'

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
 */

type VisionMode = 'combined' | 'ordonnancement' | 'planification'

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


const MODE_LABELS: Record<VisionMode, string> = {
  ordonnancement: 'OF',
  combined: 'Combiné',
  planification: 'Cmdes',
}

// SCOPES moved to OF_SCOPES / ORDER_SCOPES above

const STATUS_FILTER_CHIPS: { k: 'ferme' | 'planifie' | 'suggere'; label: string }[] = [
  { k: 'ferme', label: 'Ferme' },
  { k: 'planifie', label: 'Planifié' },
  { k: 'suggere', label: 'Suggéré' },
]

const DAY_MS = 86_400_000
const parseIso = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startOfDay = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** ISO YYYY-MM-DD → JJ/MM. */
const fmtDay = (iso: string | null): string => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

const r1 = (n: number) => Math.round(n)

interface PathSpec {
  d: string
  suggere: boolean
  ofId: string
  commandeId: string
}

const Programme: Component<VisionProps> = (props) => {
  const store = createBoardStore(props.board ?? EMPTY_BOARD)
  const orderStore = createOrderBoardStore(props.orderBoard ?? EMPTY_ORDER_BOARD)

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
      window.dispatchEvent(
        new CustomEvent('sch-toast', { detail: 'Aucun OF rattaché à cette ligne de commande.' }),
      )
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
        store.updateData(page.props.board ?? EMPTY_BOARD)
        orderStore.updateData(page.props.orderBoard ?? EMPTY_ORDER_BOARD)
        requestAnimationFrame(measure)
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

  // Commandes regroupées par poste (= rangée du board) × colonne d'expédition.
  // Une même ligne de commande peut figurer sur plusieurs postes (alimentée par
  // des OF de postes différents) → dédoublonnage par posteCode:lineId.
  const cmdCells = createMemo(() => {
    const cmdById = new Map(props.commandes.map((c) => [c.id, c]))
    const grids = new Map<string, VisionCommande[][]>()
    const seen = new Set<string>()
    for (const l of props.links) {
      const cmd = cmdById.get(l.commandeId)
      if (!cmd) continue
      const key = `${l.posteCode}:${l.commandeId}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!grids.has(l.posteCode)) grids.set(l.posteCode, [])
      const grid = grids.get(l.posteCode)!
      const col = cmdCol(l)
      ;(grid[col] ||= []).push(cmd)
    }
    return grids
  })

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
    requestAnimationFrame(measure)
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
        requestAnimationFrame(measure)
        window.dispatchEvent(
          new CustomEvent('sch-toast', { detail: `Déplacement commande échoué : ${err.message}` })
        )
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
    const out: PathSpec[] = []
    for (const link of props.links) {
      const ofEl = content.querySelector(`[data-num-of="${link.ofId}"]`)
      const cmdEl = content.querySelector(`[data-link-cmd="${link.posteCode}:${link.commandeId}"]`)
      if (!ofEl || !cmdEl) continue
      const or = (ofEl as HTMLElement).getBoundingClientRect()
      const cr = (cmdEl as HTMLElement).getBoundingClientRect()
      // Rangée masquée (recherche → display:none) → rect nul : on saute le lien.
      if (or.width === 0 || cr.width === 0) continue
      const ofMidX = or.left - cRect.left + or.width / 2
      const cmdMidX = cr.left - cRect.left + cr.width / 2
      const ofFromLeft = ofMidX <= cmdMidX
      const sx = ofFromLeft ? or.right - cRect.left : or.left - cRect.left
      const sy = or.top - cRect.top + or.height / 2
      const tx = ofFromLeft ? cr.left - cRect.left : cr.right - cRect.left
      const ty = cr.top - cRect.top + cr.height / 2
      const mx = (sx + tx) / 2
      out.push({
        d: `M${r1(sx)},${r1(sy)} C${r1(mx)},${r1(sy)} ${r1(mx)},${r1(ty)} ${r1(tx)},${r1(ty)}`,
        suggere: link.suggere,
        ofId: link.ofId,
        commandeId: link.commandeId,
      })
    }
    setPaths(out)
  }

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
      () => [props.board, cmdMoved()] as const,
      () => requestAnimationFrame(measure),
      { defer: true }
    )
  )

  /** Marqueur commande rendu dans une cellule (slot cellExtra de BoardGrid). */
  const commandeMarker = (lineCode: string, cmd: VisionCommande) => (
    <div
      data-link-cmd={`${lineCode}:${cmd.id}`}
      draggable={!!cmd.ligne}
      onDragStart={(e) => {
        if (!cmd.ligne) return
        e.dataTransfer?.setData(
          'application/x-cmd',
          JSON.stringify({ id: cmd.id, numCommande: cmd.numCommande, ligne: cmd.ligne })
        )
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      }}
      onMouseEnter={() => setActiveId(cmd.id)}
      onMouseLeave={() => setActiveId(null)}
      class={cx(
        'relative overflow-hidden rounded-[6px] border border-rule border-l-[3px] border-l-terra bg-terra-soft px-1.5 py-1.5 leading-tight shadow-[0_1px_2px_rgba(31,26,19,.06)] transition-shadow duration-150',
        cmd.ligne ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        activeId() === cmd.id && 'shadow-[0_2px_10px_rgba(168,67,31,.22)] ring-1 ring-terra/50'
      )}
    >
      {/* Numéro complet (+ ligne) sur sa propre ligne, police réduite pour rentrer. */}
      <div class="flex items-baseline gap-1 whitespace-nowrap font-mono text-[9.5px] font-bold text-terra">
        <span class="material-symbols-outlined flex-none self-center text-[11px] text-terra">
          local_shipping
        </span>
        <span>
          {cmd.numCommande}
          <Show when={cmd.ligne}>
            <span class="text-terra/70">·L{cmd.ligne}</span>
          </Show>
        </span>
      </div>
      <div class="mt-1 flex items-center gap-1">
        <Show when={cmd.type}>
          <span class="flex-none rounded bg-terra-soft px-1 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-terra">
            {cmd.type}
          </span>
        </Show>
        <span class="flex-none font-fraunces text-[10px] font-bold tabular-nums text-secondary-foreground">
          {fmtDay(cmdIso(cmd))}
        </span>
        <Show when={cmd.client}>
          <span class="truncate font-fraunces text-[9.5px] italic text-muted-foreground">
            {cmd.client}
          </span>
        </Show>
      </div>
    </div>
  )

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Programme · Flux OF ↔ commandes"
        active="programme"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold not-italic text-terra">
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
              <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
                <span class="material-symbols-outlined text-[17px] text-muted-foreground">
                  search
                </span>
                {/* Recherche : pilote le store du board affiché — orderStore en mode
                    « Cmdes » (planification), sinon le store OF (ordonnancement/combiné). */}
                <TextFieldInput
                  class="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus-visible:ring-0"
                  placeholder={
                    mode() === 'planification' ? 'Commande, article, client…' : 'OF, article, poste…'
                  }
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
                    class="h-[30px] w-[92px] rounded-full border border-rule bg-card px-3 text-[11px] font-semibold"
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
                  class="h-[30px] w-[110px] rounded-full border border-rule bg-card px-3 text-[11px] font-semibold"
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

      {/* ═══ Toolbar (alignée /ordonnancement) ═══ */}
      <div data-print-toolbar class="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule px-7 py-2">
        {/* Sélecteur de mode */}
        <div class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
          <For each={(['ordonnancement', 'combined', 'planification'] as const)}>
            {(m) => (
              <button
                type="button"
                class={cx(
                  'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  mode() === m
                    ? 'bg-terra-soft text-terra'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => switchMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            )}
          </For>
        </div>

        {/* Filtre statut d'OF — masqué en mode planification */}
        <Show when={mode() !== 'planification'}>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Statut
          </span>
          <For each={STATUS_FILTER_CHIPS}>
            {({ k, label }) => (
              <button
                type="button"
                class={cx(
                  'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  store.statusActive(k)
                    ? 'bg-terra-soft text-terra'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => store.toggleStatus(k)}
              >
                {label}
              </button>
            )}
          </For>
        </div>
        </Show>

        {/* Filtre atelier (STOLOC, #36) — mode planification seulement.
            Parité visuelle avec /charge ; pilote orderStore.lineVisible. */}
        <Show when={mode() === 'planification' && orderStore.ateliers().length > 0}>
          <div class="inline-flex flex-wrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Atelier
            </span>
            <For each={orderStore.ateliers()}>
              {(a) => (
                <button
                  type="button"
                  title={a.code}
                  onClick={() => orderStore.toggleAtelier(a.code)}
                  class={cx(
                    'rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                    orderStore.atelierFilter().has(a.code)
                      ? 'bg-terra-soft text-terra'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {a.code}
                </button>
              )}
            </For>
            <Show when={orderStore.atelierFilter().size > 0}>
              <button
                type="button"
                onClick={() => orderStore.clearAtelier()}
                class="ml-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-terra hover:underline"
              >
                ✕
              </button>
            </Show>
          </div>
        </Show>

        {/* Filtre type de besoin (COMMANDE / PRÉVISION) — mode planification. */}
        <Show when={mode() === 'planification'}>
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Besoin
            </span>
            <For each={[{ k: 'COMMANDE', label: 'Cmde' }, { k: 'PREVISION', label: 'Prév' }]}>
              {(n) => (
                <button
                  type="button"
                  onClick={() => orderStore.toggleNature(n.k)}
                  class={cx(
                    'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                    orderStore.natureFilter().has(n.k)
                      ? 'bg-terra-soft text-terra'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n.label}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Calendrier — conservé seul à l'impression (data-print-keep). */}
        <div data-print-keep class="relative">
          <button
            type="button"
            onClick={() => setCalOpen((o) => !o)}
            class="flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-terra"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">
              calendar_month
            </span>
            {props.dateRange}
            <span class="material-symbols-outlined text-[16px] text-muted-foreground">
              expand_more
            </span>
          </button>
          <Show when={calOpen()}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              class="fixed inset-0 z-40 cursor-default"
              onClick={() => setCalOpen(false)}
            />
            <div class="absolute left-0 top-full z-50 mt-2">
              <Calendar mode="range" range={range()} onRangeChange={applyRange} />
            </div>
          </Show>
        </div>

        {/* Faisabilité — déclencheur + mode. Pilote le store ACTIF : orderStore en mode
            planification (badges par ligne de commande, dérivés des OF rattachés via
            /board-feasibility orders[]), store OF sinon (badges par OF). Aucune logique
            de calcul dupliquée — même endpoint, parsé différemment. Issues #24, #21. */}
        <div class="flex items-center gap-2.5">
          {/* Mode d'allocation stock — choix exclusif (segment, parité /ordonnancement) */}
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Stock
            </span>
            <button
              type="button"
              title="Stock vu en intégralité par chaque OF"
              onClick={() => setFeasMode('immediate')}
              class={cx(
                'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                feasMode() === 'immediate'
                  ? 'bg-terra-soft text-terra'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Instantanée
            </button>
            <button
              type="button"
              title="Stock consommé OF par OF selon priorité"
              onClick={() => setFeasMode('sequential')}
              class={cx(
                'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                feasMode() === 'sequential'
                  ? 'bg-terra-soft text-terra'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Projetée
            </button>
          </div>

          <button
            type="button"
            disabled={refreshing()}
            onClick={doRefresh}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra disabled:opacity-60"
            title="Recharger les données X3 (cache → re-fetch live), sans recharger la page"
          >
            <span class={`material-symbols-outlined text-[14px] text-muted-foreground ${refreshing() ? 'animate-spin' : ''}`}>
              refresh
            </span>
            {refreshing() ? 'Actualisation…' : 'Actualiser'}
          </button>

          <Button
            size="sm"
            disabled={feasLoading()}
            onClick={runFeasibility}
            class="gap-1.5"
          >
            <span class={`material-symbols-outlined text-[15px] ${feasLoading() ? 'animate-spin' : ''}`}>
              {feasLoading() ? 'progress_activity' : 'fact_check'}
            </span>
            {feasLoading() ? 'Calcul…' : 'Faisabilité'}
          </Button>

          {/* Sélection multi-OF → affermissement en batch (#34, vue OF uniquement) */}
          <Show when={mode() !== 'planification'}>
            <Button
              size="sm"
              variant={store.selectMode() ? 'default' : 'outline'}
              onClick={() => (store.selectMode() ? store.exitSelect() : store.enterSelect())}
              class="gap-1.5"
            >
              <span class="material-symbols-outlined text-[15px]">checklist</span>
              Sélection
            </Button>
          </Show>
        </div>
      </div>

      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-terra/30 bg-terra-soft px-7 py-2 text-[12px] text-foreground print:hidden">
          <span class="material-symbols-outlined text-[16px] text-terra">warning</span>
          <span class="font-bold">Erreur chargement :</span>
          <span class="font-mono">{props.x3Error}</span>
        </div>
      </Show>

      {/* ═══ Board : OrderGrid (planification) ou BoardGrid (combined/ordonnancement) ═══ */}
      <Show when={mode() === 'planification'}>
        <Show
          when={props.lineCount > 0}
          fallback={
            <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
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
          <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            Aucun OF dans l'horizon.
          </div>
        }
      >
        <div class="flex-1 overflow-hidden">
          <BoardGrid
            store={store}
            onSelectOf={onSelectOf}
            onCardHover={(num) => setActiveId(num)}
            onCellDrop={onCommandeDrop}
            onLineEngagement={onLineEngagement}
            contentRef={setContentEl}
            cellExtra={mode() === 'combined' ? (lineCode, col) => (
              <For each={cmdCells().get(lineCode)?.[col] ?? []}>
                {(cmd) => commandeMarker(lineCode, cmd)}
              </For>
            ) : undefined}
            overlay={mode() === 'combined' ? (
              <svg
                class="pointer-events-none absolute inset-0 z-[5]"
                style={{ width: '100%', height: '100%' }}
                aria-hidden="true"
              >
                <For each={paths()}>
                  {(p) => {
                    const on = () => isActive(p)
                    // Liens masqués par défaut : ne s'affichent qu'au survol d'un OF
                    // ou d'une commande (sinon board trop fouillis).
                    return (
                      <path
                        d={p.d}
                        fill="none"
                        stroke="var(--color-terra)"
                        stroke-width={p.suggere ? 1.8 : 2.2}
                        stroke-dasharray={p.suggere ? '5 4' : undefined}
                        opacity={on() ? (p.suggere ? 0.8 : 0.95) : 0}
                        style={{ transition: 'opacity .15s' }}
                      />
                    )
                  }}
                </For>
              </svg>
            ) : undefined}
          />
        </div>
      </Show>

      <BatchFirmBar store={store} />
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
    </div>
  )
}

export default Programme

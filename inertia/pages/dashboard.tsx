import {
  createResource,
  createMemo,
  createSignal,
  createEffect,
  on,
  onCleanup,
  For,
  Show,
  type Component,
  type JSX,
} from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { toast } from 'solid-sonner'
import { Masthead } from '@/components/masthead'
import { Calendar, type DateRange } from '@/components/ui/calendar'
import { usePrintFitPage } from '@/lib/board/use-print-fit'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  KPI_TITLES,
  normalizeDashboardLayout,
  type DashboardLayout,
  type KpiId,
  type KpiLayoutItem,
  type KpiWidth,
} from '@/lib/dashboard/types'

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Landing par défaut post-login.
 *
 * Coquille rendue instantanément ; les KPI « charge en retard » + liste des lignes
 * en retard (calcul lourd : statuts + charge gamme depuis X3) sont chargés en différé
 * par fetch JSON sur `kpisHref`. Même motif que /suivi (scheduler/tracking).
 */

interface RetardLigne {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  dateExp: string
  dateExpIso: string | null
  qteRestante: number
  heures: number
  postes: string[]
}
interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
}
interface OtdLigneDtl {
  numCommande: string
  client: string
  article: string
  posteDeCharge: string | null
  dateExpHisto: string
  qteCmde: number
  qteLivree: number
  estComplet: boolean
  estPonctuel: boolean
}
type OtdMode = 'demandee' | 'acceptee'
interface OtdKpi {
  label: string
  mode: OtdMode
  nbTotal: number
  nbOtif: number
  tauxOtif: number
  lignesNon: OtdLigneDtl[]
}
interface DashboardKpisResponse {
  retardCharge: RetardChargeKpi
  x3Error: string | null
  referenceDate: string
}
interface DashboardOtdResponse {
  otd: OtdKpi[]
  x3Error: string | null
}
interface StockValuationPoint {
  periode: string
  label: string
  valeur: number
  qte: number
}
interface StockCategorieRow {
  categorie: string
  valeur: number
  part: number
}
interface StockArticleRow {
  article: string
  designation: string
  categorie: string
  stock: number
  pmp: number
  valeur: number
}
type StockGrain = 'mois' | 'semaine'
interface StockValuationKpi {
  grain: StockGrain
  series: StockValuationPoint[]
  totalActuel: number
  totalDebut: number
  deltaPct: number
  categories: StockCategorieRow[]
  articles: StockArticleRow[]
  nbArticles: number
}
interface DashboardStockResponse {
  stockValuation: StockValuationKpi
  x3Error: string | null
}
interface DashboardProps {
  referenceDate: string
  kpisHref: string
  otdHref: string
  stockHref: string
  layout?: DashboardLayout
}

const EMPTY_KPIS: DashboardKpisResponse = {
  retardCharge: { totalHeures: 0, nbLignes: 0, postes: [], lignes: [] },
  x3Error: null,
  referenceDate: '',
}
const EMPTY_OTD: DashboardOtdResponse = { otd: [], x3Error: null }
const EMPTY_STOCK: StockValuationKpi = {
  grain: 'mois',
  series: [],
  totalActuel: 0,
  totalDebut: 0,
  deltaPct: 0,
  categories: [],
  articles: [],
  nbArticles: 0,
}

/** Palette des barres par rang de poste (du plus chargé au moins chargé). */
const BAR_PALETTE = ['#b23b2e', '#cf6a3f', '#b8862c', '#cdb079', '#a8a18c']
/** Palette des catégories de stock (bleus/verts, distincte du rouge « charge »). */
const STOCK_PALETTE = ['#2d6a8f', '#3a8a5f', '#5b9a8f', '#8fae8f', '#a8a18c']

/** En-tête de card lisible : pastille d'accent + titre Fraunces + suffixe mono optionnel. */
const CardHeader: Component<{
  title: string
  suffix?: string
  tone?: string
  onHide?: () => void
}> = (p) => (
  <div class="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
    <span
      class="size-2 shrink-0 rounded-full"
      style={{ background: p.tone ?? 'var(--color-destructive, #b23b2e)' }}
    ></span>
    <h2 class="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
      {p.title}
    </h2>
    <div class="ml-auto flex items-center gap-2.5">
      <Show when={p.suffix}>
        <span class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {p.suffix}
        </span>
      </Show>
      <Show when={p.onHide}>
        <button
          type="button"
          onClick={() => p.onHide?.()}
          class="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground print:hidden"
          title="Masquer ce KPI"
          aria-label={`Masquer le KPI ${p.title}`}
        >
          <span class="material-symbols-outlined text-[15px]">visibility</span>
        </button>
      </Show>
    </div>
  </div>
)

/** Mini-graphique 12 mois en colonnes verticales (SVG inline, pas de lib).
 *  Hauteur ∝ valeur ; dernière colonne surlignée (mois courant). */
const StockSparkline: Component<{ series: StockValuationPoint[] }> = (p) => {
  const W = 240
  const H = 56
  const PAD = 4
  const innerH = H - PAD * 2
  const max = createMemo(() => Math.max(1, ...p.series.map((s) => Math.abs(s.valeur))))
  const gap = 2
  const barW = createMemo(() => {
    const n = p.series.length || 1
    return (W - gap * (n - 1) - PAD * 2) / n
  })
  return (
    <div class="mt-5" style={{ '-webkit-print-color-adjust': 'exact', 'print-color-adjust': 'exact' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="w-full"
        preserveAspectRatio="none"
        style={{ height: '56px' }}
      >
        <For each={p.series}>
          {(pt, i) => {
            const h = Math.max(2, (Math.abs(pt.valeur) / max()) * innerH)
            const x = PAD + i() * (barW() + gap)
            const y = H - PAD - h
            const isLast = i() === p.series.length - 1
            return (
              <rect
                x={x}
                y={y}
                width={barW()}
                height={h}
                rx={1.5}
                fill={isLast ? '#2d6a8f' : '#c4d3da'}
              >
                <title>{`${pt.label} · ${pt.valeur.toFixed(0)} €`}</title>
              </rect>
            )
          }}
        </For>
      </svg>
      <div class="mt-1 flex justify-between font-mono text-[8.5px] text-muted-foreground/70">
        <span>{p.series[0]?.label}</span>
        <span>{p.series[p.series.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/** Classes de largeur statiques (purge Tailwind). 1 = 1/3, 2 = 2/3, 3 = plein. */
const WIDTH_CLASS: Record<KpiWidth, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
}

/**
 * Conteneur de KPI pilotant la disposition : largeur discrète (col-span sur la
 * grille 3 colonnes), ordre CSS (écran vs impression via `order`), et en mode
 * édition, poignée de drag, sélecteur de largeur, flèches d'ordre d'impression
 * et badge de numéro d'impression.
 */
const Tile: Component<{
  id: KpiId
  children: JSX.Element
  editMode: boolean
  screenRank: number
  printRank: number
  width: KpiWidth
  onWidth: (w: KpiWidth) => void
  onHide: () => void
  onPrintMove: (dir: -1 | 1) => void
  draggedId: () => KpiId | null
  dropTargetId: () => KpiId | null
  setDraggedId: (v: KpiId | null) => void
  setDropTargetId: (v: KpiId | null) => void
  onDrop: (target: KpiId) => void
}> = (p) => {
  // Ordre d'affichage via variables CSS : `--screen-order` à l'écran,
  // `--print-order` à l'impression (bascule déclarative en CSS @media print,
  // indépendante du cycle réactif de Solid → robuste vis-à-vis de usePrintFitPage).
  const isDropTarget = () => p.dropTargetId() === p.id && p.draggedId() !== null && p.draggedId() !== p.id

  return (
    <div
      class={`kpi-tile relative ${WIDTH_CLASS[p.width]} ${p.editMode ? 'cursor-grab rounded ring-1 ring-brand/30 active:cursor-grabbing' : ''} ${
        isDropTarget() ? 'ring-2 ring-brand' : ''
      }`}
      style={{ '--screen-order': p.screenRank, '--print-order': p.printRank }}
      draggable={p.editMode}
      onDragStart={(e) => {
        p.setDraggedId(p.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', p.id)
        }
      }}
      onDragEnd={() => {
        p.setDraggedId(null)
        p.setDropTargetId(null)
      }}
      onDragOver={(e) => {
        // CRITIQUE : en HTML5 DnD, un `drop` ne se déclenche QUE si dragover a
        // appelé preventDefault(). On le fait TOUJOURS en mode édition (on ne
        // dépend pas du signal draggedId qui peut ne pas être propagé à temps),
        // sinon le navigateur refuse définitivement le drop sur cette cible.
        if (!p.editMode) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        if (p.draggedId() && p.draggedId() !== p.id) p.setDropTargetId(p.id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        p.setDropTargetId(null)
        const dragged = p.draggedId()
        if (dragged && dragged !== p.id) p.onDrop(p.id)
      }}
    >
      {/* Barre d'outils édition (poignée + largeur + ordre impression + masquer) */}
      <Show when={p.editMode}>
        <div class="pointer-events-none absolute -top-3 left-3 z-10 flex items-center gap-1 rounded border border-rule bg-card px-1.5 py-0.5 shadow-sm print:hidden">
          <span class="text-muted-foreground" title="Glisser pour réordonner">
            <span class="material-symbols-outlined text-[14px]">drag_indicator</span>
          </span>
          {/* Sélecteur de largeur discret */}
          <div class="pointer-events-auto flex items-center rounded border border-rule bg-secondary px-0.5">
            <For each={[1, 2, 3] as KpiWidth[]}>
              {(w) => (
                <button
                  type="button"
                  onClick={() => p.onWidth(w)}
                  class="rounded px-1 py-0.5 font-mono text-[9px] font-bold transition-colors"
                  classList={{
                    'bg-card text-foreground shadow-sm': p.width === w,
                    'text-muted-foreground hover:text-foreground': p.width !== w,
                  }}
                  title={w === 1 ? '1/3' : w === 2 ? '2/3' : 'Pleine largeur'}
                >
                  {w === 1 ? '⅓' : w === 2 ? '⅔' : '▭'}
                </button>
              )}
            </For>
          </div>
        </div>
        {/* Badge numéro d'impression + flèches d'ordre d'impression */}
        <div class="pointer-events-none absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded border border-rule bg-card px-1.5 py-0.5 shadow-sm print:hidden">
          <button
            type="button"
            onClick={() => p.onPrintMove(-1)}
            class="pointer-events-auto text-muted-foreground hover:text-foreground"
            title="Monter dans l'ordre d'impression"
            aria-label="Monter dans l'ordre d'impression"
          >
            <span class="material-symbols-outlined text-[13px]">arrow_upward</span>
          </button>
          <span class="font-mono text-[9px] font-bold tabular-nums text-brand" title="Ordre d'impression">
            #{p.printRank + 1}
          </span>
          <button
            type="button"
            onClick={() => p.onPrintMove(1)}
            class="pointer-events-auto text-muted-foreground hover:text-foreground"
            title="Descendre dans l'ordre d'impression"
            aria-label="Descendre dans l'ordre d'impression"
          >
            <span class="material-symbols-outlined text-[13px]">arrow_downward</span>
          </button>
        </div>
      </Show>
      {/* Badge numéro d'impression — visible uniquement à l'impression (évite le
          chevauchement avec le bouton masquer du CardHeader à l'écran). */}
      <Show when={!p.editMode}>
        <span
          class="absolute right-3 top-3 z-10 hidden rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-muted-foreground print:block"
          title="Ordre d'impression"
        >
          {p.printRank + 1}
        </span>
      </Show>
      {p.children}
    </div>
  )
}

/**
 * Placeholder pour un KPI masqué. En mode édition, il reste un tile réordonnable
 * (pour le replacer) ; hors édition, il est masqué à l'impression.
 */
const HiddenTile: Component<{
  id: KpiId
  editMode: boolean
  onShow: () => void
}> = (p) => {
  // Affiché uniquement en mode édition : sinon le KPI masqué disparaît totalement.
  return (
    <Show when={p.editMode}>
      <div
        class="lg:col-span-1"
        style={{ order: 999 }}
      >
        <div class="flex items-center gap-2 rounded border border-dashed border-rule bg-secondary/30 px-4 py-3 print:hidden">
          <span class="material-symbols-outlined text-[15px] text-muted-foreground">visibility_off</span>
          <span class="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {KPI_TITLES[p.id]}
          </span>
          <span class="font-fraunces text-[12px] italic text-muted-foreground/70">— masqué</span>
          <button
            type="button"
            onClick={p.onShow}
            class="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span class="material-symbols-outlined text-[13px]">visibility</span>
            <span>Afficher</span>
          </button>
        </div>
      </div>
    </Show>
  )
}

const Dashboard: Component<DashboardProps> = (props) => {
  const [otdMode, setOtdMode] = createSignal<OtdMode>('demandee')
  const [otdRange, setOtdRange] = createSignal<DateRange | null>(null)
  const [calendarOpen, setCalendarOpen] = createSignal(false)
  const [clientFilter, setClientFilter] = createSignal('')
  const [detailsOpen, setDetailsOpen] = createSignal(true)

  // Disposition personnalisable du tableau de bord : ordre, visibilité, largeur
  // des KPI (écran) + ordre d'impression indépendant. Source de vérité côté
  // serveur : `users.dashboard_layout` ; sauvegarde auto (debounce) à chaque
  // mutation. Le fallback est le layout par défaut (reproduit la disposition
  // historique codée en dur).
  const [layout, setLayout] = createStore<DashboardLayout>(
    normalizeDashboardLayout(props.layout) ?? DEFAULT_DASHBOARD_LAYOUT
  )
  /** Mode édition (poignées de drag, resize, numérotation impression). */
  const [editMode, setEditMode] = createSignal(false)

  /** Map réactif id → item pour lectures ciblées dans le JSX des KPI. */
  const layoutItem = (id: KpiId) => layout.items.find((it: KpiLayoutItem) => it.id === id)
  const isVisible = (id: KpiId) => layoutItem(id)?.visible ?? true
  const setVisible = (id: KpiId, visible: boolean) =>
    setLayout('items', (it: KpiLayoutItem) => it.id === id, 'visible', visible)
  const setWidth = (id: KpiId, width: KpiWidth) =>
    setLayout('items', (it: KpiLayoutItem) => it.id === id, 'width', width)
  const printRank = (id: KpiId) => layout.printOrder.indexOf(id)

  /** Déplace un KPI avant/après un autre dans l'ordre écran. */
  const moveItem = (draggedId: KpiId, targetId: KpiId) => {
    if (draggedId === targetId) return
    setLayout('items', (items: KpiLayoutItem[]) => {
      const ordered = [...items]
      const from = ordered.findIndex((it) => it.id === draggedId)
      const to = ordered.findIndex((it) => it.id === targetId)
      if (from === -1 || to === -1) return ordered
      const [moved] = ordered.splice(from, 1)
      ordered.splice(to, 0, moved)
      return ordered
    })
  }
  /** Déplace un KPI d'un cran dans l'ordre d'impression (dir = -1 | +1). */
  const movePrint = (id: KpiId, dir: -1 | 1) => {
    setLayout('printOrder', produce((order: KpiId[]) => {
      const i = order.indexOf(id)
      const j = i + dir
      if (i === -1 || j < 0 || j >= order.length) return
      ;[order[i], order[j]] = [order[j], order[i]]
    }))
  }

  // Filtres du tableau « Stock par article ».
  const [stockSearch, setStockSearch] = createSignal('')
  const [stockCatFilter, setStockCatFilter] = createSignal('')
  const [stockHideZero, setStockHideZero] = createSignal(false)
  const [stockSortBy, setStockSortBy] = createSignal<'valeur' | 'stock' | 'article' | 'categorie'>(
    'valeur'
  )
  const [stockSortDir, setStockSortDir] = createSignal<'asc' | 'desc'>('desc')

  // Valorisation stock : maille (mois/semaine) + plage de dates (modèle OTD).
  const [stockGrain, setStockGrain] = createSignal<StockGrain>('mois')
  const [stockRange, setStockRange] = createSignal<DateRange | null>(null)
  const [stockCalendarOpen, setStockCalendarOpen] = createSignal(false)

  // Conteneur du contenu imprimable (hors Masthead) — mesuré pour le fit A3.
  let contentEl: HTMLDivElement | undefined
  usePrintFitPage(() => contentEl)

  /** Filtre client debouncé : le champ est réactif, mais la requête OTD ne part
   *  qu'après ~350 ms sans frappe (sinon un fetch X3 à chaque touche). */
  const [debouncedClient, setDebouncedClient] = createSignal('')
  let clientTimer: ReturnType<typeof setTimeout> | undefined
  const onClientInput = (v: string) => {
    setClientFilter(v)
    if (clientTimer) clearTimeout(clientTimer)
    clientTimer = setTimeout(() => setDebouncedClient(v), 350)
  }
  const clearClient = () => {
    setClientFilter('')
    if (clientTimer) {
      clearTimeout(clientTimer)
      clientTimer = undefined
    }
    setDebouncedClient('')
  }
  onCleanup(() => {
    if (clientTimer) clearTimeout(clientTimer)
  })

  /* ----- Persistance du layout (debounce 600 ms) ----- */
  /** Sauvegarde le layout courant sur le serveur. Déclenchée à chaque mutation
   *  via l'effet ci-dessous (debounce pour grouper drag/resize rapides). */
  const LAYOUT_HREF = '/api/v1/user/dashboard-layout'
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const saveLayout = (next: DashboardLayout) => {
    fetch(LAYOUT_HREF, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(next),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(() => toast.success('Disposition enregistrée', { duration: 1800 }))
      .catch(() => toast.error('Disposition non enregistrée'))
  }
  // Réagit à Toute mutation du store et debounce la sauvegarde.
  createEffect(
    on(
      () => JSON.stringify(layout),
      () => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => saveLayout(layout), 600)
      }
    )
  )

  // L'ordre d'impression est purement déclaratif (variables CSS --screen-order /
  // --print-order + règle @media print) : aucun listener beforeprint nécessaire,
  // la bascule est robuste vis-à-vis du cycle de mesure de usePrintFitPage.
  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer)
  })

  const otdUrl = createMemo(() => {
    let url = `${props.otdHref}&otdMode=${otdMode()}`
    const c = debouncedClient().trim()
    if (c) url += `&client=${encodeURIComponent(c)}`
    const r = otdRange()
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      url += `&otdFrom=${fmt(r.start)}&otdTo=${fmt(r.end ?? r.start)}`
    }
    return url
  })

  const fmtDay = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

  const otdRangeLabel = createMemo(() => {
    const r = otdRange()
    if (!r?.start) return null
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  })

  const stockUrl = createMemo(() => {
    let url = `${props.stockHref}?referenceDate=${encodeURIComponent(props.referenceDate)}&stockGrain=${stockGrain()}`
    const r = stockRange()
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      url += `&stockFrom=${fmt(r.start)}&stockTo=${fmt(r.end ?? r.start)}`
    }
    return url
  })

  const stockRangeLabel = createMemo(() => {
    const r = stockRange()
    if (!r?.start) return null
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  })

  const [kpisData] = createResource(
    () => props.kpisHref,
    async (url): Promise<DashboardKpisResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as DashboardKpisResponse
    }
  )

  const [otdData] = createResource(otdUrl, async (url): Promise<DashboardOtdResponse> => {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as DashboardOtdResponse
  })

  const [stockData] = createResource(stockUrl, async (url): Promise<DashboardStockResponse> => {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as DashboardStockResponse
  })

  const kpi = createMemo(() => (kpisData() ?? EMPTY_KPIS).retardCharge)
  const otd = createMemo(() => (otdData() ?? EMPTY_OTD).otd)
  const x3Error = createMemo(() => (kpisData() ?? EMPTY_KPIS).x3Error)
  const otdError = createMemo(() => (otdData() ?? EMPTY_OTD).x3Error)
  const maxHeures = createMemo(() => Math.max(1, ...kpi().postes.map((p) => p.heures)))

  const stock = createMemo(() => (stockData() ?? { stockValuation: EMPTY_STOCK }).stockValuation)
  const stockError = createMemo(() => (stockData() ?? { x3Error: null }).x3Error)
  const fmtEuro = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
  const stockMaxCat = createMemo(() =>
    Math.max(1, ...stock().categories.map((c) => c.valeur))
  )

  /** Catégories distinctes pour le dropdown de filtre. */
  const stockCategories = createMemo(() => {
    const set = new Set<string>()
    for (const a of stock().articles) set.add(a.categorie)
    return [...set].sort()
  })

  /** Articles filtrés (recherche ∩ catégorie ∩ masque 0) puis triés. */
  const filteredArticles = createMemo(() => {
    const needle = stockSearch().trim().toLowerCase()
    const cat = stockCatFilter()
    const hideZero = stockHideZero()
    const by = stockSortBy()
    const dir = stockSortDir() === 'asc' ? 1 : -1
    return stock()
      .articles.filter((a) => {
        if (hideZero && a.stock === 0) return false
        if (cat && a.categorie !== cat) return false
        if (needle && !a.article.toLowerCase().includes(needle) && !a.designation.toLowerCase().includes(needle))
          return false
        return true
      })
      .sort((a, b) => {
        const av = a[by]
        const bv = b[by]
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
        return String(av).localeCompare(String(bv)) * dir
      })
  })

  /** Bascule le tri : clic sur une colonne trie desc, re-clic bascule asc/desc. */
  const toggleStockSort = (col: 'valeur' | 'stock' | 'article' | 'categorie') => {
    if (stockSortBy() === col) {
      setStockSortDir(stockSortDir() === 'asc' ? 'desc' : 'asc')
    } else {
      setStockSortBy(col)
      setStockSortDir(col === 'article' || col === 'categorie' ? 'asc' : 'desc')
    }
  }

  function otdColor(taux: number, nbTotal: number): string {
    if (nbTotal === 0) return '#a8a18c'
    if (taux >= 90) return '#2d7a4f'
    if (taux >= 70) return '#b8862c'
    return '#b23b2e'
  }

  const Spinner = () => (
    <div class="flex h-[180px] items-center justify-center">
      <span class="material-symbols-outlined animate-spin text-[22px] text-muted-foreground/50">
        progress_activity
      </span>
    </div>
  )

  /* ----- Layout dynamique : grille dense + ordre CSS + largeurs discrètes ----- */
  /** Position d'un KPI dans l'ordre écran (utilisé pour CSS `order`). */
  const screenRank = (id: KpiId) => layout.items.findIndex((it) => it.id === id)

  /** Drag & drop natif (HTML5) pour réordonner les KPI à l'écran. */
  const [draggedId, setDraggedId] = createSignal<KpiId | null>(null)
  const [dropTargetId, setDropTargetId] = createSignal<KpiId | null>(null)

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground print:h-auto print:overflow-visible">
      <Masthead subtitle="Tableau de bord · Overview" active="dashboard" />

      <div ref={contentEl} class="flex-1 overflow-auto px-7 py-6 print:overflow-visible">
        {/* En-tête imprimable — masquée à l'écran, visible uniquement à l'impression */}
        <div
          data-print-header
          class="mb-5 hidden items-baseline justify-between border-b border-rule pb-3 print:flex"
        >
          <span class="font-fraunces text-[20px] font-semibold tracking-tight text-foreground">
            Supply Chain <span class="font-medium italic text-brand">AERECO</span>
            <span class="ml-3 font-mono text-[13px] font-normal text-muted-foreground">
              Tableau de bord
            </span>
          </span>
          <span class="font-mono text-[12px] text-muted-foreground">
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
              new Date(props.referenceDate)
            )}
          </span>
        </div>

        {/* Barre d'outils édition : Personnaliser / Terminé / Réinitialiser. */}
        <div class="mb-4 flex items-center justify-between gap-3 print:hidden">
          <Show when={editMode()}>
            <span class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Personnalisation — glissez les KPI, changez leur largeur, masquez-en.
            </span>
          </Show>
          <div class="ml-auto flex items-center gap-2">
            <Show when={editMode()}>
              <button
                type="button"
                onClick={() => setLayout(structuredClone(DEFAULT_DASHBOARD_LAYOUT))}
                class="rounded border border-rule bg-secondary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              >
                Réinitialiser
              </button>
            </Show>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              class="flex items-center gap-1.5 rounded border border-rule bg-card px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-secondary"
            >
              <span class="material-symbols-outlined text-[14px] text-muted-foreground">
                {editMode() ? 'check' : 'tune'}
              </span>
              {editMode() ? 'Terminé' : 'Personnaliser'}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:[grid-auto-flow:dense]">
          {/* KPI #1 — Charge en retard par poste (issue #38) */}
          <Show
            when={isVisible('charge')}
            fallback={
              <HiddenTile id="charge" editMode={editMode()} onShow={() => setVisible('charge', true)} />
            }
          >
            <Tile
              id="charge"
              editMode={editMode()}
              screenRank={screenRank('charge')}
              printRank={printRank('charge')}
              width={layoutItem('charge')?.width ?? 1}
              onWidth={(w) => setWidth('charge', w)}
              onHide={() => setVisible('charge', false)}
              onPrintMove={(dir) => movePrint('charge', dir)}
              draggedId={draggedId}
              dropTargetId={dropTargetId}
              setDraggedId={setDraggedId}
              setDropTargetId={setDropTargetId}
              onDrop={() => moveItem(draggedId()!, 'charge')}
            >
              <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
                <CardHeader
                  title="Charge en retard"
                  suffix="par poste"
                  onHide={() => setVisible('charge', false)}
                />
                <Show when={!kpisData.loading} fallback={<Spinner />}>
                  <Show
                    when={!x3Error()}
                    fallback={
                      <p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                        {x3Error()}
                      </p>
                    }
                  >
                    <div class="flex items-end justify-between gap-3">
                      <div class="font-fraunces text-[56px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                        {kpi().totalHeures}
                        <span class="ml-1 font-mono text-[18px] font-bold text-muted-foreground">
                          h
                        </span>
                      </div>
                      <div class="pb-1.5 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                        <b class="text-[13px] text-foreground">{kpi().nbLignes}</b> ligne
                        {kpi().nbLignes > 1 ? 's' : ''}
                        <br />
                        en retard
                      </div>
                    </div>

                    <Show
                      when={kpi().postes.length > 0}
                      fallback={
                        <p class="mt-6 font-fraunces text-[13px] italic text-muted-foreground">
                          Aucune charge en retard — rien à rattraper.
                        </p>
                      }
                    >
                      <div class="mt-6 flex flex-col gap-3.5">
                        <For each={kpi().postes}>
                          {(poste, i) => (
                            <div>
                              <div class="mb-[5px] flex items-baseline justify-between gap-2">
                                <span
                                  class="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground"
                                  title={poste.label}
                                >
                                  {poste.code}
                                  {poste.label ? ` · ${poste.label}` : ''}
                                </span>
                                <span class="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                                  {poste.heures} h
                                </span>
                              </div>
                              <div
                                class="h-2 overflow-hidden rounded-full bg-secondary"
                                style={{
                                  '-webkit-print-color-adjust': 'exact',
                                  'print-color-adjust': 'exact',
                                }}
                              >
                                <div
                                  class="h-full rounded-full"
                                  style={{
                                    'width': `${Math.max(3, (poste.heures / maxHeures()) * 100)}%`,
                                    'background':
                                      BAR_PALETTE[Math.min(i(), BAR_PALETTE.length - 1)],
                                    '-webkit-print-color-adjust': 'exact',
                                    'print-color-adjust': 'exact',
                                  }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </Show>
              </article>
              </Tile>
            </Show>

            {/* KPI #2 — OTD (On-Time Delivery) — 1 ou 2 périodes selon le jour */}
            <Show
              when={isVisible('otd')}
              fallback={
                <HiddenTile id="otd" editMode={editMode()} onShow={() => setVisible('otd', true)} />
              }
            >
              <Tile
                id="otd"
                editMode={editMode()}
                screenRank={screenRank('otd')}
                printRank={printRank('otd')}
                width={layoutItem('otd')?.width ?? 1}
                onWidth={(w) => setWidth('otd', w)}
                onHide={() => setVisible('otd', false)}
                onPrintMove={(dir) => movePrint('otd', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => moveItem(draggedId()!, 'otd')}
              >
              <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
                <div class="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                  <span class="size-2 shrink-0 rounded-full bg-foreground/30"></span>
                  <h2 class="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
                    OTD
                  </h2>
                  {/* Sélecteur de plage — popover calendrier */}
                  <div class="relative ml-auto">
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCalendarOpen((v) => !v)}
                        class="flex items-center gap-1.5 rounded border border-rule bg-secondary px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary/80"
                      >
                        <span class="material-symbols-outlined text-[13px] text-muted-foreground">
                          calendar_today
                        </span>
                        <span>{otdRangeLabel() ?? 'Auto'}</span>
                      </button>
                      <Show when={otdRange()?.start}>
                        <button
                          type="button"
                          onClick={() => {
                            setOtdRange(null)
                            setCalendarOpen(false)
                          }}
                          class="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          title="Réinitialiser"
                        >
                          <span class="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </Show>
                    </div>

                    <Show when={calendarOpen()}>
                      <div class="fixed inset-0 z-10" onClick={() => setCalendarOpen(false)} />
                      <div class="absolute right-0 top-full z-20 mt-1">
                        <Calendar
                          mode="range"
                          range={otdRange() ?? { start: null, end: null }}
                          onRangeChange={(r) => {
                            setOtdRange(r)
                            if (r.start && r.end) setCalendarOpen(false)
                          }}
                          max={new Date()}
                        />
                      </div>
                    </Show>
                  </div>
                  <div class="flex items-center rounded border border-rule bg-secondary p-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
                    <button
                      onClick={() => setOtdMode('demandee')}
                      class="rounded px-2 py-1 transition-colors"
                      classList={{
                        'bg-card text-foreground shadow-sm': otdMode() === 'demandee',
                        'text-muted-foreground hover:text-foreground': otdMode() !== 'demandee',
                      }}
                    >
                      Demandée
                    </button>
                    <button
                      onClick={() => setOtdMode('acceptee')}
                      class="rounded px-2 py-1 transition-colors"
                      classList={{
                        'bg-card text-foreground shadow-sm': otdMode() === 'acceptee',
                        'text-muted-foreground hover:text-foreground': otdMode() !== 'acceptee',
                      }}
                    >
                      Acceptée
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisible('otd', false)}
                    class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground print:hidden"
                    title="Masquer ce KPI"
                    aria-label="Masquer le KPI OTD"
                  >
                    <span class="material-symbols-outlined text-[15px]">visibility</span>
                  </button>
                </div>
                <Show when={!otdData.loading} fallback={<Spinner />}>
                  <Show
                    when={!otdError()}
                    fallback={
                      <p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                        {otdError()}
                      </p>
                    }
                  >
                    <Show
                      when={otd().length > 0}
                      fallback={
                        <p class="font-fraunces text-[13px] italic text-muted-foreground">
                          Aucune donnée OTD.
                        </p>
                      }
                    >
                      {/* Filtre par client + bascule afficher/masquer les détails */}
                      <div class="mb-3 flex items-center gap-1.5">
                        <div class="relative min-w-0 flex-1">
                          <span class="material-symbols-outlined pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                            search
                          </span>
                          <input
                            type="text"
                            value={clientFilter()}
                            onInput={(e) => onClientInput(e.currentTarget.value)}
                            placeholder="Filtrer par client"
                            aria-label="Filtrer les lignes par client"
                            class="w-full rounded border border-rule bg-secondary py-[5px] pl-7 pr-6 font-sans text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none"
                          />
                          <Show when={clientFilter()}>
                            <button
                              type="button"
                              onClick={clearClient}
                              class="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                              title="Effacer le filtre"
                              aria-label="Effacer le filtre"
                            >
                              <span class="material-symbols-outlined text-[13px]">close</span>
                            </button>
                          </Show>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailsOpen((v) => !v)}
                          class="flex shrink-0 items-center gap-1 rounded border border-rule bg-secondary px-2 py-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-secondary/80"
                          title={detailsOpen() ? 'Masquer les détails' : 'Afficher les détails'}
                        >
                          <span class="material-symbols-outlined text-[13px] text-muted-foreground">
                            {detailsOpen() ? 'expand_more' : 'chevron_right'}
                          </span>
                          <span>Détails</span>
                        </button>
                      </div>
                      <For each={otd()}>
                        {(p, i) => (
                          <div classList={{ 'mt-5 border-t border-rule-soft pt-5': i() > 0 }}>
                            {/* Label période */}
                            <div class="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              {p.label}
                            </div>

                            <Show
                              when={p.nbTotal > 0}
                              fallback={
                                <p class="font-fraunces text-[12px] italic text-muted-foreground">
                                  Aucune ligne à expédier.
                                </p>
                              }
                            >
                              <div class="flex items-end justify-between gap-3">
                                <div
                                  class="font-fraunces text-[48px] font-semibold leading-none tracking-tight tabular-nums"
                                  style={{ color: otdColor(p.tauxOtif, p.nbTotal) }}
                                >
                                  {p.tauxOtif}
                                  <span class="ml-0.5 font-mono text-[16px] font-bold text-muted-foreground">
                                    %
                                  </span>
                                </div>
                                <div class="pb-1 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                                  <b class="text-[13px] text-foreground">{p.nbOtif}</b>/{p.nbTotal}
                                  <br />
                                  lignes OTIF
                                </div>
                              </div>

                              <Show when={detailsOpen()}>
                                <Show
                                  when={p.lignesNon.length > 0}
                                  fallback={
                                    <p class="mt-4 font-fraunces text-[12px] italic text-muted-foreground">
                                      Toutes les lignes sont OTIF.
                                    </p>
                                  }
                                >
                                  <div class="-mx-2 mt-4 max-h-[160px] overflow-auto">
                                    <table class="w-full border-collapse text-left">
                                      <thead>
                                        <tr class="sticky top-0 bg-card">
                                          <th class="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                            Commande
                                          </th>
                                          <th class="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                            Article
                                          </th>
                                          <th class="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                            Poste
                                          </th>
                                          <th class="border-b border-rule px-2 py-1.5 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                            Livré/Cmde
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <For each={p.lignesNon}>
                                          {(l) => (
                                            <tr class="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                                              <td class="px-2 py-1.5 align-top">
                                                <div class="font-mono text-[11px] font-bold text-foreground">
                                                  {l.numCommande}
                                                </div>
                                                <div class="font-sans text-[10px] text-muted-foreground">
                                                  {l.client}
                                                </div>
                                              </td>
                                              <td class="px-2 py-1.5 align-top font-mono text-[11px] font-semibold text-brand">
                                                {l.article}
                                              </td>
                                              <td class="px-2 py-1.5 align-top">
                                                <Show
                                                  when={l.posteDeCharge}
                                                  fallback={
                                                    <span class="font-sans text-[10px] text-muted-foreground/70">
                                                      —
                                                    </span>
                                                  }
                                                >
                                                  <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                                                    {l.posteDeCharge}
                                                  </span>
                                                </Show>
                                              </td>
                                              <td class="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                                                {l.qteLivree}/{l.qteCmde}
                                              </td>
                                            </tr>
                                          )}
                                        </For>
                                      </tbody>
                                    </table>
                                  </div>
                                </Show>
                              </Show>
                            </Show>
                          </div>
                        )}
                      </For>
                    </Show>
                  </Show>
                </Show>
              </article>
              </Tile>
            </Show>

            {/* KPI #3 — Valorisation du stock sur 12 mois (AE1) */}
            <Show
              when={isVisible('stock')}
              fallback={
                <HiddenTile id="stock" editMode={editMode()} onShow={() => setVisible('stock', true)} />
              }
            >
              <Tile
                id="stock"
                editMode={editMode()}
                screenRank={screenRank('stock')}
                printRank={printRank('stock')}
                width={layoutItem('stock')?.width ?? 1}
                onWidth={(w) => setWidth('stock', w)}
                onHide={() => setVisible('stock', false)}
                onPrintMove={(dir) => movePrint('stock', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => moveItem(draggedId()!, 'stock')}
              >
              <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
                <div class="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                  <span class="size-2 shrink-0 rounded-full" style={{ background: '#2d6a8f' }}></span>
                  <h2 class="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
                    Valorisation stock
                  </h2>
                  {/* Sélecteur de plage — popover calendrier (modèle OTD) */}
                  <div class="relative ml-auto">
                    <button
                      type="button"
                      onClick={() => setStockCalendarOpen((v) => !v)}
                      class="flex items-center gap-1.5 rounded border border-rule bg-secondary px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary/80"
                    >
                      <span class="material-symbols-outlined text-[13px] text-muted-foreground">
                        calendar_today
                      </span>
                      <span>{stockRangeLabel() ?? '12 ' + (stockGrain() === 'semaine' ? 'sem.' : 'mois')}</span>
                    </button>
                    <Show when={stockRange()?.start}>
                      <button
                        type="button"
                        onClick={() => {
                          setStockRange(null)
                          setStockCalendarOpen(false)
                        }}
                        class="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        title="Réinitialiser"
                      >
                        <span class="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </Show>
                    <Show when={stockCalendarOpen()}>
                      <div class="fixed inset-0 z-10" onClick={() => setStockCalendarOpen(false)} />
                      <div class="absolute right-0 top-full z-20 mt-1">
                        <Calendar
                          mode="range"
                          range={stockRange() ?? { start: null, end: null }}
                          onRangeChange={(r) => {
                            setStockRange(r)
                            if (r.start && r.end) setStockCalendarOpen(false)
                          }}
                          max={new Date()}
                        />
                      </div>
                    </Show>
                  </div>
                  {/* Toggle maille Mois/Semaine (segmented control, modèle OTD) */}
                  <div class="flex items-center rounded border border-rule bg-secondary p-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
                    <button
                      onClick={() => setStockGrain('mois')}
                      class="rounded px-2 py-1 transition-colors"
                      classList={{
                        'bg-card text-foreground shadow-sm': stockGrain() === 'mois',
                        'text-muted-foreground hover:text-foreground': stockGrain() !== 'mois',
                      }}
                    >
                      Mois
                    </button>
                    <button
                      onClick={() => setStockGrain('semaine')}
                      class="rounded px-2 py-1 transition-colors"
                      classList={{
                        'bg-card text-foreground shadow-sm': stockGrain() === 'semaine',
                        'text-muted-foreground hover:text-foreground': stockGrain() !== 'semaine',
                      }}
                    >
                      Sem.
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisible('stock', false)}
                    class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground print:hidden"
                    title="Masquer ce KPI"
                    aria-label="Masquer le KPI Valorisation stock"
                  >
                    <span class="material-symbols-outlined text-[15px]">visibility</span>
                  </button>
                </div>
                <Show when={!stockData.loading} fallback={<Spinner />}>
                  <Show
                    when={!stockError()}
                    fallback={
                      <p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                        {stockError()}
                      </p>
                    }
                  >
                    <Show
                      when={stock().series.length > 0}
                      fallback={
                        <p class="font-fraunces text-[13px] italic text-muted-foreground">
                          Aucune donnée de valorisation.
                        </p>
                      }
                    >
                      {/* Valeur actuelle + delta vs il y a 12 mois */}
                      <div class="flex items-end justify-between gap-3">
                        <div>
                          <div class="font-fraunces text-[40px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                            {fmtEuro.format(stock().totalActuel)}
                          </div>
                          <div class="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                            <Show when={stock().deltaPct !== 0}>
                              <span
                                class="font-bold tabular-nums"
                                style={{
                                  color: stock().deltaPct > 0 ? '#b23b2e' : '#2d7a4f',
                                }}
                              >
                                {stock().deltaPct > 0 ? '+' : ''}
                                {stock().deltaPct}%
                              </span>
                            </Show>
                            <span>vs début de plage</span>
                          </div>
                        </div>
                        <div class="pb-1 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                          <b class="text-[13px] text-foreground">{stock().nbArticles}</b> art.
                          <br />
                          valorisés
                        </div>
                      </div>

                      {/* Mini-graphique — colonnes verticales SVG inline (nb points = nb périodes) */}
                      <StockSparkline series={stock().series} />

                      {/* Top 5 catégories par valeur */}
                      <div class="mt-5">
                        <div class="mb-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Top catégories
                        </div>
                        <div class="flex flex-col gap-3">
                          <For each={stock().categories}>
                            {(cat, i) => (
                              <div>
                                <div class="mb-[5px] flex items-baseline justify-between gap-2">
                                  <span class="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground">
                                    {cat.categorie}
                                  </span>
                                  <span class="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                                    {fmtEuro.format(cat.valeur)}
                                    <span class="ml-1 text-[10px] text-muted-foreground/70">
                                      {cat.part}%
                                    </span>
                                  </span>
                                </div>
                                <div
                                  class="h-2 overflow-hidden rounded-full bg-secondary"
                                  style={{
                                    '-webkit-print-color-adjust': 'exact',
                                    'print-color-adjust': 'exact',
                                  }}
                                >
                                  <div
                                    class="h-full rounded-full"
                                    style={{
                                      'width': `${Math.max(3, (cat.valeur / stockMaxCat()) * 100)}%`,
                                      'background':
                                        STOCK_PALETTE[Math.min(i(), STOCK_PALETTE.length - 1)],
                                      '-webkit-print-color-adjust': 'exact',
                                      'print-color-adjust': 'exact',
                                    }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </Show>
                </Show>
              </article>
              </Tile>
            </Show>

          {/* KPI — Lignes en retard (détail) */}
          <Show
            when={isVisible('lignes')}
            fallback={
              <HiddenTile id="lignes" editMode={editMode()} onShow={() => setVisible('lignes', true)} />
            }
          >
            <Tile
              id="lignes"
              editMode={editMode()}
              screenRank={screenRank('lignes')}
              printRank={printRank('lignes')}
              width={layoutItem('lignes')?.width ?? 2}
              onWidth={(w) => setWidth('lignes', w)}
              onHide={() => setVisible('lignes', false)}
              onPrintMove={(dir) => movePrint('lignes', dir)}
              draggedId={draggedId}
              dropTargetId={dropTargetId}
              setDraggedId={setDraggedId}
              setDropTargetId={setDropTargetId}
              onDrop={() => moveItem(draggedId()!, 'lignes')}
            >
            <article class="flex max-h-[calc(100vh-9rem)] flex-col rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] print:max-h-none print:overflow-visible print:shadow-none">
              <CardHeader
                title="Lignes en retard"
                suffix={`${kpi().nbLignes} commande${kpi().nbLignes > 1 ? 's' : ''}`}
                onHide={() => setVisible('lignes', false)}
              />
              <Show when={!kpisData.loading} fallback={<Spinner />}>
                <Show
                  when={!x3Error()}
                  fallback={
                    <p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {x3Error()}
                    </p>
                  }
                >
                  <Show
                    when={kpi().lignes.length > 0}
                    fallback={
                      <p class="font-fraunces text-[13px] italic text-muted-foreground">
                        Aucune ligne en retard.
                      </p>
                    }
                  >
                    <div class="-mx-2 overflow-auto print:overflow-visible">
                      <table class="w-full border-collapse text-left">
                        <thead>
                          <tr class="sticky top-0 bg-card">
                            <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Expé
                            </th>
                            <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Commande · Client
                            </th>
                            <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Article · Désignation
                            </th>
                            <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Poste
                            </th>
                            <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Reste
                            </th>
                            <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Charge
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={kpi().lignes}>
                            {(l) => (
                              <tr class="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                                <td class="whitespace-nowrap px-2 py-2.5 align-top font-mono text-[12px] font-semibold text-destructive">
                                  {l.dateExp || '—'}
                                </td>
                                <td class="px-2 py-2.5 align-top">
                                  <div class="font-mono text-[12px] font-bold text-foreground">
                                    {l.numCommande}
                                  </div>
                                  <div class="font-sans text-[11px] text-muted-foreground">
                                    {l.client}
                                  </div>
                                </td>
                                <td class="px-2 py-2.5 align-top">
                                  <div class="font-mono text-[12px] font-semibold text-brand">
                                    {l.article}
                                  </div>
                                  <div class="font-sans text-[11px] leading-snug text-secondary-foreground">
                                    {l.designation || '—'}
                                  </div>
                                </td>
                                <td class="px-2 py-2.5 align-top">
                                  <Show
                                    when={l.postes.length > 0}
                                    fallback={
                                      <span class="font-sans text-[11px] text-muted-foreground/70">
                                        —
                                      </span>
                                    }
                                  >
                                    <div class="flex flex-wrap gap-1">
                                      <For each={l.postes}>
                                        {(p) => (
                                          <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                                            {p}
                                          </span>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </td>
                                <td class="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-semibold tabular-nums text-foreground">
                                  {l.qteRestante}
                                </td>
                                <td class="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-bold tabular-nums text-foreground">
                                  {l.heures > 0 ? `${l.heures} h` : '—'}
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </Show>
              </Show>
            </article>
            </Tile>
          </Show>

          {/* Carte — Stock par article (détail, même source que le KPI valorisation) */}
          <Show
            when={isVisible('stockTable')}
            fallback={
              <HiddenTile id="stockTable" editMode={editMode()} onShow={() => setVisible('stockTable', true)} />
            }
          >
            <Tile
              id="stockTable"
              editMode={editMode()}
              screenRank={screenRank('stockTable')}
              printRank={printRank('stockTable')}
              width={layoutItem('stockTable')?.width ?? 2}
              onWidth={(w) => setWidth('stockTable', w)}
              onHide={() => setVisible('stockTable', false)}
              onPrintMove={(dir) => movePrint('stockTable', dir)}
              draggedId={draggedId}
              dropTargetId={dropTargetId}
              setDraggedId={setDraggedId}
              setDropTargetId={setDropTargetId}
              onDrop={() => moveItem(draggedId()!, 'stockTable')}
            >
            <article class="flex max-h-[calc(100vh-9rem)] flex-col rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] print:max-h-none print:overflow-visible print:shadow-none">
              <CardHeader
                title="Stock par article"
                suffix={`${filteredArticles().length} / ${stock().nbArticles} · AE1`}
                tone="#2d6a8f"
                onHide={() => setVisible('stockTable', false)}
              />
              <Show when={!stockData.loading} fallback={<Spinner />}>
                <Show
                  when={!stockError()}
                  fallback={
                    <p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {stockError()}
                    </p>
                  }
                >
                  {/* Barre de filtres : recherche + catégorie + masquer stock 0 */}
                  <div class="mb-3 flex flex-wrap items-center gap-1.5">
                    <div class="relative min-w-0 flex-1">
                      <span class="material-symbols-outlined pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                        search
                      </span>
                      <input
                        type="text"
                        value={stockSearch()}
                        onInput={(e) => setStockSearch(e.currentTarget.value)}
                        placeholder="Article ou désignation"
                        aria-label="Filtrer les articles"
                        class="w-full rounded border border-rule bg-secondary py-[5px] pl-7 pr-6 font-sans text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none"
                      />
                      <Show when={stockSearch()}>
                        <button
                          type="button"
                          onClick={() => setStockSearch('')}
                          class="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                          title="Effacer"
                          aria-label="Effacer la recherche"
                        >
                          <span class="material-symbols-outlined text-[13px]">close</span>
                        </button>
                      </Show>
                    </div>
                    <select
                      value={stockCatFilter()}
                      onChange={(e) => setStockCatFilter(e.currentTarget.value)}
                      aria-label="Filtrer par catégorie"
                      class="rounded border border-rule bg-secondary py-[5px] px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-foreground focus:border-foreground/30 focus:outline-none"
                    >
                      <option value="">Toutes cat.</option>
                      <For each={stockCategories()}>{(c) => <option value={c}>{c}</option>}</For>
                    </select>
                    <button
                      type="button"
                      onClick={() => setStockHideZero((v) => !v)}
                      class="flex items-center gap-1 rounded border border-rule px-2 py-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors"
                      classList={{
                        'bg-foreground text-background': stockHideZero(),
                        'bg-secondary text-muted-foreground hover:text-foreground': !stockHideZero(),
                      }}
                      title="Masquer les articles à stock nul"
                    >
                      <span class="material-symbols-outlined text-[13px]">
                        {stockHideZero() ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <span>Stock ≠ 0</span>
                    </button>
                  </div>

                  <div class="-mx-2 overflow-auto print:overflow-visible">
                    <table class="w-full border-collapse text-left">
                      <thead>
                        <tr class="sticky top-0 bg-card">
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            <button type="button" onClick={() => toggleStockSort('article')} class="flex items-center gap-1 hover:text-foreground">
                              Article
                              <Show when={stockSortBy() === 'article'}>
                                <span class="text-[10px]">{stockSortDir() === 'asc' ? '▲' : '▼'}</span>
                              </Show>
                            </button>
                          </th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            Désignation
                          </th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            <button type="button" onClick={() => toggleStockSort('categorie')} class="flex items-center gap-1 hover:text-foreground">
                              Cat.
                              <Show when={stockSortBy() === 'categorie'}>
                                <span class="text-[10px]">{stockSortDir() === 'asc' ? '▲' : '▼'}</span>
                              </Show>
                            </button>
                          </th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            <button type="button" onClick={() => toggleStockSort('stock')} class="ml-auto flex items-center gap-1 hover:text-foreground">
                              Stock
                              <Show when={stockSortBy() === 'stock'}>
                                <span class="text-[10px]">{stockSortDir() === 'asc' ? '▲' : '▼'}</span>
                              </Show>
                            </button>
                          </th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            PMP
                          </th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            <button type="button" onClick={() => toggleStockSort('valeur')} class="ml-auto flex items-center gap-1 hover:text-foreground">
                              Valeur
                              <Show when={stockSortBy() === 'valeur'}>
                                <span class="text-[10px]">{stockSortDir() === 'asc' ? '▲' : '▼'}</span>
                              </Show>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={filteredArticles()}>
                          {(a) => (
                            <tr class="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                              <td class="px-2 py-1.5 align-top font-mono text-[12px] font-semibold text-brand">
                                {a.article}
                              </td>
                              <td class="px-2 py-1.5 align-top font-sans text-[11px] leading-snug text-secondary-foreground">
                                {a.designation || '—'}
                              </td>
                              <td class="px-2 py-1.5 align-top">
                                <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                                  {a.categorie}
                                </span>
                              </td>
                              <td class="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-foreground">
                                {a.stock}
                              </td>
                              <td class="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                                {a.pmp.toFixed(4)}
                              </td>
                              <td class="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] font-bold tabular-nums text-foreground">
                                {fmtEuro.format(a.valeur)}
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </Show>
            </article>
            </Tile>
          </Show>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

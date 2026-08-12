/**
 * Page « Suivi des ruptures » (port React) — design system cursor, harmonisée
 * avec les autres pages migrées (barre d'outils `ui/toolbar`).
 *
 * La barre passe par la prop `toolbar` d'AppLayout, et non par les children :
 * c'est elle qui fournit le filet, le fond et l'axe `px-6` du TopBar. Rendue
 * en enfant, la page portait quatre bords gauches différents — TopBar 24 px,
 * barre 16 px, bandeaux 28 px, contenu 20 px.
 *
 * Shell Inertia instantané (SchedulerController.shortageTracker) ; les lignes (calcul
 * lourd : faisabilité + réceptions) chargées en différé par fetch JSON (shortageRows).
 * Deux vues d'une même donnée : « Registre » (table éditoriale) et « Par composant »
 * (agrégation dégâts).
 */
import { useCallback, useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Bell, TriangleAlert, CircleX } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'
import { LoadingState } from '@r/components/ui/loading-state'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

import AppLayout from '@r/layouts/app'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { X3Link } from '@r/components/x3-link'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { ShortageRegistre, ShortageComposants } from '@r/components/shortages'
import {
  ToolbarSegmented,
  ToolbarSegment,
  ToolbarSearch,
  ToolbarRefresh,
  ToolbarSpacer,
  ToolbarDateWindow,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarFilterChip,
} from '@r/components/ui/toolbar'
import { route } from '@r/lib/routes'
import { parseIso, toIso, startOfDay, DAY_MS } from '@r/lib/vision/date-utils'
import { VERDICT_TONE } from '@r/lib/shortages/shortage-math'
import type { ShortageRowsResponse, ShortageVerdictKey } from '@r/lib/shortages/types'

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Bornes serveur du paramètre `days` (cf. SchedulerController.shortageTracker). */
const MIN_HORIZON = 1
const MAX_HORIZON = 90

const EMPTY: ShortageRowsResponse = {
  rows: [],
  stats: { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 },
  x3Error: null,
}

interface ShortagesProps {
  horizon: number
  windowStart: string
  dateRange: string
  rowsHref: string
}

interface DateRange {
  start: Date | null
  end: Date | null
}

export default function Shortages(props: ShortagesProps) {
  const [mode, setMode] = useState<'registre' | 'composants'>('registre')
  const [query, setQuery] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<ShortageVerdictKey | 'all'>('all')
  const [selectedOf, setSelectedOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Fenêtre d'analyse : sélecteur de plage.
  const startInitial = useMemo(() => parseIso(props.windowStart), [props.windowStart])
  const windowEnd = useMemo(() => {
    if (!startInitial) return null
    const d = new Date(startInitial)
    d.setDate(d.getDate() + props.horizon)
    return d
  }, [startInitial, props.horizon])

  const [range, setRange] = useState<DateRange>({
    start: startInitial,
    end: windowEnd,
  })

  // Fetch des données
  const { data, loading, error } = useTimedFetch<ShortageRowsResponse>(props.rowsHref)
  const viewData = data ?? EMPTY

  /* Une seule mécanique de navigation pour les deux gestes qui rechargent la
     fenêtre serveur — `window.location.href` d'un côté et `router.visit` de
     l'autre, c'était deux comportements (perte du cache Inertia, pas de
     progression) pour un même effet. */
  const [refreshing, setRefreshing] = useState(false)
  const reload = useCallback((qs: string) => {
    router.visit(`${route('scheduler.shortage_tracker')}?${qs}`, {
      onStart: () => setRefreshing(true),
      onFinish: () => setRefreshing(false),
    })
  }, [])

  const applyRange = (r: DayPickerRange) => {
    const next: DateRange = { start: r.from ?? null, end: r.to ?? null }
    setRange(next)
    if (!next.start || !next.end) return
    const span = Math.round(
      (startOfDay(next.end).getTime() - startOfDay(next.start).getTime()) / DAY_MS
    )
    const days = Math.min(MAX_HORIZON, Math.max(MIN_HORIZON, span))
    reload(`start=${toIso(next.start)}&days=${days}`)
  }

  const refresh = useCallback(
    () => reload(`start=${props.windowStart}&days=${props.horizon}&refresh=1`),
    [reload, props.windowStart, props.horizon]
  )

  // Filtrage par recherche + verdict
  const filteredRows = useMemo(() => {
    const all = viewData.rows
    const q = fold(query)
    const vf = verdictFilter
    let r = vf === 'all' ? all : all.filter((row) => row.verdictKey === vf)
    if (q) r = r.filter((row) => row.filter.includes(q))
    return r
  }, [viewData.rows, query, verdictFilter])

  // Compteurs KPI (dérivés des lignes, indépendants des filtres).
  const counts = useMemo(() => {
    const c = { couvert: 0, a_risque: 0, retard: 0, sans_couverture: 0, sous_ensemble: 0 }
    for (const r of viewData.rows) c[r.verdictKey]++
    return c
  }, [viewData.rows])

  const onSelectOf = (num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }

  /* ── TopBar : notification « OF à solder » ──────────────────────────────
     Le bandeau permanent est remplacé par une cloche discrète à badge : le
     compte reste visible en continu, le détail (la liste des OF fantômes,
     écartés du calcul de couverture) se révèle au clic, dans un popover.
     Rien n'est rendu quand aucun OF n'est à solder. */
  const phantomNotif =
    (viewData.phantomOfs?.length ?? 0) > 0 ? (
      <Popover.Root>
        <Popover.Trigger
          render={
            <button
              type="button"
              aria-label={`${viewData.phantomOfs!.length} OF à solder, écartés de la couverture`}
              title={`${viewData.phantomOfs!.length} OF à solder — écartés de la couverture (gamme pointée en totalité)`}
              className="relative flex size-8 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Bell size={16} strokeWidth={1.75} />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white tabular-nums">
                {viewData.phantomOfs!.length}
              </span>
            </button>
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
            <Popover.Popup className="w-80 rounded-lg border border-rule bg-card p-3 shadow-float">
              <div className="flex items-center gap-1.5">
                <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 text-suggere" />
                <span className="text-xs font-bold text-foreground">
                  {viewData.phantomOfs!.length} OF à solder
                </span>
              </div>
              <p className="mt-1 text-2xs leading-snug text-muted-foreground">
                Écartés de la couverture (gamme pointée en totalité).
              </p>
              <ul className="mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                {viewData.phantomOfs!.map((p) => (
                  <li key={p.numOf} className="truncate font-mono text-2xs text-foreground">
                    <X3Link
                      fonction="GESMFG"
                      cle={p.numOf}
                      title={`Ouvrir l'OF ${p.numOf} dans Sage X3`}
                      className="font-bold text-foreground"
                    >
                      {p.numOf}
                    </X3Link>
                    <span className="text-muted-foreground">
                      {' '}({p.article}, reste {p.qteRestante})
                    </span>
                  </li>
                ))}
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    ) : null

  const emptyState = (
    <div className="flex flex-1 items-center justify-center p-10 text-center text-[14px] text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <DynamicIcon
          name={viewData.x3Error ? 'cloud_off' : 'task_alt'}
          size={32}
          className="text-muted-foreground/50"
        />
        {viewData.x3Error
          ? 'Données indisponibles (X3 injoignable).'
          : 'Aucune rupture détectée dans la fenêtre.'}
      </div>
    </div>
  )

  /**
   * Chip de verdict. La gravité n'est PAS un paramètre : elle vient de
   * `VERDICT_TONE`, la seule table qui dit de quelle couleur est un verdict —
   * la même qui peint le badge de la table et la barre latérale. Passée à la
   * main ici, elle avait fini par contredire les deux autres.
   */
  const verdictChip = (k: ShortageVerdictKey | 'all', label: string) => {
    const on = verdictFilter === k
    const count = k === 'all' ? viewData.rows.length : counts[k]
    return (
      <ToolbarFilterChip
        key={k}
        label={label}
        count={count}
        tone={k === 'all' ? 'neutral' : VERDICT_TONE[k].chip}
        active={on}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      />
    )
  }

  /* ── Barre d'outils (standard §17) ───────────────────────────────────────
     Zone 01 portée : la bascule de vue puis la fenêtre de dates. Zone 02 : le
     déclencheur unique de filtres. Zone 03 : la recherche. Zone 04 : actualiser.
     Pas de conteneur `<Toolbar>` : la prop d'AppLayout en est déjà un. */
  const toolbar = (
    <>
      <ToolbarSegmented semantics="tabs" aria-label="Vue">
        {(
          [
            ['registre', 'Registre', 'Table éditoriale : une ligne par composant × OF bloqué'],
            ['composants', 'Par composant', "Agrégation : quel composant bloque le plus d'OF ?"],
          ] as const
        ).map(([key, label, title]) => (
          <ToolbarSegment
            key={key}
            active={mode === key}
            title={title}
            onClick={() => setMode(key)}
          >
            {label}
          </ToolbarSegment>
        ))}
      </ToolbarSegmented>

      <ToolbarDateWindow
        value={range.start && range.end ? { from: range.start, to: range.end } : undefined}
        onCommit={applyRange}
        title="Fenêtre d'analyse : OF dont le démarrage tombe dans la plage"
      />

      {/* « Filtres » et non « Verdict » : le déclencheur est unique et nommé par
          son rôle, pas par le seul filtre qu'il contient aujourd'hui. */}
      <ToolbarFilterMenu activeCount={verdictFilter !== 'all' ? 1 : 0}>
        <ToolbarFilterSection>Verdict</ToolbarFilterSection>
        <ToolbarSegmented flat semantics="toggles" className="w-full flex-wrap">
          {verdictChip('all', 'Tous')}
          {verdictChip('sans_couverture', 'Sans couv.')}
          {verdictChip('sous_ensemble', 'S/E')}
          {verdictChip('retard', 'Retard')}
          {verdictChip('a_risque', 'À risque')}
          {verdictChip('couvert', 'Couvert')}
        </ToolbarSegmented>
      </ToolbarFilterMenu>

      <ToolbarSpacer />

      <ToolbarSearch
        value={query}
        onChange={setQuery}
        placeholder="Composant, OF, commande, fournisseur…"
      />
      {/* `loading` câblé : le calcul dépasse la dizaine de secondes sur cette
          page, et une visite Inertia ne donne aucun retour navigateur. Les deux
          états comptent — la visite du shell PUIS le fetch des lignes, qui est
          le long des deux. Le bouton se désactive tant que l'un tourne. */}
      <ToolbarRefresh loading={refreshing || loading} onClick={refresh} />
    </>
  )

  return (
    <AppLayout
      title="Ruptures"
      active="ruptures"
      subtitle="Ruptures · Couverture composants"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
      mastheadActions={phantomNotif}
    >
      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1`/`h-full` de
          la vue en dessous ne se dimensionnent contre rien et la table déborde
          hors de l'écran sans scroll possible. */}
      <div className="flex h-full min-h-0 flex-col">
        {/* ═══ X3 injoignable ═══ */}
        {viewData.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement ruptures :</span>
            <span className="font-mono">{viewData.x3Error}</span>
          </div>
        )}

        {/* ═══ Vue active ═══ */}
        {loading && !data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title="Calcul des ruptures…"
          />
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
            Échec du calcul des ruptures.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden p-5">
            {mode === 'registre' && (
              <ShortageRegistre
                rows={filteredRows}
                onSelectOf={onSelectOf}
                emptyState={emptyState}
              />
            )}
            {mode === 'composants' && (
              <ShortageComposants
                rows={filteredRows}
                onSelectOf={onSelectOf}
                emptyState={emptyState}
              />
            )}
          </div>
        )}
      </div>

      <OfDetailSheet num={selectedOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}

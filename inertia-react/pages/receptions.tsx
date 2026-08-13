/**
 * Page « Réceptions fournisseurs » — commandes d'achat non soldées, en trois
 * vues : bordereau par jour, charge par jour, board de planification.
 *
 * Coquille Inertia instantanée ; le calcul lourd (X3 + palette + agrégation)
 * est chargé en différé via useTimedFetch sur rowsHref. Même motif que
 * /expeditions, /ruptures, /suivi. La criticité (jointure ruptures) n'est
 * fetchée qu'à l'ouverture du board.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • la barre suit le standard §18 : bascule de vue, PUIS fenêtre de dates,
 *   menu Filtres unique (criticité + regroupement board), recherche,
 *   impression, actualiser — plus de `vision/toolbar` ;
 * • plus de Fraunces ni de pills maison. Le bordereau et le board restent
 *   des grilles métier
 *   (rail spanning, sous-totaux) — leurs cellules suivent `CellStack` /
 *   `CellNumber`.
 */
import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import {
  X,
  SlidersHorizontal,
  Lightbulb,
  TriangleAlert,
  CircleX,
  Inbox,
  CloudOff,
  Package,
  Printer,
} from 'lucide-react'
import { LoadingState } from '@r/components/ui/loading-state'

import AppLayout from '@r/layouts/app'
import { ReceptionTableau, ReceptionCalendrier } from '@r/components/receptions/reception-views'
import { ReceptionBoard, type ReceptionGroupBy } from '@r/components/receptions/reception-board'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import { Pill } from '@r/components/ui/pill'
import { Separator } from '@r/components/ui/separator'
import {
  ToolbarDateWindow,
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import type {
  ReceptionsCriticiteResponse,
  ReceptionsRowsResponse,
  ReceptionViewKind,
} from '@r/lib/receptions/types'

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const EMPTY: ReceptionsRowsResponse = {
  rows: [],
  chargeByDay: [],
  stats: {
    totalPalettes: 0,
    totalLignes: 0,
    totalFournisseurs: 0,
    picPalettes: 0,
    picJour: null,
    lignesEstimees: 0,
    lignesSansCoef: 0,
  },
  range: { from: '', to: '', horizonDays: 0 },
  x3Error: null,
}

interface ReceptionsPageProps {
  from: string
  to: string
  horizon: number
  rowsHref: string
  /** Fragment criticité (jointure ruptures), chargé indépendamment de rowsHref. */
  criticiteHref: string
  todayHref: string
  defaultHorizon: number
}

/** jj/mm/aaaa — l'année est indispensable sur un document imprimé. */
const fmtDayFull = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

/** ISO YYYY-MM-DD en Date locale (évite le recul UTC de `new Date(iso)`). */
function parseIsoLocal(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return new Date(iso)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** ISO YYYY-MM-DD en composantes LOCALES.
 *  toISOString() (UTC) recule d'un jour entre minuit et 1-2h du matin en fuseau
 *  UTC+1/+2 : un clic sur le 21 à 00:00 local devient le 20 en UTC. */
const isoLocalDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Receptions(props: ReceptionsPageProps) {
  const [view, setView] = useState<ReceptionViewKind>('tableau')
  const [range, setRange] = useState<DayPickerRange | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<ReceptionGroupBy>('fournisseur')
  const [criticiteOnly, setCriticiteOnly] = useState(false)
  const [bust, setBust] = useState(0)

  const windowValue: DayPickerRange = range ?? {
    from: parseIsoLocal(props.from),
    to: parseIsoLocal(props.to),
  }

  /** Plage en clair pour l'en-tête imprimée (année comprise). */
  const printRange = useMemo(() => {
    const start = range?.from ?? parseIsoLocal(props.from)
    const end = range?.to ?? range?.from ?? parseIsoLocal(props.to)
    return `${fmtDayFull(start)} → ${fmtDayFull(end)}`
  }, [range, props.from, props.to])

  const url = useMemo(() => {
    const u = new URL(props.rowsHref, window.location.origin)
    if (range?.from) {
      u.searchParams.set('from', isoLocalDay(range.from))
      u.searchParams.set('to', isoLocalDay(range.to ?? range.from))
    }
    if (bust) u.searchParams.set('refresh', String(bust))
    return `${u.pathname}?${u.searchParams.toString()}`
  }, [props.rowsHref, range, bust])

  const { data, loading, error } = useTimedFetch<ReceptionsRowsResponse>(url)

  // Criticité : second fetch, indépendant et non bloquant. Le board s'affiche sans
  // l'attendre ; un pipeline ruptures froid ou en panne coûte les badges, pas la page.
  // Chargée seulement en vue Board — les autres vues ne l'exploitent pas.
  const criticiteUrl = useMemo(() => {
    if (view !== 'board') return null
    const u = new URL(props.criticiteHref, window.location.origin)
    if (range?.from) {
      u.searchParams.set('from', isoLocalDay(range.from))
      u.searchParams.set('to', isoLocalDay(range.to ?? range.from))
    }
    if (bust) u.searchParams.set('refresh', '1')
    return `${u.pathname}?${u.searchParams.toString()}`
  }, [props.criticiteHref, range, bust, view])

  const { data: criticiteData } = useTimedFetch<ReceptionsCriticiteResponse>(criticiteUrl)

  const viewData = data ?? EMPTY
  const stats = viewData.stats
  const x3Error = viewData.x3Error
  const charge = viewData.chargeByDay

  const nbCritiques = criticiteData?.items.length ?? 0
  const nbRetard = criticiteData?.items.filter((i) => i.niveau === 'retard').length ?? 0

  // Filtrage par recherche + jour sélectionné (drill-down calendrier).
  const filteredRows = useMemo(() => {
    const q = fold(query)
    const day = selectedDay
    let rows = viewData.rows
    if (day) rows = rows.filter((r) => r.date === day)
    if (q) {
      rows = rows.filter(
        (r) =>
          fold(r.fournisseurNom).includes(q) ||
          fold(r.fournisseur).includes(q) ||
          fold(r.article).includes(q) ||
          fold(r.designation).includes(q) ||
          fold(r.noCommande).includes(q)
      )
    }
    return rows
    // viewData est dérivé de data (réf change au fetch) — pas besoin de le lister.
  }, [query, selectedDay, viewData])

  const hasContent = viewData.rows.length > 0 || x3Error

  const activeFilterCount =
    (criticiteOnly ? 1 : 0) + (view === 'board' && groupBy !== 'fournisseur' ? 1 : 0)

  /* ── Barre d'outils (standard §18) ───────────────────────────────────────
     Zone 01 portée : bascule de vue, PUIS fenêtre de dates.
     Zone 02 : un déclencheur unique. Zone 03 : la recherche.
     Zone 04 : compteurs / fraîcheur, impression, actualiser.
     Pas de conteneur `<Toolbar>` : la prop d'AppLayout en est déjà un. */
  const toolbar = (
    <>
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Vue">
          <ToolbarSegment active={view === 'tableau'} onClick={() => setView('tableau')}>
            Tableau
          </ToolbarSegment>
          <ToolbarSegment active={view === 'calendrier'} onClick={() => setView('calendrier')}>
            Charge par jour
          </ToolbarSegment>
          <ToolbarSegment active={view === 'board'} onClick={() => setView('board')}>
            Board
          </ToolbarSegment>
        </ToolbarSegmented>

        <ToolbarDateWindow
          value={windowValue}
          onCommit={setRange}
          title="Fenêtre des réceptions attendues"
        />

        <ToolbarFilterMenu activeCount={activeFilterCount} width={300}>
          {view !== 'board' ? (
            <p className="px-0.5 text-xs text-muted-foreground">
              Criticité et regroupement s'appliquent à la vue Board.
            </p>
          ) : (
            <>
              {nbCritiques > 0 && (
                <>
                  <ToolbarFilterSection>Criticité</ToolbarFilterSection>
                  <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                    <ToolbarFilterChip
                      label="Critiques"
                      count={nbCritiques}
                      tone="critical"
                      active={criticiteOnly}
                      onClick={() => setCriticiteOnly((v) => !v)}
                      title="N'afficher que les réceptions qui débloquent une rupture tendue"
                    />
                    {nbRetard > 0 && (
                      <ToolbarFilterChip
                        label="En retard"
                        count={nbRetard}
                        tone="warning"
                        active={criticiteOnly}
                        onClick={() => setCriticiteOnly((v) => !v)}
                        title="Réceptions en retard client projeté (incluses dans Critiques)"
                      />
                    )}
                  </ToolbarSegmented>
                </>
              )}
              {nbCritiques > 0 && <Separator className="my-2" />}
              <ToolbarFilterSection>Regroupement</ToolbarFilterSection>
              <ToolbarSegmented semantics="tabs" flat className="w-full">
                <ToolbarSegment
                  active={groupBy === 'fournisseur'}
                  onClick={() => setGroupBy('fournisseur')}
                >
                  Fournisseur
                </ToolbarSegment>
                <ToolbarSegment active={groupBy === 'quai'} onClick={() => setGroupBy('quai')}>
                  Quai
                </ToolbarSegment>
              </ToolbarSegmented>
            </>
          )}
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarSearch
        value={query}
        onChange={setQuery}
        placeholder="Fournisseur, article, commande…"
      />

      {view === 'board' && (
        <Pill
          variant="outline"
          className="gap-1.5"
          onClick={() => window.print()}
          title="Imprimer le board (A3 paysage)"
        >
          <Printer size={14} strokeWidth={1.75} />
          Imprimer
        </Pill>
      )}
      <ToolbarRefresh loading={loading} onClick={() => setBust((b) => b + 1)} />
    </>
  )

  const showBandeau = Boolean(selectedDay) || stats.lignesEstimees > 0 || stats.lignesSansCoef > 0

  return (
    <AppLayout
      title="Réceptions"
      active="receptions"
      subtitle="Réceptions · Commandes fournisseurs"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      {/* Colonne flex plein écran : `dense` + `scrollable={false}` donnent un
          conteneur en `overflow-hidden` — sans cette coquille les `flex-1` des
          vues ne prennent aucune hauteur et tout ce qui dépasse du viewport est
          coupé, sans ascenseur (chaque vue gère son propre scroll interne). */}
      <div data-print-page className="flex h-full flex-col overflow-hidden">
        {/* ═══ En-tête imprimable ═══
            Masquée à l'écran (le TopBar porte déjà le contexte), elle est la
            seule identité de la feuille une fois posée sur une table. */}
        <div className="hidden flex-none items-baseline justify-between border-b border-border px-6 pb-3 pt-1 print:flex">
          <span className="text-xl font-semibold tracking-tight text-foreground">
            Réceptions fournisseurs
            <span className="ml-3 font-mono text-[13px] font-normal text-muted-foreground">
              {printRange}
            </span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {stats.totalPalettes} palettes · {stats.totalLignes} réceptions ·{' '}
            {stats.totalFournisseurs} fournisseurs
          </span>
        </div>

        {/* ═══ Bandeau vue (drill-down + qualité des coefs) ═══ */}
        {showBandeau && (
          <div className="flex flex-none items-center gap-2.5 border-b border-border px-6 py-1.5 print:hidden">
            {selectedDay && (
              <span className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 font-mono text-[10px] font-semibold text-foreground">
                <SlidersHorizontal size={13} strokeWidth={1.75} />
                {charge.find((c) => c.day === selectedDay)?.dayFmt ?? selectedDay}
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="hover:opacity-70"
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              </span>
            )}

            <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
              {stats.lignesEstimees > 0 && (
                <span
                  className="flex items-center gap-1 text-planifie"
                  title="Lignes dont le coef palette a été estimé (stock actuel SM* ou historique STOJOU)"
                >
                  <Lightbulb size={13} strokeWidth={1.75} />
                  {stats.lignesEstimees} estimé{stats.lignesEstimees > 1 ? 's' : ''}
                </span>
              )}
              {stats.lignesSansCoef > 0 && (
                <span
                  className="flex items-center gap-1 text-destructive"
                  title="Lignes sans coef palette ni estimation — charge réellement sous-estimée"
                >
                  <TriangleAlert size={13} strokeWidth={1.75} />
                  {stats.lignesSansCoef} coef manquant{stats.lignesSansCoef > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ═══ X3 injoignable ═══ */}
        {x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Erreur chargement réceptions :</span>
            <span className="truncate font-mono">{x3Error}</span>
          </div>
        )}

        {/* ═══ Vue ═══ */}
        {loading && !data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title="Calcul des réceptions…"
          />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
            <p className="text-sm font-medium text-foreground">Échec du calcul des réceptions.</p>
          </div>
        ) : (
          <div
            className={cn(
              'flex flex-1 flex-col overflow-hidden transition-opacity duration-150',
              loading && 'pointer-events-none opacity-50'
            )}
          >
            {hasContent ? (
              view === 'board' ? (
                <ReceptionBoard
                  rows={filteredRows}
                  from={viewData.range.from}
                  to={viewData.range.to}
                  groupBy={groupBy}
                  criticite={criticiteData?.items ?? []}
                  criticiteHorizon={criticiteData?.horizonDays ?? null}
                  criticiteOnly={criticiteOnly}
                />
              ) : view === 'tableau' ? (
                <ReceptionTableau
                  rows={filteredRows}
                  emptyState={
                    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                      <Inbox size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        {selectedDay
                          ? 'Aucune réception ce jour.'
                          : 'Aucune réception sur la période.'}
                      </p>
                    </div>
                  }
                />
              ) : (
                <ReceptionCalendrier
                  charge={charge}
                  selectedDay={selectedDay}
                  onSelectDay={(day) => {
                    setSelectedDay(day)
                    if (day) setView('tableau')
                  }}
                />
              )
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                {x3Error ? (
                  <CloudOff size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
                ) : (
                  <Package size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
                )}
                <p className="text-sm text-muted-foreground">
                  {x3Error
                    ? 'Données indisponibles (X3 injoignable).'
                    : 'Aucune réception planifiée sur la période.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══ Pied de page imprimé ═══
            `position: fixed` en contexte paginé = une occurrence par page :
            au-delà de la page 1 l'en-tête de jours n'est plus visible, ce
            rappel de période évite une feuille orpheline sur la table. */}
        <div
          data-print-footer
          className="hidden items-baseline justify-between border-t border-border bg-background px-6 pb-1 pt-1.5 font-mono text-[10px] text-muted-foreground"
        >
          <span>Réceptions fournisseurs · {printRange}</span>
          <span>Édité le {fmtDayFull(new Date())}</span>
        </div>
      </div>
    </AppLayout>
  )
}

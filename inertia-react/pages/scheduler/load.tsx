import { useEffect, useMemo, useRef, useState } from 'react'
import { TriangleAlert, Search } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'
import AppLayout from '@r/layouts/app'
import { cx } from '@r/lib/cx'
import type { LoadPageProps, LoadLine, LoadView } from '@r/lib/load/types'
import {
  type Gran,
  maskPeriod,
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

export default function Load(props: LoadPageProps) {
  const [view, setView] = useState<LoadView>('of')
  const [selected, setSelected] = useState(props.ofLines[0]?.code ?? '')
  const [gran, setGran] = useState<Gran>('month')
  const [query, setQuery] = useState('')
  const [showCapacity, setShowCapacity] = useState(true)
  const [showAvg, setShowAvg] = useState(false)
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(new Set())

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

  const [net, setNet] = useState(false)
  const viewNet = (l: LoadLine): LoadLine =>
    net ? { ...l, monthly: l.monthlyNet, weekly: l.weeklyNet } : l

  // Filtre de segments — un jeu par vue : la vue OF filtre des STATUTS
  // (Ferme/Planifié/Suggéré), la vue Commande des NATURES (Commande/Prévision).
  // Deux états séparés pour qu'une bascule de vue ne perde pas la sélection.
  const [ofStatus, setOfStatus] = useState<Set<string>>(new Set(['f', 'p', 's']))
  const [cmdNature, setCmdNature] = useState<Set<string>>(new Set(['commande', 'prevision']))
  const activeSegs = view === 'of' ? ofStatus : cmdNature
  const setActiveSegs = view === 'of' ? setOfStatus : setCmdNature

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

  const lines = useMemo(() => {
    const keep = segKeys(view, activeSegs)
    const base = (view === 'of' ? props.ofLines : props.cmdLines).map(viewNet)
    if (!segFiltered) return base
    return base
      .map((l) => ({
        ...l,
        monthly: l.monthly.map((p) => maskPeriod(p, keep)),
        weekly: l.weekly.map((p) => maskPeriod(p, keep)),
      }))
      // Un poste sans charge restante n'a plus rien à montrer : on le sort du
      // slider plutôt que d'afficher une carte plate à 0 h.
      .filter((l) => l.monthly.some((p) => total(p) > 0))
  }, [view, props.ofLines, props.cmdLines, net, activeSegs, segFiltered])

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
    return gran === 'month'
      ? line.monthly.map((d, i) => ({
          label: props.months[i] ?? '',
          d,
          cap: line.capacity.monthly[i] ?? 0,
        }))
      : line.weekly.map((d, i) => ({
          label: props.weeks[i] ?? '',
          d,
          cap: line.capacity.weekly[i] ?? 0,
        }))
  }, [selLine, gran, props.months, props.weeks])

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
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold not-italic text-brand">
            {props.rangeLabel}
          </div>
          <div>
            <b className="font-bold text-foreground">{lines.length}</b> postes de charge ·{' '}
            {view === 'of' ? 'charge OF' : 'charge commandes'}
          </div>
        </>
      }
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
          {/* Bascule Brut ↔ Net (vue commande) */}
          {view === 'commande' && (
            <Segment role="radiogroup" ariaLabel="Brut ou net">
              {(['brut', 'net'] as const).map((m) => (
                <SegmentButton
                  key={m}
                  role="radio"
                  active={(net ? 'net' : 'brut') === m}
                  title="Net = besoin − stock disponible (physique + CQ), consommé FIFO sur l'horizon"
                  onClick={() => setNet(m === 'net')}
                >
                  {m === 'brut' ? 'Brut' : 'Net'}
                </SegmentButton>
              ))}
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
                active={showCapacity}
                onClick={() => setShowCapacity((v) => !v)}
                title="Plafond de capacité nette + zones de surcharge"
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
                      months={props.months}
                      selected={selected === line.code}
                      showCapacity={showCapacity}
                      onSelect={() => setSelected(line.code)}
                    />
                  ))}
                </div>
                {/* Dégradés de bord */}
                <div
                  className={cx(
                    'pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent transition-opacity duration-200',
                    atStart && 'opacity-0'
                  )}
                />
                <div
                  className={cx(
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
                      <DynamicIcon name={selSaturation.rate > 100 ? 'warning' : 'speed'} size={14} />
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
                      className={cx(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                        gran === 'month'
                          ? 'bg-card text-brand'
                          : 'text-muted-foreground'
                      )}
                    >
                      Mois
                    </button>
                    <button
                      type="button"
                      onClick={() => setGran('week')}
                      className={cx(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                        gran === 'week'
                          ? 'bg-card text-brand'
                          : 'text-muted-foreground'
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
                  showCapacity={showCapacity}
                  showAvg={showAvg}
                  segs={visibleSegs}
                  onSelectPeriod={openPeriod}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Détail de la période cliquée. `activeSegs`/`net` sont passés tels
          quels : la table applique le MÊME masque que le graphe, donc son
          total suit la hauteur de la barre sans re-fetch au changement de
          filtre. */}
      <ChargePeriodSheet
        open={!!periodTarget}
        onOpenChange={(v) => !v && setPeriodTarget(null)}
        target={periodTarget}
        view={view}
        start={props.startIso}
        activeSegs={activeSegs}
        net={net}
      />
    </AppLayout>
  )
}

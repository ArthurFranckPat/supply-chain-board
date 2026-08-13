import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, TriangleAlert } from 'lucide-react'
import AppLayout from '@r/layouts/app'
import { Badge } from '@r/components/ui/badge'
import { Separator } from '@r/components/ui/separator'
import {
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarMetric,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import { cn } from '@r/lib/utils'
import type { LoadPageProps, LoadLine, LoadQtyMode, LoadView } from '@r/lib/load/types'
import { type Gran, maskPeriod, satRate, segKeys, segOptions, total } from '@r/lib/load/chart-math'
import { filterLoadLines } from '@r/lib/load/search'
import { HatchDefs } from '@r/components/load/hatch-defs'
import { MiniCard } from '@r/components/load/mini-card'
import { DetailChart } from '@r/components/load/detail-chart'
import { ChargePeriodSheet } from '@r/components/load/charge-period-sheet'

/**
 * Page « Projection de charge » — vision long terme, variante 3 « Charge par ligne »
 * (design/mockups/forecast/3-overview.html).
 *
 * Grille de mini-graphes (un par poste de charge) pour comparer d'un coup d'œil, +
 * panneau de détail (histogramme empilé Ferme/Planifié/Suggéré, moyenne mobile, pic)
 * sur le poste sélectionné, avec bascule de maille Mois ↔ Semaine. Données calculées
 * serveur (LoadController) ; ici, pure présentation réactive.
 *
 * Shell (état + toolbar + composition) — dérivations et rendu des graphes vivent
 * dans lib/load/chart-math.ts et components/load/*.tsx (issue #52).
 *
 * Design system cursor (§18) : la barre passe par la prop `toolbar` d'AppLayout,
 * qui porte le filet, le fond, l'axe `px-6` et la règle d'impression. Rendue en
 * enfant, elle fabriquait un quatrième bord gauche sur la page.
 */

/**
 * Les trois crans de quantité, dans l'ordre de la chaîne de déduction :
 * brut → net → reste. Les libellés d'aide sont volontairement explicites : sans
 * eux, « Net » et « Reste » se ressemblent trop pour qu'on devine ce qui a été
 * retiré, et un chiffre plus petit sans justification est pire qu'un chiffre faux.
 * Ils vivent en `title` sur le segment — c'est le seul endroit où ils restent
 * attachés au contrôle qu'ils expliquent.
 */
const QTY_MODES: { id: LoadQtyMode; label: string; long: string; hint: string }[] = [
  {
    id: 'brut',
    label: 'Brut',
    long: 'Brut',
    hint: 'Besoin explosé depuis les commandes, avant toute déduction',
  },
  {
    id: 'net',
    label: 'Net',
    long: 'Net',
    hint: "Brut − stock disponible (physique + CQ), consommé FIFO sur l'horizon",
  },
  {
    id: 'reste',
    label: 'Reste',
    long: 'Reste à produire',
    hint: 'Net − pièces déjà produites sur les OF en cours et pas encore déclarées',
  },
]

/**
 * Gravité de chip du filtre statut/nature.
 *
 * `ToolbarFilterChip` n'expose que quatre points (critical / warning / ok /
 * neutral) : « Planifié » retombe donc sur `ok`, comme « Ferme ». Ce n'est pas
 * une approximation sous thème cursor — `--planifie` et `--ferme` y valent la
 * même valeur (#007041, app.css) : les deux pastilles seraient identiques même
 * si le chip savait peindre la nuance.
 */
const SEG_CHIP_TONE: Record<string, 'ok' | 'warning'> = {
  f: 'ok',
  p: 'ok',
  s: 'warning',
  commande: 'ok',
  prevision: 'warning',
}

/** Ton de saturation — mêmes paliers que `satColor`, en tokens du thème. */
function saturationVariant(rate: number): 'destructive' | 'warning' | 'secondary' {
  if (rate > 100) return 'destructive'
  if (rate >= 85) return 'warning'
  return 'secondary'
}

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

  // Défaut « reste » : un planificateur ouvre la page pour savoir ce qu'il reste à
  // faire, pas ce que les commandes demandaient avant déduction. Les deux autres
  // crans restent accessibles — le brut sert à voir la demande nue, le net à
  // isoler ce que le stock absorbe.
  const [qtyMode, setQtyMode] = useState<LoadQtyMode>('reste')
  const viewNet = useCallback(
    (l: LoadLine): LoadLine =>
      qtyMode === 'net'
        ? { ...l, monthly: l.monthlyNet, weekly: l.weeklyNet }
        : qtyMode === 'reste'
          ? { ...l, monthly: l.monthlyReste, weekly: l.weeklyReste }
          : l,
    [qtyMode]
  )

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

  /** Postes de la vue courante, avant tout filtre — dénominateur des volumes. */
  const baseLines = view === 'of' ? props.ofLines : props.cmdLines

  const lines = useMemo(() => {
    const keep = segKeys(view, activeSegs)
    const base = baseLines.map(viewNet)
    if (!segFiltered) return base
    return (
      base
        .map((l) => ({
          ...l,
          monthly: l.monthly.map((p) => maskPeriod(p, keep)),
          weekly: l.weekly.map((p) => maskPeriod(p, keep)),
        }))
        // Un poste sans charge restante n'a plus rien à montrer : on le sort du
        // slider plutôt que d'afficher une carte plate à 0 h.
        .filter((l) => l.monthly.some((p) => total(p) > 0))
    )
  }, [view, baseLines, activeSegs, segFiltered, viewNet])

  const filteredLines = useMemo(
    () => filterLoadLines(lines, query, atelierFilter),
    [lines, query, atelierFilter]
  )

  /* ── Volumes du panneau de filtres ────────────────────────────────────────
     Une chip qui ne porte que son libellé ne rentabilise pas le clic qui ouvre
     le panneau : c'est le volume qui dit lequel des paliers pèse. On compte des
     POSTES concernés, pas des heures — c'est l'unité de la page (une carte =
     un poste), et une somme d'heures sans unité dans une chip de 22 px se lit
     comme un identifiant. */
  const segCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const o of segOptions(view)) {
      out[o.id] = baseLines.filter((l) =>
        l.monthly.some((p) => o.keys.reduce((s, k) => s + (p[k] ?? 0), 0) > 0)
      ).length
    }
    return out
  }, [view, baseLines])

  const atelierCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const l of baseLines) out[l.atelier] = (out[l.atelier] ?? 0) + 1
    return out
  }, [baseLines])

  /**
   * Filtres actifs = écart AU DÉFAUT, pas nombre de cases cochées. `activeSegs`
   * part TOUT actif : compter les coches afficherait « 3 filtres » sur une page
   * qui ne filtre rien. Les couches d'affichage (Capacité, Moyenne mobile) ne
   * comptent pas — elles ne retirent aucune donnée, et « Capacité » est allumée
   * par défaut : elle laisserait la pastille allumée en permanence.
   */
  const activeFilterCount = (segFiltered ? 1 : 0) + (atelierFilter.size > 0 ? 1 : 0)

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

  /* ── Barre d'outils (standard §18) ───────────────────────────────────────
     Zone 01 portée : la bascule de vue, le cran de quantité, puis l'horizon.
     Zone 02 : le déclencheur unique de filtres. Zone 03 : la recherche.
     Zone 04 : état puis action primaire. Cinq contrôles au plus — pas de
     conteneur `<Toolbar>` ici, la prop d'AppLayout en est déjà un. */
  const toolbar = (
    <>
      {/* ── Zone 01 · Portée : ce que la page montre ────────────────────── */}
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Vue">
          {(
            [
              ['of', 'OF', "Charge des ordres de fabrication, ventilée par statut d'ordre"],
              [
                'commande',
                'Commande',
                'Charge de la demande client, ventilée par nature (commande ferme ou prévision)',
              ],
            ] as const
          ).map(([v, label, title]) => (
            <ToolbarSegment key={v} active={view === v} title={title} onClick={() => setView(v)}>
              {label}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>

        {/* Brut / Net / Reste n'est PAS un filtre : aucun poste, aucune période
            ne disparaît — c'est la quantité mesurée qui change, donc ce que la
            page montre. Il reste en zone 01. Réservé à la vue commande : côté
            OF, la quantité est déjà déduite des pointages et les trois séries
            coïncident (load_payload_loader.ts) — le contrôle n'y ferait rien. */}
        {view === 'commande' && (
          <ToolbarSegmented semantics="tabs" aria-label="Quantité affichée">
            {QTY_MODES.map((m) => (
              <ToolbarSegment
                key={m.id}
                active={qtyMode === m.id}
                title={`${m.long} — ${m.hint}`}
                aria-label={m.long}
                onClick={() => setQtyMode(m.id)}
              >
                {m.label}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>
        )}

        {/* L'horizon est de la portée, mais il n'est pas réglable : le serveur
            le fixe à 6 mois pleins (NB_MONTHS) et la page n'expose aucun
            paramètre. Un `ToolbarDateWindow` promettrait un choix qui n'existe
            pas — c'est donc l'indicateur en lecture seule, à sa place en 01. */}
        <ToolbarMetric title="Horizon de projection, fixé par le serveur (6 mois pleins)">
          {props.rangeLabel}
        </ToolbarMetric>

        {/* ── Zone 02 · Filtres : un déclencheur, rien d'autre ──────────── */}
        <ToolbarFilterMenu activeCount={activeFilterCount} width={300}>
          {/* La vue OF ventile par STATUT d'ordre, la vue Commande par NATURE
              de demande : même filtre, deux vocabulaires métier. */}
          <ToolbarFilterSection>{view === 'of' ? 'Statut' : 'Nature'}</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            {/* « Tous » remplace le ✕ de réinitialisation fait main : c'est le
                défaut, il s'affiche donc comme un état et non comme un geste. */}
            <ToolbarFilterChip
              label="Tous"
              count={baseLines.length}
              tone="neutral"
              active={!segFiltered}
              onClick={() => setActiveSegs(new Set(segOptions(view).map((o) => o.id)))}
              title={`Tous les ${view === 'of' ? 'statuts' : 'natures'}`}
            />
            {segOptions(view).map((o) => (
              <ToolbarFilterChip
                key={o.id}
                label={o.label}
                count={segCounts[o.id]}
                tone={SEG_CHIP_TONE[o.id] ?? 'neutral'}
                active={activeSegs.has(o.id)}
                onClick={() => toggleSeg(o.id)}
                title={`${o.label} — ${segCounts[o.id] ?? 0} poste${(segCounts[o.id] ?? 0) > 1 ? 's' : ''} concerné${(segCounts[o.id] ?? 0) > 1 ? 's' : ''}`}
              />
            ))}
          </ToolbarSegmented>

          {/* Filtre atelier (#36) — chips STOLOC, transverse aux 2 vues. */}
          {props.ateliers.length > 0 && (
            <>
              <Separator className="my-2" />
              <ToolbarFilterSection>Atelier</ToolbarFilterSection>
              <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                <ToolbarFilterChip
                  label="Tous"
                  count={baseLines.length}
                  tone="neutral"
                  active={atelierFilter.size === 0}
                  onClick={() => setAtelierFilter(new Set())}
                  title="Tous les ateliers"
                />
                {props.ateliers.map((a) => (
                  <ToolbarFilterChip
                    key={a.code}
                    label={a.label.replace(/^ATELIER\s+/i, '')}
                    count={atelierCounts[a.code]}
                    tone="neutral"
                    active={atelierFilter.has(a.code)}
                    onClick={() => toggleAtelier(a.code)}
                    title={`${a.code} — ${a.label}`}
                  />
                ))}
              </ToolbarSegmented>
            </>
          )}

          {/* Couches d'affichage — pas des filtres (elles ne retirent aucune
              donnée), mais même déclencheur : la rangée n'a pas à porter des
              coches ad hoc. Pas de gravité non plus : ce sont des interrupteurs,
              pas des paliers de sévérité. */}
          <Separator className="my-2" />
          <ToolbarFilterSection>Affichage</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            <ToolbarSegment
              active={showCapacity}
              onClick={() => setShowCapacity((v) => !v)}
              title="Plafond de capacité nette + zones de surcharge"
            >
              Capacité
            </ToolbarSegment>
            <ToolbarSegment
              active={showAvg}
              onClick={() => setShowAvg((v) => !v)}
              title="Moyenne mobile de la charge totale"
            >
              Moyenne mobile
            </ToolbarSegment>
          </ToolbarSegmented>
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      {/* ── Zone 03 · Interrogation : jamais repliée sous « Filtres » ───── */}
      <ToolbarSearch value={query} onChange={setQuery} placeholder="Poste, article…" />
    </>
  )

  return (
    <AppLayout
      title="Charge · Projection"
      active="load"
      subtitle="Charge / Capacité"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      <HatchDefs />

      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1`/`h-full` du
          contenu en dessous ne se dimensionnent contre rien et débordent hors
          de l'écran sans scroll possible. */}
      <div className="flex h-full min-h-0 flex-col">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-10 text-center text-[14px] text-muted-foreground">
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
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-6 py-5">
            {/* Vue d'ensemble : slider horizontal de mini-cartes */}
            {filteredLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-rule px-4 py-6 text-center text-[13px] text-muted-foreground">
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
                      view={view}
                      selected={selected === line.code}
                      showCapacity={showCapacity}
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
              <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-rule bg-card p-4">
                <div className="mb-2.5 flex flex-none flex-wrap items-center gap-2.5">
                  {/* Échelle micro (app.css) : `text-sm` pour l'identité du
                      poste — haut de l'échelle d'interface déclarée — et
                      `text-xs` pour son libellé. Plus de serif : `font-fraunces`
                      est la grammaire Airbnb, elle sort avec le thème. */}
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 flex-none rounded-[3px]"
                      style={{ background: selLine.color }}
                    />
                    <span className="font-mono text-sm font-bold tracking-tight text-foreground">
                      {selLine.code}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{selLine.name}</span>
                  </div>
                  {selLine.atelier && <Badge variant="outline">{selLine.atelierLabel}</Badge>}
                  {/* Badge saturation (#35). La gravité vient du TAUX, pas de
                      `satColor()` : celui-ci rend `var(--color-danger)` /
                      `var(--color-warn)`, deux tokens qui n'existent dans aucune
                      feuille — la couleur retombait donc sur l'héritage et le
                      badge ne signalait rien. Mêmes paliers (>100 %, ≥85 %). */}
                  {selSaturation.cap > 0 && (
                    <Badge
                      variant={saturationVariant(selSaturation.rate)}
                      className="gap-1 font-mono tabular-nums"
                      title={`${selSaturation.charge} h de charge pour ${selSaturation.cap} h de capacité nette sur l'horizon`}
                    >
                      {selSaturation.rate > 100 ? (
                        <TriangleAlert size={12} strokeWidth={1.75} />
                      ) : (
                        <Gauge size={12} strokeWidth={1.75} />
                      )}
                      Saturation {Math.round(selSaturation.rate)} %
                      <span className="font-sans font-normal opacity-70">
                        ({selSaturation.charge} / {selSaturation.cap} h)
                      </span>
                    </Badge>
                  )}
                  {/* La maille reste ATTACHÉE au graphe qu'elle gouverne : elle
                      ne change que l'axe du détail (les mini-cartes sont toujours
                      mensuelles). Montée dans la rangée, elle aurait quitté son
                      objet et fait un sixième contrôle. */}
                  <ToolbarSegmented semantics="tabs" aria-label="Maille" className="ml-auto">
                    {(
                      [
                        ['month', 'Mois', "Axe mensuel sur les 6 mois de l'horizon"],
                        ['week', 'Semaine', 'Axe hebdomadaire — maille de séquencement'],
                      ] as const
                    ).map(([g, label, title]) => (
                      <ToolbarSegment
                        key={g}
                        active={gran === g}
                        title={title}
                        onClick={() => setGran(g)}
                      >
                        {label}
                      </ToolbarSegment>
                    ))}
                  </ToolbarSegmented>
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
        activeSegs={activeSegs}
        qtyMode={qtyMode}
      />
    </AppLayout>
  )
}

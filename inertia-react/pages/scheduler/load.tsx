import { useEffect, useMemo, useRef, useState } from 'react'
import { TriangleAlert, Search, Gauge } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'
import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import type { LoadPageProps, LoadLine, LoadView } from '@/lib/load/types'
import { type Gran, satColor, satRate, total } from '@/lib/load/chart-math'
import { HatchDefs } from '@r/components/load/hatch-defs'
import { MiniCard } from '@r/components/load/mini-card'
import { DetailChart } from '@r/components/load/detail-chart'

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

  const lines = useMemo(
    () => (view === 'of' ? props.ofLines : props.cmdLines).map(viewNet),
    [view, props.ofLines, props.cmdLines, net]
  )

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
          <div className="font-fraunces text-[12px] font-bold italic text-brand">
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

        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* Sélecteur de vue + légende */}
        <div className="flex flex-none flex-wrap items-center gap-3.5 border-b border-rule px-7 py-2 text-[12px] font-semibold text-secondary-foreground">
          {/* Bascule OF ↔ Commande */}
          <div className="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
            {(['of', 'commande'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  view === v
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v === 'of' ? 'OF' : 'Commande'}
              </button>
            ))}
          </div>
          {/* Bascule Brut ↔ Net (vue commande) */}
          {view === 'commande' && (
            <div
              className="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5"
              title="Net = besoin − stock disponible (physique + CQ), consommé FIFO sur l'horizon"
            >
              {(['brut', 'net'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNet(m === 'net')}
                  className={cn(
                    'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                    (net ? 'net' : 'brut') === m
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'brut' ? 'Brut' : 'Net'}
                </button>
              ))}
            </div>
          )}
          <span className="h-3.5 w-px bg-rule-soft" />
          {view === 'of' ? (
            <>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-3.5 rounded-[2px] bg-ferme" />
                Ferme
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-3.5 rounded-[2px] bg-planifie" />
                Planifié
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-3.5 rounded-[2px] bg-suggere" />
                Suggéré
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-3.5 rounded-[2px] bg-ferme" />
                Commande
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-3.5 rounded-[2px] bg-suggere" />
                Prévision
              </span>
            </>
          )}
          <span className="h-3.5 w-px bg-rule-soft" />
          {/* Couches optionnelles — déplacées à droite (actions d'affichage). */}
          <span className="flex items-center gap-1.5">
            <i
              className="inline-block h-2.5 w-3.5 rounded-[2px]"
              style={{
                background: 'color-mix(in srgb, var(--color-danger) 20%, transparent)',
                boxShadow: 'inset 0 0 0 1px var(--color-danger)',
              }}
            />
            Surcharge
          </span>
          <span className="ml-auto flex items-center gap-3">
            {/* Couches optionnelles — toggles d'affichage, à droite avec les actions. */}
            <button
              type="button"
              onClick={() => setShowCapacity((v) => !v)}
              className={cn('flex items-center gap-1.5 transition-opacity', !showCapacity && 'opacity-40')}
            >
              <DynamicIcon name={showCapacity ? 'check_box' : 'check_box_outline_blank'} size={16} className="text-brand" />
              <i className="inline-block w-[18px] border-t-[3px] border-foreground/70" />
              Capacité
            </button>
            <button
              type="button"
              onClick={() => setShowAvg((v) => !v)}
              className={cn('flex items-center gap-1.5 transition-opacity', !showAvg && 'opacity-40')}
            >
              <DynamicIcon name={showAvg ? 'check_box' : 'check_box_outline_blank'} size={16} className="text-brand" />
              <i className="inline-block w-[18px] border-t-[1.5px] border-dashed border-brand" />
              Moyenne mobile
            </button>
            {/* Recherche — systématiquement à droite (convention toolbar). */}
            <div className="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
              <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
              <input
                className="w-[190px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
                placeholder="Poste, article…"
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
              />
            </div>
            <span className="font-fraunces text-[11px] italic text-muted-foreground">
              Mini-graphes : {props.months.length} mois · clic = détail
            </span>
          </span>
        </div>

        {/* Filtre atelier (#36) */}
        {props.ateliers.length > 0 && (
          <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-rule px-7 py-2 text-[12px]">
            <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Atelier
            </span>
            {props.ateliers.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => toggleAtelier(a.code)}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold transition-colors',
                  atelierFilter.has(a.code)
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-rule bg-card text-muted-foreground hover:border-[#b3a47e] hover:text-foreground'
                )}
                title={a.code}
              >
                {a.label}
              </button>
            ))}
            {atelierFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setAtelierFilter(new Set())}
                className="ml-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            {view === 'of'
              ? "Aucune charge OF sur l'horizon."
              : "Aucune charge commande sur l'horizon."}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-7 py-5">
            {/* Vue d'ensemble : slider horizontal de mini-cartes */}
            {filteredLines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-rule px-4 py-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
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
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-rule bg-card p-4 shadow-[0_1px_2px_rgba(31,26,19,.05)]">
                <div className="mb-2.5 flex flex-none flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 font-fraunces text-[20px] font-extrabold tracking-tight">
                    <span className="size-3 rounded-[3px]" style={{ background: selLine.color }} />
                    {selLine.code}
                    <span className="font-sans text-[14px] font-medium text-muted-foreground">
                      · {selLine.name}
                    </span>
                  </div>
                  {selLine.atelier && (
                    <span className="rounded-full border border-rule bg-secondary px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
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
                      className={cn(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wide transition-colors',
                        gran === 'month'
                          ? 'bg-card text-brand shadow-[0_1px_2px_rgba(0,0,0,.08)]'
                          : 'text-muted-foreground'
                      )}
                    >
                      Mois
                    </button>
                    <button
                      type="button"
                      onClick={() => setGran('week')}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wide transition-colors',
                        gran === 'week'
                          ? 'bg-card text-brand shadow-[0_1px_2px_rgba(0,0,0,.08)]'
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
                />
              </div>
            )}
          </div>
        )}
    </AppLayout>
  )
}

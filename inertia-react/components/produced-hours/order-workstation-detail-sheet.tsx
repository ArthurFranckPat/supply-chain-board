import { useEffect, useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import {
  Layers,
  Search,
  LoaderCircle,
  Package,
  Calendar,
  Building2,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Segment, SegmentButton } from '@r/components/vision/toolbar'
import {
  formatDateFr,
  type OrderWorkstationDetailResponse,
  type OrderDateMode,
  type OrderDetailLine,
} from '@r/lib/produced-hours/types'

type TimelineGranularity = 'day' | 'week' | 'month'

interface AggregatedOrderPoint {
  key: string
  label: string
  tooltipLabel: string
  qty: number
  nbOrders: number
}

const MONTHS_SHORT_FR = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
]

const MONTHS_FULL_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

function getIsoWeekDetails(dateStr: string): { weekNum: number; year: number } {
  const parts = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const year = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { weekNum, year }
}

interface OrderWorkstationDetailSheetProps {
  poste: string | null
  from: string
  to: string
  dateMode: OrderDateMode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrderWorkstationDetailSheet({
  poste,
  from,
  to,
  dateMode,
  open,
  onOpenChange,
}: OrderWorkstationDetailSheetProps) {
  const [data, setData] = useState<OrderWorkstationDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<string>('ALL')
  const [granularity, setGranularity] = useState<TimelineGranularity>('day')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !poste) {
      setData(null)
      setError(null)
      setSearch('')
      setSelectedProduct('ALL')
      setGranularity('day')
      setHoveredKey(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setHoveredKey(null)

    const url = `/api/v1/heures-produites/orders-detail?poste=${encodeURIComponent(poste)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&dateMode=${encodeURIComponent(dateMode)}`

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Erreur ${res.status}`)
        }
        return res.json()
      })
      .then((json: OrderWorkstationDetailResponse) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, poste, from, to, dateMode])

  // Filtrage des lignes de commande par recherche et par produit sélectionné
  const filteredLines = useMemo(() => {
    if (!data?.lines) return []
    let lines = data.lines

    if (selectedProduct !== 'ALL') {
      lines = lines.filter((l) => l.article === selectedProduct)
    }

    const q = search.trim().toLowerCase()
    if (!q) return lines

    return lines.filter(
      (l) =>
        l.orderNum.toLowerCase().includes(q) ||
        l.clientCode.toLowerCase().includes(q) ||
        l.clientName.toLowerCase().includes(q) ||
        l.article.toLowerCase().includes(q) ||
        l.designation.toLowerCase().includes(q)
    )
  }, [data?.lines, search, selectedProduct])

  // Agrégation de la timeline selon la granularité sélectionnée (jour / semaine / mois)
  const aggregatedTimeline = useMemo<AggregatedOrderPoint[]>(() => {
    if (!data?.timeline?.length) return []

    if (granularity === 'day') {
      return data.timeline.map((pt) => ({
        key: pt.date,
        label: formatDateFr(pt.date).slice(0, 5),
        tooltipLabel: formatDateFr(pt.date),
        qty: pt.qty,
        nbOrders: pt.nbOrders,
      }))
    }

    if (granularity === 'week') {
      const map = new Map<string, AggregatedOrderPoint>()
      for (const pt of data.timeline) {
        const { weekNum, year } = getIsoWeekDetails(pt.date)
        const key = `${year}-W${String(weekNum).padStart(2, '0')}`
        const existing = map.get(key)
        if (existing) {
          existing.qty += pt.qty
          existing.nbOrders += pt.nbOrders
        } else {
          map.set(key, {
            key,
            label: `S${String(weekNum).padStart(2, '0')}`,
            tooltipLabel: `Semaine ${weekNum} (${year})`,
            qty: pt.qty,
            nbOrders: pt.nbOrders,
          })
        }
      }
      return Array.from(map.values()).map((p) => ({
        ...p,
        qty: Math.round(p.qty * 100) / 100,
      }))
    }

    // granularity === 'month'
    const map = new Map<string, AggregatedOrderPoint>()
    for (const pt of data.timeline) {
      const parts = pt.date.split('-').map(Number)
      const year = parts[0]
      const month = parts[1]
      const key = `${year}-${String(month).padStart(2, '0')}`
      const existing = map.get(key)
      if (existing) {
        existing.qty += pt.qty
        existing.nbOrders += pt.nbOrders
      } else {
        const mShort = MONTHS_SHORT_FR[month - 1] || `${month}`
        const mFull = MONTHS_FULL_FR[month - 1] || `${month}`
        map.set(key, {
          key,
          label: `${mShort} ${String(year).slice(2)}`,
          tooltipLabel: `${mFull} ${year}`,
          qty: pt.qty,
          nbOrders: pt.nbOrders,
        })
      }
    }
    return Array.from(map.values()).map((p) => ({
      ...p,
      qty: Math.round(p.qty * 100) / 100,
    }))
  }, [data?.timeline, granularity])

  const maxAggregatedQty = useMemo(() => {
    if (!aggregatedTimeline.length) return 1
    const m = Math.max(...aggregatedTimeline.map((d) => d.qty))
    return m > 0 ? m * 1.15 : 1
  }, [aggregatedTimeline])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 data-[side=right]:w-full data-[side=right]:sm:w-[760px] data-[side=right]:sm:max-w-[95vw] data-[side=right]:md:w-[900px] data-[side=right]:lg:w-[1080px] data-[side=right]:xl:w-[1200px] sm:border-l sm:border-rule"
      >
        {/* Header */}
        <SheetHeader className="border-b border-rule bg-surface-base px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-xl border border-rule bg-card text-brand shadow-xs">
              <Layers className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono text-lg font-bold text-foreground">
                  {poste}
                </SheetTitle>
                {data?.atelier && (
                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {data.atelier}
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    dateMode === 'demandee'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-emerald-50 text-emerald-700'
                  )}
                >
                  Date {dateMode === 'demandee' ? 'demandée' : 'acceptée'}
                </span>
              </div>
              <SheetDescription className="truncate text-xs text-muted-foreground">
                {data?.name || 'Chargement de la ligne...'} · Période du {formatDateFr(from)} au{' '}
                {formatDateFr(to)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <LoaderCircle className="size-7 animate-spin text-brand" />
              <span className="text-sm font-medium">
                Chargement des commandes clients depuis Sage X3...
              </span>
            </div>
          )}

          {error && (
            <div className="my-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="font-semibold">Erreur lors de la récupération des données</div>
              <div className="mt-1 text-xs text-red-600">{error}</div>
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              {/* Synthèse de la ligne */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-card p-3.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Total commandé :</span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    {data.kpis.totalQuantity.toLocaleString('fr-FR')} pcs
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Références PF (niveau 0) :</span>
                  <span className="font-mono font-bold text-foreground">
                    {data.kpis.nbProducts}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Commandes clients :</span>
                  <span className="font-mono font-bold text-foreground">{data.kpis.nbOrders}</span>
                </div>

                {data.kpis.topProduct && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Top référence :</span>
                    <span className="font-mono font-bold text-brand">
                      {data.kpis.topProduct.code}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      ({data.kpis.topProduct.quantity.toLocaleString('fr-FR')} pcs ·{' '}
                      {data.kpis.topProduct.sharePct}%)
                    </span>
                  </div>
                )}
              </div>

              {/* Timeline chart */}
              {data.timeline.length > 0 && (
                <div className="rounded-xl border border-rule bg-card p-4 shadow-xs">
                  <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Volume commandé{' '}
                        {granularity === 'day'
                          ? 'journalier'
                          : granularity === 'week'
                            ? 'hebdomadaire'
                            : 'mensuel'}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Segment ariaLabel="Maille d'affichage">
                        <SegmentButton
                          active={granularity === 'day'}
                          onClick={() => {
                            setGranularity('day')
                            setHoveredKey(null)
                          }}
                          title="Affichage par jour"
                        >
                          Jour
                        </SegmentButton>
                        <SegmentButton
                          active={granularity === 'week'}
                          onClick={() => {
                            setGranularity('week')
                            setHoveredKey(null)
                          }}
                          title="Affichage par semaine"
                        >
                          Semaine
                        </SegmentButton>
                        <SegmentButton
                          active={granularity === 'month'}
                          onClick={() => {
                            setGranularity('month')
                            setHoveredKey(null)
                          }}
                          title="Affichage par mois"
                        >
                          Mois
                        </SegmentButton>
                      </Segment>
                    </div>
                  </div>

                  {/* Zone de barres */}
                  <div className="w-full overflow-x-auto pb-1">
                    <div className="relative flex h-48 min-w-full items-end justify-between gap-1.5 border-b border-rule pt-4 pb-1">
                      {aggregatedTimeline.map((pt, index) => {
                        const hBar = Math.min(100, (pt.qty / maxAggregatedQty) * 100)
                        const isFew = aggregatedTimeline.length <= 6
                        const isMid = aggregatedTimeline.length <= 14
                        const barWidth = isFew ? 'w-8' : isMid ? 'w-5' : 'w-3.5'

                        const isHovered = hoveredKey === pt.key
                        const hasAnyHover = hoveredKey !== null

                        const isNearLeft =
                          index === 0 || (index === 1 && aggregatedTimeline.length > 3)
                        const isNearRight =
                          !isNearLeft &&
                          (index === aggregatedTimeline.length - 1 ||
                            (index === aggregatedTimeline.length - 2 &&
                              aggregatedTimeline.length > 3))

                        return (
                          <div
                            key={pt.key}
                            onMouseEnter={() => setHoveredKey(pt.key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            title={`${pt.tooltipLabel} : ${pt.qty.toLocaleString('fr-FR')} pièces (${pt.nbOrders} commandes)`}
                            className={cn(
                              'group relative flex h-full flex-1 min-w-[32px] cursor-pointer flex-col items-center justify-end transition-opacity duration-150',
                              hasAnyHover && !isHovered && 'opacity-40'
                            )}
                          >
                            {/* Popover Bubble */}
                            {isHovered && (
                              <div
                                className={cn(
                                  'pointer-events-none absolute bottom-[110px] z-30 flex flex-col whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-100',
                                  isNearLeft
                                    ? 'left-0 items-start'
                                    : isNearRight
                                      ? 'right-0 items-end'
                                      : 'left-1/2 -translate-x-1/2 items-center'
                                )}
                              >
                                <div className="rounded-lg border border-border bg-[#18181b] px-3 py-2 text-[11px] text-white shadow-xl">
                                  <div className="border-b border-white/20 pb-1 mb-1.5 font-semibold text-white">
                                    {pt.tooltipLabel}
                                  </div>
                                  <div className="space-y-1 font-mono text-[10px]">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-white/70">Quantité commandée :</span>
                                      <span className="font-bold text-white">
                                        {pt.qty.toLocaleString('fr-FR')} pcs
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-white/70">
                                      <span>Nombre de commandes :</span>
                                      <span className="font-bold text-white">{pt.nbOrders}</span>
                                    </div>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    '-mt-1 size-2 rotate-45 border-b border-r border-border bg-[#18181b]',
                                    isNearLeft ? 'ml-3.5' : isNearRight ? 'mr-3.5' : 'self-center'
                                  )}
                                />
                              </div>
                            )}

                            {/* Bar */}
                            <div className="flex h-24 w-full items-end justify-center">
                              <div
                                style={{ height: `${Math.max(6, Math.round(hBar))}%` }}
                                className={cn(
                                  barWidth,
                                  'rounded-t-sm bg-brand transition-all',
                                  isHovered && 'brightness-110 ring-2 ring-brand ring-offset-1'
                                )}
                              />
                            </div>

                            <span
                              className={cn(
                                'mt-1.5 font-mono text-[9px] whitespace-nowrap transition-colors',
                                isHovered ? 'font-bold text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {pt.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Sélecteur rapide d'article PF */}
              {data.products.length > 1 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Filtrer par référence produit fini
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct('ALL')}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                        selectedProduct === 'ALL'
                          ? 'border-brand bg-brand/10 font-bold text-brand'
                          : 'border-rule bg-card text-muted-foreground hover:border-brand/50 hover:text-foreground'
                      )}
                    >
                      Toutes ({data.products.length})
                    </button>
                    {data.products.map((p) => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() =>
                          setSelectedProduct(selectedProduct === p.code ? 'ALL' : p.code)
                        }
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors font-mono',
                          selectedProduct === p.code
                            ? 'border-brand bg-brand/10 font-bold text-brand'
                            : 'border-rule bg-card text-muted-foreground hover:border-brand/50 hover:text-foreground'
                        )}
                        title={`${p.name} · ${p.quantity.toLocaleString('fr-FR')} pcs (${p.sharePct}%)`}
                      >
                        <span>{p.code}</span>
                        <span className="ml-1.5 text-[10px] opacity-70">
                          {p.quantity.toLocaleString('fr-FR')} pcs
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lignes de commandes X3 */}
              <div className="rounded-xl border border-rule bg-card shadow-xs">
                <div className="flex flex-col gap-2 border-b border-rule p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Lignes de commandes clients ({filteredLines.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Détail issu des tables SORDERQ et SORDER pour les produits finis assemblés sur{' '}
                      {data.poste}
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filtrer commande, client, article..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 w-full rounded-md border border-rule bg-surface-base pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-left text-xs">
                    <thead className="border-b border-rule bg-surface-muted text-[11px] font-semibold text-muted-foreground">
                      <tr>
                        <th className="w-28 px-3 py-2.5 whitespace-nowrap">N° Commande</th>
                        <th className="w-24 px-3 py-2.5 whitespace-nowrap">Date demandée</th>
                        <th className="w-24 px-3 py-2.5 whitespace-nowrap">Date acceptée</th>
                        <th className="min-w-[160px] px-3 py-2.5">Client</th>
                        <th className="w-32 px-3 py-2.5 whitespace-nowrap">Article PF</th>
                        <th className="min-w-[180px] px-3 py-2.5">Désignation</th>
                        <th className="w-20 px-3 py-2.5 text-right whitespace-nowrap">Quantité</th>
                        <th className="w-24 px-3 py-2.5 text-center whitespace-nowrap">
                          Écart OTD
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule font-mono text-[11px]">
                      {filteredLines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-8 text-center text-xs text-muted-foreground"
                          >
                            Aucune ligne de commande trouvée pour cette sélection.
                          </td>
                        </tr>
                      ) : (
                        filteredLines.map((line, idx) => {
                          const isDelay = line.deltaDays > 0
                          const isAdvance = line.deltaDays < 0
                          const isOnTime = line.deltaDays === 0

                          return (
                            <tr
                              key={`${line.orderNum}-${line.orderLine}-${line.orderSeq}-${idx}`}
                              className="transition-colors hover:bg-surface-hover"
                            >
                              <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                                {line.orderNum}
                                {line.orderLine > 0 && (
                                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                    /{line.orderLine}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-sans">
                                {formatDateFr(line.dateDemandee) || '—'}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-sans">
                                {formatDateFr(line.dateAcceptee) || '—'}
                              </td>
                              <td className="px-3 py-2 font-sans text-foreground">
                                <div className="font-semibold text-xs truncate max-w-[200px]">
                                  {line.clientName || line.clientCode}
                                </div>
                                {line.clientName && line.clientCode && (
                                  <div className="font-mono text-[10px] text-muted-foreground">
                                    {line.clientCode}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">
                                {line.article}
                              </td>
                              <td
                                className="max-w-[220px] truncate px-3 py-2 font-sans text-muted-foreground text-xs"
                                title={line.designation}
                              >
                                {line.designation || '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-foreground whitespace-nowrap">
                                {line.quantity.toLocaleString('fr-FR')}
                              </td>
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                {line.dateDemandee && line.dateAcceptee ? (
                                  isOnTime ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      Conforme
                                    </span>
                                  ) : isDelay ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      +{line.deltaDays}j
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                      {line.deltaDays}j
                                    </span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

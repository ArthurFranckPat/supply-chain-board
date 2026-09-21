import { useMemo, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronsDownUp,
  Package,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@r/lib/utils'
import type {
  SubAssemblyWorkstationGroup,
  SubAssemblyItem,
  SubAssemblyPfContribution,
  LoadQtyMode,
  LoadUnit,
} from '@r/lib/load/types'
import type { Gran } from '@r/lib/load/chart-math'

interface SubAssemblyClpViewProps {
  groups: SubAssemblyWorkstationGroup[]
  months: string[]
  weeks: string[]
  gran: Gran
  unit: LoadUnit
  qtyMode: LoadQtyMode
  query: string
}

const formatCell = (val: number | undefined, unit: LoadUnit): string => {
  if (val === undefined || val <= 0) return '—'
  const rounded = unit === 'u' ? Math.round(val) : Math.round(val * 10) / 10
  if (rounded <= 0) return '—'
  return rounded.toLocaleString('fr-FR')
}

export function SubAssemblyClpView({
  groups,
  months,
  weeks,
  gran,
  unit,
  qtyMode,
  query,
}: SubAssemblyClpViewProps) {
  const periods = gran === 'month' ? months : weeks

  // Clé d'un SE pour le dépliage : "wst:article"
  const itemKey = (wst: string, article: string) => `${wst}:${article}`

  // Dépliage des postes : tous dépliés par défaut
  const [collapsedWst, setCollapsedWst] = useState<Set<string>>(new Set())
  // Dépliage des articles SE (pour voir les PF parents)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleWst = (wst: string) => {
    setCollapsedWst((prev) => {
      const next = new Set(prev)
      if (next.has(wst)) next.delete(wst)
      else next.add(wst)
      return next
    })
  }

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Filtrage selon query
  const q = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!q) return groups

    return groups
      .map((g) => {
        const wstMatches = g.wst.toLowerCase().includes(q) || g.wstLabel.toLowerCase().includes(q)

        const matchingItems = g.items.filter((it) => {
          if (wstMatches) return true
          const itMatches =
            it.article.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)
          if (itMatches) return true
          return it.parents.some(
            (p) =>
              p.pfArticle.toLowerCase().includes(q) || p.pfDescription.toLowerCase().includes(q)
          )
        })

        if (matchingItems.length === 0) return null

        return {
          ...g,
          items: matchingItems,
        }
      })
      .filter((g): g is SubAssemblyWorkstationGroup => g !== null)
  }, [groups, q])

  // Statistiques rapides
  const totalWstCount = filteredGroups.length
  const totalItemCount = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.items.length, 0),
    [filteredGroups]
  )

  const handleExpandAll = () => {
    setCollapsedWst(new Set())
    const all = new Set<string>()
    for (const g of filteredGroups) {
      for (const it of g.items) {
        all.add(itemKey(g.wst, it.article))
      }
    }
    setExpandedItems(all)
  }

  const handleCollapseAll = () => {
    setExpandedItems(new Set())
  }

  // Helper pour extraire les séries de nombres de l'item selon unit, gran, qtyMode
  const getItemSeries = (it: SubAssemblyItem): number[] => {
    if (unit === 'u') {
      const b = gran === 'month' ? it.monthlyQty : it.weeklyQty
      return b[qtyMode] ?? []
    }
    const b = gran === 'month' ? it.monthlyHours : it.weeklyHours
    return b[qtyMode] ?? []
  }

  // Helper pour extraire les séries d'un parent PF
  const getParentSeries = (p: SubAssemblyPfContribution): number[] => {
    if (unit === 'u') {
      return gran === 'month' ? p.monthlyQty : p.weeklyQty
    }
    return gran === 'month' ? p.monthlyHours : p.weeklyHours
  }

  // Helper pour extraire les séries totales d'un groupe poste
  const getGroupSeries = (g: SubAssemblyWorkstationGroup): number[] => {
    if (unit === 'u') {
      const b = gran === 'month' ? g.monthlyQty : g.weeklyQty
      return b[qtyMode] ?? []
    }
    const b = gran === 'month' ? g.monthlyHours : g.weeklyHours
    return b[qtyMode] ?? []
  }

  return (
    <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-card">
      {/* Barre d'outils secondaire de la vue sous-ensembles */}
      <div className="flex flex-none min-w-0 w-full items-center justify-between border-b border-rule bg-muted/40 px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded bg-brand/10 text-brand">
              <Layers size={14} />
            </span>
            <span className="font-semibold text-xs text-foreground whitespace-nowrap">
              Besoins Sous-ensembles CLP (PF → SE niveau 1)
            </span>
          </div>
          <span className="truncate font-mono text-2xs text-muted-foreground">
            {totalWstCount} poste{totalWstCount > 1 ? 's' : ''} · {totalItemCount} sous-ensemble
            {totalItemCount > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleExpandAll}
            className="inline-flex items-center gap-1 rounded border border-rule bg-background px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            title="Déplier tous les sous-ensembles pour voir les PF"
          >
            <ChevronsUpDown size={13} />
            <span>Tout déplier</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="inline-flex items-center gap-1 rounded border border-rule bg-background px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            title="Replier tous les sous-ensembles"
          >
            <ChevronsDownUp size={13} />
            <span>Tout replier</span>
          </button>
        </div>
      </div>

      {/* Table matrice */}
      <div className="min-h-0 min-w-0 w-full flex-1 overflow-auto">
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center font-fraunces text-sm italic text-muted-foreground">
            {q
              ? `Aucun sous-ensemble ni poste ne correspond à « ${query} ».`
              : 'Aucun besoin en sous-ensemble CLP sur l’horizon sélectionné.'}
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            {/* En-tête des colonnes */}
            <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur">
              <tr className="border-b border-rule">
                <th className="sticky left-0 z-30 w-[380px] min-w-[380px] max-w-[380px] border-b border-r border-rule bg-background px-4 py-2.5 font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                  Poste / Sous-ensemble / PF
                </th>
                <th className="w-[110px] min-w-[110px] max-w-[110px] border-b border-r border-rule bg-background px-3 py-2.5 text-right font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                  Stock / En-cours
                </th>
                {periods.map((p, idx) => {
                  const isRetard = p.toLowerCase().includes('retard')
                  return (
                    <th
                      key={`${p}-${idx}`}
                      className={cn(
                        'w-[75px] min-w-[75px] border-b border-r border-rule/60 bg-background px-2.5 py-2.5 text-right font-mono text-3xs font-bold uppercase tracking-wider',
                        isRetard ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {p}
                    </th>
                  )
                })}
                <th className="w-[90px] min-w-[90px] border-b border-rule bg-background px-3 py-2.5 text-right font-mono text-3xs font-bold uppercase tracking-wider text-foreground">
                  Total {unit === 'u' ? 'pièces' : 'heures'}
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredGroups.map((group) => {
                const isWstCollapsed = collapsedWst.has(group.wst)
                const groupSeries = getGroupSeries(group)
                const groupTotal = groupSeries.reduce((s, x) => s + x, 0)

                return (
                  <WorkstationSection
                    key={group.wst}
                    group={group}
                    periods={periods}
                    unit={unit}
                    isCollapsed={isWstCollapsed}
                    onToggleWst={() => toggleWst(group.wst)}
                    groupSeries={groupSeries}
                    groupTotal={groupTotal}
                    expandedItems={expandedItems}
                    onToggleItem={toggleItem}
                    itemKey={itemKey}
                    getItemSeries={getItemSeries}
                    getParentSeries={getParentSeries}
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface WorkstationSectionProps {
  group: SubAssemblyWorkstationGroup
  periods: string[]
  unit: LoadUnit
  isCollapsed: boolean
  onToggleWst: () => void
  groupSeries: number[]
  groupTotal: number
  expandedItems: Set<string>
  onToggleItem: (key: string) => void
  itemKey: (wst: string, article: string) => string
  getItemSeries: (it: SubAssemblyItem) => number[]
  getParentSeries: (p: SubAssemblyPfContribution) => number[]
}

function WorkstationSection({
  group,
  periods,
  unit,
  isCollapsed,
  onToggleWst,
  groupSeries,
  groupTotal,
  expandedItems,
  onToggleItem,
  itemKey,
  getItemSeries,
  getParentSeries,
}: WorkstationSectionProps) {
  return (
    <>
      {/* Ligne d'en-tête du poste de charge */}
      <tr className="bg-muted/70 font-semibold text-xs text-foreground transition-colors hover:bg-muted">
        <td
          className="sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px] cursor-pointer border-b border-r border-rule bg-muted px-4 py-2"
          onClick={onToggleWst}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-muted-foreground transition-transform">
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </span>
            <span className="shrink-0 font-mono text-xs font-bold text-foreground">
              {group.wst}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-2xs text-muted-foreground">
              {group.wstLabel}
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap rounded bg-background/80 px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
              {group.items.length} SE
            </span>
          </div>
        </td>

        <td className="w-[110px] min-w-[110px] max-w-[110px] border-b border-r border-rule px-3 py-2 text-right font-mono text-2xs text-muted-foreground">
          —
        </td>

        {periods.map((p, idx) => {
          const val = groupSeries[idx]
          return (
            <td
              key={`${group.wst}-${p}-${idx}`}
              className="w-[75px] min-w-[75px] border-b border-r border-rule/50 px-2.5 py-2 text-right font-mono text-2xs font-semibold tabular-nums text-foreground"
            >
              {formatCell(val, unit)}
            </td>
          )
        })}

        <td className="w-[90px] min-w-[90px] border-b border-rule px-3 py-2 text-right font-mono text-2xs font-bold tabular-nums text-foreground">
          {formatCell(groupTotal, unit)}
        </td>
      </tr>

      {/* Lignes des sous-ensembles sous ce poste */}
      {!isCollapsed &&
        group.items.map((it) => {
          const itKey = itemKey(group.wst, it.article)
          const isItemExpanded = expandedItems.has(itKey)
          const series = getItemSeries(it)
          const itemTotal = series.reduce((s, x) => s + x, 0)

          return (
            <SubAssemblyRow
              key={itKey}
              wst={group.wst}
              item={it}
              periods={periods}
              unit={unit}
              series={series}
              itemTotal={itemTotal}
              isExpanded={isItemExpanded}
              onToggle={() => onToggleItem(itKey)}
              getParentSeries={getParentSeries}
            />
          )
        })}
    </>
  )
}

interface SubAssemblyRowProps {
  wst: string
  item: SubAssemblyItem
  periods: string[]
  unit: LoadUnit
  series: number[]
  itemTotal: number
  isExpanded: boolean
  onToggle: () => void
  getParentSeries: (p: SubAssemblyPfContribution) => number[]
}

function SubAssemblyRow({
  item,
  periods,
  unit,
  series,
  itemTotal,
  isExpanded,
  onToggle,
  getParentSeries,
}: SubAssemblyRowProps) {
  const hasParents = item.parents.length > 0

  return (
    <>
      <tr className="border-b border-rule/60 transition-colors hover:bg-muted/30">
        <td
          className={cn(
            'sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px] border-b border-r border-rule bg-card px-4 py-2 text-xs',
            hasParents ? 'cursor-pointer' : ''
          )}
          onClick={hasParents ? onToggle : undefined}
        >
          <div className="flex min-w-0 items-center gap-2 pl-3">
            {hasParents ? (
              <span className="shrink-0 text-muted-foreground transition-transform hover:text-foreground">
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            ) : (
              <span className="size-[13px] shrink-0" />
            )}

            <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
              {item.article}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-normal text-2xs text-muted-foreground"
              title={item.description}
            >
              {item.description}
            </span>

            {hasParents && (
              <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-brand/10 px-1.5 py-0.5 font-mono text-3xs font-medium text-brand">
                {item.parents.length} PF
              </span>
            )}
          </div>
        </td>

        <td className="w-[110px] min-w-[110px] max-w-[110px] border-b border-r border-rule px-3 py-2 text-right font-mono text-3xs tabular-nums text-muted-foreground">
          <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
            <span title="Stock disponible (physique + CQ)">
              Stk: <span className="font-semibold text-foreground">{item.stock}</span>
            </span>
            {item.encours > 0 && (
              <span title="En-cours déjà produit non déclaré" className="text-brand">
                Enc: <span className="font-semibold text-brand">{item.encours}</span>
              </span>
            )}
          </div>
        </td>

        {periods.map((p, idx) => {
          const val = series[idx]
          const isZero = !val || val <= 0
          return (
            <td
              key={`${item.article}-${p}-${idx}`}
              className={cn(
                'w-[75px] min-w-[75px] border-b border-r border-rule/40 px-2.5 py-2 text-right font-mono text-2xs tabular-nums',
                isZero ? 'text-muted-foreground/30' : 'font-medium text-foreground'
              )}
            >
              {formatCell(val, unit)}
            </td>
          )
        })}

        <td className="w-[90px] min-w-[90px] border-b border-rule px-3 py-2 text-right font-mono text-2xs font-semibold tabular-nums text-foreground">
          {formatCell(itemTotal, unit)}
        </td>
      </tr>

      {/* Lignes enfants : Produits Finis parents (PF => SE niveau 1) */}
      {isExpanded &&
        item.parents.map((p) => {
          const pSeries = getParentSeries(p)
          const pTotal = pSeries.reduce((s, x) => s + x, 0)

          return (
            <tr
              key={`${item.article}-pf-${p.pfArticle}`}
              className="border-b border-rule/30 bg-muted/15 transition-colors hover:bg-muted/25"
            >
              <td className="sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px] border-b border-r border-rule bg-background px-4 py-1.5 text-2xs">
                <div className="flex min-w-0 items-center gap-2 pl-7">
                  <ArrowRight size={11} className="shrink-0 text-muted-foreground/60" />
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-3xs font-semibold uppercase text-muted-foreground">
                    PF
                  </span>
                  <span className="shrink-0 font-mono text-2xs font-medium text-foreground">
                    {p.pfArticle}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-3xs text-muted-foreground"
                    title={p.pfDescription}
                  >
                    {p.pfDescription}
                  </span>
                  <span className="ml-auto shrink-0 whitespace-nowrap rounded bg-card px-1 py-0.5 font-mono text-3xs text-muted-foreground shadow-2xs">
                    ×{p.linkQuantity}
                  </span>
                </div>
              </td>

              <td className="w-[110px] min-w-[110px] max-w-[110px] border-b border-r border-rule px-3 py-1.5 text-right font-mono text-3xs text-muted-foreground/40">
                —
              </td>

              {periods.map((per, idx) => {
                const val = pSeries[idx]
                const isZero = !val || val <= 0
                return (
                  <td
                    key={`${item.article}-${p.pfArticle}-${per}-${idx}`}
                    className={cn(
                      'w-[75px] min-w-[75px] border-b border-r border-rule/30 px-2.5 py-1.5 text-right font-mono text-3xs tabular-nums',
                      isZero ? 'text-muted-foreground/25' : 'text-foreground/80'
                    )}
                  >
                    {formatCell(val, unit)}
                  </td>
                )
              })}

              <td className="w-[90px] min-w-[90px] border-b border-rule px-3 py-1.5 text-right font-mono text-3xs tabular-nums text-foreground/80">
                {formatCell(pTotal, unit)}
              </td>
            </tr>
          )
        })}
    </>
  )
}

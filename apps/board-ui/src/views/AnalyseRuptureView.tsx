import { useState, useEffect, useCallback, Fragment } from 'react'
import { apiClient, ApiError } from '@/api/client'
import { Pill } from '@/components/ui/pill'
import { Segmented } from '@/components/ui/segmented'
import { LoadingInline, LoadingError, LoadingEmpty } from '@/components/ui/loading'
import type { AnalyseRuptureResponse, PoolContrib } from '@/types/analyse-rupture'
import {
  Search, AlertTriangle, Factory, Truck,
  ChevronDown, ChevronRight, Package, Layers, Loader2,
  Boxes, CircleCheck,
} from 'lucide-react'

/** Pool breakdown as a collapsible tree: Composant → SF → PF */
function PoolTree({ repartition }: { repartition: PoolContrib[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Build adjacency: parent_article → children
  const byParent = new Map<string, PoolContrib[]>()
  const roots: PoolContrib[] = []
  for (const p of repartition) {
    if (!p.parent_article) {
      roots.push(p)
    } else {
      const siblings = byParent.get(p.parent_article) ?? []
      siblings.push(p)
      byParent.set(p.parent_article, siblings)
    }
  }

  function toggle(article: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(article)) next.delete(article)
      else next.add(article)
      return next
    })
  }

  const totalPool = repartition.reduce((s, p) => s + p.contribution, 0)

  const catColor: Record<string, string> = {
    COMPOSANT: 'bg-muted text-muted-foreground',
    SF: 'bg-primary/10 text-primary',
    PF: 'bg-green-500/10 text-green-700',
  }

  function renderNode(node: PoolContrib, depth: number) {
    const children = byParent.get(node.article) ?? []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(node.article)
    const contribPct = totalPool > 0 ? (node.contribution / totalPool) * 100 : 0

    return (
      <Fragment key={node.article}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 cursor-pointer group"
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => hasChildren && toggle(node.article)}
        >
          {/* Expand/collapse icon */}
          {hasChildren ? (
            isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <span className="font-mono font-semibold text-[12px]">{node.article}</span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{node.description}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${catColor[node.categorie] ?? 'bg-muted text-muted-foreground'}`}>
            {node.categorie}
          </span>

          {/* Contribution bar + number */}
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/30 group-hover:bg-foreground/50 transition-colors"
                style={{ width: `${Math.min(100, contribPct)}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold tabular-nums w-10 text-right">{Math.round(node.contribution)}</span>
          </span>
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl px-[18px] py-[14px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
          Pool ({repartition.length} articles)
        </span>
        <span className="text-[11px] font-mono font-bold tabular-nums">
          Total {Math.round(totalPool)}
        </span>
      </div>
      <div className="space-y-0.5">
        {roots.map((r) => renderNode(r, 0))}
      </div>
    </div>
  )
}

export function AnalyseRuptureView() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyseRuptureResponse | null>(null)
  const [expandedOfs, setExpandedOfs] = useState<Set<number>>(new Set())
  const [expandedOrphans, setExpandedOrphans] = useState(false)
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set())
  const [demandFilter, setDemandFilter] = useState<'fermes' | 'tout'>('fermes')
  const [stockFilter, setStockFilter] = useState<'immediat' | 'projeté'>('immediat')
  const [usePool, setUsePool] = useState(true)
  const [mergeBranches, setMergeBranches] = useState(true)
  const [includeSf, setIncludeSf] = useState(true)
  const [includePf, setIncludePf] = useState(false)

  const handleAnalyze = useCallback(async (codeOverride?: string) => {
    const code = (codeOverride ?? query).trim()
    if (!code) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await apiClient.analyserRupture(code, {
        include_previsions: demandFilter === 'tout',
        include_receptions: stockFilter === 'projeté',
        use_pool: usePool,
        merge_branches: mergeBranches,
        include_sf: includeSf,
        include_pf: includePf,
      })
      setResult(data)
      setExpandedOfs(new Set())
      setExpandedBranches(new Set())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'analyse")
    } finally {
      setLoading(false)
    }
  }, [query, demandFilter, stockFilter, usePool, mergeBranches, includeSf, includePf])

  // Re-analyze automatically when filters change (if we already have a result)
  useEffect(() => {
    if (result) {
      handleAnalyze()
    }
  }, [demandFilter, stockFilter, usePool, mergeBranches, includeSf, includePf]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleOfs(index: number) {
    setExpandedOfs((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function fmtDate(iso: string): string {
    try {
      const d = new Date(iso)
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    } catch {
      return iso
    }
  }

  function toggleBranch(key: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function groupedByBranch() {
    const map = new Map<string, { cmd: (typeof result.commandes_bloquees)[number]; idx: number }[]>()
    const cmds = result!.commandes_bloquees
    for (let idx = 0; idx < cmds.length; idx++) {
      const cmd = cmds[idx]
      const key = cmd.branch_key ?? '(Autres)'
      const group = map.get(key) ?? []
      group.push({ cmd, idx })
      map.set(key, group)
    }
    return map
  }

  function getSfDescription(branchKey: string): string {
    if (!result) return ''
    const contrib = result.component.pool_repartition.find((p) => p.article === branchKey)
    return contrib?.description ?? ''
  }

  const isProjected = stockFilter === 'projeté'

  return (
    <div className="space-y-3 max-w-5xl">
      {/* ── Search + controls bar ──────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl px-[18px] py-[14px]">
        {/* Row 1: Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="Code composant (ex: E7368)"
              className="w-full h-9 pl-10 pr-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => handleAnalyze()}
            disabled={loading || !query.trim()}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Analyser
          </button>
        </div>

        {/* Row 2: Options grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Demande</span>
            <Segmented
              value={demandFilter}
              onChange={(v) => setDemandFilter(v as 'fermes' | 'tout')}
              options={[
                { value: 'fermes', label: 'Fermes' },
                { value: 'tout', label: 'Tout' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Stock</span>
            <Segmented
              value={stockFilter}
              onChange={(v) => setStockFilter(v as 'immediat' | 'projeté')}
              options={[
                { value: 'immediat', label: 'Immediat' },
                { value: 'projeté', label: 'Projete' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Source</span>
            <Segmented
              value={usePool ? 'pool' : 'stock'}
              onChange={(v) => setUsePool(v === 'pool')}
              options={[
                { value: 'pool', label: 'Pool' },
                { value: 'stock', label: 'Stock' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Branches</span>
            <Segmented
              value={mergeBranches ? 'merge' : 'split'}
              onChange={(v) => setMergeBranches(v === 'merge')}
              options={[
                { value: 'merge', label: 'Fusion' },
                { value: 'split', label: 'Split' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">SF</span>
            <Segmented
              value={includeSf ? 'oui' : 'non'}
              onChange={(v) => setIncludeSf(v === 'oui')}
              options={[
                { value: 'oui', label: 'Oui' },
                { value: 'non', label: 'Non' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">PF</span>
            <Segmented
              value={includePf ? 'oui' : 'non'}
              onChange={(v) => setIncludePf(v === 'oui')}
              options={[
                { value: 'oui', label: 'Oui' },
                { value: 'non', label: 'Non' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Loading state ──────────────────────────────────── */}
      {loading && (
        <LoadingInline label="analyse de rupture" sublabel="Remontee de la nomenclature..." />
      )}

      {/* ── Error state ────────────────────────────────────── */}
      {error && !loading && (
        <LoadingError message={error} onRetry={() => handleAnalyze()} />
      )}

      {/* ── Empty state ────────────────────────────────────── */}
      {!result && !loading && !error && (
        <LoadingEmpty
          message="Recherchez un composant pour analyser son impact de rupture."
          icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
        />
      )}

      {/* ── Results ────────────────────────────────────────── */}
      {result && !loading && (
        <>
          {/* Component info */}
          <div className="bg-card border border-border rounded-2xl px-[18px] py-[14px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="block text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                  Composant
                </span>
                <p className="text-base font-bold">{result.component.code}</p>
                <p className="text-[12px] text-muted-foreground">{result.component.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone="default" icon={<Package className="h-3 w-3" />} mono>
                  Stock {result.component.stock_physique}
                </Pill>
                <Pill tone="warn" mono>
                  Alloue {result.component.stock_alloue}
                </Pill>
                <Pill tone="good" mono>
                  Dispo {isProjected ? result.component.stock_disponible_projete : result.component.stock_disponible}
                </Pill>
                {(isProjected ? result.component.deficit_projete : result.component.deficit) > 0 && (
                  <Pill tone="danger" mono>
                    Deficit {isProjected ? result.component.deficit_projete : result.component.deficit}
                  </Pill>
                )}
              </div>
            </div>
          </div>

          {/* KPI pills row */}
          <div className="flex items-center gap-2">
            <Pill tone="danger" icon={<AlertTriangle className="h-3 w-3" />} mono>
              {result.summary.total_blocked_ofs} OFs bloques
            </Pill>
            <Pill tone="warn" icon={<Truck className="h-3 w-3" />} mono>
              {result.summary.total_affected_orders} cmd impactees
            </Pill>
            <Pill tone="primary" icon={<Factory className="h-3 w-3" />} mono>
              {result.summary.affected_lines.length} lignes
            </Pill>
            <Pill tone="good" icon={<Layers className="h-3 w-3" />} mono>
              Pool {Math.round(result.component.pool_total)}
            </Pill>
            {result.summary.truncated && (
              <Pill tone="warn" icon={<Layers className="h-3 w-3" />}>
                Resultat tronque
              </Pill>
            )}
          </div>

          {/* Pool breakdown - tree view */}
          {result.component.pool_repartition.filter((p) => p.contribution !== 0).length > 0 && (
            <PoolTree repartition={result.component.pool_repartition.filter((p) => p.contribution !== 0)} />
          )}

          {/* Commandes bloquees */}
          <div className="space-y-2">
            <span className="block text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono px-1">
              Commandes bloquees ({result.commandes_bloquees.length})
            </span>

            {result.merge_branches ? (
              /* ── MERGE MODE: flat card list ── */
              result.commandes_bloquees.map((cmd, index) => {
                const poolTotal = cmd.branch_pool_total ?? (result.component.pool_total || 1)
                const poolPct = Math.max(0, Math.min(100, (cmd.proj_pool / poolTotal) * 100))
                const barColor = cmd.etat === 'RUPTURE'
                  ? 'bg-destructive'
                  : 'bg-green-500'
                return (
                  <div key={`${cmd.num_commande}-${cmd.branch_key ?? index}`} className="bg-card border border-border rounded-2xl overflow-hidden">
                    {/* Header row */}
                    <div className="px-[18px] py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-[12px]">{cmd.num_commande}</span>
                        <span className="font-semibold text-[12px] truncate">{cmd.client}</span>
                        <span className="text-[11px] text-muted-foreground">{cmd.article}</span>
                        <Pill tone="outline">{cmd.type_commande}</Pill>
                        {cmd.nature === 'PREVISION' && (
                          <Pill tone="warn">Prevision</Pill>
                        )}
                        {cmd.branch_key && (
                          <Pill tone="outline">{cmd.branch_key}</Pill>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDate(cmd.date_expedition)}</span>
                        {cmd.etat && (
                          <Pill tone={cmd.etat === 'RUPTURE' ? 'danger' : 'good'} mono>
                            {cmd.etat}
                          </Pill>
                        )}
                      </div>
                    </div>

                    {/* Critical path - always visible */}
                    {cmd.chemin_impact.length > 1 && (
                      <div className="px-[18px] pb-1.5">
                        <div className="flex items-center gap-0 flex-wrap">
                          {cmd.chemin_impact.map((code, i) => {
                            const isLast = i === cmd.chemin_impact.length - 1
                            const isFirst = i === 0
                            return (
                              <span key={i} className="flex items-center gap-0">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  isFirst
                                    ? 'bg-foreground/10 text-foreground font-semibold'
                                    : isLast
                                      ? 'bg-destructive/10 text-destructive font-semibold'
                                      : 'bg-muted text-muted-foreground'
                                }`}>
                                  {code}
                                </span>
                                {!isLast && (
                                  <span className="mx-0.5 text-[9px] text-muted-foreground/40">&rsaquo;</span>
                                )}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Metrics row */}
                    <div className="px-[18px] pb-3 flex items-center gap-4">
                      {/* Qte */}
                      <div className="w-16 shrink-0 text-center">
                        <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Qte</span>
                        <span className="block text-[16px] font-mono font-bold tabular-nums leading-tight">{cmd.qte_restante}</span>
                      </div>

                      <div className="w-px h-8 bg-border shrink-0" />

                      {/* Impact composant */}
                      <div className="w-20 shrink-0 text-center">
                        <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Impact</span>
                        <span className="block text-[16px] font-mono font-bold tabular-nums leading-tight text-destructive">
                          -{Math.round(cmd.qte_impact_composant)}
                        </span>
                      </div>

                      <div className="w-px h-8 bg-border shrink-0" />

                      {/* Pool bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Pool restant</span>
                          <span className="text-[10px] font-mono font-semibold tabular-nums">
                            {Math.round(Math.max(0, cmd.proj_pool))} / {Math.round(poolTotal)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${poolPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* OFs bloquants - behind "more" button */}
                    {cmd.ofs_bloquants.length > 0 && (
                      <div className="border-t border-border px-[18px]">
                        {expandedOfs.has(index) ? (
                          <>
                            <button
                              className="w-full py-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => toggleOfs(index)}
                            >
                              <ChevronDown className="h-3 w-3" />
                              Masquer les OFs
                            </button>
                            <div className="space-y-1 pb-3">
                              {cmd.ofs_bloquants.map((of) => (
                                <div key={of.num_of} className={`flex items-center justify-between rounded-lg px-3 py-2 ${of.composants_alloues ? 'bg-green-500/5 border border-green-500/20' : 'bg-muted/50'}`}>
                                  <div className="flex items-center gap-2">
                                    {of.composants_alloues
                                      ? <CircleCheck className="h-3 w-3 text-green-600" />
                                      : <Boxes className="h-3 w-3 text-muted-foreground" />
                                    }
                                    <span className="font-mono font-semibold text-[12px]">{of.num_of}</span>
                                    <span className="text-[12px] text-muted-foreground">{of.article}</span>
                                    <Pill tone="outline">{of.statut}</Pill>
                                    {of.composants_alloues && (
                                      <Pill tone="good">Composants alloues</Pill>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                    <span className="tabular-nums">{of.qte_restante}/{of.qte_a_fabriquer}</span>
                                    <span>{of.date_fin}</span>
                                    {of.postes_charge.length > 0 && (
                                      <span>{of.postes_charge.join(', ')}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <button
                            className="w-full py-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => toggleOfs(index)}
                          >
                            <ChevronRight className="h-3 w-3" />
                            {cmd.ofs_bloquants.length} OF{cmd.ofs_bloquants.length > 1 ? 's' : ''} bloquant{cmd.ofs_bloquants.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              /* ── SPLIT MODE: tree layout grouped by SF branch ── */
              (() => {
                const branches = groupedByBranch()
                return Array.from(branches.entries()).map(([branchKey, cmds]) => {
                  const isExpanded = expandedBranches.size === 0 || expandedBranches.has(branchKey)
                  const branchPool = cmds[0]?.cmd.branch_pool_total ?? (result.component.pool_total || 1)
                  const desc = getSfDescription(branchKey)

                  return (
                    <div key={branchKey} className="bg-card border border-border rounded-2xl overflow-hidden">
                      {/* Branch header */}
                      <button
                        className="w-full px-[18px] py-2.5 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => toggleBranch(branchKey)}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        }
                        <span className="font-mono font-bold text-[13px]">{branchKey}</span>
                        {desc && <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{desc}</span>}
                        <Pill tone="primary" icon={<Layers className="h-3 w-3" />} mono>
                          Pool {Math.round(branchPool)}
                        </Pill>
                        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                          {cmds.length} cmd{cmds.length > 1 ? 's' : ''}
                        </span>
                      </button>

                      {/* Branch commands with tree line */}
                      {isExpanded && (
                        <div className="border-t border-border">
                          <div className="ml-4 pl-3 border-l-2 border-border space-y-1.5 py-2 pr-[18px]">
                            {cmds.map(({ cmd, idx }) => {
                              const poolTotal = cmd.branch_pool_total ?? (result.component.pool_total || 1)
                              const poolPct = Math.max(0, Math.min(100, (cmd.proj_pool / poolTotal) * 100))
                              const barColor = cmd.etat === 'RUPTURE' ? 'bg-destructive' : 'bg-green-500'

                              return (
                                <div key={`${cmd.num_commande}-${idx}`} className="relative pl-3">
                                  {/* Horizontal tree connector */}
                                  <div className="absolute left-0 top-4 w-3 border-t-2 border-border" />

                                  {/* Command card */}
                                  <div className="bg-background border border-border rounded-xl overflow-hidden">
                                    {/* Header */}
                                    <div className="px-3 py-2 flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-mono font-semibold text-[11px]">{cmd.num_commande}</span>
                                        <span className="font-semibold text-[11px] truncate">{cmd.client}</span>
                                        <span className="text-[10px] text-muted-foreground">{cmd.article}</span>
                                        <Pill tone="outline">{cmd.type_commande}</Pill>
                                        {cmd.nature === 'PREVISION' && <Pill tone="warn">Prevision</Pill>}
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDate(cmd.date_expedition)}</span>
                                        {cmd.etat && (
                                          <Pill tone={cmd.etat === 'RUPTURE' ? 'danger' : 'good'} mono>
                                            {cmd.etat}
                                          </Pill>
                                        )}
                                      </div>
                                    </div>

                                    {/* Metrics row */}
                                    <div className="px-3 pb-2 flex items-center gap-3">
                                      <div className="w-14 shrink-0 text-center">
                                        <span className="block text-[7px] text-muted-foreground uppercase tracking-wider">Qte</span>
                                        <span className="block text-[14px] font-mono font-bold tabular-nums leading-tight">{cmd.qte_restante}</span>
                                      </div>
                                      <div className="w-px h-6 bg-border shrink-0" />
                                      <div className="w-16 shrink-0 text-center">
                                        <span className="block text-[7px] text-muted-foreground uppercase tracking-wider">Impact</span>
                                        <span className="block text-[14px] font-mono font-bold tabular-nums leading-tight text-destructive">
                                          -{Math.round(cmd.qte_impact_composant)}
                                        </span>
                                      </div>
                                      <div className="w-px h-6 bg-border shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                          <span className="text-[7px] text-muted-foreground uppercase tracking-wider">Pool</span>
                                          <span className="text-[9px] font-mono font-semibold tabular-nums">
                                            {Math.round(Math.max(0, cmd.proj_pool))}/{Math.round(poolTotal)}
                                          </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${barColor}`}
                                            style={{ width: `${poolPct}%` }}
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* OFs bloquants */}
                                    {cmd.ofs_bloquants.length > 0 && (
                                      <div className="border-t border-border px-3">
                                        {expandedOfs.has(idx) ? (
                                          <>
                                            <button
                                              className="w-full py-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                              onClick={() => toggleOfs(idx)}
                                            >
                                              <ChevronDown className="h-3 w-3" />
                                              Masquer OFs
                                            </button>
                                            <div className="space-y-1 pb-2">
                                              {cmd.ofs_bloquants.map((of) => (
                                                <div key={of.num_of} className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${of.composants_alloues ? 'bg-green-500/5 border border-green-500/20' : 'bg-muted/50'}`}>
                                                  <div className="flex items-center gap-1.5">
                                                    {of.composants_alloues
                                                      ? <CircleCheck className="h-3 w-3 text-green-600" />
                                                      : <Boxes className="h-3 w-3 text-muted-foreground" />
                                                    }
                                                    <span className="font-mono font-semibold text-[11px]">{of.num_of}</span>
                                                    <span className="text-[11px] text-muted-foreground">{of.article}</span>
                                                    <Pill tone="outline">{of.statut}</Pill>
                                                    {of.composants_alloues && <Pill tone="good">Alloues</Pill>}
                                                  </div>
                                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    <span className="tabular-nums">{of.qte_restante}/{of.qte_a_fabriquer}</span>
                                                    <span>{of.date_fin}</span>
                                                    {of.postes_charge.length > 0 && <span>{of.postes_charge.join(', ')}</span>}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </>
                                        ) : (
                                          <button
                                            className="w-full py-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                            onClick={() => toggleOfs(idx)}
                                          >
                                            <ChevronRight className="h-3 w-3" />
                                            {cmd.ofs_bloquants.length} OF{cmd.ofs_bloquants.length > 1 ? 's' : ''}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              })()
            )}
          </div>

          {/* OFs sans commande */}
          {result.ofs_sans_commande.length > 0 && (
            <div className="space-y-2">
              <button
                className="w-full bg-card border border-border rounded-2xl overflow-hidden"
                onClick={() => setExpandedOrphans(!expandedOrphans)}
              >
                <div className="px-[18px] py-3 flex items-center gap-3 text-left">
                  {expandedOrphans
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono flex-1">
                    OFs sans rattachement commande ({result.ofs_sans_commande.length})
                  </span>
                  <Pill tone="outline" mono>{result.ofs_sans_commande.length}</Pill>
                </div>
              </button>

              {expandedOrphans && (
                <div className="space-y-1">
                  {result.ofs_sans_commande.map((of) => (
                    <div key={of.num_of} className={`bg-card border rounded-lg px-[18px] py-2.5 flex items-center justify-between ${of.composants_alloues ? 'border-green-500/20' : 'border-border'}`}>
                      <div className="flex items-center gap-2">
                        {of.composants_alloues
                          ? <CircleCheck className="h-3 w-3 text-green-600" />
                          : <Boxes className="h-3 w-3 text-muted-foreground" />
                        }
                        <span className="font-mono font-semibold text-[12px]">{of.num_of}</span>
                        <span className="text-[12px] text-muted-foreground">{of.article}</span>
                        <Pill tone="outline">{of.statut}</Pill>
                        {of.composants_alloues && (
                          <Pill tone="good">Composants alloues</Pill>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{of.qte_restante}/{of.qte_a_fabriquer}</span>
                        <span>{of.date_fin}</span>
                        {of.postes_charge.length > 0 && (
                          <span>{of.postes_charge.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Affected lines */}
          {result.summary.affected_lines.length > 0 && (
            <div className="bg-card border border-border rounded-2xl px-[18px] py-[14px]">
              <span className="block text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mb-2">
                Lignes de production impactees
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.summary.affected_lines.map((line) => (
                  <Pill key={line} tone="primary">{line}</Pill>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useState, useMemo, useCallback } from 'react'
import type { SchedulerResult, CandidateOF } from '@/types/scheduler'
export interface SchedulerStats {
  totalPlanned: number
  totalBlocked: number
  totalRealisables: number
  unscheduledCount: number
  ordersLate: number
}

export interface SchedulerFilters {
  focusLine: string | null
  focusDay: string | null
  lensBlocked: boolean
  query: string
  statusFilter: string
}

export function useSchedulerData(result: SchedulerResult | null) {
  /* ── Controls ─────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<string>('planning')
  const [showKpis, setShowKpis] = useState(true)
  const [weekMode, setWeekMode] = useState('week')
  const [density, setDensity] = useState<'compact' | 'comfort'>('comfort')
  const [dark, setDark] = useState(false)
  const [focusLine, setFocusLine] = useState<string | null>(null)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const [lensBlocked, setLensBlocked] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showWorkqueue, setShowWorkqueue] = useState(false)

  /* ── Derived data ─────────────────────────────────────────── */
  const allOfs = useMemo(() => {
    if (!result) return [] as Array<CandidateOF & { line: string }>
    return Object.entries(result.line_candidates).flatMap(([line, ofs]) =>
      ofs.map((o) => ({ ...o, line }))
    )
  }, [result])

  const days = useMemo(() => {
    const daySet = new Set<string>()
    for (const o of allOfs) { if (o.scheduled_day) daySet.add(o.scheduled_day) }
    return [...daySet].sort()
  }, [allOfs])

  const lines = useMemo(() => [...new Set(allOfs.map(o => o.line))].sort(), [allOfs])

  const filtered = useMemo(() => allOfs.filter(o => {
    if (focusLine && o.line !== focusLine) return false
    if (focusDay && o.scheduled_day !== focusDay) return false
    if (lensBlocked && !o.blocking_components) return false
    if (statusFilter === 'ferme' && o.statut_num !== 1) return false
    if (statusFilter === 'planifie' && o.statut_num !== 2) return false
    if (statusFilter === 'sugg' && o.statut_num !== 3) return false
    if (query) {
      const q = query.toLowerCase()
      const lineLabel = result?.line_labels?.[o.line]?.toLowerCase() ?? ''
      return o.num_of.toLowerCase().includes(q)
          || o.article.toLowerCase().includes(q)
          || (o.description ?? '').toLowerCase().includes(q)
          || o.line.toLowerCase().includes(q)
          || lineLabel.includes(q)
    }
    return true
  }), [allOfs, focusLine, focusDay, lensBlocked, statusFilter, query, result?.line_labels])

  const grouped = useMemo(() => {
    const g: Record<string, CandidateOF[]> = {}
    for (const of_ of filtered) {
      const day = of_.scheduled_day ?? '__none__'
      if (!g[day]) g[day] = []
      g[day].push(of_)
    }
    return g
  }, [filtered])

  const toggleDay = useCallback((key: string) => {
    setExpandedDays(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }, [])

  const stats = useMemo<SchedulerStats | null>(() => {
    if (!result) return null
    const all = Object.values(result.line_candidates).flat()
    const totalPlanned = all.filter(o => o.scheduled_day).length
    const totalBlocked = all.filter(o => o.blocking_components).length
    return {
      totalPlanned,
      totalBlocked,
      totalRealisables: totalPlanned - totalBlocked,
      unscheduledCount: result.unscheduled_rows.length,
      ordersLate: result.order_rows.filter(r => r.statut.toLowerCase().includes('retard') || r.statut.toLowerCase().includes('non')).length,
    }
  }, [result])

  return {
    // Tab / display controls
    activeTab, setActiveTab,
    showKpis, setShowKpis,
    weekMode, setWeekMode,
    density, setDensity,
    dark, setDark,
    showHeatmap, setShowHeatmap,
    showWorkqueue, setShowWorkqueue,
    // Filters
    focusLine, setFocusLine,
    focusDay, setFocusDay,
    lensBlocked, setLensBlocked,
    query, setQuery,
    statusFilter, setStatusFilter,
    // Expansion
    expandedDays, setExpandedDays, toggleDay,
    // Derived data
    allOfs, days, lines, filtered, grouped, stats,
  }
}

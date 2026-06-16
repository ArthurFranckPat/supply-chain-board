/**
 * Détail OF — miroir client de SchedulerController.loadOfDetail() (DetailPayload).
 * Servi en JSON par GET /scheduler/of/:num, consommé par <OfDetailSheet>.
 */

export interface StatItem {
  label: string
  value: string
  sub: string | null
  valueClass: string
  trend: string | null
  trendClass: string
}

export interface BomRow {
  id: string
  name: string
  stock: string
  need: string
  unit: string
  ok: boolean
  shortage: string | null
}

export interface OfDetail {
  num: string
  title: string
  article: string
  statusLabel: string
  statusIcon: string
  statusClass: string
  context: string
  stats: StatItem[]
  progressPct: number
  operator: { initials: string; name: string }
  cycle: { start: string; end: string }
  bomCount: number
  bomBlocked: number
  bom: BomRow[]
  events: { label: string; time: string; desc: string | null; dot: string }[]
}

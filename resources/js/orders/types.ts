/**
 * Issue #10 — types du board planification (lignes de commande ouvertes).
 * Miroir des formes émises par OrderPlanningController.loadBoardData().
 */

export interface Field {
  icon: string
  val: string
}

export interface OrderCard {
  /** `numCommande#ligne` — clé unique de la ligne. */
  id: string
  title: string
  article: string | null
  href: string
  accentClass: string
  cardClass: string
  textTone: string
  idTone: string
  fieldValTone: string
  fields: Field[]
  metric: string | null
  hours: number
  hasOverride: boolean
}

export interface WeekCol {
  week: number
  iso: string
  short: string
  loadHours: number
  cap: number
  pct: number
  barClass: string
  headerTone: string
  labelClass: string
}

export interface WeekCell {
  cellClass: string
  cards: OrderCard[]
  iso: string
}

export interface WeekLoad {
  week: number
  hours: number
  pct: number
  barClass: string
}

export interface OrderLineRow {
  name: string
  code: string
  dot: string
  meta: { k: string; v: string }[]
  weekCells: WeekCell[]
  weekLoads: WeekLoad[]
}

export interface OrderBoardData {
  weeks: WeekCol[]
  lines: OrderLineRow[]
  weekSpans: { week: number; span: number }[]
  cols: number
  colWeek: number[]
  weekCaps: Record<string, number>
}

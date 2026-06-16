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
  /** Type commande MTS/MTO/NOR — filtre. */
  orderType: string | null
  /** COMMANDE (ARxxxx) ou PREVISION (SGAxxxx) — filtre. */
  nature: string
  /** Client — recherche scope. */
  customer: string | null
}

/** Portée de la recherche live. */
export type OrderSearchScope = 'poste' | 'commande' | 'article' | 'client'

export interface DayCol {
  short: string
  iso: string
  today: boolean
  headerTone: string
}

export interface DayCell {
  cellClass: string
  cards: OrderCard[]
  iso: string
}

export interface WeekSpan {
  week: number
  span: number
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
  dayCells: DayCell[]
  weekLoads: WeekLoad[]
}

export interface OrderBoardData {
  days: DayCol[]
  lines: OrderLineRow[]
  weekSpans: WeekSpan[]
  cols: number
  /** Index colonne → ISO week (pour histogramme live). */
  colWeek: number[]
  /** ISO week → capacité (jours ouvrés × 8h). */
  weekCaps: Record<string, number>
}

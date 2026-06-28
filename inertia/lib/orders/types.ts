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
  fields: Field[]
  metric: string | null
  hours: number
  hasOverride: boolean
  /** Type commande MTS/MTO/NOR — filtre. */
  orderType: string | null
  /** COMMANDE (ARxxxx) / PREVISION (SGAxxxx) / INDUIT (ghost depth-1) — filtre. */
  nature: string
  /** Client — recherche scope. */
  customer: string | null
  /** Article dont la nomenclature contient un composant BDH (issue #28). */
  consommeBouche?: boolean
  /** Typologie X3 (TSICOD_4) du PF — ex: ESH10=AUTO, ESH30=HYGRO (issue #42). */
  typologie?: string
  /** Quantité (reste à livrer) — footer (issue #42). */
  qty?: number
  /** Carte induite (besoin brut depth-1) : ghost, non-draggable, hors filtres. */
  induit?: boolean
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
  /** Atelier (STOLOC du poste) — filtre atelier (#36). */
  atelier: string
  meta: { k: string; v: string }[]
  dayCells: DayCell[]
  weekLoads: WeekLoad[]
  /** Présent seulement sur la ligne PP_830 — header d'équilibrage (issue #42). */
  pp830?: {
    chargeByTypo: { typo: string; sans: number; bouche: number }[]
    stockBouchesHygro: number | null
  }
}

/** Composant BOM d'une ligne (miroir de lineDetail.bom). */
export interface OrderBomRow {
  article: string
  description: string
  need: string
  available: string
  unit: string
  ok: boolean
  shortage: string | null
}

/** Détail d'une ligne de commande — miroir de OrderPlanningController.lineDetail(). */
export interface OrderLineDetail {
  numCommande: string
  ligne: string
  article: string
  designation: string | null
  client: string | null
  quantite: number
  unite: string | null
  dateLivraison: string
  contremarque: string | null
  orderType: string | null
  nature: string
  hasOverride: boolean
  workstation: string | null
  workstationLabel: string | null
  hours: number
  bom: OrderBomRow[]
  bomCount: number
  bomBlocked: number
  x3Error: string | null
}

export interface OrderBoardData {
  days: DayCol[]
  lines: OrderLineRow[]
  /** Options du filtre atelier (STOLOC distincts), issue #36. */
  ateliers: { code: string; label: string }[]
  weekSpans: WeekSpan[]
  cols: number
  /** Index colonne → ISO week (pour histogramme live). */
  colWeek: number[]
  /** ISO week → capacité (jours ouvrés × 8h). */
  weekCaps: Record<string, number>
}

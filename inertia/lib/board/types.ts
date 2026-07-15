/**
 * Board data contract — mirrors les shapes émis par SchedulerController.loadBoardData()
 * et passés en props Inertia. Le backend envoie de la DATA (statut, article, qté…) ;
 * le client (board-card) dérive toute la présentation du `status` (TONE_BORDER/TONE_FILL).
 * Plus de classes CSS baked côté serveur.
 */

export interface Field {
  icon: string
  val: string
}

export interface Card {
  id: string
  title: string
  article: string | null
  status: string
  href: string
  fields: Field[]
  metric: string | null
  hours: number
  consommeBouche?: boolean
  typologie?: string
  kitGpe?: 'KIT' | 'GPE'
}

export interface DayCol {
  short: string
  hours: string
  pct: number
  loadClass: string
  valClass: string
  today: boolean
  headerTone: string
  pctClass: string
}

export interface DayCell {
  cellClass: string
  cards: Card[]
  iso: string
}

export interface WeekLoad {
  week: number
  hours: number
  pct: number
  barClass: string
}

export interface LineRow {
  name: string
  code: string
  dot: string
  meta: { k: string; v: string }[]
  dayCells: DayCell[]
  weekLoads: WeekLoad[]
  /** Présent seulement sur la ligne PP_830 — header d'équilibrage (issue #42). */
  pp830?: {
    /** Charge (heures) par typo, splittée bouche-consommatrice vs non. */
    chargeByTypo: { typo: string; sans: number; bouche: number }[]
    stockBouchesHygro: number | null
  }
}

/**
 * Map typo X3 (TSICOD_4) → {label, color, light}. Décision user (issue #42) :
 * HYGRO=bleu, DHU=orange, AUTO=jaune, PURAIR=vert, AUTOSENS=violet.
 * `light` = teinte claire pour la part bouche-consommatrice (ex: HYGRO-BDH vs HYGRO-BAH).
 */
export const TYPO_META: Record<
  string,
  { label: string; color: string; light: string; text: string }
> = {
  ESH10: { label: 'AUTO', color: '#eab308', light: '#fde68a', text: '#1f2937' },
  ESH20: { label: 'DHU', color: '#ea580c', light: '#fdba74', text: '#ffffff' },
  ESH30: { label: 'HYGRO', color: '#2563eb', light: '#93c5fd', text: '#ffffff' },
  ESH40: { label: 'PURAIR', color: '#5b7d4e', light: '#a7c4a0', text: '#ffffff' },
  ESH60: { label: 'AUTOSENS', color: '#6d4bb0', light: '#c4b5fd', text: '#ffffff' },
}

export interface WeekSpan {
  week: number
  span: number
}

/** Full payload passed as the `board` Inertia prop and consumed by the grid. */
export interface BoardData {
  days: DayCol[]
  lines: LineRow[]
  weekSpans: WeekSpan[]
  cols: number
  /** Column index → ISO week. */
  colWeek: number[]
  /** ISO week → capacity hours (business days × 8h). */
  weekCaps: Record<string, number>
}

/** Search scope → backend route + matched data-attribute on cards. */
export type SearchScope = 'poste' | 'of' | 'pf' | 'composant'

/** Stock-availability mode for the feasibility computation. */
export type FeasibilityMode = 'immediate' | 'sequential'

/** Per-OF feasibility result. `missing` = component refs short on stock. */
export interface FeasStatus {
  st: 'ok' | 'blocked'
  missing: string[]
}

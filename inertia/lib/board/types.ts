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
 * Map typo X3 (TSICOD_4) → {label, color, light}. Sémantique issue #42
 * (HYGRO=bleuté, DHU=orange, AUTO=neutre chaud, PURAIR=vert, AUTOSENS=violet)
 * remappée le 21/07/2026 sur le brand book Airbnb (migration grammaire —
 * les hex Tailwind d'origine dataient d'avant le pivot design) :
 *   HYGRO → Babu #00a699 · DHU → Arches #fc642d · PURAIR → ferme #008049
 *   AUTOSENS → Luxe #460479 (sub-brand violet, usage ponctuel data-viz)
 *   AUTO → Foggy #767676 (pas de jaune en grammaire Airbnb)
 * `light` = teinte claire (≈45 % blanc) pour la part bouche-consommatrice
 * (ex: HYGRO-BDH vs HYGRO-BAH).
 */
export const TYPO_META: Record<
  string,
  { label: string; color: string; light: string; text: string }
> = {
  ESH10: { label: 'AUTO', color: '#767676', light: '#adadad', text: '#ffffff' },
  ESH20: { label: 'DHU', color: '#fc642d', light: '#fdb196', text: '#ffffff' },
  ESH30: { label: 'HYGRO', color: '#00a699', light: '#72cbc2', text: '#ffffff' },
  ESH40: { label: 'PURAIR', color: '#008049', light: '#72b99b', text: '#ffffff' },
  ESH60: { label: 'AUTOSENS', color: '#460479', light: '#9975b5', text: '#ffffff' },
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

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
  /**
   * Nature du poste (catégories article préfixe PF / SF, 1ʳᵉ op gamme).
   * Absent sur d'anciens payloads → traité comme `autre`.
   */
  nature?: PosteNature
  /** Présent seulement sur la ligne PP_830 — header d'équilibrage (issue #42). */
  pp830?: {
    /** Charge (heures) par typo, splittée bouche-consommatrice vs non. */
    chargeByTypo: { typo: string; sans: number; bouche: number }[]
    stockBouchesHygro: number | null
  }
}

/** Assemblage PF vs sous-ensemble — filtre lignes poste du Programme. */
export type PosteNature = 'assemblage_pf' | 'assemble_sous_ensemble' | 'autre'
export type PosteNatureFilterKey = 'assemblage_pf' | 'assemble_sous_ensemble'

/**
 * Map typo X3 (TSICOD_4) → {label, color, light}. Sémantique issue #42
 * (HYGRO=bleuté, DHU=orange, AUTO=neutre, PURAIR=vert, AUTOSENS=ambre).
 *
 * Remappée le 12/08/2026 sur la rampe catégorielle du thème Cursor
 * (`--chart-1..5` du design system), depuis le brand book Airbnb qui la
 * précédait : /programme rend en `theme-cursor` depuis la migration, et le
 * Babu #00a699 (teal) comme le Luxe #460479 (violet) n'y appartiennent à
 * aucune échelle — ils se lisaient comme deux couleurs importées d'un autre
 * produit dans un en-tête par ailleurs monochrome.
 *
 * Cinq typologies, cinq entrées de la rampe, une par catégorie :
 *   AUTO → ink aplati · DHU → brand #f54e00 · HYGRO → accent #2778c1
 *   PURAIR → success #007041 · AUTOSENS → warn #a46700
 *
 * Hex littéraux et non `var(--chart-N)` : ces valeurs partent en `background`
 * inline sur des pastilles ET dans le SVG des barres, et `text: '#ffffff'`
 * n'est un contraste valide que contre un fond opaque connu. Deux d'entre
 * elles (`--chart-2`) sont définies en `color-mix(… transparent)`.
 *
 * `light` = teinte claire (≈45 % de la couleur sur blanc) pour la part
 * bouche-consommatrice (ex: HYGRO-BDH vs HYGRO-BAH).
 */
export const TYPO_META: Record<
  string,
  { label: string; color: string; light: string; text: string }
> = {
  ESH10: { label: 'AUTO', color: '#6b6b6b', light: '#b5b5b5', text: '#ffffff' },
  ESH20: { label: 'DHU', color: '#f54e00', light: '#f9b18d', text: '#ffffff' },
  ESH30: { label: 'HYGRO', color: '#2778c1', light: '#9ec2e3', text: '#ffffff' },
  ESH40: { label: 'PURAIR', color: '#007041', light: '#8cbea9', text: '#ffffff' },
  ESH60: { label: 'AUTOSENS', color: '#a46700', light: '#d6ba8c', text: '#ffffff' },
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

/**
 * Per-OF feasibility result. `missing` = component refs short on stock.
 *
 * `qc` = faisable, MAIS la couverture repose sur du stock au statut Q (contrôle qualité) :
 * le verdict compte ce stock comme disponible (règle métier assumée), l'état distinct rend
 * la dépendance visible pour que l'ordonnanceur relance le service contrôle réception.
 */
export interface FeasStatus {
  st: 'ok' | 'qc' | 'blocked'
  missing: string[]
  /** Composants couverts uniquement grâce au stock sous CQ : réf → quantité concernée. */
  qcComponents?: Record<string, number>
}

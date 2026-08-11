/**
 * Contrat de disposition du tableau de bord (feature KPI personnalisables).
 *
 * Partagé entre le backend (modèle User, validator, controller) et le miroir
 * client `inertia-react/lib/dashboard/types.ts`. Toute évolution du registre des KPI
 * se fait ici (ajout d'un KpiId + entrée dans DEFAULT_DASHBOARD_LAYOUT).
 *
 * Persistance : JSON sérialisé dans `users.dashboard_layout` (colonne TEXT
 * nullable). `null` = layout par défaut (utilisateur n'a rien personnalisé).
 */

/** Identifiants stables des KPI du tableau de bord. */
export const KPI_IDS = ['charge', 'profondeur', 'otd', 'stock', 'lignes', 'stockTable'] as const
export type KpiId = (typeof KPI_IDS)[number]

/** Largeur discrète sur la grille 3 colonnes : 1 = 1/3, 2 = 2/3, 3 = plein. */
export const KPI_WIDTHS = [1, 2, 3] as const
export type KpiWidth = (typeof KPI_WIDTHS)[number]

/**
 * Nombre de colonnes de la grille du tableau de bord. `x` et `w` sont exprimés
 * dans cette unité. Le pas vertical est porté par `rowHeight` côté composant.
 */
export const GRID_COLS = 24

/**
 * Version du contrat de disposition. La v1 utilisait une grille deux fois plus
 * grossière (12 colonnes, `rowHeight` 65) ; la v2 double la finesse du pas.
 * Un payload sans `version` est de la v1 et voit ses unités doublées à la
 * lecture — la surface occupée est identique, seul le pas d'accrochage change.
 */
export const LAYOUT_VERSION = 2

/** Colonnes occupées par une largeur discrète (1 = 1/3, 2 = 2/3, 3 = plein). */
export function colsForWidth(width: KpiWidth): number {
  return width === 2 ? (GRID_COLS * 2) / 3 : width === 3 ? GRID_COLS : GRID_COLS / 3
}

/** Position d'un KPI dans la disposition écran. */
export interface KpiLayoutItem {
  id: KpiId
  visible: boolean
  width: KpiWidth
  x: number
  y: number
  w: number
  h: number
}

/** Disposition complète du tableau de bord d'un utilisateur. */
export interface DashboardLayout {
  /** Version du contrat — cf. LAYOUT_VERSION. */
  version: number
  /** Ordre affiché à l'écran (haut → bas, reflow grille dense). */
  items: KpiLayoutItem[]
  /** Ordre d'impression indépendant de l'ordre écran. */
  printOrder: KpiId[]
}

/**
 * Layout par défaut — Fold A : retard au-dessus du pli (charge + profondeur
 * à gauche, lignes à droite), OTIF / stock / articles sous le pli en 3 colonnes.
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: LAYOUT_VERSION,
  items: [
    { id: 'charge', visible: true, width: 1, x: 0, y: 0, w: 8, h: 7 },
    { id: 'profondeur', visible: true, width: 1, x: 0, y: 7, w: 8, h: 7 },
    { id: 'lignes', visible: true, width: 2, x: 8, y: 0, w: 16, h: 14 },
    { id: 'otd', visible: true, width: 1, x: 0, y: 14, w: 8, h: 8 },
    { id: 'stock', visible: true, width: 1, x: 8, y: 14, w: 8, h: 8 },
    { id: 'stockTable', visible: true, width: 1, x: 16, y: 14, w: 8, h: 10 },
  ],
  printOrder: ['charge', 'profondeur', 'lignes', 'otd', 'stock', 'stockTable'],
}

/** Vérifie qu'un `unknown` est un `KpiId` valide. */
export function isKpiId(v: unknown): v is KpiId {
  return typeof v === 'string' && (KPI_IDS as readonly string[]).includes(v)
}

/**
 * Normalise un payload brut (DB ou client) en `DashboardLayout` valide.
 * Complète les KPI manquants et ignore les entrées inconnues — robuste aux
 * évolutions du registre (un KPI retiré n'empêche pas de relire un ancien layout).
 */
export function normalizeDashboardLayout(raw: unknown): DashboardLayout {
  const base = structuredClone(DEFAULT_DASHBOARD_LAYOUT)
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>

  // Un payload sans `version` date de la grille 12 colonnes : ses unités valent
  // le double aujourd'hui. On ne met à l'échelle que les valeurs réellement
  // fournies — les valeurs de repli sont déjà exprimées en v2.
  const version = typeof obj.version === 'number' ? obj.version : 1
  const scale = version < 2 ? 2 : 1

  // items : on reconstruit dans l'ordre canonique, en écrasant avec les valeurs
  // valides trouvées dans le payload. Les doublons/inconnus sont ignorés.
  if (Array.isArray(obj.items)) {
    const seen = new Set<KpiId>()
    const incoming = obj.items
      .map((it) => (it && typeof it === 'object' ? (it as Record<string, unknown>) : null))
      .filter((it): it is Record<string, unknown> => it !== null)
    const merged: KpiLayoutItem[] = []
    for (const it of incoming) {
      if (!isKpiId(it.id) || seen.has(it.id)) continue
      seen.add(it.id)
      const width: KpiWidth = it.width === 2 ? 2 : it.width === 3 ? 3 : 1
      const def = DEFAULT_DASHBOARD_LAYOUT.items.find((d) => d.id === it.id)
      const x = typeof it.x === 'number' ? it.x * scale : (def?.x ?? 0)
      const y = typeof it.y === 'number' ? it.y * scale : (def?.y ?? 0)
      const w = typeof it.w === 'number' ? it.w * scale : (def?.w ?? colsForWidth(width))
      const h = typeof it.h === 'number' ? it.h * scale : (def?.h ?? 10)
      merged.push({ id: it.id, visible: it.visible !== false, width, x, y, w, h })
    }
    // On replace les KPI canoniques absents du payload à la fin (visibles par défaut).
    for (const id of KPI_IDS) {
      if (!seen.has(id)) {
        const def = DEFAULT_DASHBOARD_LAYOUT.items.find((d) => d.id === id) ?? {
          x: 0,
          y: 0,
          w: GRID_COLS / 3,
          h: 10,
        }
        merged.push({ id, visible: true, width: 1, x: def.x, y: def.y, w: def.w, h: def.h })
      }
    }
    base.items = merged
  }

  // printOrder : on garde l'ordre fourni pour les ids valides et uniques,
  // puis on complète par les ids manquants dans l'ordre canonique.
  if (Array.isArray(obj.printOrder)) {
    const seen = new Set<KpiId>()
    const ordered: KpiId[] = []
    for (const id of obj.printOrder) {
      if (isKpiId(id) && !seen.has(id)) {
        seen.add(id)
        ordered.push(id)
      }
    }
    for (const id of KPI_IDS) {
      if (!seen.has(id)) ordered.push(id)
    }
    base.printOrder = ordered
  }

  return base
}

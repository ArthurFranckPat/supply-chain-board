/**
 * Contrat de disposition du tableau de bord (feature KPI personnalisables).
 *
 * Partagé entre le backend (modèle User, validator, controller) et le miroir
 * client `inertia/lib/dashboard/types.ts`. Toute évolution du registre des KPI
 * se fait ici (ajout d'un KpiId + entrée dans DEFAULT_DASHBOARD_LAYOUT).
 *
 * Persistance : JSON sérialisé dans `users.dashboard_layout` (colonne TEXT
 * nullable). `null` = layout par défaut (utilisateur n'a rien personnalisé).
 */

/** Identifiants stables des KPI du tableau de bord. */
export const KPI_IDS = ['charge', 'otd', 'stock', 'lignes', 'stockTable'] as const
export type KpiId = (typeof KPI_IDS)[number]

/** Grille libre (Gridstack) : nb de colonnes + bornes de taille en unités de grille. */
export const GRID_COLS = 12
export const GRID_MIN_W = 2
export const GRID_MIN_H = 2
export const GRID_MAX_H = 40

/** Position + taille libres d'un KPI sur la grille (unités Gridstack, pas des px). */
export interface KpiLayoutItem {
  id: KpiId
  visible: boolean
  x: number
  y: number
  w: number
  h: number
}

/** Disposition complète du tableau de bord d'un utilisateur. */
export interface DashboardLayout {
  /** Ordre affiché à l'écran (haut → bas, reflow grille dense). */
  items: KpiLayoutItem[]
  /** Ordre d'impression indépendant de l'ordre écran. */
  printOrder: KpiId[]
}

/**
 * Layout par défaut — reproduit la disposition historique codée en dur :
 * colonne gauche 1/3 (charge, OTD, valorisation) + colonne droite 2/3
 * (lignes en retard, stock par article).
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  items: [
    { id: 'charge', visible: true, x: 0, y: 0, w: 4, h: 7 },
    { id: 'otd', visible: true, x: 4, y: 0, w: 4, h: 7 },
    { id: 'stock', visible: true, x: 8, y: 0, w: 4, h: 7 },
    { id: 'lignes', visible: true, x: 0, y: 7, w: 6, h: 9 },
    { id: 'stockTable', visible: true, x: 6, y: 7, w: 6, h: 9 },
  ],
  printOrder: ['charge', 'otd', 'stock', 'lignes', 'stockTable'],
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

  // items : on reconstruit dans l'ordre canonique, en écrasant avec les valeurs
  // valides trouvées dans le payload. Les doublons/inconnus sont ignorés.
  if (Array.isArray(obj.items)) {
    const seen = new Set<KpiId>()
    const incoming = obj.items
      .map((it) => (it && typeof it === 'object' ? (it as Record<string, unknown>) : null))
      .filter((it): it is Record<string, unknown> => it !== null)
    const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
      return Math.min(max, Math.max(min, n))
    }
    const merged: KpiLayoutItem[] = []
    for (const it of incoming) {
      if (!isKpiId(it.id) || seen.has(it.id)) continue
      seen.add(it.id)
      const w = clampInt(it.w, GRID_MIN_W, GRID_COLS, GRID_MIN_W)
      const h = clampInt(it.h, GRID_MIN_H, GRID_MAX_H, GRID_MIN_H)
      const x = clampInt(it.x, 0, GRID_COLS - w, 0)
      const y = clampInt(it.y, 0, 999, 0)
      merged.push({ id: it.id, visible: it.visible !== false, x, y, w, h })
    }
    // On replace les KPI canoniques absents du payload à la fin (visibles par défaut).
    for (const id of KPI_IDS) {
      if (!seen.has(id)) {
        const fallback = DEFAULT_DASHBOARD_LAYOUT.items.find((it) => it.id === id)!
        merged.push({ ...fallback })
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

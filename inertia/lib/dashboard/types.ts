/**
 * Miroir client des types de disposition du tableau de bord.
 *
 * Source de vérité côté serveur : `app/types/dashboard_layout.ts`.
 * On redéclare ici (plutôt qu'importer) car le client ne résout pas l'alias
 * `#types/*` (Adonis). Les deux fichiers doivent rester synchrones.
 */

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

export interface DashboardLayout {
  items: KpiLayoutItem[]
  printOrder: KpiId[]
}

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

export function isKpiId(v: unknown): v is KpiId {
  return typeof v === 'string' && (KPI_IDS as readonly string[]).includes(v)
}

/** Normalise un payload brut en layout valide (complète + dédoublonne). */
export function normalizeDashboardLayout(raw: unknown): DashboardLayout {
  const base: DashboardLayout = {
    items: DEFAULT_DASHBOARD_LAYOUT.items.map((it) => ({ ...it })),
    printOrder: [...DEFAULT_DASHBOARD_LAYOUT.printOrder],
  }
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>

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
    for (const id of KPI_IDS) {
      if (!seen.has(id)) {
        const fallback = DEFAULT_DASHBOARD_LAYOUT.items.find((it) => it.id === id)!
        merged.push({ ...fallback })
      }
    }
    base.items = merged
  }

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

/** Titre affichable de chaque KPI. */
export const KPI_TITLES: Record<KpiId, string> = {
  charge: 'Charge en retard',
  otd: 'OTD',
  stock: 'Valorisation stock',
  lignes: 'Lignes en retard',
  stockTable: 'Stock par article',
}

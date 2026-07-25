/**
 * Miroir client des types de disposition du tableau de bord.
 *
 * Source de vérité côté serveur : `app/types/dashboard_layout.ts`.
 * On redéclare ici (plutôt qu'importer) car le client ne résout pas l'alias
 * `#types/*` (Adonis). Les deux fichiers doivent rester synchrones.
 */

export const KPI_IDS = ['charge', 'otd', 'stock', 'lignes', 'stockTable'] as const
export type KpiId = (typeof KPI_IDS)[number]

export const KPI_WIDTHS = [1, 2, 3] as const
export type KpiWidth = (typeof KPI_WIDTHS)[number]

export interface KpiLayoutItem {
  id: KpiId
  visible: boolean
  width: KpiWidth
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
    { id: 'charge', visible: true, width: 1, x: 0, y: 0, w: 4, h: 5 },
    { id: 'otd', visible: true, width: 1, x: 0, y: 5, w: 4, h: 5 },
    { id: 'stock', visible: true, width: 1, x: 0, y: 10, w: 4, h: 5 },
    { id: 'lignes', visible: true, width: 2, x: 4, y: 0, w: 8, h: 7 },
    { id: 'stockTable', visible: true, width: 2, x: 4, y: 7, w: 8, h: 8 },
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
    const merged: KpiLayoutItem[] = []
    for (const it of incoming) {
      if (!isKpiId(it.id) || seen.has(it.id)) continue
      seen.add(it.id)
      const width: KpiWidth = it.width === 2 ? 2 : it.width === 3 ? 3 : 1
      const def = DEFAULT_DASHBOARD_LAYOUT.items.find((d) => d.id === it.id)
      const x = typeof it.x === 'number' ? it.x : (def?.x ?? 0)
      const y = typeof it.y === 'number' ? it.y : (def?.y ?? 0)
      const w = typeof it.w === 'number' ? it.w : (def?.w ?? (width === 2 ? 8 : width === 3 ? 12 : 4))
      const h = typeof it.h === 'number' ? it.h : (def?.h ?? 5)
      merged.push({ id: it.id, visible: it.visible !== false, width, x, y, w, h })
    }
    for (const id of KPI_IDS) {
      if (!seen.has(id)) {
        const def = DEFAULT_DASHBOARD_LAYOUT.items.find((d) => d.id === id) ?? { x: 0, y: 0, w: 4, h: 5 }
        merged.push({ id, visible: true, width: 1, x: def.x, y: def.y, w: def.w, h: def.h })
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

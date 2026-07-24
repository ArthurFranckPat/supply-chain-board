import vine from '@vinejs/vine'
import { KPI_IDS } from '#types/dashboard_layout'

/**
 * Validation du PATCH /api/v1/user/dashboard-layout.
 *
 * On valide la forme ; le clamp des bornes de grille (x/y/w/h) et la
 * normalisation canonique (complétude / dédoublonnage des KPI) sont gérés par
 * `normalizeDashboardLayout` au moment de la persistance.
 */
export const updateDashboardLayoutValidator = vine.compile(
  vine.object({
    items: vine.array(
      vine.object({
        id: vine.enum(KPI_IDS),
        visible: vine.boolean(),
        x: vine.number(),
        y: vine.number(),
        w: vine.number(),
        h: vine.number(),
      })
    ),
    printOrder: vine.array(vine.enum(KPI_IDS)),
  })
)

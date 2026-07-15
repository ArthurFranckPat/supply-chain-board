import vine from '@vinejs/vine'
import { KPI_IDS, KPI_WIDTHS } from '#types/dashboard_layout'

/**
 * Validation du PATCH /api/v1/user/dashboard-layout.
 *
 * On valide la forme ; la normalisation canonique (complétude / dédoublonnage
 * des KPI) est gérée par `normalizeDashboardLayout` au moment de la persistance.
 */
export const updateDashboardLayoutValidator = vine.compile(
  vine.object({
    items: vine.array(
      vine.object({
        id: vine.enum(KPI_IDS),
        visible: vine.boolean(),
        width: vine.enum(KPI_WIDTHS),
      })
    ),
    printOrder: vine.array(vine.enum(KPI_IDS)),
  })
)

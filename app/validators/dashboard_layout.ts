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
    // `version` conditionne la mise à l'échelle des unités de grille dans
    // `normalizeDashboardLayout` : un payload sans version est de la v1 et sera
    // doublé. Elle doit donc traverser le validator, sinon un layout déjà
    // migré serait remis à l'échelle à chaque sauvegarde.
    version: vine.number().optional(),
    items: vine.array(
      vine.object({
        id: vine.enum(KPI_IDS),
        visible: vine.boolean(),
        width: vine.enum(KPI_WIDTHS),
        // Position et taille sur la grille. Sans ces champs le validator les
        // écartait du payload et chaque PATCH réécrivait la disposition par
        // défaut côté serveur.
        x: vine.number().min(0),
        y: vine.number().min(0),
        w: vine.number().min(1),
        h: vine.number().min(1),
      })
    ),
    printOrder: vine.array(vine.enum(KPI_IDS)),
  })
)

import vine from '@vinejs/vine'
import { PAGE_KEYS } from '#types/view_prefs'

/**
 * Validation du PATCH /api/v1/user/view-prefs.
 *
 * On valide la FORME ; la normalisation canonique (clés connues, dédoublonnage,
 * `dashboard` non masquable) est faite par `normalizeViewPrefs` au moment de la
 * persistance. Les sous-vues arrivent en clés composites `page:sousVue` : le
 * validator se contente de vérifier que ce sont des chaînes, la normalisation
 * écarte les clés inconnues.
 */
export const updateViewPrefsValidator = vine.compile(
  vine.object({
    version: vine.number().optional(),
    hiddenPages: vine.array(vine.enum(PAGE_KEYS)),
    hiddenSubviews: vine.array(vine.string()),
  })
)

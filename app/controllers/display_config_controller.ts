import { type HttpContext } from '@adonisjs/core/http'

/**
 * Configuration de l'affichage (issue #186).
 *
 * Page `/configuration/affichage` : les réglages de confort VISUEL de
 * l'application — rien qui touche aux données ni aux calculs.
 *
 * Aucun état serveur ici, et c'est délibéré : ces réglages sont propres au
 * POSTE, pas à l'identité. Ils vivent dans le navigateur
 * (`inertia-react/lib/display-prefs-store.ts`, localStorage), ce qui évite une
 * migration et un aller-retour pour un interrupteur, au prix assumé d'un
 * réglage qui ne suit pas l'utilisateur d'une machine à l'autre. Le jour où un
 * réglage devra suivre le compte, c'est ici qu'il faudra le charger — à côté
 * de `users.dashboard_layout`, qui est déjà dans ce cas.
 */
export default class DisplayConfigController {
  /** GET /configuration/affichage — page Inertia (coquille pure). */
  async index(ctx: HttpContext) {
    return ctx.inertia.render('config/affichage', {})
  }
}

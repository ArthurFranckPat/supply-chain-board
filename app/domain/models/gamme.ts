/**
 * Gamme -- route de fabrication (operations par poste de charge).
 */

export interface GammeOperation {
  article: string
  workstation: string
  workstationLabel: string
  rate: number // unites/heure
}

export interface Gamme {
  article: string
  operations: GammeOperation[]
}

// -- Helpers --

/**
 * Heures de charge pour une quantité : `qty / rate`, 0 si l'article n'a pas de
 * gamme ou pas de cadence exploitable.
 *
 * Accepte `null`/`undefined` exprès : la quasi-totalité des appelants partent
 * d'un `gammeMap.get(article)` et écrivaient sinon `rate > 0 ? qty / rate : 0`
 * à la main — l'expression était recopiée sur 9 sites.
 *
 * Ne fait PAS d'arrondi : l'arrondi est une décision d'AFFICHAGE. Quatre
 * payloads (`board_payload_loader`, `poste_engagement_loader`×2,
 * `scheduler_controller`) arrondissent encore au dixième côté serveur, les
 * autres non — d'où le même OF à 12.3 h ici et 12.34 h là. À trancher côté
 * client ; ne pas ajouter l'arrondi ici en attendant.
 */
export function hoursForQuantity(
  op: Pick<GammeOperation, 'rate'> | null | undefined,
  qty: number
): number {
  const rate = op?.rate ?? 0
  if (rate <= 0) return 0
  return qty / rate
}

/**
 * Quantités d'une ligne ORDERS — un seul endroit pour « ce qu'il reste à faire ».
 *
 * X3 expose deux colonnes qu'il faut TOUJOURS lire ensemble :
 *  - `RMNEXTQTY_0` : reliquat de la ligne (commandé − livré) ;
 *  - `ALLQTY_0`    : part de ce reliquat déjà ALLOUÉE sur du stock existant.
 *
 * Le reste à FABRIQUER, c'est la différence. La confusion entre les deux a déjà
 * produit deux bugs distincts :
 *  - `suivi_service.buildOrderLines` compensait un « reste à livrer » qui était
 *    en fait un reste à fabriquer (cf. son en-tête) ;
 *  - la vue commande de /charge lisait `RMNEXTQTY_0` nu, ce qui donnait une
 *    DOUBLE PEINE : la part allouée comptait comme besoin ici, pendant que le
 *    stock qui la couvre était déjà retiré du pool côté offre
 *    (`stock_repository` : strict = physique − allouePhys − alloueGlob). Une
 *    ligne allouée traversait `brut` ET `net` intacte.
 *
 * D'où l'invariant, à faire respecter en relecture :
 * **une requête ORDERS qui sélectionne `RMNEXTQTY_0` sans `ALLQTY_0` est un bug
 * en puissance** — soit elle soustrait (via `SQL_RESTE_A_FABRIQUER`), soit elle
 * remonte les deux colonnes et laisse le domaine trancher (`resteAFabriquer`).
 * Jamais le reliquat nu.
 */

/**
 * Reste à fabriquer = reliquat − alloué, planché à 0.
 *
 * Clampé parce qu'X3 tolère `ALLQTY_0 > RMNEXTQTY_0` sur des lignes en cours de
 * régularisation : un besoin négatif se propagerait en charge négative.
 */
export function resteAFabriquer(qteRestante: number, qteAllouee: number): number {
  return Math.max(0, qteRestante - qteAllouee)
}

/**
 * Expression SQL équivalente, pour les requêtes qui soustraient côté base.
 * Suppose l'alias `O` sur ORDERS — convention de tous les repositories X3 ici.
 */
export const SQL_RESTE_A_FABRIQUER = '(O.RMNEXTQTY_0 - O.ALLQTY_0)'

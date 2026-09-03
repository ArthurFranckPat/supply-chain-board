/**
 * Tampon d'âge des payloads cachés (`computedAt`) — la contrepartie serveur de
 * la pastille de statut du masthead.
 *
 * Le tampon est posé DANS la valeur au moment où la factory tourne : il vit
 * avec elle dans le cache, donc un hit (TTL courant comme grace SWR) rend la
 * marque de FABRICATION, pas l'instant de la relecture. C'est ce qui distingue
 * « le serveur m'a répondu maintenant » de « la donnée a été calculée il y a
 * X min » — la question réelle derrière le bouton recharger.
 *
 * Portée : caches de niveau réponse (payload d'une page ou d'un fragment).
 * Les segments internes de boardDataset (ORDERS 5 min, live 2 min, référentiel
 * 2 h) ne sont pas tamponnés : quand un endpoint se reconstruit par requête
 * au-dessus de segments plus vieux, l'âge affiché est un minorant.
 */

/** Enrobe une factory de `getOrSet` pour poser `computedAt` (epoch ms) dans la
 *  valeur produite — au moment de sa fabrication, pas au moment du hit. */
export function stamped<T extends object>(
  factory: () => Promise<T>
): () => Promise<T & { computedAt: number }> {
  return async () => ({ ...(await factory()), computedAt: Date.now() })
}

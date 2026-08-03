/**
 * Lien « Ouvrir dans X3 » (issue #118) — seul module à connaître la syntaxe
 * Syracuse et son double encodage.
 *
 * Forme retenue (établie et vérifiée au navigateur, lot 0) :
 *
 *   http://<host>:<port>/syracuse-main/html/main.html
 *     ?url=/trans/x3/erp/<ENDPOINT>/$sessions?f=<FONCTION>[~<TRANSACTION>]/2//M/<CLÉ>
 *
 * Double encodage structurel : la valeur de `f=` est encodée une fois, puis le
 * paramètre `url=` tout entier est encodé une seconde fois (les `/` et `$` de
 * sa propre query deviennent `%252F`, `%2524`). Ni `profile` ni
 * `representation` ne sont émis : le premier contient des UUID propres à
 * l'utilisateur qui a copié l'URL et s'est avéré optionnel.
 *
 * Codes de transaction par fonction — identiques TEST/PROD au moment du constat
 * (MFGTRS/SALTRS, ENAFLG_0=2). Si un jour ils divergent, les sortir en config.
 */
const TRANSACTIONS = { GESMFG: 'OF1', GESSOH: 'OV1' } as const

/** Fonctions X3 cibles du board (code Syracuse). */
export type X3Fonction = 'GESMFG' | 'GESSOH' | 'GESPOH' | 'GESITM'

/** Prop Inertia partagée `x3Web` — session de l'utilisateur, jamais un choix client. */
export interface X3Web {
  baseUrl: string
  endpoint: string
}

/**
 * Une ligne de demande porte-t-elle un numéro ouvrable dans `GESSOH` ?
 *
 * Non pour une PRÉVISION : ce sont des lignes `ORDERS` WIPTYP=1 WIPSTA=3, dont
 * le numéro (14 chiffres) n'a aucune correspondance dans `SORDER` — le lien
 * ouvrirait la fonction sur une clé inexistante.
 *
 * Seule maison de la règle : les appelants la LISENT, ils ne la redéduisent pas
 * d'un indice de forme (présence d'un n° de ligne, préfixe du numéro…). Casse
 * indifférente — le board émet `COMMANDE`, le domaine `commande`.
 */
export function peutOuvrirCommande(nature: string | null | undefined): boolean {
  return (nature ?? '').toUpperCase() === 'COMMANDE'
}

/**
 * Construit l'URL « Ouvrir dans X3 » pour un objet du board.
 *
 * Retourne `null` si `web` est absent (endpoint non configuré, session non
 * authentifiée) ou la clé vide → l'appelant rend du texte, jamais de lien mort.
 */
export function x3Href(web: X3Web | null, fonction: X3Fonction, cle?: string): string | null {
  if (!web || !cle?.trim()) return null

  const transaction = TRANSACTIONS[fonction as keyof typeof TRANSACTIONS]
  const f = `${fonction}${transaction ? `~${transaction}` : ''}/2//M/${cle.trim()}`
  const inner = `/trans/x3/erp/${web.endpoint}/$sessions?f=${encodeURIComponent(f)}`

  return `${web.baseUrl}/syracuse-main/html/main.html?url=${encodeURIComponent(inner)}`
}

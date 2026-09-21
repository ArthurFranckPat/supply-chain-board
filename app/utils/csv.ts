/**
 * Sérialiseur CSV — conventions d'export de l'application.
 *
 * Les fichiers produits sont destinés à être ouverts TEL QUELS dans Excel FR,
 * donc :
 *  - séparateur de CHAMPS « ; » (la virgule y est le séparateur DÉCIMAL) ;
 *  - décimales à la VIRGULE ;
 *  - BOM UTF-8 en tête — sans lui Excel lit « Ã© » et casse les accents ;
 *  - fins de ligne CRLF (norme CSV, ce qu'attend Excel).
 *
 * Aucun séparateur de milliers : « 12 000,5 » se parse mal. Une valeur se lit
 * donc « 12000,5 ». C'est un fichier de DONNÉES, pas un écran.
 */

/** Marque d'ordre des octets — indispensable pour qu'Excel honore l'UTF-8. */
const BOM = '\uFEFF'

/**
 * Échappe un champ : guillemets UNIQUEMENT quand c'est nécessaire (champ vide,
 * ou contenant un guillemet, le séparateur, un retour ligne), guillemets
 * internes doublés. Sans échappement, un libellé contenant « ; » casserait le
 * fichier en deux colonnes — et le lecteur afficherait des décalages.
 */
function escapeField(value: string, delimiter: string): string {
  if (value === '') return ''
  const needsQuotes =
    value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)
  if (!needsQuotes) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Nombre au format d'Excel FR : virgule décimale, jamais de séparateur de
 * milliers. `decimals` fixe la précision (0 pour des pièces, 1 pour des heures
 * de poste). Une valeur non finie rend une chaîne vide plutôt que « NaN ».
 */
export function csvNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return ''
  return value.toFixed(decimals).replace('.', ',')
}

/**
 * Quantité : entier quand la valeur l'est (le cas courant), sinon jusqu'à 3
 * décimales sans zéros superflus. Une quantité n'est pas toujours entière — une
 * nomenclature peut consommer des fractions par pièce — et l'arrondir ferait
 * mentir le fichier.
 */
export function csvQty(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(3))).replace('.', ',')
}

/** ISO `YYYY-MM-DD…` → `JJ/MM/AAAA` (jamais d'ISO brut dans un export métier). */
export function csvDateFr(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * Assemble un tableau de lignes (chacune un tableau de champs) en un document
 * CSV complet, BOM inclus et terminé par un CRLF.
 *
 * Les `null`/`undefined` deviennent des champs vides : un export ne doit pas
 * écrire « null » à la place d'une donnée absente.
 */
export function toCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
  delimiter = ';'
): string {
  const body = rows
    .map((row) =>
      row.map((cell) => escapeField(cell == null ? '' : String(cell), delimiter)).join(delimiter)
    )
    .join('\r\n')
  return BOM + body + (body ? '\r\n' : '')
}

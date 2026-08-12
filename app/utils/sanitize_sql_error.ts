/**
 * Assainissement des messages d'erreur avant journalisation ou renvoi à l'appelant.
 *
 * Knex préfixe le message de TOUTE erreur SQL par la requête compilée, bindings
 * interpolés — `err.message = <sql formaté> + ' - ' + <message du driver>`. Sur un
 * `insert` par lots (photo des besoins, ingestion réplique : 400 lignes par chunk),
 * ce préfixe déverse dans la console, dans les fichiers de log et dans les tables
 * de journal l'intégralité des données métier écrites : fournisseurs, articles,
 * quantités, numéros de commande.
 *
 * On garde ce qui rend le log actionnable — le verbe, la table visée, la taille de
 * la requête, et surtout le message du driver, seul porteur de la cause réelle —
 * et on jette le corps de la requête.
 */

/** Au-delà, un message d'erreur n'apporte plus rien et ne fait que déverser. */
const MAX_LEN = 1000

/** Un message qui commence par un verbe SQL est un message préfixé par Knex. */
const VERBE_SQL =
  /^\s*(with|select|insert|update|delete|replace|create|alter|drop|truncate|merge|pragma)\b/i

/** Séparateur posé par Knex entre la requête et le message du driver. */
const SEP = ' - '

function tronquer(s: string): string {
  return s.length <= MAX_LEN ? s : `${s.slice(0, MAX_LEN)}… [tronqué]`
}

/** Table visée par la requête, pour situer l'échec sans citer une seule valeur. */
function tableCible(sql: string): string | null {
  const m =
    /\binsert\s+into\s+([`"[]?[\w.]+[`"\]]?)/i.exec(sql) ??
    /\bupdate\s+([`"[]?[\w.]+[`"\]]?)/i.exec(sql) ??
    /\bdelete\s+from\s+([`"[]?[\w.]+[`"\]]?)/i.exec(sql) ??
    /\bfrom\s+([`"[]?[\w.]+[`"\]]?)/i.exec(sql)
  return m ? m[1].replace(/[`"[\]]/g, '') : null
}

/**
 * Message d'erreur → message sans corps de requête, borné en longueur.
 *
 * Le découpage prend la DERNIÈRE occurrence de ` - ` : une valeur métier peut
 * contenir ` - `, jamais l'inverse. Se tromper de ce côté masque un bout du
 * message du driver ; se tromper de l'autre laisserait fuiter des données.
 */
export function sanitizeSqlErrorMessage(message: string): string {
  if (!VERBE_SQL.test(message)) return tronquer(message)

  const sep = message.lastIndexOf(SEP)
  const sql = sep === -1 ? message : message.slice(0, sep)
  const cause = sep === -1 ? '' : message.slice(sep + SEP.length)

  const verbe = (VERBE_SQL.exec(sql)?.[1] ?? 'sql').toLowerCase()
  const table = tableCible(sql)
  const resume = `[sql masqué : ${verbe}${table ? ` ${table}` : ''}, ${sql.length} car.]`

  return cause ? `${resume}${SEP}${tronquer(cause)}` : resume
}

/** Erreur (quelle que soit sa forme) → message assaini prêt à journaliser. */
export function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return sanitizeSqlErrorMessage(raw)
}

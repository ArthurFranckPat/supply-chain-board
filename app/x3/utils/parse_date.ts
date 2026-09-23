import { DateTime } from 'luxon'

/** X3 via Oracle retourne les dates en format DD-MMM-YY (ex: "07-JAN-26"). */
export function parseX3Date(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'string') return null
  const dt = DateTime.fromFormat(raw.trim(), 'dd-MMM-yy', { locale: 'en', zone: 'UTC' })
  return dt.isValid ? dt.toJSDate() : null
}

/**
 * `consume` Lucid pour une colonne date X3 : le `column.date` par défaut passe la chaîne
 * à `DateTime.fromSQL`, qui rejette "22-SEP-26" → DateTime invalide, silencieusement.
 */
export function consumeX3Date(value: unknown): DateTime | null {
  if (!value) return null
  if (value instanceof Date) return DateTime.fromJSDate(value)
  if (typeof value !== 'string') return null
  const x3 = DateTime.fromFormat(value.trim(), 'dd-MMM-yy', { locale: 'en', zone: 'UTC' })
  return x3.isValid ? x3 : DateTime.fromSQL(value)
}

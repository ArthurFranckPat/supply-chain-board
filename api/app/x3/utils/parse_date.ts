import { DateTime } from 'luxon'

/** X3 via Oracle retourne les dates en format DD-MMM-YY (ex: "07-JAN-26"). */
export function parseX3Date(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'string') return null
  const dt = DateTime.fromFormat(raw.trim(), 'dd-MMM-yy', { locale: 'en' })
  return dt.isValid ? dt.toJSDate() : null
}

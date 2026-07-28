/** Millisecondes dans une journée civile. */
export const DAY_MS = 86_400_000

/** Tronque une date à minuit en heure locale (comparaisons jour à jour). */
export function atMidnight(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Date locale → `YYYY-MM-DD`.
 * Préférer à `toISOString().slice(0, 10)` qui recule d'un jour à minuit en UTC+n.
 */
export function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Numéro de semaine ISO (calcul sur la date civile locale, convention usuelle). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

/** Lundi de la semaine contenant `d` (minuit local, lundi = début de semaine). */
export function mondayOf(d: Date): Date {
  const x = atMidnight(d)
  const dow = (x.getDay() + 6) % 7 // 0 = lundi
  x.setDate(x.getDate() - dow)
  return x
}

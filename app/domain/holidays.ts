/**
 * Jours fériés français, calculés (sans dépendance externe) — issue #37.
 *
 * Fixes : 1er janv., 1er mai, 8 mai, 14 juil., 15 août, 1er nov., 11 nov., 25 déc.
 * Mobiles (à partir de Pâques, algo de Butcher/Meeus) : Lundi de Pâques (+1),
 * Ascension (+39), Lundi de Pentecôte (+50).
 *
 * Hors périmètre (à activer si besoin, ex. site Alsace-Moselle) : Vendredi saint, 26 déc.
 */

export interface Holiday {
  /** Date ISO `YYYY-MM-DD`. */
  date: string
  /** Libellé FR. */
  name: string
}

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Dimanche de Pâques (grégorien, algo de Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const addDays = (d: Date, n: number): Date => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Liste des jours fériés FR d'une année (triée par date). */
export function frenchHolidays(year: number): Holiday[] {
  const easter = easterSunday(year)
  const out: Holiday[] = [
    { date: iso(new Date(year, 0, 1)), name: "Jour de l'An" },
    { date: iso(addDays(easter, 1)), name: 'Lundi de Pâques' },
    { date: iso(new Date(year, 4, 1)), name: 'Fête du Travail' },
    { date: iso(new Date(year, 4, 8)), name: 'Victoire 1945' },
    { date: iso(addDays(easter, 39)), name: 'Ascension' },
    { date: iso(addDays(easter, 50)), name: 'Lundi de Pentecôte' },
    { date: iso(new Date(year, 6, 14)), name: 'Fête nationale' },
    { date: iso(new Date(year, 7, 15)), name: 'Assomption' },
    { date: iso(new Date(year, 10, 1)), name: 'Toussaint' },
    { date: iso(new Date(year, 10, 11)), name: 'Armistice 1918' },
    { date: iso(new Date(year, 11, 25)), name: 'Noël' },
  ]
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Jours fériés couvrant une plage d'années (incluses). */
export function frenchHolidaysRange(fromYear: number, toYear: number): Holiday[] {
  const out: Holiday[] = []
  for (let y = fromYear; y <= toYear; y++) out.push(...frenchHolidays(y))
  return out
}

/**
 * Nombre de jours OUVRÉS entre deux dates ISO (inclusives pour `from`, exclusives
 * pour `to` — i.e. compte les jours ouvrés strictement après `from` et avant `to`).
 *
 * Utile pour calculer le retard « réel » d'une ligne : 1 jour calendaire friday→monday
 * = 0 jour ouvré (le week-end ne compte pas). Les jours fériés FR sont exclus.
 *
 * @param fromIso Date de référence (ex. : date d'expédition demandée).
 * @param toIso   Date cible (ex. : aujourd'hui). Si antérieure à `from`, retourne 0.
 */
export function workingDaysBetween(fromIso: string, toIso: string): number {
  if (toIso <= fromIso) return 0
  const fromYear = Number(fromIso.slice(0, 4))
  const toYear = Number(toIso.slice(0, 4))
  const closed = new Set(frenchHolidaysRange(fromYear, toYear + 1).map((h) => h.date))

  let count = 0
  const cur = new Date(fromIso + 'T00:00:00Z')
  const end = new Date(toIso + 'T00:00:00Z')
  while (cur < end) {
    const day = cur.getUTCDay() // 0 = dimanche, 6 = samedi
    const iso = cur.toISOString().slice(0, 10)
    if (day !== 0 && day !== 6 && !closed.has(iso)) count++
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return count
}

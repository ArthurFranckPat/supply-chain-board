import { addDays, isoDay, mondayOf } from '#app/utils/dates'

/**
 * Fenêtre hebdomadaire affichée par /charge.
 *
 * L'horizon de la page part du 1er du mois courant, donc du lundi qui le
 * contient : jusqu'à quatre semaines DÉJÀ ÉCOULÉES ouvrent le graphe. Le graphe
 * part désormais TOUJOURS de la semaine courante.
 *
 * Mais une semaine passée qui porte ENCORE de la charge (OF en retard, besoin
 * non soldé, reste d'une opération entamée) est du travail à faire, pas de
 * l'histoire : la couper la ferait disparaître. Les semaines écoulées sont donc
 * fondues en UNE barre « Retard » placée avant la semaine courante — le retard
 * reste visible sans que le graphe s'ouvre sur le passé. Sans charge passée,
 * pas de barre : elles sont simplement coupées.
 */

export interface WeekWindow {
  /** Nombre de semaines écoulées en tête de l'horizon (fondues ou coupées). */
  pastCount: number
  /** Vrai si ces semaines portent de la charge : une barre « Retard » les remplace. */
  retard: boolean
}

/**
 * @param weekKeys Lundis ISO de l'horizon, croissants.
 * @param hasLoad  Vrai si la semaine d'index `i` porte de la charge, toutes
 *                 lignes et tous crans confondus.
 */
export function weekWindow(
  weekKeys: string[],
  hasLoad: (index: number) => boolean,
  today: Date
): WeekWindow {
  const currentMonday = isoDay(mondayOf(today))
  let pastCount = 0
  while (pastCount < weekKeys.length && weekKeys[pastCount] < currentMonday) pastCount++
  // Horizon entièrement passé (l'utilisateur a visé un mois révolu) : on ne rend
  // pas un graphe vide, on lui montre ce qu'il a demandé, semaine par semaine.
  if (pastCount === 0 || pastCount >= weekKeys.length) return { pastCount: 0, retard: false }
  let retard = false
  for (let i = 0; i < pastCount && !retard; i++) retard = hasLoad(i)
  return { pastCount, retard }
}

/**
 * Clé du bucket « Retard » : l'intervalle `premier lundi~veille du lundi
 * courant`. Commence par une date ISO pour garder l'ordre lexicographique des
 * clés hebdo (le copilote ancre sa fenêtre par `k >= lundi`) ; le `~` la
 * distingue d'un lundi. Lue par `chargeBucketRange` (détail, export).
 */
export function retardBucketKey(firstMondayIso: string, currentMondayIso: string): string {
  const [y, m, d] = currentMondayIso.split('-').map(Number)
  return `${firstMondayIso}~${isoDay(addDays(new Date(y, m - 1, d), -1))}`
}

export function isRetardBucketKey(key: string): boolean {
  return key.includes('~')
}

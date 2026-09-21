import { isoDay, mondayOf } from '#app/utils/dates'

/**
 * Fenêtre hebdomadaire affichée par /charge.
 *
 * L'horizon de la page part du 1er du mois courant, donc du lundi qui le
 * contient : jusqu'à quatre semaines DÉJÀ ÉCOULÉES ouvrent le graphe. Vides,
 * elles n'apportent rien et poussent la charge réelle vers la droite.
 *
 * Une semaine passée qui porte ENCORE de la charge est un cas différent : OF en
 * retard, besoin non soldé, reste à produire d'une opération entamée. C'est du
 * travail à faire, pas de l'histoire — elle reste affichée, et tout ce qui la
 * suit avec elle.
 */

/**
 * Index de la première semaine à afficher : on coupe le préfixe de semaines
 * écoulées ET vides, rien de plus.
 *
 * @param weekKeys Lundis ISO de l'horizon, croissants.
 * @param hasLoad  Vrai si la semaine d'index `i` porte de la charge, toutes
 *                 lignes et tous crans confondus.
 */
export function firstVisibleWeek(
  weekKeys: string[],
  hasLoad: (index: number) => boolean,
  today: Date
): number {
  const currentMonday = isoDay(mondayOf(today))
  let i = 0
  while (i < weekKeys.length && weekKeys[i] < currentMonday && !hasLoad(i)) i++
  // Horizon entièrement passé (l'utilisateur a visé un mois révolu) : on ne rend
  // pas un graphe vide, on lui montre ce qu'il a demandé.
  return i >= weekKeys.length ? 0 : i
}

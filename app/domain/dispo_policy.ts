/**
 * Politique de disponibilité : stock strict (dispo instantanée) vs stock + réceptions
 * futures. Remplace le booléen `useReceptions` qui traversait 6 fichiers du domaine avec
 * des défauts contradictoires (issue #51) — un composant en retard de livraison doit
 * rester manquant tant que sa politique n'est pas explicitement 'stock_plus_receptions'.
 *
 * Pas de défaut exporté : chaque appelant choisit à la frontière (cf. architecture
 * faisabilité unique — badge/détail = 'stock_strict' toujours, projections = au cas par cas).
 */
export type DispoPolicy = 'stock_strict' | 'stock_plus_receptions'

export function includesReceptions(policy: DispoPolicy): boolean {
  return policy === 'stock_plus_receptions'
}

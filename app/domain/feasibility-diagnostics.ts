/**
 * Human-readable diagnostics for feasibility checks.
 *
 * Mirrors production_planning.feasibility.diagnostics.
 */

export function alertNoFeasibleDate(horizonDays: number): string {
  return `Aucune date faisable trouvee dans ${horizonDays} jours`
}

export function alertOrderLineNotFound(orderNumber: string, article: string): string {
  return `Commande ${orderNumber} / article ${article} non trouvee`
}

export function alertPurchaseSupplyInsufficient(): string {
  return 'Stock et receptions insuffisants meme a horizon max'
}

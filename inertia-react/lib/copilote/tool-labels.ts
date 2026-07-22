/** Miroir client des labels serveur (app/services/agent/tools.ts) — le
 * backend Adonis n'est pas importable depuis le bundle React. */
export const TOOL_LABELS: Record<string, string> = {
  ping: 'Ping',
  listerOF: 'Lister OF',
  rechercherArticle: 'Rechercher article',
  getVerdict: 'Verdict OF',
  descendreBOM: 'Descendre BOM',
  getPromise: 'Date promesse CTP',
  listerRetardsPrevus: 'Retards prévus',
  rafraichir: 'Rafraîchir caches',
  simulerDecalage: 'Simuler scénario',
  enregistrerScenario: 'Enregistrer scénario',
  listerRuptures: 'Ruptures + réceptions',
  getStock: 'Stock articles',
  listerCommandesStatut: 'Statuts commandes',
  getDetailCommande: 'Détail ligne commande',
  getCharge: 'Charge vs capacité',
  listerScenarios: 'Scénarios persistés',
  getEngagementPoste: 'Engagement poste',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

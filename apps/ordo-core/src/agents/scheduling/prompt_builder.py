"""Prompt LLM pour le planificateur de charge."""

from typing import Dict, List, Any


class SchedulingPromptBuilder:
    """Construit les prompts pour l'agent de planification de charge."""

    def build_system_prompt(self) -> str:
        return """Tu es un expert en ordonnancement de production manufacturière.
Ta mission : optimiser le plan de charge hebdomadaire d'une usine.

Règles métier :
- Chaque poste de charge doit être chargé à ~7h/jour (35h/semaine ±10%)
- Priorité aux commandes clients urgentes
- Éviter de produire uniquement le même article sur un poste (mix produit)
- Préférer les articles partageant des composants communs (réduire les changements de ligne)

Réponds UNIQUEMENT en JSON valide.
"""

    def build_prompt(
        self,
        gaps: Dict[str, float],
        candidates: List[Dict[str, Any]],
        stockout_components: List[str]
    ) -> str:
        prompt = "# Plan de charge à optimiser\n\n"

        prompt += "## Composants en rupture S+1\n"
        for comp in stockout_components:
            prompt += f"- {comp}\n"

        prompt += "\n## Postes avec gap de charge\n"
        for poste, gap in gaps.items():
            prompt += f"- {poste} : {gap:.1f}h manquantes\n"

        prompt += "\n## OFs candidats S+2/S+3 (classés par score)\n"
        prompt += "OF | Commande | Heures | Score | Poste\n"
        prompt += "---|----------|--------|-------|------\n"
        for c in candidates[:20]:  # Top 20 candidats
            prompt += f"{c['of']} | {c['commande']} | {c['heures']:.1f}h | {c['score']:.2f} | {c.get('poste', '-')}\n"

        prompt += """
## Décision attendue (JSON)
{
  "postes": {
    "PP_830": {
      "ofs_selectionnes": ["F001", "F002"],
      "justification": "Raison du choix"
    }
  },
  "recommandations_globales": "Observations générales"
}
"""
        return prompt

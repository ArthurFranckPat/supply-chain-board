"""Construction des prompts pour le LLM."""

from typing import Dict, Any, Optional


class LLMPromptBuilder:
    """Construit les prompts pour le LLM."""

    def __init__(self, language: str = "fr", detail_level: str = "high"):
        """Initialise le builder.

        Parameters
        ----------
        language : str
            Langue de la réponse (défaut: "fr")
        detail_level : str
            Niveau de détail ("low", "medium", "high")
        """
        self.language = language
        self.detail_level = detail_level

    def build_decision_prompt(
        self,
        context: Dict[str, Any]
    ) -> str:
        """Construit le prompt de décision.

        Parameters
        ----------
        context : Dict[str, Any]
            Contexte d'analyse (résultat de LLMAnalysisContext.to_dict())

        Returns
        -------
        str
            Prompt structuré pour le LLM
        """
        prompt = f"""# {self._get_system_prompt()}

# Contexte OF
- OF: {context['of_info']['num_of']}
- Article: {context['of_info']['article']}
- Quantité: {context['of_info']['quantite']}
- Date de fin: {context['of_info']['date_fin']}
- Statut: {context['of_info']['statut']}
"""

        # Ajouter les infos commande si disponibles
        if context.get('commande_info'):
            cmd = context['commande_info']
            prompt += f"""
# Contexte Commande
- Commande: {cmd['num_commande']}
- Client: {cmd['client']}
- Article: {cmd['article']}
- Quantité restante: {cmd['quantite_restante']}
- Date d'expédition: {cmd['date_expedition']}
- Urgence: {cmd['urgence']}
"""

        # Ajouter l'analyse des composants
        prompt += f"""
# Analyse des Composants
Composant  | Niv | Type | Requis | Phys | Alloué* | Alloué† | Bloqué | Dispo | Net‡ | Situation | Ratio | Récept. | Date Récept.
-----------|-----|------|--------|------|---------|---------|--------|-------|------|-----------|-------|---------|-------------
"""

        for comp in context['composants']:
            type_article_short = comp['type_article'][0] if comp['type_article'] else 'A'
            recept = comp.get('receptions_imminentes', 0)
            date_recept = comp.get('date_reception_prochaine', '') or ''
            prompt += (
                f"{comp['article'][:10]:10} | "
                f"{comp['niveau']:3} | "
                f"{type_article_short:4} | "
                f"{comp['quantite_requise']:6} | "
                f"{comp['stock_physique']:5} | "
                f"{comp['stock_alloue_total']:7} | "
                f"{comp['stock_alloue_cet_of']:7} | "
                f"{comp['stock_bloque']:6} | "
                f"{comp['stock_disponible']:5} | "
                f"{comp['stock_net_pour_of']:4} | "
                f"{comp['situation']:9} | "
                f"{comp['ratio_couverture']:.0%}   | "
                f"{recept:7} | "
                f"{date_recept}\n"
            )

        prompt += """
* Alloué total (tous OFs confondus)
† Alloué à cet OF précis
‡ Net = Disponible + Alloué à cet OF
"""

        # Ajouter les composants critiques
        if context['composants_critiques']:
            prompt += "\n# Composants Critiques\n"
            for i, comp in enumerate(context['composants_critiques'], 1):
                # type_article n'est pas dans ComposantCritique, seulement dans ComposantAnalyse
                prompt += f"{i}. {comp['article']} (Niveau {comp['niveau']})\n"
                prompt += f"   - Type: {comp['type_probleme'].upper()}\n"
                prompt += f"   - Gravité: {comp['gravite'].upper()}\n"
                prompt += f"   - Description: {comp['description']}\n"
                prompt += f"   - Action suggérée: \"{comp['action_suggeree'].upper()}\"\n"

                if comp.get('details'):
                    details = comp['details']
                    if 'potentiel_deblocage' in details:
                        prompt += f"   - Potentiel de déblocage: {details['potentiel_deblocage'] > details.get('manque', 0)} ✅\n"
                    prompt += "\n"

        # Ajouter la situation globale
        sit = context['situation_globale']
        prompt += f"""
# Analyse de la Situation
- Faisabilité: {sit['faisabilite'].upper()}
"""
        if sit.get('raison_blocage'):
            prompt += f"- Raison: {sit['raison_blocage']}\n"

        if sit.get('conditions_deblocage'):
            prompt += "- Conditions de déblocage:\n"
            for condition in sit['conditions_deblocage']:
                prompt += f"  • {condition}\n"

        if sit.get('delai_estime'):
            prompt += f"- Délai estimé: {sit['delai_estime']}\n"

        # Ajouter les OFs concurrents si présents
        if context.get('competing_ofs_summary'):
            c = context['competing_ofs_summary']
            prompt += f"""
# Concurrence entre OFs
- Nombre d'OFs en concurrence pour les mêmes composants : {c['nb_competing']}
"""
            if c.get('of_plus_urgent'):
                prompt += f"- OF concurrent le plus urgent : {c['of_plus_urgent']} (date fin : {c.get('date_plus_urgent', 'inconnue')})\n"

        # Ajouter la mission
        prompt += f"""
# Ta Mission
Propose une décision métier nuancée en considérant:
"""
        if context.get('commande_info'):
            cmd = context['commande_info']
            prompt += f"1. L'urgence de la commande (client {cmd['client']}, urgence {cmd['urgence']})\n"

        # Ajouter des instructions spécifiques selon la situation
        if sit['faisabilite'] == "faisable_avec_conditions":
            if sit.get('delai_estime'):
                prompt += f"2. Le délai de déblocage ({sit['delai_estime']}) est-il acceptable au vu de l'urgence ?\n"
        elif sit['faisabilite'] == "faisable_apres_reception":
            if sit.get('delai_estime'):
                prompt += f"2. Les réceptions imminentes couvrent le manque dans {sit['delai_estime']} — DEFER est la décision logique\n"

        prompt += """3. Les actions concrètes à entreprendre
4. Les contraintes de production (délai, qualité, etc.)

# Format de Réponse OBLIGATOIRE
Tu dois répondre UNIQUEMENT avec un objet JSON valide. Pas de texte avant, pas de texte après, pas de markdown, pas de code blocks.

EXEMPLE de réponse correcte:
{"action":"ACCEPT_AS_IS","reason":"Tous les composants disponibles","modified_quantity":null,"defer_date":null,"action_required":"Lancer la production","confidence":1.0,"metadata":{"composants_limitants":[],"situation":"disponible","delai_estime":null,"action_nature":null}}

Ta réponse (obligatoirement au format JSON ci-dessous, sans aucune modification):
{
  "action": "ACCEPT_AS_IS",
  "reason": "Ta raison en 2-3 phrases",
  "modified_quantity": null,
  "defer_date": null,
  "action_required": "Action concrète",
  "confidence": 0.8,
  "metadata": {
    "composants_limitants": [],
    "situation": "disponible",
    "delai_estime": null,
    "action_nature": null
  }
}
"""
        return prompt

    def build_system_prompt(self) -> str:
        """Construit le prompt système.

        Returns
        -------
        str
            Prompt système
        """
        return """Tu es un expert en ordonnancement production manufacturier avec plus de 20 ans d'expérience.

Ta tâche est d'analyser un Ordre de Fabrication (OF) et de proposer une décision métier nuancée parmi:
- ACCEPT_AS_IS: L'OF est faisable en l'état, accepter tel quel
- ACCEPT_PARTIAL: L'OF est partiellement faisable, accepter une quantité réduite
- DEFER: L'OF n'est pas faisable maintenant mais le sera bientôt, reporter la décision
- DEFER_PARTIAL: Report avec acceptation partielle
- REJECT: L'OF n'est pas faisable et ne le sera pas, rejeter

## Ta méthodologie d'analyse:

1. **Analyser les allocations**: Vérifier d'abord les composants déjà alloués à cet OF
   - Le stock_net = stock_disponible + stock_alloué_à_cet_of
   - C'est ce qui est RÉELLEMENT disponible pour la production

2. **Comprendre la nature du blocage**:
   - Stock bloqué = en contrôle qualité (TEMPORAIRE, sera disponible)
   - Stock disponible = 0 mais alloué = réservé pour d'autres OFs (PERMANENT)
   - Rupture vraie = pas de stock, pas d'allocation, pas de bloqué (PROBLÈME)

3. **Proposer des actions concrètes**:
   - Si bloqué: "Accélérer le contrôle qualité"
   - Si rupture: "Contacter fournisseur" ou "Proposer article alternatif"
   - Si insuffisant: "Allouer plus de stock" ou "Réduire la quantité"

4. **Être pragmatique**: L'objectif est de servir le client, pas d'être parfait
   - 95% de satisfaction avec 2 jours de retard > 100% de satisfaction avec annulation
   - Les allocations déjà faites sont des engagements, les respecter

## Règles de décision:

- **ACCEPT_AS_IS**: Tous les composants disponibles (ratio >= 100%)
- **ACCEPT_PARTIAL**: Ratio entre 80% et 99%, avec quantité modifiée réaliste
- **DEFER**: Faisable après déblocage (stock bloqué suffisant), délai acceptable
- **REJECT**: Rupture sans perspective, ou délai inacceptable
- **DEFER_PARTIAL**: Faisable partiellement après déblocage

## Format de sortie:
JSON UNIQUEMENT, sans texte autour, sans markdown.
"""

    def _get_system_prompt(self) -> str:
        """Retourne le titre du prompt."""
        return "Analyse de Faisabilité d'Ordre de Fabrication"

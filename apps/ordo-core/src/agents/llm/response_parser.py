"""Parsing des réponses LLM."""

import json
from dataclasses import dataclass
from typing import Dict, Any, Optional


@dataclass
class ParsedLLMDecision:
    """Décision parsée depuis la réponse LLM."""
    action: str  # "ACCEPT_AS_IS", "ACCEPT_PARTIAL", "REJECT", "DEFER", "DEFER_PARTIAL"
    reason: str
    modified_quantity: Optional[int]
    defer_date: Optional[str]
    action_required: str
    confidence: float
    metadata: Dict[str, Any]


class LLMResponseParser:
    """Parse la réponse JSON du LLM."""

    def parse_decision(self, response: str) -> ParsedLLMDecision:
        """Parse la réponse JSON du LLM.

        Parameters
        ----------
        response : str
            Réponse brute du LLM

        Returns
        -------
        ParsedLLMDecision
            Décision parsée

        Raises
        ------
        ValueError
            Si la réponse n'est pas un JSON valide
            Si des champs requis sont manquants
            Si des valeurs sont invalides
        """
        # Nettoyer la réponse
        cleaned_response = self._clean_response(response)

        # Parser le JSON
        try:
            data = json.loads(cleaned_response)
        except json.JSONDecodeError as e:
            # Logger la réponse brute pour debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Réponse LLM brute (longueur: {len(response)}):")
            logger.error(f"Réponse: {response[:1000]}")
            logger.error(f"Nettoyée: {cleaned_response[:1000]}")
            raise ValueError(
                f"Réponse n'est pas un JSON valide: {e}\n"
                f"Réponse: {cleaned_response[:500]}"
            )

        # Valider les champs requis
        required_fields = ["action", "reason", "action_required", "confidence"]
        for field in required_fields:
            if field not in data:
                raise ValueError(f"Champ requis manquant: {field}")

        # Valider l'action
        valid_actions = [
            "ACCEPT_AS_IS", "ACCEPT_PARTIAL",
            "REJECT", "DEFER", "DEFER_PARTIAL"
        ]
        if data["action"] not in valid_actions:
            raise ValueError(
                f"Action invalide: {data['action']}. "
                f"Actions valides: {valid_actions}"
            )

        # Valider la confidence
        try:
            confidence = float(data["confidence"])
        except (ValueError, TypeError):
            raise ValueError(f"Confidence doit être un nombre: {data.get('confidence')}")

        if not 0.0 <= confidence <= 1.0:
            raise ValueError(f"Confidence doit être entre 0.0 et 1.0: {confidence}")

        # Valider la cohérence des champs optionnels
        if data["action"] == "ACCEPT_PARTIAL":
            if data.get("modified_quantity") is None:
                raise ValueError("ACCEPT_PARTIAL requiert modified_quantity")
            try:
                modified_quantity = int(data["modified_quantity"])
                if modified_quantity <= 0:
                    raise ValueError(f"modified_quantity doit être > 0: {modified_quantity}")
            except (ValueError, TypeError):
                raise ValueError(f"modified_quantity invalide: {data.get('modified_quantity')}")
        else:
            modified_quantity = None

        if data["action"] in ["DEFER", "DEFER_PARTIAL"]:
            defer_date = data.get("defer_date")
            if defer_date:
                # Valider le format de date
                try:
                    from datetime import datetime
                    datetime.strptime(defer_date, "%Y-%m-%d")
                except ValueError as e:
                    raise ValueError(f"defer_date invalide (attendu YYYY-MM-DD): {defer_date}")
            else:
                raise ValueError(f"{data['action']} requiert defer_date")
        else:
            defer_date = None

        # Nettoyer et valider la raison
        reason = self._sanitize_reason(data["reason"])

        # Valider l'action_required
        action_required = data["action_required"].strip()
        if not action_required:
            raise ValueError("action_required ne peut pas être vide")

        # Créer la décision parsée
        return ParsedLLMDecision(
            action=data["action"],
            reason=reason,
            modified_quantity=modified_quantity,
            defer_date=defer_date,
            action_required=action_required,
            confidence=confidence,
            metadata=data.get("metadata", {})
        )

    def _clean_response(self, response: str) -> str:
        """Nettoie la réponse du LLM.

        Parameters
        ----------
        response : str
            Réponse brute du LLM

        Returns
        -------
        str
            Réponse nettoyée (JSON uniquement)
        """
        import re

        response = response.strip()

        # Méthode 1: Trouver le premier objet JSON complet (racine)
        # Cherche le premier { et fait correspondre avec le dernier } correspondant
        first_brace = response.find('{')
        if first_brace >= 0:
            # Compter les accolades pour trouver la fermante correspondante
            brace_count = 0
            for i in range(first_brace, len(response)):
                if response[i] == '{':
                    brace_count += 1
                elif response[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        # Trouvé ! Extraire l'objet JSON complet
                        return response[first_brace:i+1]

        # Méthode 2: Enlever les marques de code markdown
        if response.startswith("```"):
            lines = response.split("\n")
            if len(lines) > 1:
                # Trouver la fin du bloc de code
                end_idx = -1
                for i in range(1, len(lines)):
                    if lines[i].startswith("```"):
                        end_idx = i
                        break

                if end_idx > 0:
                    response = "\n".join(lines[1:end_idx])
                else:
                    response = "\n".join(lines[1:])
            else:
                response = response.replace("```json", "").replace("```", "")

        return response

    def _sanitize_reason(self, reason: str) -> str:
        """Nettoie et formate la raison.

        Parameters
        ----------
        reason : str
            Raison à nettoyer

        Returns
        -------
        str
            Raison nettoyée
        """
        # Limiter la longueur
        if len(reason) > 500:
            reason = reason[:497] + "..."

        return reason.strip()

    def validate_decision(self, decision: ParsedLLMDecision) -> bool:
        """Valide la cohérence de la décision.

        Parameters
        ----------
        decision : ParsedLLMDecision
            Décision à valider

        Returns
        -------
        bool
            True si valide, False sinon
        """
        # Valider la cohérence action/champs
        if decision.action == "ACCEPT_PARTIAL":
            if decision.modified_quantity is None or decision.modified_quantity <= 0:
                return False

        if decision.action in ["DEFER", "DEFER_PARTIAL"]:
            if decision.defer_date is None:
                return False

        # Rejeter uniquement confidence = 0.0 (le LLM dit lui-même qu'il ne sait pas)
        # Les cas ambigus avec confidence faible mais > 0.0 sont valides
        if decision.confidence <= 0.0:
            return False

        return True

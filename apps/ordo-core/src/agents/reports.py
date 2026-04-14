"""Génération de rapports de décisions métier."""

import json
import os
from datetime import datetime
from typing import Dict

from .models import AgentDecision
from ..algorithms.allocation import AllocationResult


class DecisionReporter:
    """Génération de rapports de décisions."""

    def generate_markdown_report(
        self,
        results: Dict[str, AllocationResult],
        output_path: str
    ):
        """Génère un rapport Markdown.

        Parameters
        ----------
        results : Dict[str, AllocationResult]
            Résultats d'allocation par numéro d'OF
        output_path : str
            Chemin du fichier de sortie
        """
        lines = []
        lines.append("# Rapport de Décisions Métier")
        lines.append(f"\nGénéré le : {datetime.now().strftime('%d/%m/%Y %H:%M')}\n")

        # Résumé
        decisions = [r.decision for r in results.values() if hasattr(r, 'decision') and r.decision]

        lines.append("## Résumé\n")
        lines.append(f"- Total OFs traités : {len(results)}")
        lines.append(f"- OFs avec décision : {len(decisions)}")

        # Par action
        action_counts = {}
        for d in decisions:
            action = d.action.value
            action_counts[action] = action_counts.get(action, 0) + 1

        lines.append("\n### Par action")
        for action, count in sorted(action_counts.items()):
            lines.append(f"- **{action}** : {count}")

        # Détail par OF
        lines.append("\n## Détail par OF\n")

        for of_num, result in sorted(results.items()):
            if not hasattr(result, 'decision') or not result.decision:
                continue

            d = result.decision
            lines.append(f"### {of_num}")
            lines.append(f"- **Action** : {d.action.value}")
            lines.append(f"- **Raison** : {d.reason}")

            if d.modified_quantity:
                lines.append(f"- **Quantité modifiée** : {d.modified_quantity}")

            if d.metadata.get('weighted_score'):
                lines.append(f"- **Score** : {d.metadata['weighted_score']:.2f}")

            lines.append("")

        # Écrire le fichier
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            f.write('\n'.join(lines))

    def generate_json_report(
        self,
        results: Dict[str, AllocationResult],
        output_path: str
    ):
        """Génère un rapport JSON.

        Parameters
        ----------
        results : Dict[str, AllocationResult]
            Résultats d'allocation par numéro d'OF
        output_path : str
            Chemin du fichier de sortie
        """
        report = {
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_ofs": len(results),
                "with_decisions": sum(1 for r in results.values() if hasattr(r, 'decision') and r.decision)
            },
            "decisions": []
        }

        for of_num, result in sorted(results.items()):
            if not hasattr(result, 'decision') or not result.decision:
                continue

            d = result.decision
            report["decisions"].append({
                "of_num": of_num,
                "action": d.action.value,
                "reason": d.reason,
                "modified_quantity": d.modified_quantity,
                "metadata": d.metadata
            })

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)

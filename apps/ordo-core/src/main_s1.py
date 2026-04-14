"""Fonction main_s1 pour le mode S+1."""

from datetime import date
import os
from typing import Dict

from rich.console import Console

from .checkers import ImmediateChecker, ProjectedChecker, RecursiveChecker
from .algorithms import AllocationManager, CommandeOFMatcher
from .reports import (
    build_action_report,
    format_rapport_s1,
    render_action_report_console,
    write_action_report_markdown,
)
from .agents import AgentEngine, AgentContext


def main_s1(args, loader, include_previsions=False):
    """Fonction principale pour le mode S+1.

    Parameters
    ----------
    args
        Arguments de ligne de commande
    loader : DataLoader
        Loader de données
    include_previsions : bool
        Si True, inclut les prévisions (défaut: False)
    """
    from rich.console import Console

    console = Console()
    horizon = args.horizon
    date_ref = getattr(args, "_resolved_reference_date", date.today())

    console.print(f"[bold cyan]🎯 MODE S+1 : Commandes des {horizon} prochains jours[/bold cyan]")
    console.print(f"   Date de référence : {date_ref.strftime('%d/%m/%Y')}")
    if include_previsions:
        console.print(f"   [yellow]⚠️  Prévisions incluses[/yellow]")
    console.print()

    # 1. Récupérer les commandes de S+1
    console.print(f"[bold cyan]📋 Recherche des commandes S+1...[/bold cyan]")
    besoins_s1 = loader.get_commandes_s1(date_ref, horizon, include_previsions=include_previsions)

    if not besoins_s1:
        console.print("[yellow]⚠️  Aucune commande trouvée pour l'horizon S+1[/yellow]")
        return

    commandes = [b for b in besoins_s1 if b.est_commande()]
    previsions = [b for b in besoins_s1 if b.est_prevision()]

    console.print(f"✅ {len(besoins_s1)} besoins trouvés")
    if include_previsions:
        console.print(f"   📦 Commandes : {len(commandes)}")
        console.print(f"   📊 Prévisions : {len(previsions)}")
    console.print()

    # 2. Matcher les commandes avec les OF
    console.print(f"[bold cyan]🔗 Matching commande→OF...[/bold cyan]")
    matcher = CommandeOFMatcher(loader, date_tolerance_days=10)
    resultats_matching = matcher.match_commandes(besoins_s1)

    of_trouves = sum(1 for r in resultats_matching if r.of is not None)
    console.print(f"✅ {of_trouves}/{len(besoins_s1)} OF matchés")

    # Détail par type
    mts_count = sum(1 for r in resultats_matching if r.commande.is_mts() and r.of is not None)
    nor_mto_count = sum(1 for r in resultats_matching if r.commande.is_nor_mto() and r.of is not None)
    console.print(f"   MTS : {mts_count}")
    console.print(f"   NOR/MTO : {nor_mto_count}")

    # Détail par nature
    if include_previsions:
        commandes_match = sum(1 for r in resultats_matching if r.commande.est_commande() and r.of is not None)
        previsions_match = sum(1 for r in resultats_matching if r.commande.est_prevision() and r.of is not None)
        console.print(f"   Commandes matchées : {commandes_match}")
        console.print(f"   Prévisions matchées : {previsions_match}")
    console.print()

    # 3. Évaluation pré-allocation avec DecisionEngine
    ofs_a_verifier = [r.of for r in resultats_matching if r.of is not None]
    resultats_faisabilite: Dict[str, any] = {}

    if ofs_a_verifier:
        console.print(f"[bold cyan]🧠 Évaluation décisionnelle pré-allocation...[/bold cyan]")

        # Créer le DecisionEngine (mode LLM si --llm activé)
        use_llm = getattr(args, 'llm', False)
        llm_model = getattr(args, 'llm_model', 'mistral-large-latest')

        if use_llm:
            api_key = os.environ.get("MISTRAL_API_KEY")
            if not api_key:
                console.print("[bold red]Erreur: MISTRAL_API_KEY non défini. Mode LLM désactivé.[/bold red]")
                use_llm = False

        if use_llm:
            from .agents.llm.mistral_client import MistralLLMClient
            llm_client = MistralLLMClient(model=llm_model)
            decision_engine = AgentEngine(
                "config/decisions.yaml",
                use_llm=True,
                llm_client=llm_client,
                loader=loader
            )
            console.print(f"[bold yellow]⚡ Mode LLM activé : {llm_model}[/bold yellow]")
        else:
            decision_engine = AgentEngine("config/decisions.yaml", loader=loader)

        # Évaluer tous les OF avec leur contexte de commande
        decisions_pre: Dict[str, any] = {}
        for resultat in resultats_matching:
            if resultat.of is None:
                continue

            of = resultat.of
            commande = resultat.commande

            # Récupérer le stock initial
            initial_stock = {}
            for article_code, stock_info in loader.stocks.items():
                available = stock_info.stock_physique - stock_info.stock_alloue - stock_info.stock_bloque
                if available > 0:
                    initial_stock[article_code] = available

            # Évaluer avant allocation
            decision = decision_engine.evaluate_pre_allocation(
                of=of,
                initial_stock=initial_stock,
                competing_ofs=ofs_a_verifier,
                commande=commande
            )
            decisions_pre[of.num_of] = decision

        # Statistiques des décisions
        from .agents.models import AgentAction
        accept_as_is = sum(1 for d in decisions_pre.values() if d.action == AgentAction.ACCEPT_AS_IS)
        accept_partial = sum(1 for d in decisions_pre.values() if d.action == AgentAction.ACCEPT_PARTIAL)
        reject = sum(1 for d in decisions_pre.values() if d.action == AgentAction.REJECT)
        defer = sum(1 for d in decisions_pre.values() if d.action in [AgentAction.DEFER, AgentAction.DEFER_PARTIAL])

        console.print(f"✅ Évaluation terminée : {len(decisions_pre)} décisions")
        console.print(f"   ✓ Accepter tel quel : {accept_as_is}")
        console.print(f"   ➤ Accepter partiel : {accept_partial}")
        console.print(f"   ✗ Rejeter : {reject}")
        console.print(f"   ⏰ Reporter : {defer}")
        console.print()

        # Appliquer les décisions ACCEPT_PARTIAL
        of_original_quantities: Dict[str, int] = {}
        for of_num, decision in decisions_pre.items():
            if decision.action == AgentAction.ACCEPT_PARTIAL and decision.modified_quantity:
                of = next((o for o in ofs_a_verifier if o.num_of == of_num), None)
                if of:
                    # Sauvegarder la quantité originale
                    of_original_quantities[of_num] = of.qte_restante
                    # Modifier temporairement
                    of.qte_restante = decision.modified_quantity
                    console.print(f"   [yellow]➤[/yellow] {of_num} : {of_original_quantities[of_num]} → {decision.modified_quantity}")

        if of_original_quantities:
            console.print()

        # 4. Vérifier la faisabilité des OF (avec quantités modifiées pour ACCEPT_PARTIAL)
        feasibility_mode = getattr(args, "feasibility_mode", "projected")
        mode_labels = {
            "immediate": "dispo immédiate",
            "projected": "dispo projetée",
            "allocation": "allocation virtuelle",
        }
        console.print(
            f"[bold cyan]🔍 Vérification de faisabilité "
            f"({mode_labels.get(feasibility_mode, feasibility_mode)})...[/bold cyan]"
        )

        if feasibility_mode == "immediate":
            checker = ImmediateChecker(loader)
            resultats_faisabilite = checker.check_all_ofs(ofs_a_verifier)
        elif feasibility_mode == "allocation":
            recursive_checker = RecursiveChecker(
                loader,
                use_receptions=True,
                check_date=date_ref,
            )
            allocation_manager = AllocationManager(
                data_loader=loader,
                checker=recursive_checker,
                decision_engine=None,
            )
            allocation_results = allocation_manager.allocate_stock(ofs_a_verifier)
            resultats_faisabilite = {
                of_num: result.feasibility_result
                for of_num, result in allocation_results.items()
                if result.feasibility_result is not None
            }
        else:
            checker = ProjectedChecker(loader)
            resultats_faisabilite = checker.check_all_ofs(ofs_a_verifier)

        faisables = sum(1 for r in resultats_faisabilite.values() if r.feasible)
        console.print(f"✅ {faisables}/{len(ofs_a_verifier)} OF faisables")
        console.print()

        # 5. Rapport d'actions appro S+1
        action_report = build_action_report(
            loader,
            resultats_matching,
            resultats_faisabilite,
            reference_date=date_ref,
        )
        if action_report.component_lines or action_report.poste_kanban_lines:
            render_action_report_console(action_report)
            output_dir = "reports/actions"
            output_path = os.path.join(output_dir, "s1_action_report.md")
            write_action_report_markdown(action_report, output_path)
            console.print(f"[green]✅ Rapport d'actions appro généré : {output_path}[/green]")
            console.print()

        # 6. Évaluation post-allocation pour les OF non faisables
        console.print(f"[bold cyan]🧠 Évaluation décisionnelle post-allocation...[/bold cyan]")
        non_faisable_ofs = [of for of in ofs_a_verifier if not resultats_faisabilite[of.num_of].feasible]

        if non_faisable_ofs:
            decisions_post: Dict[str, any] = {}
            for resultat in resultats_matching:
                if resultat.of is None or resultat.of.num_of not in [of.num_of for of in non_faisable_ofs]:
                    continue

                of = resultat.of
                commande = resultat.commande

                # Récupérer le stock restant après allocation virtuelle
                remaining_stock = {}
                for article_code, stock_info in loader.stocks.items():
                    available = stock_info.stock_physique - stock_info.stock_alloue - stock_info.stock_bloque
                    if available > 0:
                        remaining_stock[article_code] = available

                # Évaluer via le moteur (gère LLM et mode classique)
                class _FeasStub:
                    def __init__(self, feasibility_result):
                        self.feasibility_result = feasibility_result

                decision = decision_engine.evaluate_post_allocation(
                    of=of,
                    allocation_result=_FeasStub(resultats_faisabilite[of.num_of]),
                    commande=commande
                )
                decisions_post[of.num_of] = decision

            console.print(f"✅ {len(decisions_post)} décisions post-allocation")
            console.print()

        # 7. Restaurer les quantités originales
        for of_num, original_qty in of_original_quantities.items():
            of = next((o for o in ofs_a_verifier if o.num_of == of_num), None)
            if of:
                of.qte_restante = original_qty

        # 8. Générer les rapports de décisions
        try:
            from src.agents.reports import DecisionReporter
            from dataclasses import dataclass

            @dataclass
            class DecisionWrapper:
                """Wrapper pour adapter AgentDecision au format attendu par DecisionReporter."""
                decision: any

            # Créer des wrappers pour les décisions
            wrapped_decisions = {
                of_num: DecisionWrapper(decision=decision)
                for of_num, decision in decisions_pre.items()
            }

            reporter = DecisionReporter()
            output_dir = "reports/decisions"

            # Créer le répertoire si nécessaire
            os.makedirs(output_dir, exist_ok=True)

            # Générer rapport Markdown
            md_path = os.path.join(output_dir, "decisions_report.md")
            reporter.generate_markdown_report(wrapped_decisions, md_path)
            console.print(f"✅ Rapport Markdown généré : {md_path}")

            # Générer rapport JSON
            json_path = os.path.join(output_dir, "decisions_report.json")
            reporter.generate_json_report(wrapped_decisions, json_path)
            console.print(f"✅ Rapport JSON généré : {json_path}")
            console.print()
        except Exception as e:
            console.print(f"[yellow]⚠️  Impossible de générer les rapports: {e}[/yellow]")
            console.print()
    else:
        console.print("[yellow]⚠️  Aucun OF à vérifier[/yellow]")
        console.print()

    # 9. Planification de charge (si --schedule activé)
    if getattr(args, 'schedule', False) and ofs_a_verifier:
        console.print("[bold cyan]📅 Planification de charge...[/bold cyan]")
        ofs_faisables_s1 = [of for of in ofs_a_verifier if resultats_faisabilite[of.num_of].feasible]

        if ofs_faisables_s1:
            try:
                schedule_result = decision_engine.plan_schedule(
                    s1_feasible_ofs=ofs_faisables_s1,
                    feasibility_results=resultats_faisabilite,
                    reference_date=date_ref,
                    matcher=matcher
                )

                console.print(schedule_result.explanation)
                if schedule_result.s2_s3_candidates_selected:
                    console.print(f"[bold green]✅ {len(schedule_result.s2_s3_candidates_selected)} OF(s) S+2/S+3 recommandés à affirmer[/bold green]")
                    for candidate in schedule_result.s2_s3_candidates_selected[:10]:
                        heures_totales = sum(candidate.hours_per_poste.values())
                        console.print(f"   ➤ {candidate.of.num_of} ({candidate.of.article}) — {heures_totales:.1f}h")
                    if len(schedule_result.s2_s3_candidates_selected) > 10:
                        console.print(f"   ... et {len(schedule_result.s2_s3_candidates_selected) - 10} autres")
                if schedule_result.llm_reasoning:
                    console.print("\n[bold yellow]📝 Analyse LLM :[/bold yellow]")
                    console.print(schedule_result.llm_reasoning[:500])
                    if len(schedule_result.llm_reasoning) > 500:
                        console.print("...")
                console.print()
            except Exception as e:
                console.print(f"[bold red]❌ Erreur lors de la planification : {e}[/bold red]")
                console.print()

    # 6. Afficher le rapport
    format_rapport_s1(resultats_matching, resultats_faisabilite, include_previsions=include_previsions)

"""Point d'entrée principal du système de vérification de faisabilité."""

import argparse
from datetime import date, datetime
from pathlib import Path

from rich.console import Console

from .loaders import DataLoader
from .checkers import ImmediateChecker, ProjectedChecker, RecursiveChecker
from .algorithms import AllocationManager, AllocationResult, AllocationStatus
from .agents import AgentEngine
from .algorithms import calculate_weekly_charge_heatmap
from .scheduler import run_schedule
from .utils import format_of_table, format_detailed_report, format_summary
from .utils import format_charge_heatmap, format_charge_summary
from .main_s1 import main_s1

console = Console()


DEFAULT_REFERENCE_DATE = date(2026, 3, 23)


def _resolve_reference_date(raw_value: str | None) -> date:
    """Resolve la date de reference du run.

    Par defaut, on utilise la date d'extraction des donnees partagee par l'utilisateur.
    """
    if not raw_value:
        return DEFAULT_REFERENCE_DATE
    return datetime.strptime(raw_value, "%Y-%m-%d").date()


def main():
    """Fonction principale."""
    parser = argparse.ArgumentParser(
        description="Système de vérification de faisabilité des composants pour l'ordonnancement production"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="data",
        help="Répertoire contenant les fichiers CSV (défaut: data)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limite le nombre d'OF à vérifier (pour les tests)",
    )
    parser.add_argument(
        "--of",
        type=str,
        default=None,
        help="Numéro d'OF spécifique à vérifier (ex: F426-08419)",
    )
    parser.add_argument(
        "--commande",
        type=str,
        default=None,
        help="Numéro de commande client à vérifier (ex: AR2600885)",
    )
    parser.add_argument(
        "--detailed",
        action="store_true",
        help="Affiche un rapport détaillé pour chaque OF",
    )
    parser.add_argument(
        "--no-allocation",
        action="store_true",
        help="Désactive la gestion de la concurrence",
    )
    parser.add_argument(
        "--no-virtual-allocation",
        action="store_true",
        help="Désactive l'allocation virtuelle (vérification indépendante des OF)",
    )
    parser.add_argument(
        "--s1",
        action="store_true",
        help="Mode S+1 : Vérifier les OF pour les commandes des 7 prochains jours",
    )
    parser.add_argument(
        "--horizon",
        type=int,
        default=7,
        help="Horizon en jours pour le mode S+1 (défaut: 7)",
    )
    parser.add_argument(
        "--with-previsions",
        action="store_true",
        help="Inclut les prévisions Export dans l'analyse (mode S+1)",
    )
    parser.add_argument(
        "--schedule",
        action="store_true",
        help="Active le planificateur de charge (mode S+1 requis)",
    )
    parser.add_argument(
        "--charge-heatmap",
        action="store_true",
        help="Génère une heatmap de charge par poste de charge",
    )
    parser.add_argument(
        "--num-weeks",
        type=int,
        default=4,
        help="Nombre de semaines pour la heatmap (défaut: 4)",
    )
    parser.add_argument(
        "--llm",
        action="store_true",
        default=False,
        help="Active le mode LLM pour les décisions (nécessite MISTRAL_API_KEY)",
    )
    parser.add_argument(
        "--llm-model",
        type=str,
        default="mistral-large-latest",
        help="Modèle LLM à utiliser (défaut: mistral-large-latest)",
    )
    parser.add_argument(
        "--reference-date",
        type=str,
        default=None,
        help="Date de reference de l'analyse au format YYYY-MM-DD (defaut: 2026-03-23)",
    )

    parser.add_argument(
        "--organization",
        action="store_true",
        help="Analyse l'organisation de l'atelier sur 4 semaines",
    )

    args = parser.parse_args()
    reference_date = _resolve_reference_date(args.reference_date)
    setattr(args, "_resolved_reference_date", reference_date)

    # Vérifier que le répertoire de données existe
    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        console.print(f"[bold red]Erreur: Répertoire de données introuvable: {data_dir}[/bold red]")
        return

    # Charger les données
    console.print(f"[bold cyan]Chargement des données depuis {data_dir}...[/bold cyan]")
    loader = DataLoader(args.data_dir)
    loader.load_all()

    console.print(f"✅ {len(loader.articles)} articles chargés")
    console.print(f"✅ {len(loader.nomenclatures)} nomenclatures chargées")
    console.print(f"✅ {len(loader.gammes)} gammes chargées")
    console.print(f"✅ {len(loader.ofs)} OF chargés")
    console.print(f"✅ {len(loader.stocks)} stocks chargés")
    console.print(f"✅ {len(loader.receptions)} réceptions chargées")
    console.print(f"✅ {len(loader.commandes_clients)} commandes clients chargées")
    console.print()

    # Mode AUTORESEARCH scheduler
    if args.schedule and not args.s1:
        console.print("[bold cyan]🗓️  Scheduler AUTORESEARCH...[/bold cyan]")
        result = run_schedule(loader, reference_date=reference_date, output_dir="outputs", weights_path="config/weights.json")
        total_tasks = sum(len(p) for p in result.plannings.values())
        lines_summary = ", ".join(f"{line}={len(p)}" for line, p in result.plannings.items())
        console.print(f"✅ Planning genere : {total_tasks} taches réparties sur les lignes ({lines_summary})")
        taux_service = getattr(getattr(result, "kpis", result), "taux_service")
        taux_ouverture = getattr(getattr(result, "kpis", result), "taux_ouverture")
        nb_deviations = getattr(getattr(result, "kpis", result), "nb_deviations")
        nb_changements_serie = getattr(getattr(result, "kpis", result), "nb_changements_serie", 0)
        score = getattr(getattr(result, "kpis", result), "score")
        
        # Calculer le cumul de charge par jour et nombre d'OFs
        console.print("\n[bold cyan]📊 Cumul de charge par jour :[/bold cyan]")
        from collections import defaultdict
        
        charge_by_day_and_line = defaultdict(lambda: defaultdict(float))
        for line, planning in result.plannings.items():
            for item in planning:
                if item.scheduled_day:
                    charge_by_day_and_line[item.scheduled_day.isoformat()][line] += item.charge_hours

        for day in sorted(charge_by_day_and_line.keys()):
            charges = charge_by_day_and_line[day]
            # Show only lines that have charge
            details = " | ".join(f"{l}: {h:.1f}h" for l, h in charges.items() if h > 0)
            if details:
                console.print(f"  📅 {day} -> {details}")
        
        console.print(
            f"\n✅ KPIs : taux_service={taux_service:.3f}, "
            f"taux_ouverture={taux_ouverture:.3f}, "
            f"deviations={nb_deviations}, "
            f"changements_serie={nb_changements_serie}"
        )
        print(f"SCORE: {score:.3f}")
        return

    # Mode Heatmap de charge
    if args.charge_heatmap:
        from datetime import timedelta

        console.print("[bold cyan]🔥 Calcul de la charge par poste de charge...[/bold cyan]")
        console.print()

        # Filtrer les besoins
        date_ref = reference_date
        besoins = loader.commandes_clients

        # Calculer les bornes
        from datetime import timedelta
        weekday = date_ref.weekday()
        lundi_semaine_en_cours = date_ref - timedelta(days=weekday)
        horizon_end = lundi_semaine_en_cours + timedelta(days=args.num_weeks * 7 + 6)  # Inclure toutes les semaines jusqu'à S+N

        # Filtrer : inclure BACKLOG + EN_COURS + S+1 à S+N
        besoins = [
            b for b in besoins
            if b.date_expedition_demandee <= horizon_end and b.qte_restante > 0
        ]

        console.print(f"📋 [bold cyan]{len(besoins)}[/bold cyan] besoins analysés")
        console.print(f"   Période: [bold white]BACKLOG[/bold white] + [bold white]EN_COURS[/bold white] + [bold white]{args.num_weeks}[/bold white] semaines")
        console.print(f"   (Consommation des prévisions activée)")
        console.print()

        # Calculer la heatmap
        heatmap = calculate_weekly_charge_heatmap(
            besoins=besoins,
            data_loader=loader,
            num_weeks=args.num_weeks
        )

        # Afficher
        week_labels = ["BACKLOG", "EN_COURS"] + [f"S+{i}" for i in range(1, args.num_weeks + 1)]
        format_charge_heatmap(heatmap, week_labels)
        format_charge_summary(heatmap, len(besoins), args.num_weeks)

        return

    # Mode S+1
    if args.s1:
        main_s1(args, loader, include_previsions=args.with_previsions)
        return

    # Mode organisation
    if args.organization:
        from src.agents.organization.organization_agent import OrganizationAgent
        from src.agents.organization.formatter import format_organization_table
        from src.algorithms import CommandeOFMatcher

        agent = OrganizationAgent(loader)
        matcher = CommandeOFMatcher(loader, date_tolerance_days=10)

        results = agent.analyze_workshop_organization(
            reference_date=reference_date,
            matcher=matcher
        )

        format_organization_table(results)
        return

    # Mode vérification commande
    if args.commande:
        commandes = [c for c in loader.commandes_clients if c.num_commande == args.commande]
        if not commandes:
            console.print(f"[bold red]Erreur: Commande {args.commande} introuvable[/bold red]")
            return

        commande = commandes[0]
        type_str = "MTS" if commande.is_mts() else "NOR/MTO"
        console.print(f"🎯 Vérification de la commande {args.commande}")
        console.print(f"   Client: {commande.nom_client}")
        console.print(f"   Article: {commande.article} - {commande.description}")
        console.print(f"   Qté restante: {commande.qte_restante}")
        console.print(f"   Type: {type_str}")
        if commande.is_mts() and commande.of_contremarque:
            console.print(f"   OF lié: {commande.of_contremarque}")
        console.print()

        # Vérifier les allocations
        allocations = loader.get_allocations_of(args.commande)
        if allocations:
            console.print(f"   📦 Allocations: {len(allocations)} composant(s)")
            for alloc in allocations[:5]:
                console.print(f"      - {alloc.article}: {alloc.qte_allouee}")
            if len(allocations) > 5:
                console.print(f"      ... et {len(allocations) - 5} autres")
        else:
            console.print(f"   📦 Aucune allocation connue")
        console.print()

        # Vérification récursive
        console.print("[bold cyan]🔍 Vérification récursive avec allocations...[/bold cyan]")
        checker = RecursiveChecker(loader)
        result = checker.check_commande(commande)

        console.print(f"   {result}")
        if result.missing_components:
            console.print()
            console.print("[bold red]Composants manquants:[/bold red]")
            for article, qte in result.missing_components.items():
                console.print(f"   ❌ {article}: {qte} unités")
        if result.alerts:
            console.print()
            console.print("[yellow]Alertes:[/yellow]")
            for alert in result.alerts[:5]:
                console.print(f"   ⚠️  {alert}")
            if len(result.alerts) > 5:
                console.print(f"   ... et {len(result.alerts) - 5} autres alertes")
        console.print()
        console.print(f"   📊 Composants vérifiés: {result.components_checked}")
        console.print(f"   📊 Profondeur récursion: {result.depth}")
        console.print()

        return

    # Sélectionner les OF à vérifier
    if args.of:
        # OF spécifique
        ofs = [of for of in loader.ofs if of.num_of == args.of]
        if not ofs:
            console.print(f"[bold red]Erreur: OF {args.of} introuvable[/bold red]")
            return
        console.print(f"🎯 Vérification de l'OF {args.of}")
    else:
        # Tous les OF à vérifier
        ofs = loader.get_ofs_to_check()

        # Limiter le nombre d'OF si demandé
        if args.limit:
            ofs = ofs[: args.limit]
            console.print(f"📋 Limite: {len(ofs)} OF à vérifier")

    console.print(f"📋 {len(ofs)} OF à vérifier")
    console.print()

    # Vérification immédiate
    console.print("[bold cyan]🔍 Vérification immédiate (stock actuel)...[/bold cyan]")
    immediate_checker = ImmediateChecker(loader)
    immediate_results = immediate_checker.check_all_ofs(ofs)

    imm_feasible = sum(1 for r in immediate_results.values() if r.feasible)
    console.print(f"✅ Terminé: {imm_feasible}/{len(ofs)} OF faisables")
    console.print()

    # Vérification projetée
    console.print("[bold cyan]🔮 Vérification projetée (stock + réceptions)...[/bold cyan]")
    projected_checker = ProjectedChecker(loader)
    projected_results = projected_checker.check_all_ofs(ofs)

    proj_feasible = sum(1 for r in projected_results.values() if r.feasible)
    console.print(f"✅ Terminé: {proj_feasible}/{len(ofs)} OF faisables")
    console.print()

    # Gestion de la concurrence
    allocation_results = None
    if not args.no_allocation:
        if args.no_virtual_allocation:
            # Approche 1 : Pas d'allocation virtuelle (vérification indépendante)
            console.print("[bold cyan]📦 Vérification sans allocation virtuelle...[/bold cyan]")

            # Utiliser ProjectedChecker directement (pas de StockState)
            allocation_results = {
                of.num_of: AllocationResult(
                    of_num=of.num_of,
                    status=AllocationStatus.FEASIBLE if projected_results[of.num_of].feasible else AllocationStatus.NOT_FEASIBLE,
                    feasibility_result=projected_results[of.num_of],
                    allocated_quantity={},
                )
                for of in ofs
            }

            alloc_feasible = sum(1 for r in allocation_results.values() if r.status.value == "feasible")
            console.print(f"✅ Terminé: {alloc_feasible}/{len(ofs)} OF vérifiés (indépendamment)")
            console.print()
        else:
            # Approche 2 : Allocation virtuelle (défaut)
            console.print("[bold cyan]📦 Gestion de la concurrence avec allocation virtuelle...[/bold cyan]")

            # Créer un RecursiveChecker avec réceptions
            recursive_checker = RecursiveChecker(
                loader,
                use_receptions=True,  # Utiliser les réceptions fournisseurs
                check_date=date.today()  # Date du jour
            )

            # Créer le DecisionEngine
            decision_engine = AgentEngine("config/decisions.yaml", loader=loader)

            # Passer à AllocationManager
            allocation_manager = AllocationManager(
                data_loader=loader,
                checker=recursive_checker,
                decision_engine=decision_engine
            )
            allocation_results = allocation_manager.allocate_stock(ofs)

            alloc_feasible = sum(1 for r in allocation_results.values() if r.status.value == "feasible")
            console.print(f"✅ Terminé: {alloc_feasible}/{len(ofs)} OF alloués")
            console.print()

    # Afficher les résultats
    format_of_table(ofs, immediate_results, projected_results, allocation_results)
    format_summary(immediate_results, projected_results, allocation_results)

    # Rapport détaillé si demandé
    if args.detailed:
        for of in ofs:
            result = projected_results.get(of.num_of)
            if result and not result.feasible:
                format_detailed_report(of, result)

    # Générer les rapports de décisions
    try:
        from .agents.reports import DecisionReporter
        import os

        reporter = DecisionReporter()
        output_dir = "reports/decisions"

        # Générer rapport Markdown
        md_path = os.path.join(output_dir, "decisions_report.md")
        reporter.generate_markdown_report(allocation_results, md_path)
        console.print(f"✅ Rapport Markdown généré : {md_path}")

        # Générer rapport JSON
        json_path = os.path.join(output_dir, "decisions_report.json")
        reporter.generate_json_report(allocation_results, json_path)
        console.print(f"✅ Rapport JSON généré : {json_path}")
    except Exception as e:
        console.print(f"⚠️  Impossible de générer les rapports: {e}")


if __name__ == "__main__":
    main()

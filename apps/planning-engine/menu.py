#!/usr/bin/env python3
"""Menu interactif Rich pour l'ordonnancement production."""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import questionary
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from production_planning.orders import AllocationManager, calculate_weekly_charge_heatmap
from production_planning.feasibility import ImmediateChecker, ProjectedChecker, RecursiveChecker
from production_planning.loaders import DataLoader, resolve_extractions_files
from production_planning.utils import format_charge_heatmap, format_charge_summary
from production_planning.utils import format_detailed_report, format_of_table, format_summary

console = Console()

FEASIBILITY_MODE_LABELS = {
    "compare": "Comparer tous les modes (actuel)",
    "immediate": "Dispo immÃ©diate (stock actuel)",
    "projected": "Dispo projetÃ©e (stock + rÃ©ceptions)",
    "allocation": "Allocation virtuelle (gestion de concurrence)",
}


def select_feasibility_mode(include_compare: bool = True) -> str | None:
    """Demande le mode d'Ã©valuation de disponibilitÃ© composants."""
    choices = []
    if include_compare:
        choices.append(FEASIBILITY_MODE_LABELS["compare"])
    choices.extend(
        [
            FEASIBILITY_MODE_LABELS["immediate"],
            FEASIBILITY_MODE_LABELS["projected"],
            FEASIBILITY_MODE_LABELS["allocation"],
        ]
    )
    selection = questionary.select(
        "Mode d'Ã©valuation des composants ?",
        choices=choices,
    ).ask()
    if selection is None:
        return None

    for mode, label in FEASIBILITY_MODE_LABELS.items():
        if selection == label:
            return mode
    return None


def allocation_results_to_feasibility(allocation_results):
    """Convertit les rÃ©sultats d'allocation en rÃ©sultats de faisabilitÃ©."""
    return {
        of_num: result.feasibility_result
        for of_num, result in allocation_results.items()
        if result.feasibility_result is not None
    }


def format_missing_components(result) -> str:
    """Formate les composants manquants pour une ligne de tableau."""
    if not result or not result.missing_components:
        return "-"
    items = [f"{article}:{quantity}" for article, quantity in result.missing_components.items()]
    return ", ".join(items)


def display_single_mode_results(ofs, mode_label: str, results, allocation_results=None) -> None:
    """Affiche un tableau synthÃ©tique pour un seul mode de vÃ©rification."""
    table = Table(title=f"ðŸ“‹ RÃ©sultats de vÃ©rification de faisabilitÃ© des OF - {mode_label}")

    table.add_column("NumÃ©ro OF", style="cyan", no_wrap=True)
    table.add_column("Article", style="magenta")
    table.add_column("QtÃ© restante", justify="right", style="white")
    table.add_column("Date fin", style="white")
    table.add_column("Statut", justify="center")
    table.add_column("Composants manquants", style="red")

    for of in ofs:
        if allocation_results is not None:
            allocation_result = allocation_results.get(of.num_of)
            feasibility_result = allocation_result.feasibility_result if allocation_result else None
            if allocation_result and allocation_result.status.value == "feasible":
                status = "âœ…"
            elif allocation_result and allocation_result.status.value in {"skipped", "deferred"}:
                status = "â­ï¸"
            else:
                status = "âŒ"
        else:
            feasibility_result = results.get(of.num_of)
            status = "âœ…" if feasibility_result and feasibility_result.feasible else "âŒ"

        table.add_row(
            of.num_of,
            of.article,
            str(of.qte_restante),
            of.date_fin.strftime("%Y-%m-%d"),
            status,
            format_missing_components(feasibility_result),
        )

    console.print(table)


def display_single_mode_summary(mode_label: str, results, allocation_results=None) -> None:
    """Affiche un rÃ©sumÃ© synthÃ©tique pour un seul mode."""
    console.print("\n" + "=" * 80)
    console.print(f"ðŸ“Š [bold]RÃ‰SUMÃ‰ - {mode_label.upper()}[/bold]")
    console.print("=" * 80 + "\n")

    if allocation_results is not None:
        total = len(allocation_results)
        feasible = sum(1 for result in allocation_results.values() if result.status.value == "feasible")
        console.print(f"ðŸ“¦ [bold]{mode_label}[/bold]")
        console.print(f"   âœ… Faisables : {feasible}/{total} ({feasible / total * 100:.1f}%)")
        console.print(f"   âŒ Non faisables : {total - feasible}/{total}")
        console.print()
        return

    total = len(results)
    feasible = sum(1 for result in results.values() if result.feasible)
    console.print(f"ðŸ”Ž [bold]{mode_label}[/bold]")
    console.print(f"   âœ… Faisables : {feasible}/{total} ({feasible / total * 100:.1f}%)")
    console.print(f"   âŒ Non faisables : {total - feasible}/{total}")
    console.print()


def run_allocation_mode(loader: DataLoader, ofs):
    """ExÃ©cute le mode allocation virtuelle avec gestion de la concurrence."""
    console.print("[bold cyan]ðŸ“¦ Allocation virtuelle (gestion de la concurrence)...[/bold cyan]")
    recursive_checker = RecursiveChecker(
        loader,
        use_receptions=True,
        check_date=date.today(),
    )
    allocation_manager = AllocationManager(
        data_loader=loader,
        checker=recursive_checker,
    )
    allocation_results = allocation_manager.allocate_stock(ofs)
    alloc_feasible = sum(1 for result in allocation_results.values() if result.status.value == "feasible")
    console.print(f"[green]âœ… TerminÃ© : {alloc_feasible}/{len(ofs)} OF faisables[/green]\n")
    return allocation_results


def run_single_feasibility_mode(loader: DataLoader, ofs, mode: str):
    """ExÃ©cute un seul mode de vÃ©rification de faisabilitÃ©."""
    if mode == "immediate":
        console.print("[bold cyan]ðŸ” VÃ©rification immÃ©diate (stock actuel)...[/bold cyan]")
        checker = ImmediateChecker(loader)
        results = checker.check_all_ofs(ofs)
        feasible = sum(1 for result in results.values() if result.feasible)
        console.print(f"[green]âœ… TerminÃ© : {feasible}/{len(ofs)} OF faisables[/green]\n")
        return FEASIBILITY_MODE_LABELS[mode], results, None

    if mode == "projected":
        console.print("[bold cyan]ðŸ”® VÃ©rification projetÃ©e (stock + rÃ©ceptions)...[/bold cyan]")
        checker = ProjectedChecker(loader)
        results = checker.check_all_ofs(ofs)
        feasible = sum(1 for result in results.values() if result.feasible)
        console.print(f"[green]âœ… TerminÃ© : {feasible}/{len(ofs)} OF faisables[/green]\n")
        return FEASIBILITY_MODE_LABELS[mode], results, None

    if mode == "allocation":
        allocation_results = run_allocation_mode(loader, ofs)
        return FEASIBILITY_MODE_LABELS[mode], allocation_results_to_feasibility(allocation_results), allocation_results

    raise ValueError(f"Mode de faisabilitÃ© inconnu : {mode}")


def load_data(data_dir: str | None = None) -> DataLoader:
    """Charge les Donn\u00e9es depuis le rÃ©pertoire d'extractions ERP."""
    with console.status("[bold cyan]Chargement des Donn\u00e9es...[/bold cyan]"):
        loader = DataLoader.from_extractions(data_dir)
        loader.load_all()
    console.print(
        f"[green]Donn\u00e9es chargÃ©es :[/green] "
        f"{len(loader.articles)} articles, "
        f"{len(loader.ofs)} OF, "
        f"{len(loader.commandes_clients)} commandes"
    )
    return loader


def load_data_from_extractions(extractions_dir: str | None = None) -> DataLoader:
    """Charge les Donn\u00e9es depuis le dossier d'extractions ERP centralisÃ©."""
    resolved, missing = resolve_extractions_files(extractions_dir)

    if missing:
        console.print("[yellow]âš ï¸  Fichiers manquants dans le dossier d'extractions :[/yellow]")
        for name in missing:
            console.print(f"   [red]âœ—[/red] {name}")
        console.print()

    if not resolved:
        raise FileNotFoundError("Aucun fichier d'extraction trouvÃ© dans le dossier fourni.")

    console.print("[bold cyan]Fichiers sÃ©lectionnÃ©s :[/bold cyan]")
    for name, path in sorted(resolved.items()):
        console.print(f"   [green]âœ“[/green] {name:30s} â† [dim]{path.name}[/dim]")
    console.print()

    with console.status("[bold cyan]Chargement des Donn\u00e9es...[/bold cyan]"):
        loader = DataLoader.from_extractions(extractions_dir)
        loader.load_all()

    console.print(
        f"[green]Donn\u00e9es chargÃ©es :[/green] "
        f"{len(loader.articles)} articles, "
        f"{len(loader.ofs)} OF, "
        f"{len(loader.commandes_clients)} commandes"
    )
    return loader


def run_feasibility_all(loader: DataLoader) -> None:
    mode = select_feasibility_mode(include_compare=True)
    if mode is None:
        return
    detailed = questionary.confirm("Rapport dÃ©taillÃ© ?", default=False).ask()
    if detailed is None:
        return
    limit_str = questionary.text("Limite d'OFs (EntrÃ©e = tous)", default="").ask()
    if limit_str is None:
        return
    limit = int(limit_str) if limit_str.strip() else None
    include_allocation = False
    if mode == "compare":
        include_allocation = questionary.confirm("Inclure l'allocation virtuelle ?", default=True).ask()
        if include_allocation is None:
            return

    ofs = loader.get_ofs_to_check()
    if limit:
        ofs = ofs[:limit]
        console.print(f"[dim]Limite : {len(ofs)} OF[/dim]")

    console.print(f"\n[bold]ðŸ“‹ {len(ofs)} OF Ã  vÃ©rifier[/bold]\n")

    allocation_results = None
    if mode == "compare":
        console.print("[bold cyan]ðŸ” VÃ©rification immÃ©diate (stock actuel)...[/bold cyan]")
        immediate_checker = ImmediateChecker(loader)
        immediate_results = immediate_checker.check_all_ofs(ofs)
        imm_feasible = sum(1 for r in immediate_results.values() if r.feasible)
        console.print(f"[green]âœ… TerminÃ© : {imm_feasible}/{len(ofs)} OF faisables[/green]\n")

        console.print("[bold cyan]ðŸ”® VÃ©rification projetÃ©e (stock + rÃ©ceptions)...[/bold cyan]")
        projected_checker = ProjectedChecker(loader)
        projected_results = projected_checker.check_all_ofs(ofs)
        proj_feasible = sum(1 for r in projected_results.values() if r.feasible)
        console.print(f"[green]âœ… TerminÃ© : {proj_feasible}/{len(ofs)} OF faisables[/green]\n")

        if include_allocation:
            allocation_results = run_allocation_mode(loader, ofs)

        format_of_table(ofs, immediate_results, projected_results, allocation_results)
        format_summary(immediate_results, projected_results, allocation_results)

        if detailed:
            for of in ofs:
                result = projected_results.get(of.num_of)
                if result and not result.feasible:
                    format_detailed_report(of, result)
    else:
        mode_label, results, allocation_results = run_single_feasibility_mode(loader, ofs, mode)
        display_single_mode_results(ofs, mode_label, results, allocation_results)
        display_single_mode_summary(mode_label, results, allocation_results)

        if detailed:
            for of in ofs:
                result = results.get(of.num_of)
                if result and not result.feasible:
                    format_detailed_report(of, result)



def run_feasibility_of(loader: DataLoader) -> None:
    num_of = questionary.text("NumÃ©ro de l'OF (ex: F426-08419)").ask()
    if not num_of:
        return
    mode = select_feasibility_mode(include_compare=True)
    if mode is None:
        return
    detailed = questionary.confirm("Rapport dÃ©taillÃ© ?", default=False).ask()
    if detailed is None:
        return

    ofs = [of for of in loader.ofs if of.num_of == num_of]
    if not ofs:
        console.print(f"[bold red]OF {num_of} introuvable[/bold red]")
        return

    console.print(f"\n[bold]ðŸŽ¯ VÃ©rification de l'OF {num_of}[/bold]\n")

    if mode == "compare":
        console.print("[bold cyan]ðŸ” VÃ©rification immÃ©diate...[/bold cyan]")
        immediate_checker = ImmediateChecker(loader)
        immediate_results = immediate_checker.check_all_ofs(ofs)
        imm_feasible = sum(1 for r in immediate_results.values() if r.feasible)
        console.print(f"[green]âœ… {imm_feasible}/{len(ofs)} faisable[/green]\n")

        console.print("[bold cyan]ðŸ”® VÃ©rification projetÃ©e...[/bold cyan]")
        projected_checker = ProjectedChecker(loader)
        projected_results = projected_checker.check_all_ofs(ofs)
        proj_feasible = sum(1 for r in projected_results.values() if r.feasible)
        console.print(f"[green]âœ… {proj_feasible}/{len(ofs)} faisable[/green]\n")

        allocation_results = run_allocation_mode(loader, ofs)

        format_of_table(ofs, immediate_results, projected_results, allocation_results)
        format_summary(immediate_results, projected_results, allocation_results)

        if detailed:
            for of in ofs:
                result = projected_results.get(of.num_of)
                if result and not result.feasible:
                    format_detailed_report(of, result)
    else:
        mode_label, results, allocation_results = run_single_feasibility_mode(loader, ofs, mode)
        display_single_mode_results(ofs, mode_label, results, allocation_results)
        display_single_mode_summary(mode_label, results, allocation_results)

        if detailed:
            for of in ofs:
                result = results.get(of.num_of)
                if result and not result.feasible:
                    format_detailed_report(of, result)


def run_commande(loader: DataLoader) -> None:
    num_commande = questionary.text("NumÃ©ro de commande (ex: AR2600885)").ask()
    if not num_commande:
        return

    commandes = [c for c in loader.commandes_clients if c.num_commande == num_commande]
    if not commandes:
        console.print(f"[bold red]Commande {num_commande} introuvable[/bold red]")
        return

    commande = commandes[0]
    type_str = "MTS" if commande.is_mts() else "NOR/MTO"
    console.print(f"\n[bold]ðŸŽ¯ Commande {num_commande}[/bold]")
    console.print(f"   Client : {commande.nom_client}")
    console.print(f"   Article : {commande.article} - {commande.description}")
    console.print(f"   QtÃ© restante : {commande.qte_restante}")
    console.print(f"   Type : {type_str}")
    if commande.is_mts() and commande.of_contremarque:
        console.print(f"   OF liÃ© : {commande.of_contremarque}")
    console.print()

    allocations = loader.get_allocations_of(num_commande)
    if allocations:
        console.print(f"   ðŸ“¦ Allocations : {len(allocations)} composant(s)")
        for alloc in allocations[:5]:
            console.print(f"      - {alloc.article} : {alloc.qte_allouee}")
        if len(allocations) > 5:
            console.print(f"      ... et {len(allocations) - 5} autres")
    else:
        console.print("   ðŸ“¦ Aucune allocation connue")
    console.print()

    console.print("[bold cyan]ðŸ” VÃ©rification rÃ©cursive avec allocations...[/bold cyan]")
    checker = RecursiveChecker(loader)
    result = checker.check_commande(commande)

    console.print(f"   {result}")
    if result.missing_components:
        console.print()
        console.print("[bold red]Composants manquants :[/bold red]")
        for article, qte in result.missing_components.items():
            console.print(f"   âŒ {article} : {qte} unitÃ©s")
    if result.alerts:
        console.print()
        console.print("[yellow]Alertes :[/yellow]")
        for alert in result.alerts[:5]:
            console.print(f"   âš ï¸  {alert}")
        if len(result.alerts) > 5:
            console.print(f"   ... et {len(result.alerts) - 5} autres alertes")
    console.print()
    console.print(f"   ðŸ“Š Composants vÃ©rifiÃ©s : {result.components_checked}")
    console.print(f"   ðŸ“Š Profondeur rÃ©cursion : {result.depth}")


def run_heatmap(loader: DataLoader) -> None:
    weeks_str = questionary.text("Nombre de semaines", default="4").ask()
    if weeks_str is None:
        return
    num_weeks = int(weeks_str) if weeks_str else 4

    console.print(f"\n[bold cyan]ðŸ”¥ Calcul de la charge ({num_weeks} semaines)...[/bold cyan]\n")

    date_ref = date.today()
    weekday = date_ref.weekday()
    lundi_semaine_en_cours = date_ref - timedelta(days=weekday)
    horizon_end = lundi_semaine_en_cours + timedelta(days=num_weeks * 7 + 6)

    besoins = [
        b for b in loader.commandes_clients
        if b.date_expedition_demandee <= horizon_end and b.qte_restante > 0
    ]

    console.print(f"[bold cyan]{len(besoins)}[/bold cyan] besoins analysÃ©s")
    console.print(
        f"   PÃ©riode : [bold white]BACKLOG[/bold white] + [bold white]EN_COURS[/bold white] "
        f"+ [bold white]{num_weeks}[/bold white] semaines"
    )
    console.print()

    heatmap = calculate_weekly_charge_heatmap(
        besoins=besoins,
        data_loader=loader,
        num_weeks=num_weeks,
    )

    week_labels = ["BACKLOG", "EN_COURS"] + [f"S+{i}" for i in range(1, num_weeks + 1)]
    format_charge_heatmap(heatmap, week_labels)
    format_charge_summary(heatmap, len(besoins), num_weeks)


MENU_CHOICES = {
    "VÃ©rification de faisabilitÃ© (tous les OFs)": run_feasibility_all,
    "VÃ©rifier un OF spÃ©cifique": run_feasibility_of,
    "Analyser une commande client": run_commande,
    "Heatmap de charge": run_heatmap,
    "Quitter": None,
}


def run_menu(loader: DataLoader) -> None:
    while True:
        console.print()
        choice = questionary.select(
            "Que voulez-vous faire ?",
            choices=list(MENU_CHOICES.keys()),
        ).ask()

        if choice is None or choice == "Quitter":
            console.print("[bold green]Au revoir ![/bold green]")
            break

        console.print()
        try:
            MENU_CHOICES[choice](loader)
        except KeyboardInterrupt:
            console.print("\n[dim]Action annulÃ©e.[/dim]")
        except Exception as e:
            console.print(Panel(
                f"[bold red]Erreur :[/bold red] {e}",
                title="[red]Erreur[/red]",
                border_style="red",
            ))


def main() -> None:
    console.print(Panel.fit(
        "[bold cyan]Bienvenue dans Ordo v2[/bold cyan]\n"
        "[dim]SystÃ¨me d'ordonnancement production[/dim]",
        border_style="cyan",
    ))
    console.print()

    extractions_dir = questionary.text(
        "Dossier des extractions ERP ?",
        default="C:\\Users\\bledoua\\OneDrive - Aldes Aeraulique\\Donn\u00e9es\\Extractions",
    ).ask()

    if extractions_dir is None:
        return

    try:
        loader = load_data_from_extractions(extractions_dir)
    except FileNotFoundError as e:
        console.print(Panel(
            f"[bold red]{e}[/bold red]",
            title="[red]Erreur chargement[/red]",
            border_style="red",
        ))
        return

    run_menu(loader)


if __name__ == "__main__":
    main()


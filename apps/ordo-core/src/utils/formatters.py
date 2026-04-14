"""Formatters - helpers for feasibility result display."""

from typing import Optional

from rich.console import Console
from rich.table import Table

from ..algorithms.allocation import AllocationResult, AllocationStatus
from ..checkers.base import FeasibilityResult
from ..models.of import OF


console = Console()


def format_of_table(
    ofs: list[OF],
    immediate_results: dict[str, FeasibilityResult],
    projected_results: dict[str, FeasibilityResult],
    allocation_results: Optional[dict[str, AllocationResult]] = None,
):
    """Display a compact OF feasibility table."""
    table = Table(title="Validation faisabilite OF", padding=(0, 1))

    table.add_column("OF", style="cyan", no_wrap=True)
    table.add_column("Article", style="magenta", no_wrap=True, max_width=14, overflow="ellipsis")
    table.add_column("Qte", justify="right", style="white", width=5)
    table.add_column("Fin", style="white", no_wrap=True, width=10)
    table.add_column("Imm.", justify="center", width=4)
    table.add_column("Proj.", justify="center", width=5)
    if allocation_results:
        table.add_column("Alloc.", justify="center", width=6)
    table.add_column("Manquants", style="red", overflow="fold", max_width=24)

    for of in ofs:
        imm_result = immediate_results.get(of.num_of)
        proj_result = projected_results.get(of.num_of)
        alloc_result = allocation_results.get(of.num_of) if allocation_results else None

        imm_status = "✅" if imm_result and imm_result.feasible else "❌"
        proj_status = "✅" if proj_result and proj_result.feasible else "❌"
        alloc_status = _format_allocation_status(alloc_result) if alloc_result else "N/A"
        missing = _format_missing_components(proj_result)

        row = [
            of.num_of,
            of.article,
            str(of.qte_restante),
            of.date_fin.strftime("%Y-%m-%d"),
            imm_status,
            proj_status,
        ]
        if allocation_results:
            row.append(alloc_status)
        row.append(missing)
        table.add_row(*row)

    console.print(table)


def format_detailed_report(
    of: OF,
    result: FeasibilityResult,
    show_tree: bool = True,
):
    """Display a detailed report for one OF."""
    console.print(f"\n{'=' * 80}")
    console.print(f"OF [bold cyan]{of.num_of}[/bold cyan] - {of.description}")
    console.print(f"   Article : [bold magenta]{of.article}[/bold magenta]")
    console.print(f"   Quantite : {of.qte_restante} a fabriquer")
    console.print(f"   Date fin : {of.date_fin.strftime('%Y-%m-%d')}")
    console.print(f"{'=' * 80}\n")

    status = "✅ [bold green]FAISABLE[/bold green]" if result.feasible else "❌ [bold red]NON FAISABLE[/bold red]"
    console.print(f"Statut : {status}")
    console.print(f"Composants verifies : {result.components_checked}")
    console.print(f"Profondeur recursion : {result.depth}")

    if result.alerts:
        console.print("\n[bold yellow]Alertes :[/bold yellow]")
        for alert in result.alerts:
            console.print(f"   - {alert}")

    if result.missing_components:
        console.print("\n[bold red]Composants manquants :[/bold red]")
        for article, quantity in result.missing_components.items():
            console.print(f"   - {article} : {quantity} unites")
    else:
        console.print("\n[bold green]Tous les composants sont disponibles[/bold green]")


def format_summary(
    immediate_results: dict[str, FeasibilityResult],
    projected_results: dict[str, FeasibilityResult],
    allocation_results: Optional[dict[str, AllocationResult]] = None,
):
    """Display a summary of all modes."""
    console.print("\n" + "=" * 80)
    console.print("[bold]RESUME DES RESULTATS[/bold]")
    console.print("=" * 80 + "\n")

    imm_feasible = sum(1 for result in immediate_results.values() if result.feasible)
    imm_total = len(immediate_results)
    console.print("[bold]Verification immediate (stock actuel)[/bold]")
    console.print(f"   ✅ Faisables : {imm_feasible}/{imm_total} ({imm_feasible / imm_total * 100:.1f}%)")
    console.print(f"   ❌ Non faisables : {imm_total - imm_feasible}/{imm_total}")

    proj_feasible = sum(1 for result in projected_results.values() if result.feasible)
    proj_total = len(projected_results)
    console.print("\n[bold]Verification projetee (stock + receptions)[/bold]")
    console.print(f"   ✅ Faisables : {proj_feasible}/{proj_total} ({proj_feasible / proj_total * 100:.1f}%)")
    console.print(f"   ❌ Non faisables : {proj_total - proj_feasible}/{proj_total}")

    if allocation_results:
        alloc_feasible = sum(
            1 for result in allocation_results.values() if result.status == AllocationStatus.FEASIBLE
        )
        alloc_total = len(allocation_results)
        console.print("\n[bold]Allocation avec gestion de la concurrence[/bold]")
        console.print(f"   ✅ Alloues : {alloc_feasible}/{alloc_total} ({alloc_feasible / alloc_total * 100:.1f}%)")
        console.print(f"   ❌ Non alloues : {alloc_total - alloc_feasible}/{alloc_total}")

    console.print()


def _format_allocation_status(result: Optional[AllocationResult]) -> str:
    """Format allocation status for compact tables."""
    if result is None:
        return "N/A"
    if result.status == AllocationStatus.FEASIBLE:
        return "✅"
    if result.status == AllocationStatus.NOT_FEASIBLE:
        return "❌"
    return "⏭️"


def _format_missing_components(result: Optional[FeasibilityResult]) -> str:
    """Format missing components on multiple lines to avoid truncation."""
    if not result or not result.missing_components:
        return "-"

    items = [f"{article}:{quantity}" for article, quantity in result.missing_components.items()]
    if len(items) <= 3:
        return "\n".join(items)
    return "\n".join(items[:3] + [f"+{len(items) - 3} autres"])

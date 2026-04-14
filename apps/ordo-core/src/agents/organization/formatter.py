from rich.console import Console
from rich.table import Table


def format_organization_table(results: dict) -> None:
    """
    Affiche les résultats d'organisation dans une table console.

    Parameters
    ----------
    results : Dict[str, PosteChargeResult]
        Résultats par poste
    """
    console = Console()

    table = Table(title="Organisation de l'atelier - S+1")
    table.add_column("Poste", style="cyan", width=12)
    table.add_column("S+1", justify="right", width=10)
    table.add_column("S+2", justify="right", width=10)
    table.add_column("S+3", justify="right", width=10)
    table.add_column("S+4", justify="right", width=10)
    table.add_column("Trend", justify="center", width=10)
    table.add_column("Organisation S+1", justify="center", width=15)
    table.add_column("Charge traitée", justify="right", width=12)

    for result in results.values():
        # Trend emoji
        if result.trend.value == "upward":
            trend_str = "⬆️ Hausse"
        elif result.trend.value == "downward":
            trend_str = "⬇️ Baisse"
        else:
            trend_str = "➡️ Stable"

        org_str = f"{result.recommended_org.type} ({result.recommended_org.hours}h)"
        treated_str = f"{result.charge_treated:.1f}h ({result.coverage_pct:.0f}%)"

        table.add_row(
            result.poste,
            f"{result.charge_s1:.1f}h",
            f"{result.charge_s2:.1f}h",
            f"{result.charge_s3:.1f}h",
            f"{result.charge_s4:.1f}h",
            trend_str,
            org_str,
            treated_str
        )

    console.print(table)

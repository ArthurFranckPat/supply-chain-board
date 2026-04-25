"""Formatters pour la heatmap de charge."""

from rich.console import Console
from rich.table import Table

from ..models.charge import ChargeByPoste

console = Console()


def format_charge_heatmap(
    heatmap: list[ChargeByPoste],
    week_labels: list[str],
    show_totals: bool = True,
    title: str = "🔥 Heatmap de Charge par Poste (heures)"
):
    """Affiche la heatmap de charge sous forme de tableau Rich.

    Parameters
    ----------
    heatmap : list[ChargeByPoste]
        Liste des postes avec leurs charges
    week_labels : list[str]
        Liste des labels de semaines (ex: ["BACKLOG", "EN_COURS", "S+1", "S+2", "S+3", "S+4"])
    show_totals : bool, optional
        Si True, affiche une colonne total (défaut: True)
    title : str, optional
        Titre du tableau (défaut: "🔥 Heatmap de Charge par Poste (heures)")

    Examples
    --------
    >>> format_charge_heatmap(heatmap, ["BACKLOG", "EN_COURS", "S+1", "S+2", "S+3", "S+4"])
    ┏━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━┳━━━━━━┳━━━━━━┳━━━━━━┳━━━━━━━┓
    ┃ Poste ┃ Libellé            ┃BACKLOG�EN_COURS┃  S+1 ┃  S+2 ┃  S+3 ┃  S+4 ┃ Total ┃
    ┡━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━╇━━━━━━╇━━━━━━╇━━━━━━╇━━━━━━╇━━━━━━━┩
    │ PP_128│ ASSEMBLAGE KIT BOUCHE│  10.5 │   5.3 │ 120.5│  98.3│ 150.2│  80.1│ 384.9 │
    └───────┴─────────────────────┴───────┴───────┴──────┴──────┴──────┴──────┴───────┘
    """
    # Créer le tableau avec expand=True pour utiliser toute la largeur
    table = Table(title=title, title_style="bold red", expand=True)

    # Colonnes
    table.add_column("Poste", style="cyan", no_wrap=True, width=7)
    table.add_column("Libellé", style="magenta", width=22)

    for week in week_labels:
        # Styling spécifique pour BACKLOG et EN_COURS
        if week == "BACKLOG":
            table.add_column("BKLOG", justify="right", style="bold red", width=8)
        elif week == "EN_COURS":
            table.add_column("ENCOURS", justify="right", style="bold yellow", width=8)
        else:
            table.add_column(week, justify="right", style="white", width=8)

    if show_totals:
        table.add_column("Total", justify="right", style="bold green", width=10)

    # Lignes de données
    for row in heatmap:
        cells = [
            row.poste_charge,
            row.libelle_poste or ""
        ]

        total = 0.0
        for week in week_labels:
            hours = row.charges.get(week, 0.0)
            cells.append(f"{hours:.1f}")
            total += hours

        if show_totals:
            cells.append(f"{total:.1f}")

        table.add_row(*cells)

    # Afficher
    console.print(table)


def format_charge_summary(
    heatmap: list[ChargeByPoste],
    num_besoins: int,
    num_weeks: int
):
    """Affiche un résumé de la charge.

    Parameters
    ----------
    heatmap : list[ChargeByPoste]
        Liste des postes avec leurs charges
    num_besoins : int
        Nombre de besoins analysés
    num_weeks : int
        Nombre de semaines
    """
    total_hours = sum(poste.get_total() for poste in heatmap)

    console.print()
    console.print(f"📊 [bold cyan]{num_besoins}[/bold cyan] besoins analysés")
    console.print(f"   Horizon: [bold white]{num_weeks}[/bold white] semaines")
    console.print(f"   Postes de charge: [bold white]{len(heatmap)}[/bold white]")
    console.print(f"   Charge totale: [bold green]{total_hours:.1f}[/bold green] heures")
    console.print()

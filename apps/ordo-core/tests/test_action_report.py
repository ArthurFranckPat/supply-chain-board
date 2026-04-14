"""Tests pour le rapport d'actions appro S+1."""

from datetime import date

from src.algorithms.matching import MatchingResult
from src.checkers.base import FeasibilityResult
from src.models.article import Article, TypeApprovisionnement
from src.models.gamme import Gamme, GammeOperation
from src.reports import build_action_report, write_action_report_markdown

from .agents.tools.conftest import (
    TODAY,
    make_commande,
    make_loader,
    make_nomenclature,
    make_of,
    make_reception,
    make_stock,
)


def _make_feasibility(**missing_components):
    result = FeasibilityResult(feasible=False)
    for article, quantity in missing_components.items():
        result.add_missing(article, quantity)
    return result


def test_build_action_report_aggregates_and_prioritizes_components():
    """Agrège les ruptures d'un même composant et les trie par impact client."""
    of_1 = make_of("OF_A", "PF_A", 3, date(2026, 3, 26))
    of_2 = make_of("OF_B", "PF_B", 3, date(2026, 3, 27))
    cmd_1 = make_commande("CMD_1", "PF_A", date(2026, 3, 24))
    cmd_2 = make_commande("CMD_2", "PF_B", date(2026, 3, 25))

    loader = make_loader(
        ofs=[of_1, of_2],
        commandes=[cmd_1, cmd_2],
        receptions=[
            make_reception("COMP_A", date(2026, 3, 22), qte=10, fournisseur="SUP_A"),
        ],
        stocks={
            "COMP_A": make_stock("COMP_A", physique=0),
            "COMP_B": make_stock("COMP_B", physique=0),
        },
    )
    loader.articles = {
        "COMP_A": Article("COMP_A", "Composant A", "AP", TypeApprovisionnement.ACHAT, 7),
        "COMP_B": Article("COMP_B", "Composant B", "AP", TypeApprovisionnement.ACHAT, 7),
    }
    loader.get_article.side_effect = lambda article: loader.articles.get(article)

    matching_results = [
        MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS"),
        MatchingResult(commande=cmd_2, of=of_2, matching_method="MTS"),
    ]
    feasibility_results = {
        "OF_A": _make_feasibility(COMP_A=5, COMP_B=2),
        "OF_B": _make_feasibility(COMP_A=3),
    }

    report = build_action_report(loader, matching_results, feasibility_results, reference_date=TODAY)

    assert [line.article_composant for line in report.component_lines] == ["COMP_A", "COMP_B"]

    comp_a = report.component_lines[0]
    assert comp_a.description == "Composant A"
    assert comp_a.missing_qty_total == 8
    assert comp_a.nb_ofs_impactes == 2
    assert comp_a.nb_commandes_impactees == 2
    assert comp_a.date_expedition_la_plus_proche == date(2026, 3, 24)
    assert comp_a.niveau_action == "RETARD_FOURNISSEUR"

    comp_b = report.component_lines[1]
    assert comp_b.niveau_action == "AUCUNE_COUVERTURE"
    assert report.impacted_ofs == 2
    assert report.impacted_commandes == 2


def test_build_action_report_classifies_all_action_levels():
    """Classe correctement les composants selon la situation appro."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 28))
    cmd_1 = make_commande("CMD_1", "PF_1", date(2026, 3, 25))

    loader = make_loader(
        ofs=[of_1],
        commandes=[cmd_1],
        receptions=[
            make_reception("COMP_RET", date(2026, 3, 20), qte=10, fournisseur="SUP_1"),
            make_reception("COMP_TARD", date(2026, 3, 29), qte=10, fournisseur="SUP_2"),
            make_reception("COMP_OK", date(2026, 3, 24), qte=10, fournisseur="SUP_3"),
        ],
        stocks={
            "COMP_RET": make_stock("COMP_RET", physique=0),
            "COMP_TARD": make_stock("COMP_TARD", physique=0),
            "COMP_NONE": make_stock("COMP_NONE", physique=0),
            "COMP_OK": make_stock("COMP_OK", physique=0),
        },
    )
    loader.get_article.side_effect = lambda article: None

    matching_results = [MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS")]
    feasibility_results = {
        "OF_1": _make_feasibility(
            COMP_RET=1,
            COMP_TARD=1,
            COMP_NONE=1,
            COMP_OK=1,
        )
    }

    report = build_action_report(loader, matching_results, feasibility_results, reference_date=TODAY)
    levels = {line.article_composant: line.niveau_action for line in report.component_lines}

    assert levels == {
        "COMP_RET": "RETARD_FOURNISSEUR",
        "COMP_TARD": "COUVERTURE_TARDIVE",
        "COMP_NONE": "AUCUNE_COUVERTURE",
        "COMP_OK": "SURVEILLANCE",
    }


def test_build_action_report_mentions_quality_control_when_blocked_stock_exists():
    """Ajoute une action contrôle qualité si du stock bloqué existe sur le composant."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 28))
    cmd_1 = make_commande("CMD_1", "PF_1", date(2026, 3, 25))

    loader = make_loader(
        ofs=[of_1],
        commandes=[cmd_1],
        receptions=[],
        stocks={
            "COMP_QC": make_stock("COMP_QC", physique=5, bloque=5),
        },
    )
    loader.get_article.side_effect = lambda article: None

    matching_results = [MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS")]
    feasibility_results = {"OF_1": _make_feasibility(COMP_QC=4)}

    report = build_action_report(loader, matching_results, feasibility_results, reference_date=TODAY)

    comp_line = report.component_lines[0]
    assert comp_line.article_composant == "COMP_QC"
    assert comp_line.stock_sous_controle == 5
    assert "controle qualite" in comp_line.action_recommandee.lower()


def test_build_action_report_uses_of_start_date_for_component_need():
    """La date de besoin composant suit la date de début OF, pas la date client."""
    of_1 = make_of(
        "OF_1",
        "PF_1",
        3,
        date(2026, 3, 28),
        date_debut=date(2026, 3, 24),
    )
    cmd_1 = make_commande("CMD_1", "PF_1", date(2026, 3, 27))

    loader = make_loader(
        ofs=[of_1],
        commandes=[cmd_1],
        receptions=[
            make_reception("COMP_TARD", date(2026, 3, 25), qte=10, fournisseur="SUP_2"),
        ],
        stocks={"COMP_TARD": make_stock("COMP_TARD", physique=0)},
    )
    loader.get_article.side_effect = lambda article: None

    matching_results = [MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS")]
    feasibility_results = {"OF_1": _make_feasibility(COMP_TARD=1)}

    report = build_action_report(loader, matching_results, feasibility_results, reference_date=TODAY)

    comp_line = report.component_lines[0]
    assert comp_line.article_composant == "COMP_TARD"
    assert comp_line.date_expedition_la_plus_proche == date(2026, 3, 24)
    assert comp_line.niveau_action == "COUVERTURE_TARDIVE"


def test_build_action_report_groups_supplier_actions():
    """Regroupe les lignes d'exécution par fournisseur / commande achat."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26))
    of_2 = make_of("OF_2", "PF_2", 3, date(2026, 3, 27))
    of_3 = make_of("OF_3", "PF_3", 3, date(2026, 3, 28))
    cmd_1 = make_commande("CMD_1", "PF_1", date(2026, 3, 24))
    cmd_2 = make_commande("CMD_2", "PF_2", date(2026, 3, 25))
    cmd_3 = make_commande("CMD_3", "PF_3", date(2026, 3, 26))

    receptions = [
        make_reception("COMP_A", date(2026, 3, 22), qte=5, fournisseur="SUP_X"),
        make_reception("COMP_C", date(2026, 3, 24), qte=5, fournisseur="SUP_X"),
    ]
    receptions[0].num_commande = "CA_X"
    receptions[1].num_commande = "CA_X"

    loader = make_loader(
        ofs=[of_1, of_2, of_3],
        commandes=[cmd_1, cmd_2, cmd_3],
        receptions=receptions,
        stocks={
            "COMP_A": make_stock("COMP_A", physique=0),
            "COMP_B": make_stock("COMP_B", physique=0),
            "COMP_C": make_stock("COMP_C", physique=0),
        },
    )
    loader.get_article.side_effect = lambda article: None

    matching_results = [
        MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS"),
        MatchingResult(commande=cmd_2, of=of_2, matching_method="MTS"),
        MatchingResult(commande=cmd_3, of=of_3, matching_method="MTS"),
    ]
    feasibility_results = {
        "OF_1": _make_feasibility(COMP_A=2),
        "OF_2": _make_feasibility(COMP_B=3),
        "OF_3": _make_feasibility(COMP_C=1),
    }

    report = build_action_report(loader, matching_results, feasibility_results, reference_date=TODAY)
    supplier_lines = {
        (line.fournisseur, line.num_commande_achat): line
        for line in report.supplier_lines
    }

    supplier_line = supplier_lines[("SUP_X", "CA_X")]
    assert supplier_line.nb_components == 2
    assert supplier_line.articles_concernes == ["COMP_A", "COMP_C"]
    assert supplier_line.nb_commandes_impactees == 2
    assert "Relancer" in supplier_line.action_recommandee

    no_cover_line = supplier_lines[("SANS_FOURNISSEUR", "APPRO SANS CA OUVERTE")]
    assert no_cover_line.articles_concernes == ["COMP_B"]


def test_build_action_report_aggregates_poste_charge_risks():
    """Agrège les OF bloqués par poste de charge avec les heures à risque."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26), qte_restante=100)
    of_2 = make_of("OF_2", "PF_2", 3, date(2026, 3, 27), qte_restante=60)
    cmd_1 = make_commande("CMD_1", "PF_1", date(2026, 3, 24))
    cmd_2 = make_commande("CMD_2", "PF_2", date(2026, 3, 25))

    loader = make_loader(
        ofs=[of_1, of_2],
        commandes=[cmd_1, cmd_2],
        receptions=[],
        stocks={
            "COMP_A": make_stock("COMP_A", physique=0),
            "COMP_B": make_stock("COMP_B", physique=0),
        },
    )
    gammes = {
        "PF_1": Gamme(
            article="PF_1",
            operations=[
                GammeOperation("PF_1", "PP_100", "ASSEMBLAGE", 50.0),
                GammeOperation("PF_1", "PP_200", "TEST", 100.0),
            ],
        ),
        "PF_2": Gamme(
            article="PF_2",
            operations=[
                GammeOperation("PF_2", "PP_100", "ASSEMBLAGE", 30.0),
            ],
        ),
    }
    loader.get_gamme.side_effect = lambda article: gammes.get(article)
    loader.get_article.side_effect = lambda article: None

    report = build_action_report(
        loader,
        [
            MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS"),
            MatchingResult(commande=cmd_2, of=of_2, matching_method="MTS"),
        ],
        {
            "OF_1": _make_feasibility(COMP_A=4),
            "OF_2": _make_feasibility(COMP_B=2),
        },
        reference_date=TODAY,
    )

    poste_lines = {line.poste: line for line in report.poste_charge_lines}
    assert set(poste_lines) == {"PP_100", "PP_200"}

    pp100 = poste_lines["PP_100"]
    assert pp100.nb_ofs_impactes == 2
    assert pp100.nb_commandes_impactees == 2
    assert pp100.charge_risquee_heures == 4.0
    assert pp100.composants_bloquants == ["COMP_A", "COMP_B"]

    pp200 = poste_lines["PP_200"]
    assert pp200.nb_ofs_impactes == 1
    assert pp200.charge_risquee_heures == 1.0
    assert pp200.composants_bloquants == ["COMP_A"]


def test_build_action_report_builds_kanban_risks_from_successor_and_upstream_chain():
    """Le kanban part du successeur direct et module son seuil selon les cadences amont/aval."""
    of_parent = make_of("OF_PARENT", "PF_PARENT", 3, date(2026, 3, 26), qte_restante=100)
    commande = make_commande("CMD_PARENT", "PF_PARENT", date(2026, 3, 25), qte_restante=100)

    loader = make_loader(
        ofs=[of_parent],
        commandes=[commande],
        receptions=[],
        nomenclatures={
            "PF_PARENT": make_nomenclature("PF_PARENT", [("MH7624", 1, "Fabriqué")]),
            "MH7624": make_nomenclature("MH7624", [("MH7623", 1, "Fabriqué")]),
            "MH7623": make_nomenclature("MH7623", [("MF_A", 1, "Fabriqué")]),
        },
        stocks={"MH7624": make_stock("MH7624", physique=40)},
    )
    gammes = {
        "MH7624": Gamme(
            article="MH7624",
            operations=[GammeOperation("MH7624", "PP_146", "REGLAGE BDH", 340.0)],
        ),
        "MH7623": Gamme(
            article="MH7623",
            operations=[GammeOperation("MH7623", "PP_145", "PREREGLAGE BDH", 180.0)],
        ),
        "MF_A": Gamme(
            article="MF_A",
            operations=[GammeOperation("MF_A", "PP_144", "MACHINE FAISCEAU", 150.0)],
        ),
    }
    loader.get_gamme.side_effect = lambda article: gammes.get(article)
    loader.get_ofs_by_article.side_effect = lambda article: []
    loader.get_article.side_effect = lambda article: None

    report = build_action_report(
        loader,
        [MatchingResult(commande=commande, of=of_parent, matching_method="MTS")],
        {"OF_PARENT": FeasibilityResult(feasible=True)},
        reference_date=TODAY,
    )

    assert report.component_lines == []
    assert [line.article_kanban for line in report.kanban_component_lines] == ["MH7624"]

    kanban_line = report.kanban_component_lines[0]
    assert kanban_line.refs_kanban_sources == ["MH7623"]
    assert kanban_line.postes_consommateurs == ["PP_146"]
    assert kanban_line.postes_fournisseurs == ["PP_144", "PP_145", "PP_146"]
    assert kanban_line.stock_equivalent_jours == 0.02
    assert kanban_line.seuil_couverture_jours == 7.27
    assert kanban_line.jours_manquants == 7.25
    assert kanban_line.nb_commandes_s1_impactees == 1
    assert kanban_line.niveau_risque == "TRES_TENDU"
    assert {
        poste: round(seuil, 2)
        for poste, seuil in kanban_line.seuils_par_poste_fournisseur.items()
    } == {
        "PP_144": 7.27,
        "PP_145": 6.89,
        "PP_146": 6.0,
    }

    poste_lines = {line.poste_fournisseur: line for line in report.poste_kanban_lines}
    assert set(poste_lines) == {"PP_144", "PP_145", "PP_146"}
    assert poste_lines["PP_144"].articles_kanban_concernes == ["MH7624"]
    assert poste_lines["PP_144"].refs_kanban_sources == ["MH7623"]
    assert poste_lines["PP_144"].postes_consommateurs == ["PP_146"]
    assert poste_lines["PP_144"].seuil_couverture_jours == 7.27
    assert poste_lines["PP_145"].seuil_couverture_jours == 6.89
    assert poste_lines["PP_146"].seuil_couverture_jours == 6.0


def test_build_action_report_skips_kanban_when_coverage_reaches_threshold():
    """N'alerte pas en kanban quand la couverture couvre le seuil dynamique calculé."""
    of_parent = make_of("OF_PARENT", "PF_PARENT", 3, date(2026, 3, 26), qte_restante=100)
    commande = make_commande("CMD_PARENT", "PF_PARENT", date(2026, 3, 25), qte_restante=100)

    loader = make_loader(
        ofs=[of_parent],
        commandes=[commande],
        receptions=[],
        nomenclatures={
            "PF_PARENT": make_nomenclature("PF_PARENT", [("MH7624", 1, "Fabriqué")]),
            "MH7624": make_nomenclature("MH7624", [("MH7623", 1, "Fabriqué")]),
        },
        stocks={"MH7624": make_stock("MH7624", physique=15000)},
    )
    gammes = {
        "MH7624": Gamme(
            article="MH7624",
            operations=[GammeOperation("MH7624", "PP_146", "REGLAGE BDH", 340.0)],
        ),
        "MH7623": Gamme(
            article="MH7623",
            operations=[GammeOperation("MH7623", "PP_145", "PREREGLAGE BDH", 180.0)],
        ),
    }
    loader.get_gamme.side_effect = lambda article: gammes.get(article)
    loader.get_ofs_by_article.side_effect = lambda article: []
    loader.get_article.side_effect = lambda article: None

    report = build_action_report(
        loader,
        [MatchingResult(commande=commande, of=of_parent, matching_method="MTS")],
        {"OF_PARENT": FeasibilityResult(feasible=True)},
        reference_date=TODAY,
    )

    assert report.poste_kanban_lines == []
    assert report.kanban_component_lines == []


def test_write_action_report_markdown_contains_expected_sections(tmp_path):
    """Le rendu Markdown expose les vues composant, poste et kanban métier."""
    of_1 = make_of("OF_1", "PF_1", 3, date(2026, 3, 26))
    cmd_1 = make_commande("CMD_1", "PF_1", date(2026, 3, 24), qte_restante=100)

    loader = make_loader(
        ofs=[of_1],
        commandes=[cmd_1],
        receptions=[],
        nomenclatures={
            "PF_1": make_nomenclature("PF_1", [("MH7624", 1, "Fabriqué")]),
            "MH7624": make_nomenclature("MH7624", [("MH7623", 1, "Fabriqué")]),
        },
        stocks={
            "COMP_X": make_stock("COMP_X", physique=0),
            "MH7624": make_stock("MH7624", physique=0),
        },
    )
    loader.get_article.side_effect = lambda article: None
    loader.get_gamme.side_effect = lambda article: {
        "PF_1": Gamme(
            article="PF_1",
            operations=[GammeOperation("PF_1", "PP_100", "ASSEMBLAGE", 50.0)],
        ),
        "MH7624": Gamme(
            article="MH7624",
            operations=[GammeOperation("MH7624", "PP_146", "REGLAGE BDH", 340.0)],
        ),
        "MH7623": Gamme(
            article="MH7623",
            operations=[GammeOperation("MH7623", "PP_145", "PREREGLAGE BDH", 180.0)],
        ),
    }.get(article)
    loader.get_ofs_by_article.side_effect = lambda article: []

    report = build_action_report(
        loader,
        [MatchingResult(commande=cmd_1, of=of_1, matching_method="MTS")],
        {"OF_1": _make_feasibility(COMP_X=4)},
        reference_date=TODAY,
    )

    output_path = tmp_path / "report.md"
    write_action_report_markdown(report, str(output_path))
    content = output_path.read_text(encoding="utf-8")

    assert "# Rapport d'actions appro S+1" in content
    assert "## Composants critiques" in content
    assert "## Postes de charge à risque d'arrêt" in content
    assert "## Postes fournisseurs à maintenir en marche" in content
    assert "## Articles kanban sous seuil" in content
    assert "## Actions appro par fournisseur / CA" in content
    assert "## Composants sans couverture identifiée" in content
    assert "COMP_X" in content
    assert "PP_100" in content
    assert "PP_145" in content
    assert "MH7624" in content
    assert "MH7623" in content
    assert "APPRO SANS CA OUVERTE" in content


def test_write_action_report_markdown_empty_report(tmp_path):
    """Le rapport vide reste explicite et sans faux positif."""
    loader = make_loader()
    report = build_action_report(loader, [], {}, reference_date=TODAY)

    output_path = tmp_path / "report.md"
    write_action_report_markdown(report, str(output_path))
    content = output_path.read_text(encoding="utf-8")

    assert "Aucune alerte composant ou kanban détectée sur le plan S+1." in content
    assert "Aucune action requise." in content

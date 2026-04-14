"""Tests pour le modèle OF."""

from datetime import date

from src.models.of import OF


class TestOF:
    """Tests pour le parsing des OF depuis CSV."""

    def test_from_csv_row_parse_date_debut(self):
        """DATE_DEBUT est parsée si la colonne est présente."""
        of = OF.from_csv_row(
            {
                "NUM_OF": "F426-00001",
                "ARTICLE": "ART001",
                "DESCRIPTION": "OF de test",
                "STATUT_NUM_OF": "3",
                "STATUT_TEXTE_OF": "Suggéré",
                "DATE_DEBUT": "14/04/2026",
                "DATE_FIN": "16/04/2026",
                "QTE_A_FABRIQUER": "10",
                "QTE_FABRIQUEE": "2",
                "QTE_RESTANTE": "8",
            }
        )

        assert of.date_debut == date(2026, 4, 14)
        assert of.date_fin == date(2026, 4, 16)

    def test_from_csv_row_missing_date_debut_returns_none(self):
        """DATE_DEBUT absente n'empêche pas le parsing de l'OF."""
        of = OF.from_csv_row(
            {
                "NUM_OF": "F426-00002",
                "ARTICLE": "ART002",
                "DESCRIPTION": "OF sans date début",
                "STATUT_NUM_OF": "1",
                "STATUT_TEXTE_OF": "Ferme",
                "DATE_FIN": "2026-04-20",
                "QTE_A_FABRIQUER": "5",
                "QTE_FABRIQUEE": "0",
                "QTE_RESTANTE": "5",
            }
        )

        assert of.date_debut is None
        assert of.date_fin == date(2026, 4, 20)

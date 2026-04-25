"""Configuration pytest pour les tests."""

import pytest
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour importer les modules
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def sample_gamme():
    """Fixture pour une gamme de test."""
    from production_planning.models.gamme import Gamme, GammeOperation

    return Gamme(
        article="ART001",
        operations=[
            GammeOperation(
                poste_charge="PP_830",
                libelle_poste="LIGNE EASY HOME",
                cadence=100.0,
                numero=1,
            ),
            GammeOperation(
                poste_charge="PP_128",
                libelle_poste="ASSEMBLAGE",
                cadence=50.0,
                numero=2,
            ),
        ],
    )


@pytest.fixture
def sample_nomenclature():
    """Fixture pour une nomenclature de test."""
    from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry

    return Nomenclature(
        article="ART001",
        designation="Article parent 1",
        composants=[
            NomenclatureEntry(
                article_parent="ART001",
                designation_parent="Article parent 1",
                niveau=10,
                article_composant="ART002",
                designation_composant="Composant fabriqué",
                qte_lien=2.0,
                type_article="Fabriqué",
            ),
            NomenclatureEntry(
                article_parent="ART001",
                designation_parent="Article parent 1",
                niveau=10,
                article_composant="ART003",
                designation_composant="Composant acheté",
                qte_lien=1.0,
                type_article="Acheté",
            ),
        ],
    )

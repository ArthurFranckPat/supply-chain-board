"""Fixtures et helpers partagés pour les tests des outils super-agent."""

from datetime import date
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Helpers de construction de modèles
# ---------------------------------------------------------------------------

def make_of(
    num_of,
    article,
    statut_num,
    date_fin,
    qte_restante=100,
    description="DESC",
    date_debut=None,
):
    from src.models.of import OF
    return OF(
        num_of=num_of,
        article=article,
        description=description,
        statut_num=statut_num,
        statut_texte="Ferme" if statut_num == 1 else "Suggéré",
        date_fin=date_fin,
        qte_a_fabriquer=qte_restante,
        qte_fabriquee=0,
        qte_restante=qte_restante,
        date_debut=date_debut,
    )


def make_commande(
    num, article, date_exp,
    qte_commandee=100, qte_allouee=0, qte_restante=100,
    nom_client="CLIENT_A", code_pays="FR", nature_besoin=None,
):
    from src.models.besoin_client import BesoinClient, TypeCommande, NatureBesoin
    return BesoinClient(
        nom_client=nom_client,
        code_pays=code_pays,
        type_commande=TypeCommande.NOR,
        num_commande=num,
        nature_besoin=nature_besoin or NatureBesoin.COMMANDE,
        article=article,
        description="Test",
        categorie="PF3",
        source_origine_besoin="Ventes",
        of_contremarque="",
        date_commande=None,
        date_expedition_demandee=date_exp,
        qte_commandee=qte_commandee,
        qte_allouee=qte_allouee,
        qte_restante=qte_restante,
    )


def make_reception(article, date_prevue, qte=100, fournisseur="F001"):
    from src.models.reception import Reception
    return Reception(
        num_commande="CA001",
        article=article,
        code_fournisseur=fournisseur,
        quantite_restante=qte,
        date_reception_prevue=date_prevue,
    )


def make_stock(article, physique=100, alloue=0, bloque=0):
    from src.models.stock import Stock
    return Stock(article=article, stock_physique=physique, stock_alloue=alloue, stock_bloque=bloque)


def make_nomenclature(article, composants_data):
    """composants_data : list of (article_composant, qte_lien, "Acheté"|"Fabriqué")."""
    import unicodedata
    from src.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle

    def _normalise_type(type_str: str) -> str:
        """Strip accents so 'Acheté' -> 'Achete', 'Fabriqué' -> 'Fabrique'."""
        return unicodedata.normalize("NFKD", type_str).encode("ascii", "ignore").decode("ascii")

    entries = [
        NomenclatureEntry(
            article_parent=article,
            designation_parent=f"DESC_{article}",
            niveau=10,
            article_composant=art_comp,
            designation_composant=f"DESC_{art_comp}",
            qte_lien=qte,
            type_article=TypeArticle(_normalise_type(type_str)),
        )
        for art_comp, qte, type_str in composants_data
    ]
    return Nomenclature(article=article, designation=f"DESC_{article}", composants=entries)


def make_loader(ofs=None, commandes=None, receptions=None, nomenclatures=None, stocks=None):
    """Construit un DataLoader mocké avec des données contrôlées."""
    loader = MagicMock()
    loader.ofs = ofs or []
    loader.commandes_clients = commandes or []
    loader.receptions = receptions or []
    loader.nomenclatures = nomenclatures or {}

    loader.get_nomenclature.side_effect = lambda art: (nomenclatures or {}).get(art)
    loader.get_stock.side_effect = lambda art: (stocks or {}).get(art)
    loader.get_receptions.side_effect = lambda art: [
        r for r in (receptions or []) if r.article == art
    ]
    loader.get_of_by_num.side_effect = lambda num: next(
        (o for o in (ofs or []) if o.num_of == num), None
    )
    loader.get_commandes_s1.return_value = commandes or []
    return loader


# ---------------------------------------------------------------------------
# Date de référence fixe pour tous les tests
# ---------------------------------------------------------------------------

TODAY = date(2026, 3, 23)

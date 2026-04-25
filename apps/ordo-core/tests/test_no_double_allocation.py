"""Regle metier : un composant deja alloue a un OF ne doit jamais etre alloue a nouveau.

Cette regle garantit que :
1. Le checker ne marque pas en rupture un composant deja alloue a l'OF
2. La reservation virtuelle ne reserve pas ce qui est deja alloue dans l'ERP
3. La reservation virtuelle reserve quand meme les composants NON alloues (allocation partielle)
4. Deux OFs en concurrence ne sur-allouent pas un composant
"""

from datetime import date
from types import SimpleNamespace


from production_planning.orders.allocation import StockState
from production_planning.feasibility.recursive import RecursiveChecker
from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from production_planning.models.stock import Stock
from production_planning.models.allocation import OFAllocation
from production_planning.scheduling.material import (
    reserve_candidate_components,
    availability_status,
    compute_direct_component_shortages,
)
from production_planning.scheduling.models import CandidateOF


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_nomenclature(parent, components):
    """Cree une nomenclature simple. components: list of (code, qte, type)."""
    return Nomenclature(
        article=parent,
        designation=f"DESC_{parent}",
        composants=[
            NomenclatureEntry(
                article_parent=parent,
                designation_parent=f"DESC_{parent}",
                niveau=10,
                article_composant=code,
                designation_composant=f"DESC_{code}",
                qte_lien=qte,
                type_article=type_article,
            )
            for code, qte, type_article in components
        ],
    )


def _make_loader(nomenclatures, stocks, allocations_by_of=None):
    """Cree un loader minimal avec les donnees fournies."""
    allocations_by_of = allocations_by_of or {}
    return SimpleNamespace(
        commandes_clients=[],
        get_nomenclature=lambda article: nomenclatures.get(article),
        get_stock=lambda article: stocks.get(article),
        get_allocations_of=lambda num_doc: allocations_by_of.get(num_doc, []),
        get_ofs_by_article=lambda *a, **kw: [],
        get_receptions=lambda article: [],
    )


def _make_candidate(num_of, article, quantity, line="PP_128"):
    return CandidateOF(
        num_of=num_of,
        article=article,
        description=f"DESC_{article}",
        line=line,
        due_date=date(2026, 4, 20),
        quantity=quantity,
        charge_hours=5.0,
    )


# ===========================================================================
# REGLE 1 : Checker — composant deja alloue => pas marque en rupture
# ===========================================================================

class TestCheckerSkipsAlreadyAllocatedComponent:
    """Le checker doit ignorer un composant deja alloue a l'OF parent."""

    def test_allocated_component_not_marked_missing(self):
        """Un composant deja alloue (ERP) ne doit pas etre en rupture."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
                ("COMP_B", 2.0, TypeArticle.ACHETE),
            ]),
        }
        # Stock tres faible — insuffisant sans allocation
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=0, stock_alloue=0, stock_bloque=0),
            "COMP_B": Stock("COMP_B", stock_physique=1, stock_alloue=1, stock_bloque=0),
        }
        # OF_A a deja COMP_B alloue (couvre 100%)
        allocations = {
            "OF_A": [OFAllocation(article="COMP_B", qte_allouee=10.0, num_doc="OF_A", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF",
            qte_besoin=5,  # need COMP_A=5, COMP_B=10
            date_besoin=date(2026, 4, 20),
            depth=0,
            of_parent_est_ferme=True,
            num_of_parent="OF_A",
        )

        # COMP_B est alloue => non marque en rupture
        assert "COMP_B" not in result.missing_components
        # COMP_A n'est PAS alloue => marque en rupture
        assert "COMP_A" in result.missing_components

    def test_partial_allocation_still_checks_unallocated(self):
        """Si seul COMP_A est alloue, COMP_B doit etre verifie normalement."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
                ("COMP_B", 3.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=10, stock_alloue=10, stock_bloque=0),
            "COMP_B": Stock("COMP_B", stock_physique=5, stock_alloue=0, stock_bloque=0),
        }
        allocations = {
            "OF_X": [OFAllocation(article="COMP_A", qte_allouee=10.0, num_doc="OF_X", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF",
            qte_besoin=10,
            date_besoin=date(2026, 4, 20),
            depth=0,
            of_parent_est_ferme=True,
            num_of_parent="OF_X",
        )

        # COMP_A alloue => skippe
        assert "COMP_A" not in result.missing_components
        # COMP_B non alloue => verifie. Besoin=30, dispo=5 => rupture 25
        assert "COMP_B" in result.missing_components
        assert result.missing_components["COMP_B"] == 25


# ===========================================================================
# REGLE 2 : Reservation virtuelle — pas de double allocation
# ===========================================================================

class TestVirtualReservationNoDoubleAllocation:
    """La reservation virtuelle ne doit pas allouer ce qui est deja alloue."""

    def test_reserve_skips_already_allocated_component(self):
        """Un OF avec allocation ERP pour COMP_A ne doit pas virtual-reserver COMP_A."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
                ("COMP_B", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=100, stock_alloue=50, stock_bloque=0),
            "COMP_B": Stock("COMP_B", stock_physique=100, stock_alloue=0, stock_bloque=0),
        }
        # OF_A a deja COMP_A alloue dans l'ERP
        allocations = {
            "OF_A": [OFAllocation(article="COMP_A", qte_allouee=50.0, num_doc="OF_A", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)
        material_state = StockState({"COMP_A": 50, "COMP_B": 100})
        checker = RecursiveChecker(loader)

        candidate = _make_candidate("OF_A", "PF", 50)

        reserve_candidate_components(loader, checker, candidate, date(2026, 4, 20), material_state)

        # COMP_A ne doit PAS etre virtual-reserve (deja alloue ERP)
        assert material_state.get_available("COMP_A") == 50, \
            "COMP_A ne doit pas etre virtual-reserve (deja alloue ERP)"

    def test_reserve_partially_allocated_of_still_reserves_unallocated(self):
        """OF avec allocation partielle : COMP_A alloue, COMP_B non => reserve seulement COMP_B.

        Note : reserve_candidate_components ne reserve que les composants "sous tension"
        (stock < besoin). On met COMP_B en tension pour forcer la reservation.
        """
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
                ("COMP_B", 2.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=100, stock_alloue=50, stock_bloque=0),
            "COMP_B": Stock("COMP_B", stock_physique=200, stock_alloue=0, stock_bloque=0),
        }
        # OF_A a COMP_A alloue mais PAS COMP_B
        allocations = {
            "OF_A": [OFAllocation(article="COMP_A", qte_allouee=50.0, num_doc="OF_A", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)
        # COMP_B en tension : dispo < besoin (80 < 100)
        material_state = StockState({"COMP_A": 50, "COMP_B": 80})
        checker = RecursiveChecker(loader)

        candidate = _make_candidate("OF_A", "PF", 50)

        reserve_candidate_components(loader, checker, candidate, date(2026, 4, 20), material_state)

        # COMP_A : deja alloue => pas de virtual reserve
        assert material_state.get_available("COMP_A") == 50, \
            "COMP_A ne doit pas etre virtual-reserve"

        # COMP_B : pas alloue et sous tension => DOIT etre virtual-reserve (besoin = 50*2 = 100)
        assert material_state.get_available("COMP_B") == -20, \
            f"COMP_B doit etre virtual-reserve (80 - 100), reste={material_state.get_available('COMP_B')}"

    def test_two_ofs_competing_no_over_allocation(self):
        """Deux OFs en concurrence ne doivent pas sur-allouer un composant sous tension."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_X", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_X": Stock("COMP_X", stock_physique=100, stock_alloue=0, stock_bloque=0),
        }
        loader = _make_loader(nomenclatures, stocks)
        # Stock en tension : dispo < besoin pour forcer la reservation
        material_state = StockState({"COMP_X": 50})
        checker = RecursiveChecker(loader)

        # OF_A : besoin=60, dispo=50 => scarce, reserve 60
        cand_a = _make_candidate("OF_A", "PF", 60)
        reserve_candidate_components(loader, checker, cand_a, date(2026, 4, 20), material_state)
        assert material_state.get_available("COMP_X") == -10  # 50 - 60

        # OF_B : besoin=40, dispo=-10 => scarce, reserve 40
        cand_b = _make_candidate("OF_B", "PF", 40)
        reserve_candidate_components(loader, checker, cand_b, date(2026, 4, 20), material_state)
        assert material_state.get_available("COMP_X") == -50  # -10 - 40

    def test_allocated_of_does_not_inflate_pool(self):
        """Un OF avec allocation ERP ne doit pas gonfler le pool virtuel en sautant la reservation.

        Scenario :
        - COMP_X : stock=100, alloue_ERP=50 (pour OF_A), dispo=50
        - OF_A : a deja 50 alloues, besoin=50 => couvert par ERP, ne reserve rien
        - OF_B : pas d'allocation, besoin=50 => DOIT pouvoir reserver les 50 libres

        Note : COMP_X est sous tension (dispo < besoin pour forcer la reservation).
        """
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_X", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_X": Stock("COMP_X", stock_physique=100, stock_alloue=50, stock_bloque=0),
        }
        allocations = {
            "OF_A": [OFAllocation(article="COMP_X", qte_allouee=50.0, num_doc="OF_A", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)
        material_state = StockState({"COMP_X": 50})  # dispo = 50
        checker = RecursiveChecker(loader)

        # OF_A : allocation ERP => ne reserve rien
        cand_a = _make_candidate("OF_A", "PF", 50)
        reserve_candidate_components(loader, checker, cand_a, date(2026, 4, 20), material_state)
        pool_after_a = material_state.get_available("COMP_X")
        assert pool_after_a == 50, \
            f"OF_A a deja son allocation ERP, le pool ne doit pas changer, pool={pool_after_a}"

        # OF_B : pas d'allocation, besoin=50, dispo=50 => scarce (50 < 50 is False)
        # On met le stock sous tension pour forcer la reservation
        material_state = StockState({"COMP_X": 30})
        cand_b = _make_candidate("OF_B", "PF", 50)
        reserve_candidate_components(loader, checker, cand_b, date(2026, 4, 20), material_state)
        pool_after_b = material_state.get_available("COMP_X")
        assert pool_after_b == -20, \
            f"OF_B doit reserver 50 (scarce: 30 < 50), pool={pool_after_b}"


# ===========================================================================
# REGLE 3 : compute_direct_component_shortages respecte les allocations
# ===========================================================================

class TestDirectShortagesRespectsAllocations:
    """compute_direct_component_shortages doit deduire les allocations ERP."""

    def test_no_shortage_when_fully_allocated(self):
        """Composant entierement alloue => pas de rupture signalee."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=10, stock_alloue=10, stock_bloque=0),
        }
        allocations = {
            "OF_A": [OFAllocation(article="COMP_A", qte_allouee=10.0, num_doc="OF_A", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)
        material_state = StockState({"COMP_A": 0})

        candidate = _make_candidate("OF_A", "PF", 10)
        result = compute_direct_component_shortages(loader, candidate, material_state)

        assert result == "", f"Pas de rupture attendue, obtenu: '{result}'"

    def test_shortage_only_for_unallocated_portion(self):
        """Allocation partielle : la rupture = besoin - alloue_ERP - dispo."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 2.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=100, stock_alloue=10, stock_bloque=0),
        }
        allocations = {
            "OF_A": [OFAllocation(article="COMP_A", qte_allouee=10.0, num_doc="OF_A", date_besoin="20/04/2026")],
        }
        loader = _make_loader(nomenclatures, stocks, allocations)
        material_state = StockState({"COMP_A": 90})  # dispo = 100-10 = 90

        candidate = _make_candidate("OF_A", "PF", 20)
        # Besoin = 20*2 = 40. Alloue ERP = 10. Dispo = 90.
        # Manquant = 40 - 10 - 90 = -60 => pas de rupture
        result = compute_direct_component_shortages(loader, candidate, material_state)

        assert result == "", f"Pas de rupture attendue (besoin=40, alloue=10, dispo=90), obtenu: '{result}'"


# ===========================================================================
# REGLE 4 : OF FERME (statut 1) — jamais bloque pour rupture composants
# ===========================================================================

class TestFermeOFNeverBlocked:
    """Un OF FERME (statut_num=1) est deja en production.
    Achats valides a l'affermissement, fabriques manquants ne bloquent pas
    (on lance des sous-OFs). Jamais bloque."""

    def test_ferme_of_always_comfortable_achete_shortage(self):
        """OF FERME avec composant ACHETE en rupture => comfortable."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=0, stock_alloue=0, stock_bloque=0),
        }
        loader = _make_loader(nomenclatures, stocks)
        checker = RecursiveChecker(loader)

        candidate = _make_candidate("OF_FERME", "PF", 50)
        candidate.statut_num = 1

        status, reason = availability_status(
            checker, loader, candidate, date(2026, 4, 20),
        )
        assert status == "comfortable"
        assert reason == ""

    def test_ferme_of_always_comfortable_fabrique_shortage(self):
        """OF FERME avec composant FABRIQUE en rupture => comfortable quand meme."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
                ("COMP_F", 2.0, TypeArticle.FABRIQUE),
            ]),
            "COMP_F": _make_nomenclature("COMP_F", [
                ("COMP_F_ACHAT", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=0, stock_alloue=0, stock_bloque=0),
            "COMP_F": Stock("COMP_F", stock_physique=0, stock_alloue=0, stock_bloque=0),
            "COMP_F_ACHAT": Stock("COMP_F_ACHAT", stock_physique=0, stock_alloue=0, stock_bloque=0),
        }
        loader = _make_loader(nomenclatures, stocks)
        checker = RecursiveChecker(loader)

        candidate = _make_candidate("OF_FERME", "PF", 50)
        candidate.statut_num = 1

        status, reason = availability_status(
            checker, loader, candidate, date(2026, 4, 20),
        )
        assert status == "comfortable"

    def test_ferme_of_comfortable_with_virtual_stock(self):
        """OF FERME avec material_state => comfortable."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_X", 2.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_X": Stock("COMP_X", stock_physique=0, stock_alloue=0, stock_bloque=0),
        }
        loader = _make_loader(nomenclatures, stocks)
        material_state = StockState({"COMP_X": 0})
        checker = RecursiveChecker(loader)

        candidate = _make_candidate("OF_FERME", "PF", 100)
        candidate.statut_num = 1

        status, reason = availability_status(
            checker, loader, candidate, date(2026, 4, 20),
            material_state=material_state,
        )
        assert status == "comfortable"

    def test_suggere_of_still_blocked_by_achete_shortage(self):
        """OF SUGGERE avec composant ACHETE en rupture => blocked."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=0, stock_alloue=0, stock_bloque=0),
        }
        loader = _make_loader(nomenclatures, stocks)
        checker = RecursiveChecker(loader)

        candidate = _make_candidate("OF_SUGG", "PF", 50)
        candidate.statut_num = 3

        status, reason = availability_status(
            checker, loader, candidate, date(2026, 4, 20),
        )
        assert status == "blocked"

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from suivi_commandes.domain.charge_port import ChargeCalculatorPort

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class ProductionPlanningChargeAdapter(ChargeCalculatorPort):
    """Adapter ChargeCalculatorPort qui délègue à production_planning.

    C'est le SEUL endroit de suivi-commandes qui importe production_planning.
    Si on supprime ce couplage, on remplace juste cet adapter.
    """

    POSTE_CHARGE_REGEX = re.compile(r"^PP_\d+$")

    def __init__(self, data_reader: "DataReader") -> None:
        self._reader = data_reader
        # Import lazy pour éviter le couplage au chargement
        from production_planning.planning.charge_calculator import (
            calculate_article_charge as _calc,
            get_poste_libelle as _libelle,
            is_valid_poste as _valid,
        )
        self._calculate_article_charge = _calc
        self._get_poste_libelle = _libelle
        self._is_valid_poste = _valid

    def calculate_direct_charge(self, article: str, quantity: float) -> dict[str, float]:
        gamme = self._reader.get_gamme(article)
        if not gamme:
            return {}
        result: dict[str, float] = {}
        for op in gamme.operations:
            if self.is_valid_poste(op.poste_charge) and op.cadence > 0:
                result[op.poste_charge] = quantity / op.cadence
        return result

    def calculate_recursive_charge(self, article: str, quantity: float) -> dict[str, float]:
        return self._calculate_article_charge(article, quantity, self._reader)

    def get_poste_libelle(self, poste: str) -> str:
        return self._get_poste_libelle(poste, self._reader)

    def is_valid_poste(self, poste: str) -> bool:
        return self._is_valid_poste(poste)

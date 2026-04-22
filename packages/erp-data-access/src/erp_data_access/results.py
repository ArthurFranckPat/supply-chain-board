"""Named container for loaded ERP data.

Standalone module to avoid circular imports between loaders and protocols.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models.article import Article
    from .models.besoin_client import BesoinClient
    from .models.gamme import Gamme
    from .models.nomenclature import Nomenclature
    from .models.of import OF
    from .models.reception import Reception
    from .models.stock import Stock
    from .models.tarif_achat import TarifAchat


@dataclass
class LoadResult:
    """Named container for all loaded ERP data.

    Replaces the fragile 7-element positional tuple from CSVLoader.load_all().
    """

    articles: dict[str, "Article"] = field(default_factory=dict)
    nomenclatures: dict[str, "Nomenclature"] = field(default_factory=dict)
    gammes: dict[str, "Gamme"] = field(default_factory=dict)
    ofs: list["OF"] = field(default_factory=list)
    stocks: dict[str, "Stock"] = field(default_factory=dict)
    receptions: list["Reception"] = field(default_factory=list)
    commandes_clients: list["BesoinClient"] = field(default_factory=list)
    tarifs_achats: list["TarifAchat"] = field(default_factory=list)

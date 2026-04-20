"""Abstract data access protocols for dependency inversion.

Consumers should type-hint these protocols instead of the concrete DataLoader.
This enables testing with mocks and swapping data sources without touching
business logic.
"""

from __future__ import annotations

from datetime import date
from typing import Optional, Protocol, runtime_checkable, TYPE_CHECKING

if TYPE_CHECKING:
    from .models.article import Article
    from .models.besoin_client import BesoinClient
    from .models.gamme import Gamme
    from .models.nomenclature import Nomenclature
    from .models.of import OF
    from .models.reception import Reception
    from .models.stock import Stock
    from .models.allocation import OFAllocation


@runtime_checkable
class ArticleReader(Protocol):
    """Read-only access to article data."""

    @property
    def articles(self) -> dict[str, "Article"]: ...

    def get_article(self, code: str) -> Optional["Article"]: ...


@runtime_checkable
class StockReader(Protocol):
    """Read-only access to stock data."""

    def get_stock(self, article: str) -> Optional["Stock"]: ...


@runtime_checkable
class GammeReader(Protocol):
    """Read-only access to gamme (routing) data."""

    def get_gamme(self, article: str) -> Optional["Gamme"]: ...


@runtime_checkable
class NomenclatureReader(Protocol):
    """Read-only access to nomenclature (BOM) data."""

    def get_nomenclature(self, article: str) -> Optional["Nomenclature"]: ...


@runtime_checkable
class OrderReader(Protocol):
    """Read-only access to customer orders."""

    @property
    def commandes_clients(self) -> list["BesoinClient"]: ...


@runtime_checkable
class OFReader(Protocol):
    """Read-only access to work orders."""

    @property
    def ofs(self) -> list["OF"]: ...

    def get_of_by_num(self, num_of: str) -> Optional["OF"]: ...

    def get_ofs_by_origin(
        self, num_ordre_origine: str, article: Optional[str] = None
    ) -> list["OF"]: ...

    def get_ofs_by_article(
        self,
        article: str,
        statut: Optional[int] = None,
        date_besoin: Optional[date] = None,
    ) -> list["OF"]: ...

    def get_ofs_to_check(self) -> list["OF"]: ...


@runtime_checkable
class ReceptionReader(Protocol):
    """Read-only access to supplier receptions."""

    def get_receptions(self, article: str) -> list["Reception"]: ...


@runtime_checkable
class AllocationReader(Protocol):
    """Read-only access to allocation data."""

    def get_allocations_of(self, num_doc: str) -> list["OFAllocation"]: ...


@runtime_checkable
class DataReader(
    ArticleReader,
    StockReader,
    GammeReader,
    NomenclatureReader,
    OrderReader,
    OFReader,
    ReceptionReader,
    AllocationReader,
    Protocol,
):
    """Composite read-only data access interface.

    Consumers type-hint the narrowest protocol they need.
    For example, suivi-commandes only needs OrderReader + StockReader + GammeReader.
    """
    pass

"""DataLoader - Interface de requete pour les donnees chargees."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Optional

from .csv_loader import CSVLoader, resolve_extractions_files
from ..models.article import Article
from ..models.besoin_client import BesoinClient
from ..models.gamme import Gamme
from ..models.nomenclature import Nomenclature
from ..models.of import OF
from ..models.reception import Reception
from ..models.stock import Stock
from ..models.allocation import OFAllocation
from ..results import LoadResult


class DataLoader:
    """DataLoader principal - implements DataReader protocol.

    Orchestrate CSV loading via CSVLoader, builds secondary indexes,
    and exposes read-only query methods defined by the DataReader protocol.
    """

    def __init__(self, data_dir: str = None, *, csv_loader: "CSVLoader" = None):
        if csv_loader is not None:
            self.csv_loader = csv_loader
        elif data_dir is not None:
            self.csv_loader = CSVLoader(data_dir)
        else:
            self.csv_loader = CSVLoader()

        self._articles: Optional[dict[str, Article]] = None
        self._nomenclatures: Optional[dict[str, Nomenclature]] = None
        self._gammes: Optional[dict[str, Gamme]] = None
        self._ofs: Optional[list[OF]] = None
        self._stocks: Optional[dict[str, Stock]] = None
        self._receptions: Optional[list[Reception]] = None
        self._commandes_clients: Optional[list[BesoinClient]] = None
        self._allocations: Optional[dict[str, list[OFAllocation]]] = None

        self._receptions_by_article: Optional[dict[str, list[Reception]]] = None
        self._ofs_by_num: Optional[dict[str, OF]] = None
        self._ofs_by_origin: Optional[dict[str, list[OF]]] = None

    @classmethod
    def from_extractions(cls, extractions_dir=None) -> "DataLoader":
        """Cree un DataLoader depuis le dossier d'extractions ERP."""
        resolved, missing = resolve_extractions_files(extractions_dir)
        if missing:
            missing_files = [CSVLoader.EXTRACTIONS_FILE_MAP[name] for name in missing]
            raise FileNotFoundError(
                "Fichiers introuvables dans le dossier d'extractions ERP:\n"
                + "\n".join(f"  - {m}" for m in missing_files)
            )
        return cls(csv_loader=CSVLoader(resolved_files=resolved))

    def load_all(self):
        """Charge tous les fichiers CSV en memoire."""
        result: LoadResult = self.csv_loader.load_all()

        self._articles = result.articles
        self._nomenclatures = result.nomenclatures
        self._gammes = result.gammes
        self._ofs = result.ofs
        self._stocks = result.stocks
        self._receptions = result.receptions
        self._commandes_clients = result.commandes_clients

        # Build secondary indexes
        self._receptions_by_article = defaultdict(list)
        for reception in self._receptions:
            self._receptions_by_article[reception.article].append(reception)

        self._ofs_by_num = {of.num_of: of for of in self._ofs}
        self._ofs_by_origin = defaultdict(list)
        for of in self._ofs:
            if of.num_ordre_origine:
                self._ofs_by_origin[of.num_ordre_origine].append(of)

        if self._ofs_by_origin is not None:
            self._ofs_by_origin = dict(self._ofs_by_origin)
        self._allocations = self._load_allocations()

    # -- Lazy-loading properties --

    @property
    def articles(self) -> dict[str, Article]:
        if self._articles is None:
            self.load_all()
        return self._articles

    @property
    def nomenclatures(self) -> dict[str, Nomenclature]:
        if self._nomenclatures is None:
            self.load_all()
        return self._nomenclatures

    @property
    def gammes(self) -> dict[str, Gamme]:
        if self._gammes is None:
            self.load_all()
        return self._gammes

    @property
    def ofs(self) -> list[OF]:
        if self._ofs is None:
            self.load_all()
        return self._ofs

    @property
    def stocks(self) -> dict[str, Stock]:
        if self._stocks is None:
            self.load_all()
        return self._stocks

    @property
    def receptions(self) -> list[Reception]:
        if self._receptions is None:
            self.load_all()
        return self._receptions

    @property
    def commandes_clients(self) -> list[BesoinClient]:
        if self._commandes_clients is None:
            self.load_all()
        return self._commandes_clients

    # -- Query methods (DataReader protocol) --

    def get_article(self, code: str) -> Optional[Article]:
        return self.articles.get(code)

    def get_nomenclature(self, article: str) -> Optional[Nomenclature]:
        return self.nomenclatures.get(article)

    def get_gamme(self, article: str) -> Optional[Gamme]:
        return self.gammes.get(article)

    def get_stock(self, article: str) -> Optional[Stock]:
        return self.stocks.get(article)

    def get_receptions(self, article: str) -> list[Reception]:
        if self._receptions_by_article is None:
            self.load_all()
        return self._receptions_by_article.get(article, [])

    def get_ofs_to_check(self) -> list[OF]:
        return [of for of in self.ofs if of.qte_restante > 0]

    def get_articles_fabrication(self) -> list[Article]:
        return [a for a in self.articles.values() if a.is_fabrication()]

    def get_articles_achat(self) -> list[Article]:
        return [a for a in self.articles.values() if a.is_achat()]

    def get_of_by_num(self, num_of: str) -> Optional[OF]:
        if self._ofs_by_num is None:
            self.load_all()
        return self._ofs_by_num.get(num_of)

    def get_ofs_by_origin(self, num_ordre_origine: str, article: Optional[str] = None) -> list[OF]:
        if self._ofs_by_origin is None:
            self.load_all()
        ofs = self._ofs_by_origin.get(num_ordre_origine, [])
        if article is not None:
            ofs = [of for of in ofs if of.article == article]
        return ofs

    def get_ofs_by_article(
        self,
        article: str,
        statut: Optional[int] = None,
        date_besoin: Optional["date"] = None,
    ) -> list[OF]:
        ofs = [
            of for of in self.ofs
            if of.article == article and of.qte_restante > 0
        ]
        if statut is not None:
            ofs = [of for of in ofs if of.statut_num == statut]
        if date_besoin is not None:
            ofs.sort(key=lambda of: abs((of.date_fin - date_besoin).days))
        return ofs

    def _load_allocations(self) -> dict[str, list[OFAllocation]]:
        try:
            df = self.csv_loader._load_csv("allocations.csv")
        except FileNotFoundError:
            return {}

        allocations = defaultdict(list)
        for _, row in df.iterrows():
            allocation = OFAllocation.from_csv_row(row.to_dict())
            allocations[allocation.num_doc].append(allocation)

        return dict(allocations)

    @property
    def allocations(self) -> dict[str, list[OFAllocation]]:
        if self._allocations is None:
            self.load_all()
        return self._allocations

    def get_allocations_of(self, num_doc: str) -> list[OFAllocation]:
        return self.allocations.get(num_doc, [])

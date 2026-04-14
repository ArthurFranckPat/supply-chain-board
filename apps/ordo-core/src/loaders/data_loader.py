"""DataLoader - Interface de requête pour les données chargées."""

from collections import defaultdict
from typing import Optional

import pandas as pd

from .csv_loader import CSVLoader
from ..models.article import Article
from ..models.besoin_client import BesoinClient
from ..models.gamme import Gamme
from ..models.nomenclature import Nomenclature
from ..models.of import OF
from ..models.reception import Reception
from ..models.stock import Stock
from ..models.allocation import OFAllocation


class DataLoader:
    """DataLoader principal - Interface de requête pour les données.

    Attributes
    ----------
    csv_loader : CSVLoader
        Loader pour les fichiers CSV
    articles : dict[str, Article]
        Catalogue des articles indexé par code
    nomenclatures : dict[str, Nomenclature]
        Nomenclatures indexées par article parent
    gammes : dict[str, Gamme]
        Gammes de production indexées par article
    ofs : list[OF]
        Liste des ordres de fabrication
    stocks : dict[str, Stock]
        Stocks indexés par article
    receptions : list[Reception]
        Liste des réceptions fournisseurs
    commandes_clients : list[BesoinClient]
        Liste des commandes clients (au format BesoinClient)
    allocations : dict[str, list[OFAllocation]]
        Allocations par document (OF ou commande), indexé par NUM_DOC
    """

    def __init__(self, data_dir: str = None, *, csv_loader: "CSVLoader" = None):
        """Initialise le DataLoader.

        Parameters
        ----------
        data_dir : str, optional
            Chemin vers le répertoire contenant les fichiers CSV (mode classique).
        csv_loader : CSVLoader, optional
            Loader pré-configuré (utilisé par ``from_downloads``).
        """
        if csv_loader is not None:
            self.csv_loader = csv_loader
        elif data_dir is not None:
            self.csv_loader = CSVLoader(data_dir)
        else:
            raise ValueError("data_dir ou csv_loader est requis")

        # Cache pour les données chargées
        self._articles: Optional[dict[str, Article]] = None
        self._nomenclatures: Optional[dict[str, Nomenclature]] = None
        self._gammes: Optional[dict[str, Gamme]] = None
        self._ofs: Optional[list[OF]] = None
        self._stocks: Optional[dict[str, Stock]] = None
        self._receptions: Optional[list[Reception]] = None
        self._commandes_clients: Optional[list[BesoinClient]] = None
        self._allocations: Optional[dict[str, list[OFAllocation]]] = None

        # Index des réceptions par article
        self._receptions_by_article: Optional[dict[str, list[Reception]]] = None

        # Index des OF par numéro
        self._ofs_by_num: Optional[dict[str, OF]] = None

    @classmethod
    def from_downloads(cls, downloads_dir=None) -> "DataLoader":
        """Crée un DataLoader en résolvant les fichiers depuis le dossier Téléchargements.

        Pour chaque fichier attendu, cherche le fichier le plus récent au format
        ``{timestamp}_{CODE}.csv`` dans ``downloads_dir``.

        Parameters
        ----------
        downloads_dir : str | Path, optional
            Dossier à scanner. Si None, utilise ``~/Downloads``
            (ou ``~/Téléchargements`` sur Windows FR).

        Returns
        -------
        DataLoader
            DataLoader prêt à l'emploi.

        Raises
        ------
        FileNotFoundError
            Si aucun fichier n'est trouvé pour un code donné.

        Examples
        --------
        >>> loader = DataLoader.from_downloads()
        >>> loader = DataLoader.from_downloads("C:/Users/jdupont/Downloads")
        """
        from .csv_loader import resolve_downloads_files

        resolved, missing = resolve_downloads_files(downloads_dir)

        if missing:
            missing_codes = [
                f"{name} (code: {CSVLoader._code_for_static(name)})"
                for name in missing
            ]
            raise FileNotFoundError(
                f"Fichiers introuvables dans le dossier Téléchargements :\n"
                + "\n".join(f"  - {m}" for m in missing_codes)
            )

        return cls(csv_loader=CSVLoader(resolved_files=resolved))

    def load_all(self):
        """Charge tous les fichiers CSV en mémoire."""
        (
            self._articles,
            self._nomenclatures,
            self._gammes,
            self._ofs,
            self._stocks,
            self._receptions,
            self._commandes_clients,
        ) = self.csv_loader.load_all()

        # Indexer les réceptions par article
        self._receptions_by_article = defaultdict(list)
        for reception in self._receptions:
            self._receptions_by_article[reception.article].append(reception)

        # Indexer les OF par numéro
        self._ofs_by_num = {of.num_of: of for of in self._ofs}

        # Charger les allocations
        self._allocations = self._load_allocations()

    # Méthodes de chargement individuel

    @property
    def articles(self) -> dict[str, Article]:
        """Retourne le catalogue des articles."""
        if self._articles is None:
            self.load_all()
        return self._articles

    @property
    def nomenclatures(self) -> dict[str, Nomenclature]:
        """Retourne les nomenclatures."""
        if self._nomenclatures is None:
            self.load_all()
        return self._nomenclatures

    @property
    def gammes(self) -> dict[str, Gamme]:
        """Retourne les gammes de production."""
        if self._gammes is None:
            self.load_all()
        return self._gammes

    @property
    def ofs(self) -> list[OF]:
        """Retourne la liste des OF."""
        if self._ofs is None:
            self.load_all()
        return self._ofs

    @property
    def stocks(self) -> dict[str, Stock]:
        """Retourne les stocks."""
        if self._stocks is None:
            self.load_all()
        return self._stocks

    @property
    def receptions(self) -> list[Reception]:
        """Retourne les réceptions."""
        if self._receptions is None:
            self.load_all()
        return self._receptions

    @property
    def commandes_clients(self) -> list[BesoinClient]:
        """Retourne les commandes clients (au format BesoinClient)."""
        if self._commandes_clients is None:
            self.load_all()
        return self._commandes_clients

    # Méthodes de requête

    def get_article(self, code: str) -> Optional[Article]:
        """Retourne un article par son code.

        Parameters
        ----------
        code : str
            Code de l'article

        Returns
        -------
        Optional[Article]
            Article ou None si introuvable
        """
        return self.articles.get(code)

    def get_nomenclature(self, article: str) -> Optional[Nomenclature]:
        """Retourne la nomenclature d'un article.

        Parameters
        ----------
        article : str
            Code de l'article parent

        Returns
        -------
        Optional[Nomenclature]
            Nomenclature ou None si introuvable
        """
        return self.nomenclatures.get(article)

    def get_gamme(self, article: str) -> Optional[Gamme]:
        """Retourne la gamme d'un article.

        Parameters
        ----------
        article : str
            Code de l'article

        Returns
        -------
        Optional[Gamme]
            Gamme ou None si introuvable
        """
        return self.gammes.get(article)

    def get_stock(self, article: str) -> Optional[Stock]:
        """Retourne le stock d'un article.

        Parameters
        ----------
        article : str
            Code de l'article

        Returns
        -------
        Optional[Stock]
            Stock ou None si introuvable
        """
        return self.stocks.get(article)

    def get_receptions(self, article: str) -> list[Reception]:
        """Retourne les réceptions pour un article.

        Parameters
        ----------
        article : str
            Code de l'article

        Returns
        -------
        list[Reception]
            Liste des réceptions pour l'article (vide si aucune)
        """
        if self._receptions_by_article is None:
            self.load_all()
        return self._receptions_by_article.get(article, [])

    def get_ofs_to_check(self) -> list[OF]:
        """Retourne la liste des OF à vérifier (OF avec quantité restante > 0).

        Returns
        -------
        list[OF]
            Liste des OF à vérifier
        """
        return [of for of in self.ofs if of.qte_restante > 0]

    def get_articles_fabrication(self) -> list[Article]:
        """Retourne la liste des articles de type FABRICATION.

        Returns
        -------
        list[Article]
            Liste des articles fabriqués
        """
        return [a for a in self.articles.values() if a.is_fabrication()]

    def get_articles_achat(self) -> list[Article]:
        """Retourne la liste des articles de type ACHAT.

        Returns
        -------
        list[Article]
            Liste des articles achetés
        """
        return [a for a in self.articles.values() if a.is_achat()]

    def get_of_by_num(self, num_of: str) -> Optional[OF]:
        """Retourne un OF par son numéro.

        Parameters
        ----------
        num_of : str
            Numéro de l'OF

        Returns
        -------
        Optional[OF]
            OF ou None si introuvable
        """
        if self._ofs_by_num is None:
            self.load_all()
        return self._ofs_by_num.get(num_of)

    def get_ofs_by_article(
        self,
        article: str,
        statut: Optional[int] = None,
        date_besoin: Optional["date"] = None,
    ) -> list[OF]:
        """Récupère les OFs pour un article donné.

        Parameters
        ----------
        article : str
            Code article
        statut : int, optional
            Filtre par statut (1 = Ferme, 3 = Suggéré)
        date_besoin : date, optional
            Si fourni, trie par proximité avec cette date

        Returns
        -------
        list[OF]
            Liste des OFs triés (si date_besoin fourni)
        """
        # Filtrer par article et quantité disponible
        ofs = [
            of for of in self.ofs
            if of.article == article and of.qte_restante > 0
        ]

        # Filtrer par statut si demandé
        if statut is not None:
            ofs = [of for of in ofs if of.statut_num == statut]

        # Trier par date si demandé
        if date_besoin is not None:
            ofs.sort(key=lambda of: abs((of.date_fin - date_besoin).days))

        return ofs

    def _load_allocations(self) -> dict[str, list[OFAllocation]]:
        """Charge le fichier des allocations OF/composants.

        Returns
        -------
        dict[str, list[OFAllocation]]
            Dictionnaire des allocations indexé par NUM_DOC
        """
        from collections import defaultdict

        try:
            df = self.csv_loader._load_csv("allocations.csv", subdir="dynamique")
        except FileNotFoundError:
            return {}

        allocations = defaultdict(list)
        for _, row in df.iterrows():
            allocation = OFAllocation.from_csv_row(row.to_dict())
            allocations[allocation.num_doc].append(allocation)

        return dict(allocations)

    @property
    def allocations(self) -> dict[str, list[OFAllocation]]:
        """Retourne les allocations par document.

        Returns
        -------
        dict[str, list[OFAllocation]]
            Dictionnaire des allocations indexé par NUM_DOC
        """
        if self._allocations is None:
            self.load_all()
        return self._allocations

    def get_allocations_of(self, num_doc: str) -> list[OFAllocation]:
        """Retourne les allocations pour un document donné.

        Parameters
        ----------
        num_doc : str
            Numéro du document (OF ou commande)

        Returns
        -------
        list[OFAllocation]
            Liste des allocations pour ce document
        """
        return self.allocations.get(num_doc, [])

    def get_commandes_s1(
        self,
        date_reference,
        horizon_days: int = 7,
        include_previsions: bool = False
    ) -> list[BesoinClient]:
        """Retourne les commandes clients à expédier dans l'horizon donné.

        Parameters
        ----------
        date_reference : date
            Date de référence
        horizon_days : int
            Horizon en jours (défaut: 7 pour S+1)
        include_previsions : bool
            Si True, inclut les prévisions (défaut: False)
            NOTE: Pour la France (FR), les prévisions sont toujours exclues

        Returns
        -------
        list[BesoinClient]
            Besoins avec DATE_EXPEDITION_DEMANDEE dans l'horizon
            - France (FR) : uniquement les commandes (jamais de prévisions)
            - Export (≠FR) : commandes + prévisions si include_previsions=True
            - Triées avec priorité : commandes d'abord, prévisions ensuite
        """
        from datetime import timedelta

        date_fin = date_reference + timedelta(days=horizon_days)

        besoins_s1 = []
        for besoin in self.commandes_clients:
            # Règle métier : France = pas de prévisions, Export = prévisions possibles
            # Si France, forcer l'exclusion des prévisions
            if besoin.est_france():
                # France : uniquement les commandes réelles
                if not besoin.est_commande():
                    continue
            elif besoin.est_export():
                # Export : appliquer le paramètre include_previsions
                if include_previsions:
                    # Inclure commandes ET prévisions
                    if not (besoin.est_commande() or besoin.est_prevision()):
                        continue
                else:
                    # Uniquement les commandes réelles
                    if not besoin.est_commande():
                        continue
            else:
                # Fallback : si pas de pays valide, comportement standard
                if include_previsions:
                    if not (besoin.est_commande() or besoin.est_prevision()):
                        continue
                else:
                    if not besoin.est_commande():
                        continue

            date_exp = besoin.date_expedition_demandee
            if date_reference <= date_exp <= date_fin and besoin.qte_restante > 0:
                besoins_s1.append(besoin)

        # Trier par priorité : commandes d'abord, puis prévisions
        # Puis par date d'expédition
        # Puis par ancienneté de commande (date_commande la plus ancienne = priorité)
        besoins_s1.sort(key=lambda b: (
            0 if b.est_commande() else 1,  # Commandes = 0, Prévisions = 1
            b.date_expedition_demandee,     # Date expedition (plus proche = prioritaire)
            b.date_commande or date.max     # Ancienneté (plus ancien = prioritaire, None = moins prioritaire)
        ))

        return besoins_s1

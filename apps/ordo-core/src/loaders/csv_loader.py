"""CSV Loader - Chargement des fichiers d'extraction ERP."""

from __future__ import annotations

import base64
import binascii
import io
import os
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

from ..models.article import Article
from ..models.besoin_client import BesoinClient
from ..models.gamme import Gamme, GammeOperation
from ..models.nomenclature import Nomenclature
from ..models.of import OF
from ..models.reception import Reception
from ..models.stock import Stock


DEFAULT_EXTRACTIONS_DIR = Path(
    os.environ.get(
        "ORDO_EXTRACTIONS_DIR",
        "C:\\Users\\bledoua\\OneDrive - Aldes Aeraulique\\Donn\u00e9es\\Extractions",
    )
)


def resolve_extractions_files(
    extractions_dir: str | Path | None = None,
) -> tuple[dict[str, Path], list[str]]:
    """Résout les fichiers d'extraction attendus dans un dossier ERP."""
    base_dir = Path(extractions_dir) if extractions_dir else DEFAULT_EXTRACTIONS_DIR

    resolved: dict[str, Path] = {}
    missing: list[str] = []

    for internal_name, physical_name in CSVLoader.EXTRACTIONS_FILE_MAP.items():
        path = base_dir / physical_name
        if path.exists():
            resolved[internal_name] = path
        else:
            missing.append(internal_name)

    return resolved, missing


class CSVLoader:
    """Loader pour les fichiers CSV d'extractions ERP."""

    EXTRACTIONS_FILE_MAP: dict[str, str] = {
        "articles.csv": "Articles.csv",
        "gammes.csv": "Gammes.csv",
        "nomenclatures.csv": "Nomenclatures.csv",
        "besoins_clients.csv": "Besoins Clients.csv",
        "of_entetes.csv": "Ordres de fabrication.csv",
        "stock.csv": "Stocks.csv",
        "receptions_oa.csv": "Commandes Achats.csv",
        "allocations.csv": "Allocations.csv",
    }

    def __init__(
        self,
        data_dir: str | Path | None = None,
        *,
        resolved_files: dict[str, Path] | None = None,
    ):
        """Initialise le loader ERP.

        Parameters
        ----------
        data_dir : str | Path | None
            Dossier des extractions ERP. Si None, utilise DEFAULT_EXTRACTIONS_DIR.
        resolved_files : dict[str, Path] | None
            Mapping explicite interne -> chemin physique.
        """
        if resolved_files is not None:
            self.data_dir = None
            self._resolved_files = resolved_files
            return

        self.data_dir = Path(data_dir) if data_dir else DEFAULT_EXTRACTIONS_DIR
        if not self.data_dir.exists():
            raise FileNotFoundError(
                f"Répertoire d'extractions introuvable: {self.data_dir}"
            )

        resolved, missing = resolve_extractions_files(self.data_dir)
        if missing:
            missing_files = [self.EXTRACTIONS_FILE_MAP[name] for name in missing]
            raise FileNotFoundError(
                "Fichiers d'extraction manquants:\n"
                + "\n".join(f"  - {filename}" for filename in missing_files)
            )

        self._resolved_files = resolved

    @staticmethod
    def _read_text_with_fallback(path: Path) -> str:
        """Lit un fichier texte avec fallback d'encodage."""
        last_error: Exception | None = None
        for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError as exc:
                last_error = exc

        if last_error is not None:
            raise last_error

        return path.read_text()

    @staticmethod
    def _looks_like_base64(payload: str) -> bool:
        compact = payload.replace("\r", "").replace("\n", "").strip()
        if len(compact) < 256:
            return False
        if not re.fullmatch(r"[A-Za-z0-9+/=]+", compact):
            return False
        return True

    @classmethod
    def _decode_if_base64(cls, raw_content: str) -> str:
        """Décode le contenu si le fichier contient un CSV encodé en base64."""
        first_line = raw_content.splitlines()[0] if raw_content.splitlines() else ""
        if "," in first_line or ";" in first_line:
            return raw_content

        if not cls._looks_like_base64(raw_content):
            return raw_content

        compact = raw_content.replace("\r", "").replace("\n", "").strip()
        try:
            decoded_bytes = base64.b64decode(compact, validate=True)
        except (ValueError, binascii.Error):
            return raw_content

        for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                decoded_text = decoded_bytes.decode(encoding)
                header = decoded_text.splitlines()[0] if decoded_text.splitlines() else ""
                if "," in header or ";" in header:
                    return decoded_text
            except UnicodeDecodeError:
                continue

        return raw_content

    @staticmethod
    def _detect_separator(csv_content: str) -> str:
        """Détecte le séparateur à partir de l'en-tête."""
        for line in csv_content.splitlines():
            if not line.strip():
                continue
            comma_count = line.count(",")
            semicolon_count = line.count(";")
            return "," if comma_count >= semicolon_count else ";"
        return ","

    def get_file_path(self, filename: str) -> Path:
        """Retourne le chemin physique d'un fichier interne."""
        path = self._resolved_files.get(filename)
        if path is None:
            expected = self.EXTRACTIONS_FILE_MAP.get(filename, filename)
            raise FileNotFoundError(
                f"Fichier d'extraction introuvable pour '{filename}' (attendu: {expected})"
            )
        return path

    def _load_csv(self, filename: str, sep: str | None = None) -> pd.DataFrame:
        """Charge un CSV ERP en DataFrame pandas."""
        filepath = self.get_file_path(filename)
        raw = self._read_text_with_fallback(filepath)
        normalized = self._decode_if_base64(raw)
        separator = sep or self._detect_separator(normalized)
        return pd.read_csv(io.StringIO(normalized), sep=separator, low_memory=False)

    def load_articles(self) -> dict[str, Article]:
        """Charge le catalogue des articles."""
        df = self._load_csv("articles.csv")

        articles = {}
        for _, row in df.iterrows():
            article = Article.from_csv_row(row.to_dict())
            articles[article.code] = article

        return articles

    def load_nomenclatures(self) -> dict[str, Nomenclature]:
        """Charge les nomenclatures articles."""
        df = self._load_csv("nomenclatures.csv")

        nomenclatures = {}
        for article_parent, group in df.groupby("ARTICLE_PARENT"):
            nomenclatures[article_parent] = Nomenclature.from_csv_rows(
                article=article_parent, rows=group.to_dict("records")
            )

        return nomenclatures

    def load_gammes(self) -> dict[str, Gamme]:
        """Charge les gammes de production."""
        df = self._load_csv("gammes.csv")

        gammes_dict = defaultdict(list)
        for _, row in df.iterrows():
            op = GammeOperation.from_csv_row(row.to_dict())
            gammes_dict[op.article].append(op)

        return {
            article: Gamme(article=article, operations=ops)
            for article, ops in gammes_dict.items()
        }

    def load_of_entetes(self) -> list[OF]:
        """Charge les ordres de fabrication."""
        df = self._load_csv("of_entetes.csv")

        ofs = []
        for _, row in df.iterrows():
            ofs.append(OF.from_csv_row(row.to_dict()))

        return ofs

    def load_stock(self) -> dict[str, Stock]:
        """Charge l'état des stocks."""
        df = self._load_csv("stock.csv")

        stocks = {}
        for _, row in df.iterrows():
            stock = Stock.from_csv_row(row.to_dict())
            stocks[stock.article] = stock

        return stocks

    def load_receptions(self) -> list[Reception]:
        """Charge les commandes achats (réceptions prévues)."""
        df = self._load_csv("receptions_oa.csv")

        receptions = []
        for _, row in df.iterrows():
            receptions.append(Reception.from_csv_row(row.to_dict()))

        return receptions

    def load_commandes_clients(self) -> list[BesoinClient]:
        """Charge les besoins clients issus de l'extraction ERP."""
        df = self._load_csv("besoins_clients.csv")

        besoins = []
        for idx, row in df.iterrows():
            try:
                besoin = BesoinClient.from_csv_row(row.to_dict())
                if besoin.article:
                    besoins.append(besoin)
            except Exception as exc:  # pragma: no cover
                print(f"Warning: erreur parsing ligne {idx}: {exc}")

        return besoins

    def load_all(
        self,
    ) -> tuple[
        dict[str, Article],
        dict[str, Nomenclature],
        dict[str, Gamme],
        list[OF],
        dict[str, Stock],
        list[Reception],
        list[BesoinClient],
    ]:
        """Charge tous les fichiers ERP."""
        articles = self.load_articles()
        nomenclatures = self.load_nomenclatures()
        gammes = self.load_gammes()
        ofs = self.load_of_entetes()
        stocks = self.load_stock()
        receptions = self.load_receptions()
        commandes_clients = self.load_commandes_clients()

        return articles, nomenclatures, gammes, ofs, stocks, receptions, commandes_clients


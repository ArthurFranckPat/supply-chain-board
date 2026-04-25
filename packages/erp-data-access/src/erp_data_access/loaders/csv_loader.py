"""CSV Loader - Chargement des fichiers d'extraction ERP."""

from __future__ import annotations

import base64
import binascii
import os
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

from ..models.gamme import Gamme
from ..results import LoadResult
from ..parsers import (
    parse_article,
    parse_besoin_client,
    parse_gamme_operation,
    parse_nomenclature,
    parse_of,
    parse_stock,
    parse_reception,
    parse_allocation,
)


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
        for line in csv_content.splitlines():
            if not line.strip():
                continue
            comma_count = line.count(",")
            semicolon_count = line.count(";")
            return "," if comma_count >= semicolon_count else ";"
        return ","

    def get_file_path(self, filename: str) -> Path:
        path = self._resolved_files.get(filename)
        if path is None:
            expected = self.EXTRACTIONS_FILE_MAP.get(filename, filename)
            raise FileNotFoundError(
                f"Fichier d'extraction introuvable pour '{filename}' (attendu: {expected})"
            )
        return path

    def _load_csv(self, filename: str, sep: str | None = None) -> pd.DataFrame:
        filepath = self.get_file_path(filename)

        # Try direct file reading with pandas first (faster than StringIO for large files)
        if sep is not None:
            return pd.read_csv(filepath, sep=sep, low_memory=False, encoding='utf-8-sig')

        # Auto-detect separator by reading first few lines
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            first_lines = [f.readline() for _ in range(5)]
            sample = ''.join(first_lines)

        # Check for base64 encoding
        sample = self._decode_if_base64(sample)

        # Detect separator
        separator = self._detect_separator(sample)

        # Read CSV with detected separator and optimized settings
        return pd.read_csv(
            filepath,
            sep=separator,
            low_memory=False,
            encoding='utf-8-sig',
            engine='c',  # Use C engine for faster parsing
        )

    def load_articles(self) -> dict[str, "Article"]:
        df = self._load_csv("articles.csv")
        articles = {}
        # Use itertuples with name=None for faster iteration
        cols = list(df.columns)
        for row in df.itertuples(index=False, name=None):
            row_dict = dict(zip(cols, row))
            article = parse_article(row_dict)
            articles[article.code] = article
        return articles

    def load_nomenclatures(self) -> dict[str, "Nomenclature"]:
        df = self._load_csv("nomenclatures.csv")
        nomenclatures = {}
        cols = list(df.columns)

        # Sort by ARTICLE_PARENT for efficient grouping without groupby overhead
        if "ARTICLE_PARENT" in cols:
            df_sorted = df.sort_values("ARTICLE_PARENT")
            current_parent = None
            current_rows = []

            for row in df_sorted.itertuples(index=False, name=None):
                row_dict = dict(zip(cols, row))
                parent = row_dict.get("ARTICLE_PARENT")

                if parent != current_parent:
                    if current_parent is not None and current_rows:
                        nomenclatures[current_parent] = parse_nomenclature(
                            article=current_parent, rows=current_rows
                        )
                    current_parent = parent
                    current_rows = []

                if parent is not None:
                    current_rows.append(row_dict)

            # Don't forget the last group
            if current_parent is not None and current_rows:
                nomenclatures[current_parent] = parse_nomenclature(
                    article=current_parent, rows=current_rows
                )
        else:
            # Fallback to original method if column not found
            for article_parent, group in df.groupby("ARTICLE_PARENT"):
                group_cols = list(group.columns)
                rows = [dict(zip(group_cols, row)) for row in group.itertuples(index=False, name=None)]
                nomenclatures[article_parent] = parse_nomenclature(
                    article=article_parent, rows=rows
                )

        return nomenclatures

    def load_gammes(self) -> dict[str, Gamme]:
        df = self._load_csv("gammes.csv")
        gammes_dict = defaultdict(list)
        cols = list(df.columns)
        for row in df.itertuples(index=False, name=None):
            row_dict = dict(zip(cols, row))
            op = parse_gamme_operation(row_dict)
            gammes_dict[op.article].append(op)
        return {
            article: Gamme(article=article, operations=ops)
            for article, ops in gammes_dict.items()
        }

    def load_of_entetes(self) -> list["OF"]:
        df = self._load_csv("of_entetes.csv")
        cols = list(df.columns)
        return [parse_of(dict(zip(cols, row))) for row in df.itertuples(index=False, name=None)]

    def load_stock(self) -> dict[str, "Stock"]:
        df = self._load_csv("stock.csv")
        stocks = {}
        cols = list(df.columns)
        for row in df.itertuples(index=False, name=None):
            row_dict = dict(zip(cols, row))
            stock = parse_stock(row_dict)
            stocks[stock.article] = stock
        return stocks

    def load_receptions(self) -> list["Reception"]:
        df = self._load_csv("receptions_oa.csv")
        cols = list(df.columns)
        return [parse_reception(dict(zip(cols, row))) for row in df.itertuples(index=False, name=None)]

    def load_commandes_clients(self) -> list["BesoinClient"]:
        df = self._load_csv("besoins_clients.csv")
        besoins = []
        cols = list(df.columns)
        for idx, row in enumerate(df.itertuples(index=False, name=None)):
            try:
                row_dict = dict(zip(cols, row))
                besoin = parse_besoin_client(row_dict)
                if besoin.article:
                    besoins.append(besoin)
            except Exception as exc:  # pragma: no cover
                print(f"Warning: erreur parsing ligne {idx}: {exc}")
        return besoins

    def load_allocations(self) -> list["OFAllocation"]:
        df = self._load_csv("allocations.csv")
        cols = list(df.columns)
        return [parse_allocation(dict(zip(cols, row))) for row in df.itertuples(index=False, name=None)]

    def load_all(self) -> LoadResult:
        """Charge tous les fichiers ERP et retourne un LoadResult nomme."""
        return LoadResult(
            articles=self.load_articles(),
            nomenclatures=self.load_nomenclatures(),
            gammes=self.load_gammes(),
            ofs=self.load_of_entetes(),
            stocks=self.load_stock(),
            receptions=self.load_receptions(),
            commandes_clients=self.load_commandes_clients(),
        )


# Late imports for type hints only (avoid circular imports)
from ..models.article import Article  # noqa: E402
from ..models.besoin_client import BesoinClient  # noqa: E402
from ..models.nomenclature import Nomenclature  # noqa: E402
from ..models.of import OF  # noqa: E402
from ..models.reception import Reception  # noqa: E402
from ..models.stock import Stock  # noqa: E402
from ..models.allocation import OFAllocation  # noqa: E402

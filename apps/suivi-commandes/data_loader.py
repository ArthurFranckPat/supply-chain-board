from pathlib import Path

import pandas as pd


CSV_PATTERN = "*_SUIVCDE.csv"
DATE_COLUMNS = ["Date expedition", "Date mise en stock", "Date liv prévue"]
DECIMAL_COLUMNS = ["Prix brut", "Cadence"]


def find_latest_export(folder: Path | None = None) -> Path:
    base_folder = folder or Path(__file__).parent
    suivcde_files = list(base_folder.glob(CSV_PATTERN))
    if not suivcde_files:
        raise FileNotFoundError("Aucun fichier *_SUIVCDE.csv trouvé dans le dossier.")
    return max(suivcde_files, key=lambda path: path.name.split("_SUIVCDE")[0])


def read_csv_with_fallback(file_path: Path) -> pd.DataFrame:
    last_error: Exception | None = None
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(file_path, sep=";", encoding=encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    return pd.read_csv(file_path, sep=";")


def load_data(folder: Path | None = None) -> pd.DataFrame:
    file_path = find_latest_export(folder)
    df = read_csv_with_fallback(file_path)
    df.columns = df.columns.str.strip()

    for column in DATE_COLUMNS:
        if column in df.columns:
            df[column] = pd.to_datetime(df[column], format="%d/%m/%Y", errors="coerce")

    for column in DECIMAL_COLUMNS:
        if column in df.columns:
            df[column] = pd.to_numeric(
                df[column].astype(str).str.replace(",", ".", regex=False),
                errors="coerce",
            )

    return df

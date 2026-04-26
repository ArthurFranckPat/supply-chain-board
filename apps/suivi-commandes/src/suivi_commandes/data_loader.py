from pathlib import Path

import pandas as pd


def load_data(extractions_dir: Path | str | None = None) -> pd.DataFrame:
    """Load data from ERP extractions via the shared erp-data-access package.

    Parameters
    ----------
    extractions_dir : Path | str | None
        Path to the ERP extractions directory. Falls back to
        ``ORDO_EXTRACTIONS_DIR`` env var or the configured default.

    Returns
    -------
    pd.DataFrame
        DataFrame with SUIVCDE-style French column names.
    """
    from erp_data_access.loaders import DataLoader
    from erp_data_access.transformers.suivcde_builder import build_suivcde_dataframe

    loader = DataLoader.from_extractions(extractions_dir)
    return build_suivcde_dataframe(loader)


def load_data_with_loader(extractions_dir: Path | str | None = None):
    """Load data and return both the DataFrame and the DataLoader.

    Returns
    -------
    tuple[pd.DataFrame, DataLoader]
    """
    from erp_data_access.loaders import DataLoader
    from erp_data_access.transformers.suivcde_builder import build_suivcde_dataframe

    loader = DataLoader.from_extractions(extractions_dir)
    df = build_suivcde_dataframe(loader)
    return df, loader

#!/usr/bin/env python3
"""Benchmark du temps de chargement des données ERP."""

import time
import sys
from pathlib import Path

# Add packages to path
sys.path.insert(0, str(Path(__file__).parent / "packages" / "erp-data-access" / "src"))

from erp_data_access.loaders.data_loader import DataLoader

def benchmark_loading():
    """Mesure le temps de chargement complet des données ERP.

    Requires ORDO_EXTRACTIONS_DIR env var or extractions in default path.
    """
    import os

    # Use environment variable if set, otherwise use default OneDrive path
    extractions_dir = os.environ.get("ORDO_EXTRACTIONS_DIR")
    if extractions_dir:
        extractions_path = Path(extractions_dir)
    else:
        # Default OneDrive path
        extractions_path = Path("/Users/arthurbledou/Library/CloudStorage/OneDrive-AldesAeraulique/Données/Extractions")

    start = time.perf_counter()

    try:
        loader = DataLoader.from_extractions(extractions_path)
        loader.load_all()
    except FileNotFoundError as e:
        print(f"ERREUR: {e}", file=sys.stderr)
        sys.exit(1)

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    print(elapsed_ms)
    return elapsed_ms

if __name__ == "__main__":
    benchmark_loading()

#!/usr/bin/env python3
"""Benchmark du temps de chargement des données ERP."""

import time
import sys
from pathlib import Path

# Add packages to path
sys.path.insert(0, str(Path(__file__).parent / "packages" / "erp-data-access" / "src"))
sys.path.insert(0, str(Path(__file__).parent / "apps" / "ordo-core" / "src"))

from erp_data_access.loaders.data_loader import DataLoader

def benchmark_loading():
    """Mesure le temps de chargement complet des données."""
    import os
    # Use local test data for consistent benchmarks
    script_dir = Path(__file__).parent
    extractions_dir = script_dir / "data" / "test_extractions"

    start = time.perf_counter()

    try:
        loader = DataLoader.from_extractions(extractions_dir)
        loader.load_all()
    except FileNotFoundError as e:
        print(f"ERREUR: {e}", file=sys.stderr)
        sys.exit(1)

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    print(elapsed_ms)
    return elapsed_ms

if __name__ == "__main__":
    benchmark_loading()

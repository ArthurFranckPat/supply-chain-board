"""Script de benchmark AG vs Glouton — exécutable en ligne de commande.

Usage:
    cd apps/planning-engine
    python production_planning/scripts/benchmark_ga.py

Arguments:
    --n-runs       Nombre de runs AG par instance (défaut: 30)
    --instances    Instances à benchmarker : synthetic_S, synthetic_M, synthetic_L (défaut: toutes)
    --output-dir   Répertoire de sortie (défaut: outputs/bench)
    --population   Taille de la population AG (défaut: 50)
    --generations  Nombre max de générations (défaut: 50)
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

# Ajouter le parent au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

from production_planning.scheduling.ga.benchmark import run_benchmark
from production_planning.scheduling.ga.config import GAConfig
from production_planning.scheduling.ga.fitness import FitnessMetrics, evaluate
from production_planning.scheduling.ga.chromosome import make_individual
from production_planning.scheduling.ga.decoder import GAContext
from production_planning.scheduling.models import CandidateOF


def _build_synthetic_instance(
    n_of: int,
    n_lines: int,
    n_days: int,
    contention_level: str = "medium",
) -> tuple[GAContext, FitnessMetrics | None]:
    """Construit une instance synthétique avec paramètres contrôlés.

    Args:
        n_of: Nombre d'OF candidats.
        n_lines: Nombre de lignes.
        n_days: Nombre de jours.
        contention_level: "low", "medium", "high" (niveau de contention sur composants).

    Returns:
        (GAContext, FitnessMetrics du glouton)
    """
    from unittest.mock import MagicMock

    workdays = [date(2026, 4, 27) + __import__("datetime").timedelta(days=i) for i in range(n_days)]

    articles = ["ART_A", "ART_B", "ART_C", "ART_D", "ART_E"]
    line_names = [f"PP_{830 + i * 10}" for i in range(n_lines)]

    candidates = []
    by_line: dict[str, list[str]] = {}

    for i in range(n_of):
        line = line_names[i % n_lines]
        article = articles[i % len(articles)]
        due = workdays[i % n_days]
        charge = 2.0 + (i % 4) * 0.5  # 2.0 - 3.5h

        cand = CandidateOF(
            num_of=f"OF_{i:04d}",
            article=article,
            description=f"Desc {article}",
            line=line,
            due_date=due,
            quantity=10.0,
            charge_hours=charge,
        )
        candidates.append(cand)
        by_line.setdefault(line, []).append(cand.num_of)

    line_capacities = {line: 14.0 for line in line_names}
    line_min_open = {line: 0.0 for line in line_names}

    loader = MagicMock()
    loader.stocks = {}

    ga_config = GAConfig(
        population_size=50,
        max_generations=50,
        seed_greedy_count=1,
        seed_greedy_variants=4,
        seed_random_count=45,
    )

    ctx = GAContext(
        candidates=candidates,
        candidates_by_id={c.num_of: c for c in candidates},
        workdays=workdays,
        line_capacities=line_capacities,
        line_min_open=line_min_open,
        by_line=by_line,
        loader=loader,
        checker=MagicMock(),
        receptions_by_day={},
        initial_stock={},
        weights={"w1": 0.85, "w2": 0.10, "w3": 0.05, "w4": 0.15},
        ga_config=ga_config,
    )

    # Seed glouton : distribution uniforme des OF sur les jours
    seed_genes = {c.num_of: i % n_days for i, c in enumerate(candidates)}
    ctx.seed_genes = seed_genes  # type: ignore[attr-defined]

    # Évaluer le seed comme "glouton"
    seed = make_individual(seed_genes)
    greedy_metrics = evaluate(seed, ctx)

    return ctx, greedy_metrics


def main():
    parser = argparse.ArgumentParser(description="Benchmark AG vs Glouton")
    parser.add_argument("--n-runs", type=int, default=10, help="Nombre de runs AG par instance")
    parser.add_argument("--instances", nargs="+", default=["synthetic_S", "synthetic_M"],
                        help="Instances à benchmarker")
    parser.add_argument("--output-dir", default="outputs/bench", help="Répertoire de sortie")
    parser.add_argument("--population", type=int, default=50, help="Taille population AG")
    parser.add_argument("--generations", type=int, default=50, help="Max générations")
    args = parser.parse_args()

    print("=" * 60)
    print("Benchmark AG vs Glouton")
    print("=" * 60)

    # Construire les instances
    instance_configs = {
        "synthetic_S": (20, 2, 3),
        "synthetic_M": (50, 3, 5),
        "synthetic_L": (100, 5, 8),
    }

    instances = []
    for name in args.instances:
        if name not in instance_configs:
            print(f"⚠️ Instance inconnue: {name}, ignorée")
            continue
        n_of, n_lines, n_days = instance_configs[name]
        print(f"\n📦 Construction instance {name} ({n_of} OF, {n_lines} lignes, {n_days} jours)...")
        ctx, greedy = _build_synthetic_instance(n_of, n_lines, n_days)
        # Ajuster la config
        ctx.ga_config = GAConfig(
            population_size=args.population,
            max_generations=args.generations,
            seed_greedy_count=1,
            seed_greedy_variants=max(1, args.population // 10),
            seed_random_count=args.population - 1 - max(1, args.population // 10),
        )
        instances.append((name, ctx, greedy))

    if not instances:
        print("❌ Aucune instance valide")
        return 1

    print(f"\n🚀 Lancement du benchmark ({args.n_runs} runs AG par instance)...")
    print("-" * 60)

    def progress(msg):
        print(msg)

    report = run_benchmark(
        instances=instances,
        n_runs=args.n_runs,
        output_dir=args.output_dir,
        progress_fn=progress,
    )

    # Résumé
    print("\n" + "=" * 60)
    print("RÉSULTATS")
    print("=" * 60)
    for inst in report.instances:
        print(f"\n📊 {inst.instance_name}:")
        if inst.greedy_run:
            print(f"   Glouton : {inst.greedy_run.score:.4f}")
        print(f"   AG moy  : {inst.ga_mean_score:.4f} (±{inst.ga_std_score:.4f})")
        print(f"   AG best : {inst.ga_best_score:.4f}")
        print(f"   Δ moy   : {inst.delta_mean:+.4f}")
        if inst.p_value is not None:
            sig = "✅" if inst.p_value < 0.05 else "❌"
            print(f"   p-value : {inst.p_value:.4f} {sig}")
        print(f"   Temps   : {inst.ga_mean_time:.2f}s/run")

    print(f"\n📁 Rapport sauvegardé dans : {args.output_dir}/{date.today().isoformat()}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())

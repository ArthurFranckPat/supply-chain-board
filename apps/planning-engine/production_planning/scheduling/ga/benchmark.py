"""Moteur de benchmark pour comparer l'AG avec le glouton V1.

Produit des statistiques (moyenne, médiane, p-value Wilcoxon, Cohen's d)
et des visualisations (boxplots, courbes de convergence).
"""

from __future__ import annotations

import csv
import json
import statistics
import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable

from .config import GAConfig
from .decoder import GAContext
from .engine import run_ga
from .fitness import FitnessMetrics, evaluate
from .chromosome import make_individual


try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


try:
    import matplotlib
    matplotlib.use("Agg")  # Non-interactive backend
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


@dataclass
class BenchmarkRun:
    """Résultat d'un run unique (glouton ou AG)."""

    algorithm: str  # "greedy" | "ga"
    run_id: int
    score: float
    taux_service: float
    taux_ouverture: float
    nb_jit: int
    nb_changements_serie: int
    nb_late: int
    nb_unscheduled: int
    nb_blocked_components: int
    elapsed_seconds: float


@dataclass
class InstanceResult:
    """Résultats complets pour une instance de test."""

    instance_name: str
    greedy_run: BenchmarkRun | None = None
    ga_runs: list[BenchmarkRun] = field(default_factory=list)

    # Statistiques AG
    ga_mean_score: float = 0.0
    ga_median_score: float = 0.0
    ga_best_score: float = 0.0
    ga_std_score: float = 0.0
    ga_mean_time: float = 0.0

    # Comparatif
    delta_mean: float = 0.0
    delta_best: float = 0.0
    p_value: float | None = None
    cohens_d: float | None = None

    # Convergence
    convergence_history: list[list[tuple[int, float]]] = field(default_factory=list)


@dataclass
class BenchmarkReport:
    """Rapport complet de benchmark."""

    instances: list[InstanceResult] = field(default_factory=list)
    total_elapsed_seconds: float = 0.0
    n_runs_per_instance: int = 30


def _cohens_d(group1: list[float], group2: list[float]) -> float:
    """Calcule la taille d'effet de Cohen's d.

    group1 = AG runs, group2 = glouton (1 valeur répétée).
    """
    if not group1 or not group2:
        return None
    mean1 = statistics.mean(group1)
    mean2 = statistics.mean(group2)
    std1 = statistics.stdev(group1) if len(group1) > 1 else 0.0
    std2 = statistics.stdev(group2) if len(group2) > 1 else 0.0

    pooled_std = ((std1**2 + std2**2) / 2) ** 0.5
    if pooled_std == 0:
        return 0.0
    return (mean1 - mean2) / pooled_std


def _wilcoxon_pvalue(ga_scores: list[float], greedy_score: float) -> float | None:
    """Test de Wilcoxon : H0 = pas de différence entre AG et glouton."""
    if not HAS_SCIPY or len(ga_scores) < 2:
        return None
    try:
        # Wilcoxon signed-rank avec la valeur glouton comme référence
        differences = [s - greedy_score for s in ga_scores]
        result = scipy_stats.wilcoxon(differences)
        return float(result.pvalue)
    except Exception:
        return None


def _run_ga_n_times(
    ctx: GAContext,
    n_runs: int,
    progress_fn: Callable | None = None,
) -> tuple[list[BenchmarkRun], list[list[tuple[int, float]]]]:
    """Lance l'AG n_runs fois et collecte les résultats.

    Returns:
        (liste de BenchmarkRun, historiques de convergence)
    """
    runs = []
    histories = []

    for run_id in range(n_runs):
        if progress_fn is not None:
            progress_fn(f"  AG run {run_id + 1}/{n_runs}")

        start = time.perf_counter()
        result = run_ga(ctx)
        elapsed = time.perf_counter() - start

        metrics = result.best.metrics or FitnessMetrics()
        runs.append(
            BenchmarkRun(
                algorithm="ga",
                run_id=run_id,
                score=metrics.score,
                taux_service=metrics.taux_service,
                taux_ouverture=metrics.taux_ouverture,
                nb_jit=metrics.nb_jit,
                nb_changements_serie=metrics.nb_changements_serie,
                nb_late=metrics.nb_late,
                nb_unscheduled=metrics.nb_unscheduled,
                nb_blocked_components=metrics.nb_blocked_components,
                elapsed_seconds=elapsed,
            )
        )

        # Collecter l'historique de convergence
        history = [(s.generation, s.best_fitness) for s in result.history]
        histories.append(history)

    return runs, histories


def benchmark_instance(
    instance_name: str,
    ctx: GAContext,
    greedy_result: FitnessMetrics | None = None,
    n_runs: int = 30,
    progress_fn: Callable | None = None,
) -> InstanceResult:
    """Benchmark une instance : glouton vs AG sur n_runs.

    Args:
        instance_name: Nom de l'instance.
        ctx: Contexte AG (doit contenir seed_genes pour le glouton).
        greedy_result: Résultat glouton pré-calculé (optionnel).
        n_runs: Nombre de runs AG.
        progress_fn: Callback de progression.

    Returns:
        InstanceResult avec statistiques et visualisations.
    """
    result = InstanceResult(instance_name=instance_name)

    # 1. Glouton (seed)
    if greedy_result is None:
        seed_genes = getattr(ctx, "seed_genes", None)
        if seed_genes is not None:
            seed = make_individual(seed_genes)
            greedy_result = evaluate(seed, ctx)

    if greedy_result is not None:
        result.greedy_run = BenchmarkRun(
            algorithm="greedy",
            run_id=0,
            score=greedy_result.score,
            taux_service=greedy_result.taux_service,
            taux_ouverture=greedy_result.taux_ouverture,
            nb_jit=greedy_result.nb_jit,
            nb_changements_serie=greedy_result.nb_changements_serie,
            nb_late=greedy_result.nb_late,
            nb_unscheduled=greedy_result.nb_unscheduled,
            nb_blocked_components=greedy_result.nb_blocked_components,
            elapsed_seconds=0.0,
        )

    # 2. AG runs
    if progress_fn is not None:
        progress_fn(f"Benchmarking {instance_name}...")

    ga_runs, histories = _run_ga_n_times(ctx, n_runs, progress_fn=progress_fn)
    result.ga_runs = ga_runs
    result.convergence_history = histories

    # 3. Statistiques
    scores = [r.score for r in ga_runs]
    result.ga_mean_score = statistics.mean(scores) if scores else 0.0
    result.ga_median_score = statistics.median(scores) if scores else 0.0
    result.ga_best_score = max(scores) if scores else 0.0
    result.ga_std_score = statistics.stdev(scores) if len(scores) > 1 else 0.0
    result.ga_mean_time = statistics.mean([r.elapsed_seconds for r in ga_runs]) if ga_runs else 0.0

    if result.greedy_run is not None:
        result.delta_mean = result.ga_mean_score - result.greedy_run.score
        result.delta_best = result.ga_best_score - result.greedy_run.score
        result.p_value = _wilcoxon_pvalue(scores, result.greedy_run.score)
        greedy_scores = [result.greedy_run.score] * len(scores)
        result.cohens_d = _cohens_d(scores, greedy_scores)

    return result


def _generate_report_markdown(report: BenchmarkReport) -> str:
    """Génère un rapport Markdown synthétique."""
    lines = [
        "# Rapport de Benchmark : AG vs Glouton",
        "",
        f"**Date** : {date.today().isoformat()}",
        f"**Runs AG par instance** : {report.n_runs_per_instance}",
        f"**Temps total** : {report.total_elapsed_seconds:.1f}s",
        "",
        "---",
        "",
    ]

    for instance in report.instances:
        lines.extend([
            f"## Instance : {instance.instance_name}",
            "",
            "| Métrique | Glouton | AG (moyenne) | AG (meilleur) | AG (écart-type) | Δ moyen | Δ meilleur |",
            "|----------|---------|--------------|---------------|-----------------|---------|------------|",
        ])

        if instance.greedy_run:
            g = instance.greedy_run
            lines.append(
                f"| Score | {g.score:.4f} | {instance.ga_mean_score:.4f} | "
                f"{instance.ga_best_score:.4f} | {instance.ga_std_score:.4f} | "
                f"{instance.delta_mean:+.4f} | {instance.delta_best:+.4f} |"
            )
            lines.append(
                f"| Taux service | {g.taux_service:.2%} | - | - | - | - | - |"
            )
            lines.append(
                f"| Changements série | {g.nb_changements_serie} | - | - | - | - | - |"
            )

        if instance.p_value is not None:
            sig = "✅" if instance.p_value < 0.05 else "❌"
            lines.append(
                f"| p-value (Wilcoxon) | - | - | - | - | {instance.p_value:.4f} {sig} | - |"
            )
        if instance.cohens_d is not None:
            effect = (
                "négligeable" if abs(instance.cohens_d) < 0.2
                else "petit" if abs(instance.cohens_d) < 0.5
                else "moyen" if abs(instance.cohens_d) < 0.8
                else "grand"
            )
            lines.append(
                f"| Cohen's d | - | - | - | - | {instance.cohens_d:.3f} ({effect}) | - |"
            )

        lines.append("")

    # Critères d'acceptation
    lines.extend([
        "## Critères d'acceptation",
        "",
        "| Critère | Seuil | Statut |",
        "|---------|-------|--------|",
    ])

    all_pass = True
    for instance in report.instances:
        if instance.greedy_run and instance.ga_mean_score >= instance.greedy_run.score:
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
            all_pass = False
        lines.append(f"| AG ≥ glouton ({instance.instance_name}) | score moyen ≥ glouton | {status} |")

    lines.append("")
    lines.append(f"**Résultat global** : {'✅ PASS' if all_pass else '❌ FAIL'}")
    lines.append("")

    return "\n".join(lines)


def _write_csv(report: BenchmarkReport, output_dir: Path) -> None:
    """Écrit les données brutes en CSV."""
    csv_path = output_dir / "results.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "instance", "algorithm", "run_id", "score", "taux_service",
            "taux_ouverture", "nb_jit", "nb_setups", "nb_late",
            "nb_unscheduled", "nb_blocked", "elapsed_seconds",
        ])
        for instance in report.instances:
            for run in ([instance.greedy_run] if instance.greedy_run else []) + instance.ga_runs:
                if run is None:
                    continue
                writer.writerow([
                    instance.instance_name,
                    run.algorithm,
                    run.run_id,
                    run.score,
                    run.taux_service,
                    run.taux_ouverture,
                    run.nb_jit,
                    run.nb_changements_serie,
                    run.nb_late,
                    run.nb_unscheduled,
                    run.nb_blocked_components,
                    run.elapsed_seconds,
                ])


def _write_plots(report: BenchmarkReport, output_dir: Path) -> None:
    """Génère les visualisations."""
    if not HAS_MATPLOTLIB:
        return

    for instance in report.instances:
        # Boxplot scores
        fig, ax = plt.subplots(figsize=(8, 5))
        ga_scores = [r.score for r in instance.ga_runs]
        if instance.greedy_run:
            ax.axhline(instance.greedy_run.score, color="red", linestyle="--", label="Glouton")
        ax.boxplot([ga_scores], tick_labels=["AG"])
        ax.set_title(f"Distribution des scores — {instance.instance_name}")
        ax.set_ylabel("Score")
        ax.legend()
        fig.savefig(output_dir / f"boxplot_{instance.instance_name}.png", dpi=150)
        plt.close(fig)

        # Courbe de convergence (moyenne sur les runs)
        if instance.convergence_history:
            fig, ax = plt.subplots(figsize=(10, 5))
            max_gen = max(len(h) for h in instance.convergence_history) if instance.convergence_history else 0
            mean_curve = []
            for gen in range(max_gen):
                vals = [h[gen][1] for h in instance.convergence_history if gen < len(h)]
                mean_curve.append(statistics.mean(vals) if vals else 0.0)
            ax.plot(range(max_gen), mean_curve, label="AG (moyenne)")
            if instance.greedy_run:
                ax.axhline(instance.greedy_run.score, color="red", linestyle="--", label="Glouton")
            ax.set_xlabel("Génération")
            ax.set_ylabel("Fitness")
            ax.set_title(f"Convergence — {instance.instance_name}")
            ax.legend()
            fig.savefig(output_dir / f"convergence_{instance.instance_name}.png", dpi=150)
            plt.close(fig)


def run_benchmark(
    instances: list[tuple[str, GAContext, FitnessMetrics | None]],
    n_runs: int = 30,
    output_dir: str = "outputs/bench",
    progress_fn: Callable | None = None,
) -> BenchmarkReport:
    """Lance le benchmark complet sur plusieurs instances.

    Args:
        instances: Liste de (nom, contexte, résultat_glouton_optionnel).
        n_runs: Nombre de runs AG par instance.
        output_dir: Répertoire de sortie.
        progress_fn: Callback de progression.

    Returns:
        BenchmarkReport complet.
    """
    start = time.perf_counter()
    report = BenchmarkReport(n_runs_per_instance=n_runs)

    output_path = Path(output_dir) / date.today().isoformat()
    output_path.mkdir(parents=True, exist_ok=True)

    for name, ctx, greedy_result in instances:
        instance_result = benchmark_instance(
            instance_name=name,
            ctx=ctx,
            greedy_result=greedy_result,
            n_runs=n_runs,
            progress_fn=progress_fn,
        )
        report.instances.append(instance_result)

    report.total_elapsed_seconds = time.perf_counter() - start

    # Écrire les sorties
    report_md = _generate_report_markdown(report)
    (output_path / "report.md").write_text(report_md, encoding="utf-8")
    _write_csv(report, output_path)
    _write_plots(report, output_path)

    # Résumé console
    if progress_fn is not None:
        progress_fn("\n" + "=" * 60)
        progress_fn(report_md.split("## Critères d'acceptation")[0])
        progress_fn("=" * 60)

    return report

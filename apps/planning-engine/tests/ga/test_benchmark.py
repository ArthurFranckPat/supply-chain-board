"""Tests pour le moteur de benchmark."""

from __future__ import annotations

import pytest

from production_planning.scheduling.ga.benchmark import (
    InstanceResult,
    BenchmarkRun,
    benchmark_instance,
    run_benchmark,
    _cohens_d,
    _wilcoxon_pvalue,
)
from tests.ga.fixtures import synthetic_S, synthetic_clustered


class TestStatistics:
    def test_cohens_d_identical_groups(self):
        """Cohen's d = 0 pour des groupes identiques."""
        d = _cohens_d([1.0, 1.0, 1.0], [1.0])
        assert d == pytest.approx(0.0, abs=0.01)

    def test_cohens_d_positive_effect(self):
        """Cohen's d > 0 quand le groupe 1 est meilleur."""
        d = _cohens_d([2.0, 2.1, 1.9], [1.0])
        assert d > 0.5

    def test_wilcoxon_same_distribution(self):
        """p-value élevée quand AG = glouton (pas de différence)."""
        p = _wilcoxon_pvalue([1.0, 1.0, 1.0, 1.0], 1.0)
        if p is not None:
            assert p > 0.05

    def test_wilcoxon_different_distribution(self):
        """p-value faible quand AG >> glouton."""
        p = _wilcoxon_pvalue([2.0, 2.1, 1.9, 2.2, 2.05, 1.95, 2.15, 1.85], 1.0)
        if p is not None:
            assert p < 0.05


class TestBenchmarkInstance:
    def test_benchmark_runs_ga(self):
        """benchmark_instance produit des runs AG."""
        ctx, greedy = synthetic_S()
        result = benchmark_instance(
            instance_name="test_S",
            ctx=ctx,
            greedy_result=greedy,
            n_runs=3,
        )

        assert result.instance_name == "test_S"
        assert result.greedy_run is not None
        assert len(result.ga_runs) == 3
        assert all(r.algorithm == "ga" for r in result.ga_runs)

    def test_benchmark_statistics_computed(self):
        """Les statistiques sont calculées correctement."""
        ctx, greedy = synthetic_S()
        result = benchmark_instance(
            instance_name="test_stats",
            ctx=ctx,
            greedy_result=greedy,
            n_runs=5,
        )

        assert result.ga_mean_score > 0
        assert result.ga_best_score >= result.ga_mean_score
        assert result.ga_std_score >= 0
        assert result.ga_mean_time > 0

    def test_delta_computed_when_greedy_present(self):
        """Le delta est calculé quand le glouton est fourni."""
        ctx, greedy = synthetic_clustered()  # Seed "mauvais"
        result = benchmark_instance(
            instance_name="test_delta",
            ctx=ctx,
            greedy_result=greedy,
            n_runs=5,
        )

        assert result.greedy_run is not None
        assert result.delta_mean is not None
        assert result.delta_best is not None

    def test_convergence_history_collected(self):
        """L'historique de convergence est collecté."""
        ctx, greedy = synthetic_S()
        result = benchmark_instance(
            instance_name="test_conv",
            ctx=ctx,
            greedy_result=greedy,
            n_runs=3,
        )

        assert len(result.convergence_history) == 3
        for hist in result.convergence_history:
            assert len(hist) > 0
            for gen, fitness in hist:
                assert isinstance(gen, int)
                assert isinstance(fitness, float)


class TestBenchmarkReport:
    def test_run_benchmark_multiple_instances(self):
        """run_benchmark gère plusieurs instances."""
        ctx_s, greedy_s = synthetic_S()
        ctx_c, greedy_c = synthetic_clustered()

        instances = [
            ("synthetic_S", ctx_s, greedy_s),
            ("synthetic_clustered", ctx_c, greedy_c),
        ]

        report = run_benchmark(
            instances=instances,
            n_runs=3,
            output_dir="outputs/bench_test",
        )

        assert len(report.instances) == 2
        assert report.total_elapsed_seconds > 0
        assert report.n_runs_per_instance == 3

        for inst in report.instances:
            assert len(inst.ga_runs) == 3

    def test_report_markdown_generated(self):
        """Le rapport Markdown est généré et contient les sections attendues."""
        import tempfile
        from pathlib import Path

        ctx, greedy = synthetic_S()
        with tempfile.TemporaryDirectory() as tmpdir:
            report = run_benchmark(
                instances=[("test_md", ctx, greedy)],
                n_runs=2,
                output_dir=tmpdir,
            )

            output_path = Path(tmpdir) / __import__("datetime").date.today().isoformat()
            md_file = output_path / "report.md"
            assert md_file.exists()

            content = md_file.read_text()
            assert "# Rapport de Benchmark" in content
            assert "test_md" in content
            assert "Critères d'acceptation" in content

    def test_csv_generated(self):
        """Le fichier CSV est généré avec les bonnes colonnes."""
        import tempfile
        import csv
        from pathlib import Path

        ctx, greedy = synthetic_S()
        with tempfile.TemporaryDirectory() as tmpdir:
            run_benchmark(
                instances=[("test_csv", ctx, greedy)],
                n_runs=2,
                output_dir=tmpdir,
            )

            output_path = Path(tmpdir) / __import__("datetime").date.today().isoformat()
            csv_file = output_path / "results.csv"
            assert csv_file.exists()

            with csv_file.open() as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                assert len(rows) >= 2  # glouton + 2 runs AG
                assert "algorithm" in rows[0]
                assert "score" in rows[0]

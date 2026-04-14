"""
Integration test for OrganizationAgent with real data.

This test verifies the complete end-to-end workflow of the OrganizationAgent
using real production data.
"""

import pytest
from datetime import date


def test_organization_full_integration():
    """Full integration test with real data"""
    from src.agents.organization.organization_agent import OrganizationAgent
    from src.loaders.data_loader import DataLoader
    from src.algorithms.matching import CommandeOFMatcher
    import os

    # Load real data - data is in the main repo, not the worktree
    data_dir = os.path.join(os.path.dirname(__file__), "../../../data")
    if not os.path.exists(data_dir):
        pytest.skip(f"Data directory not found at {data_dir}")

    loader = DataLoader(data_dir)
    loader.load_all()

    agent = OrganizationAgent(loader)
    matcher = CommandeOFMatcher(loader, date_tolerance_days=10)

    results = agent.analyze_workshop_organization(
        reference_date=date.today(),
        matcher=matcher
    )

    # Verify we got results
    assert len(results) > 0, "OrganizationAgent should return results for at least one poste"

    # Verify each result has all fields populated
    for poste, result in results.items():
        assert result.poste == poste, f"Poste mismatch: {poste} != {result.poste}"
        assert result.charge_s1 >= 0, f"Charge S+1 should be non-negative for {poste}"
        assert result.charge_s2 >= 0, f"Charge S+2 should be non-negative for {poste}"
        assert result.charge_s3 >= 0, f"Charge S+3 should be non-negative for {poste}"
        assert result.charge_s4 >= 0, f"Charge S+4 should be non-negative for {poste}"
        assert result.trend is not None, f"Trend should be set for {poste}"
        assert result.recommended_org is not None, f"Recommended organization should be set for {poste}"
        assert result.charge_treated >= 0, f"Charge treated should be non-negative for {poste}"
        assert result.coverage_pct >= 0, f"Coverage percentage should be non-negative for {poste}"
        assert result.coverage_pct <= 100, f"Coverage percentage should be <= 100 for {poste}"


def test_organization_cli_integration():
    """Test that the CLI integration works"""
    import subprocess
    import sys
    import os

    data_dir = os.path.join(os.path.dirname(__file__), "../../../data")
    if not os.path.exists(data_dir):
        pytest.skip(f"Data directory not found at {data_dir}")

    result = subprocess.run(
        [sys.executable, "-m", "src.main", "--data-dir", data_dir, "--organization"],
        cwd="/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling",
        capture_output=True,
        text=True,
        timeout=60
    )

    # The CLI should run without errors
    assert result.returncode == 0, f"CLI failed with return code {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"

    # Output should contain some expected content
    output = result.stdout
    assert len(output) > 0, "CLI should produce output"
    assert "Poste" in output or "poste" in output, "Output should contain poste information"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

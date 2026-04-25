from planning_engine.feasibility.base import FeasibilityResult
from planning_engine.orders.allocation import AllocationResult, AllocationStatus
from planning_engine.utils.formatters import (
    compute_allocation_ratio,
    compute_feasibility_ratio,
)


def test_compute_feasibility_ratio_handles_empty_results():
    stats = compute_feasibility_ratio({})

    assert stats.feasible == 0
    assert stats.total == 0
    assert stats.pct == 0.0


def test_compute_feasibility_ratio_counts_feasible_results():
    results = {
        "OF-1": FeasibilityResult(feasible=True),
        "OF-2": FeasibilityResult(feasible=False),
        "OF-3": FeasibilityResult(feasible=True),
    }

    stats = compute_feasibility_ratio(results)

    assert stats.feasible == 2
    assert stats.total == 3
    assert stats.pct == (2 / 3) * 100


def test_compute_allocation_ratio_counts_feasible_allocations():
    results = {
        "OF-1": AllocationResult(of_num="OF-1", status=AllocationStatus.FEASIBLE),
        "OF-2": AllocationResult(of_num="OF-2", status=AllocationStatus.NOT_FEASIBLE),
        "OF-3": AllocationResult(of_num="OF-3", status=AllocationStatus.FEASIBLE),
    }

    stats = compute_allocation_ratio(results)

    assert stats.feasible == 2
    assert stats.total == 3
    assert stats.pct == (2 / 3) * 100

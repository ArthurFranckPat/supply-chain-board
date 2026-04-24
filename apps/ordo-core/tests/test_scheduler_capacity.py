from datetime import date

from src.planning.capacity import build_working_day_horizon, is_line_open


def test_build_working_day_horizon_skips_weekends():
    horizon = build_working_day_horizon(date(2026, 4, 3), 5)

    assert [day.isoformat() for day in horizon] == [
        "2026-04-03",
        "2026-04-06",
        "2026-04-07",
        "2026-04-08",
        "2026-04-09",
    ]


def test_is_line_open_uses_seven_hour_threshold():
    assert is_line_open(6.99) is False
    assert is_line_open(7.0) is True

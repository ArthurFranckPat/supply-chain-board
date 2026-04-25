"""Planning package: calendar, capacity, holidays, weights, and charge calculation."""

from .calendar_config import (
    DayOff,
    CalendarConfig,
    CalendarDay,
    load_calendar_config,
    save_calendar_config,
    is_workday,
    build_workdays,
    next_workday,
    previous_workday,
    get_month_calendar,
)
# Backward-compatible aliases. These resolve to the same underlying
# implementation as the configurable helpers above.
from .calendar import (
    is_workday as simple_is_workday,
    next_workday as simple_next_workday,
    previous_workday as simple_previous_workday,
    build_workdays as simple_build_workdays,
)
from .capacity_config import (
    PosteCapacity,
    CapacityConfig,
    load_capacity_config,
    save_capacity_config,
    get_capacity_for_day,
    set_daily_override,
    remove_daily_override,
    set_weekly_override,
    remove_weekly_override,
    ensure_poste,
    to_api_dict,
)
from .capacity import (
    SHIFT_HOURS,
    MAX_DAY_HOURS,
    MIN_OPEN_HOURS,
    WORKING_DAYS_DEFAULT,
    TARGET_LINES,
    build_working_day_horizon,
    is_line_open,
)
from .holidays import (
    ensure_holidays_in_calendar,
    refresh_holidays,
    get_holidays,
    fetch_holidays,
)
from .weights import load_weights
from .charge_calculator import (
    POSTE_CHARGE_REGEX,
    is_valid_poste,
    calculate_article_charge,
    get_week_info,
    group_by_week,
    calculate_weekly_charge_heatmap,
    get_poste_libelle,
)

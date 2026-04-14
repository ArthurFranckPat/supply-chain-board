from enum import Enum
from dataclasses import dataclass
from typing import Optional


class TrendType(Enum):
    UPWARD = "upward"
    STABLE = "stable"
    DOWNWARD = "downward"


@dataclass
class OrganizationType:
    type: str  # "1x8", "2x8", "3x8", "partial"
    hours: float

    @property
    def description(self) -> str:
        if self.type == "1x8":
            return f"Standard 1x8 ({self.hours}h/week)"
        elif self.type == "2x8":
            return f"Two shifts 2x8 ({self.hours}h/week)"
        elif self.type == "3x8":
            return f"Three shifts 3x8 ({self.hours}h/week)"
        else:
            return f"Partial opening ({self.hours}h/week)"


@dataclass
class PosteChargeResult:
    poste: str
    charge_s1: float
    charge_s2: float
    charge_s3: float
    charge_s4: float
    trend: TrendType = TrendType.STABLE
    slope: float = 0.0
    recommended_org: Optional[OrganizationType] = None
    charge_treated: float = 0.0
    coverage_pct: float = 0.0

    @property
    def total_charge(self) -> float:
        return self.charge_s1 + self.charge_s2 + self.charge_s3 + self.charge_s4
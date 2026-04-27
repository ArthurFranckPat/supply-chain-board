from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExtensibleModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class ServiceHealth(ExtensibleModel):
    status: str = "ok"
    service: str | None = None
    timestamp: datetime | None = None


class IntegrationHealthResponse(BaseModel):
    status: str = "ok"
    service: str = "integration-hub"
    timestamp: datetime = Field(default_factory=_utc_now)
    downstream: dict[str, ServiceHealth]


class SuiviAssignRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    reference_date: date | None = None


class SuiviLatestExportRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None


class SuiviAssignResponse(ExtensibleModel):
    total_rows: int
    status_counts: dict[str, int]
    rows: list[dict[str, Any]]
    line_level: list[dict[str, Any]]


class OrdoLoadDataRequest(BaseModel):
    source: str = "data"


class OrdoLoadDataResponse(ExtensibleModel):
    status: str | None = None


class OrdoScheduleRequest(BaseModel):
    immediate_components: bool = False
    blocking_components_mode: str = "blocked"
    demand_horizon_days: int = Field(default=15, ge=7, le=60)


class OrdoScheduleResponse(ExtensibleModel):
    run_id: str


class OrdoRunResponse(ExtensibleModel):
    status: str
    result: dict[str, Any] = Field(default_factory=dict)


class BoardSummary(BaseModel):
    ordo_taux_service: float
    ordo_unscheduled: int
    suivi_retard_prod: int
    suivi_allocation_a_faire: int
    suivi_total_rows: int


class PipelineSupplyBoardRequest(BaseModel):
    source: str = "data"
    demand_horizon_days: int = Field(default=15, ge=7, le=60)
    immediate_components: bool = False
    blocking_components_mode: str = "blocked"
    suivi_folder: str | None = None
    poll_interval_seconds: float = Field(default=1.0, ge=0.2, le=10.0)
    timeout_seconds: int = Field(default=120, ge=10, le=1800)


class RetardChargeRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None


class RetardChargeItem(BaseModel):
    poste: str
    libelle: str
    heures: float


class RetardChargeResponse(ExtensibleModel):
    items: list[RetardChargeItem]
    total_heures: float


class PaletteLigne(BaseModel):
    num_commande: str
    article: str
    designation: str
    type_commande: str
    statut: str
    qte_restante: float
    unites_par_pal: int
    type_palette: str
    gamme: str
    nb_palettes: int


class PaletteByDay(BaseModel):
    date: str
    date_fmt: str
    palettes_standard: int
    palettes_easyhome: int
    total_palettes: int
    camions: int
    nb_lignes: int


class PaletteMoyenne(BaseModel):
    par_jour: float
    par_semaine: float


class PaletteTotaux(BaseModel):
    palettes_standard: int
    palettes_easyhome: int
    total_palettes: int
    camions: int
    total_lignes: int


class PaletteRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None


class PaletteResponse(ExtensibleModel):
    lignes: list[PaletteLigne]
    by_day: list[PaletteByDay]
    moyenne: PaletteMoyenne
    totaux: PaletteTotaux


class PipelineSupplyBoardResponse(BaseModel):
    timestamp: datetime = Field(default_factory=_utc_now)
    ordo: OrdoRunResponse
    suivi: SuiviAssignResponse
    board_summary: BoardSummary


class StatusDetailResponse(ExtensibleModel):
    no_commande: str
    article: str

    # OF section
    of_info: dict[str, Any] | None = None

    # Composants bloquants
    composants: list[dict[str, Any]] = Field(default_factory=list)

    # Stock article
    stock_detail: dict[str, Any] = Field(default_factory=dict)

    # Stock composants bloquants
    stock_composants: dict[str, dict[str, Any]] = Field(default_factory=dict)


# ── Rapport suivi-commandes (PDF / XLSX) ───────────────────────────


class ActionDTO(BaseModel):
    label: str
    severity: Literal["info", "warning", "critical"]


class ReportRowDTO(BaseModel):
    num_commande: str
    article: str
    designation: str = ""
    nom_client: str = ""
    type_commande: str = ""
    date_expedition: date | None = None
    date_liv_prevue: date | None = None
    qte_commandee: float = 0.0
    qte_allouee: float = 0.0
    qte_restante: float = 0.0
    besoin_net: float = 0.0
    qte_allouee_virtuelle: float = 0.0
    emplacement: str | None = None
    hum: str | None = None
    zone_expedition: bool = False
    alerte_cq_statut: bool = False
    jours_retard: int | None = None
    actions: list[ActionDTO] = Field(default_factory=list)
    cause_type: str | None = None
    cause_message: str | None = None
    composants_manquants: str | None = None


class ReportPayloadResponse(BaseModel):
    generated_at: datetime
    reference_date: date
    folder: str | None = None
    totals: dict[str, int] = Field(default_factory=dict)
    sections: dict[str, Any] = Field(default_factory=dict)
    charge_retard: list[RetardChargeItem] = Field(default_factory=list)


class ReportRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None
    format: Literal["json", "pdf"] = "json"

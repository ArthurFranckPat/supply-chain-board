from __future__ import annotations

import asyncio
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel

from domain_contracts import (
    OrdoLoadDataResponse,
    OrdoRunResponse,
    OrdoScheduleResponse,
    ServiceHealth,
    SuiviAssignResponse,
)


ModelT = TypeVar("ModelT", bound=BaseModel)


class BaseApiClient:
    def __init__(self, base_url: str, timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()

    async def _request_model(
        self,
        method: str,
        path: str,
        model: type[ModelT],
        **kwargs: Any,
    ) -> ModelT:
        return model.model_validate(await self._request(method, path, **kwargs))


class PlanningEngineClient(BaseApiClient):
    async def health(self) -> ServiceHealth:
        return await self._request_model("GET", "/health", ServiceHealth)

    async def load_data(self, source: str = "data") -> OrdoLoadDataResponse:
        payload = {"source": source}
        return await self._request_model(
            "POST",
            "/api/v1/data/load",
            OrdoLoadDataResponse,
            json=payload,
        )

    async def run_schedule(
        self,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
    ) -> OrdoScheduleResponse:
        payload = {
            "immediate_components": immediate_components,
            "blocking_components_mode": blocking_components_mode,
            "demand_horizon_days": demand_horizon_days,
        }
        return await self._request_model(
            "POST",
            "/api/v1/runs/schedule",
            OrdoScheduleResponse,
            json=payload,
        )

    async def get_run(self, run_id: str) -> OrdoRunResponse:
        return await self._request_model("GET", f"/api/v1/runs/{run_id}", OrdoRunResponse)

    async def wait_for_run(
        self,
        run_id: str,
        poll_interval_seconds: float = 1.0,
        timeout_seconds: int = 120,
    ) -> OrdoRunResponse:
        elapsed = 0.0
        while elapsed <= float(timeout_seconds):
            run_state = await self.get_run(run_id)
            if run_state.status != "running":
                return run_state
            await asyncio.sleep(poll_interval_seconds)
            elapsed += poll_interval_seconds
        raise TimeoutError(f"Timeout while waiting for run {run_id}")


class SuiviCommandesClient(BaseApiClient):
    async def health(self) -> ServiceHealth:
        return await self._request_model("GET", "/health", ServiceHealth)

    async def assign_status(
        self,
        rows: list[dict[str, Any]],
        reference_date: str | None = None,
    ) -> SuiviAssignResponse:
        payload: dict[str, Any] = {"rows": rows}
        if reference_date:
            payload["reference_date"] = reference_date
        return await self._request_model(
            "POST",
            "/api/v1/status/assign",
            SuiviAssignResponse,
            json=payload,
        )

    async def status_from_latest_export(
        self,
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> SuiviAssignResponse:
        payload: dict[str, Any] = {}
        if folder:
            payload["folder"] = folder
        if reference_date:
            payload["reference_date"] = reference_date
        return await self._request_model(
            "POST",
            "/api/v1/status/from-latest-export",
            SuiviAssignResponse,
            json=payload,
        )

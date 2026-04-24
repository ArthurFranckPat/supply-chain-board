from __future__ import annotations

import asyncio
from typing import Any

import httpx


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


class OrdoCoreClient(BaseApiClient):
    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/health")

    async def load_data(self, source: str = "data") -> dict[str, Any]:
        payload = {"source": source}
        return await self._request("POST", "/api/v1/data/load", json=payload)

    async def run_schedule(
        self,
        immediate_components: bool = False,
        blocking_components_mode: str = "blocked",
        demand_horizon_days: int = 15,
    ) -> dict[str, Any]:
        payload = {
            "immediate_components": immediate_components,
            "blocking_components_mode": blocking_components_mode,
            "demand_horizon_days": demand_horizon_days,
        }
        return await self._request("POST", "/api/v1/runs/schedule", json=payload)

    async def get_run(self, run_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/v1/runs/{run_id}")

    async def wait_for_run(
        self,
        run_id: str,
        poll_interval_seconds: float = 1.0,
        timeout_seconds: int = 120,
    ) -> dict[str, Any]:
        elapsed = 0.0
        while elapsed <= float(timeout_seconds):
            run_state = await self.get_run(run_id)
            if run_state.get("status") != "running":
                return run_state
            await asyncio.sleep(poll_interval_seconds)
            elapsed += poll_interval_seconds
        raise TimeoutError(f"Timeout while waiting for run {run_id}")


class SuiviCommandesClient(BaseApiClient):
    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/health")

    async def assign_status(
        self,
        rows: list[dict[str, Any]],
        reference_date: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"rows": rows}
        if reference_date:
            payload["reference_date"] = reference_date
        return await self._request("POST", "/api/v1/status/assign", json=payload)

    async def status_from_latest_export(
        self,
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if folder:
            payload["folder"] = folder
        if reference_date:
            payload["reference_date"] = reference_date
        return await self._request("POST", "/api/v1/status/from-latest-export", json=payload)

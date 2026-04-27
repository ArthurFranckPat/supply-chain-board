from __future__ import annotations

from typing import Protocol

from suivi_commandes.application.report_service import ReportPayload


class ReportRendererPort(Protocol):
    """Port de rendu de rapport — produit un binaire (PDF, etc.) depuis un payload."""

    def render(self, payload: ReportPayload) -> bytes: ...

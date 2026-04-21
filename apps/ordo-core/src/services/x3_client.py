"""Client HTTP pour l'API Web Sage X3 (SData 2.0 / REST)."""

from __future__ import annotations

import base64
import os
from typing import Any

import httpx


def _basic_auth_header(username: str, password: str) -> str:
    creds = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {creds}"


class X3Client:
    """Client pour interroger la WEB API Sage X3.

    Paramètres d'environnement attendus :
        X3_BASE_URL   – URL racine (ex: http://host:port/api1/x3/erp/ENDPOINT)
        X3_USERNAME   – Utilisateur X3 autorisé aux Web Services
        X3_PASSWORD   – Mot de passe
    """

    def __init__(
        self,
        base_url: str | None = None,
        username: str | None = None,
        password: str | None = None,
    ):
        self.base_url = (base_url or os.getenv("X3_BASE_URL", "")).rstrip("/")
        self.username = username or os.getenv("X3_USERNAME", "")
        self.password = password or os.getenv("X3_PASSWORD", "")
        if not self.base_url:
            raise RuntimeError("X3_BASE_URL manquant (env ou argument)")
        if not self.username:
            raise RuntimeError("X3_USERNAME manquant (env ou argument)")

    def _client(self) -> httpx.Client:
        return httpx.Client(
            headers={
                "Authorization": _basic_auth_header(self.username, self.password),
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    def query(
        self,
        classe: str,
        representation: str,
        where: str | None = None,
        order_by: str | None = None,
        count: int | None = None,
        offset: int | None = None,
    ) -> dict[str, Any]:
        """Interroge la facette $query d'une classe/représentation.

        Args:
            classe: Nom de la classe (ex: STOJOU, ITMMASTER).
            representation: Nom de la représentation (ex: ZSTOJOU).
            where: Clause SData (ex: ``ITMREF eq '11035404'``).
            order_by: Tri SData (ex: ``DAT desc``).
            count: Taille de page.
            offset: Offset (pagination).
        """
        url = f"{self.base_url}/{classe}"
        params: dict[str, str | int] = {
            "representation": f"{representation}.$query",
        }
        if where:
            params["where"] = where
        if order_by:
            params["orderBy"] = order_by
        if count is not None:
            params["count"] = count
        if offset is not None:
            params["offset"] = offset

        with self._client() as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()

    def detail(
        self,
        classe: str,
        key: str,
        representation: str,
    ) -> dict[str, Any]:
        """Lit un enregistrement via la facette $detail.

        Args:
            classe: Nom de la classe.
            key: Clé primaire (composants séparés par ``~`` si clé composite).
            representation: Nom de la représentation.
        """
        url = f"{self.base_url}/{classe}('{key}')"
        params = {"representation": f"{representation}.$detail"}

        with self._client() as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()

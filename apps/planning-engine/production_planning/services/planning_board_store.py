"""Persistance locale des modifications d'OF du planning board.

L'ERP (extractions CSV) reste la source de vérité en lecture seule.
Les actions utilisateur (replanification, affermissement, édition) sont
stockées comme *overrides* dans une base SQLite locale, fusionnées à la
volée avec les OF chargés. Un journal d'événements conserve l'historique
des actions (base de la future évaluation d'impacts).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_SCHEMA = """
CREATE TABLE IF NOT EXISTS of_overrides (
    num_of      TEXT PRIMARY KEY,
    date_debut  TEXT,
    date_fin    TEXT,
    statut_num  INTEGER,
    note        TEXT,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS of_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    num_of      TEXT NOT NULL,
    action      TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
"""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class PlanningBoardStore:
    """Accès SQLite aux overrides et au journal d'événements."""

    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # Overrides
    # ------------------------------------------------------------------

    def get_overrides(self) -> dict[str, dict[str, Any]]:
        """Retourne tous les overrides indexés par num_of."""
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM of_overrides").fetchall()
        return {row["num_of"]: dict(row) for row in rows}

    def get_override(self, num_of: str) -> Optional[dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM of_overrides WHERE num_of = ?", (num_of,)
            ).fetchone()
        return dict(row) if row else None

    def upsert_override(self, num_of: str, fields: dict[str, Any]) -> dict[str, Any]:
        """Fusionne ``fields`` dans l'override existant (création si absent).

        Seules les clés présentes dans ``fields`` sont modifiées ; une valeur
        explicitement ``None`` efface le champ (retour à la valeur ERP).
        """
        allowed = {"date_debut", "date_fin", "statut_num", "note"}
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"Champs non modifiables: {sorted(unknown)}")

        current = self.get_override(num_of) or {
            "num_of": num_of,
            "date_debut": None,
            "date_fin": None,
            "statut_num": None,
            "note": None,
        }
        current.update(fields)
        current["updated_at"] = _utc_now_iso()

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO of_overrides (num_of, date_debut, date_fin, statut_num, note, updated_at)
                VALUES (:num_of, :date_debut, :date_fin, :statut_num, :note, :updated_at)
                ON CONFLICT(num_of) DO UPDATE SET
                    date_debut = excluded.date_debut,
                    date_fin = excluded.date_fin,
                    statut_num = excluded.statut_num,
                    note = excluded.note,
                    updated_at = excluded.updated_at
                """,
                current,
            )
            conn.execute(
                "INSERT INTO of_events (num_of, action, payload, created_at) VALUES (?, ?, ?, ?)",
                (num_of, "update", json.dumps(fields, ensure_ascii=False), current["updated_at"]),
            )
        return current

    def delete_override(self, num_of: str) -> bool:
        """Supprime l'override d'un OF (retour complet aux valeurs ERP)."""
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM of_overrides WHERE num_of = ?", (num_of,))
            if cursor.rowcount:
                conn.execute(
                    "INSERT INTO of_events (num_of, action, payload, created_at) VALUES (?, ?, ?, ?)",
                    (num_of, "reset", "{}", _utc_now_iso()),
                )
        return bool(cursor.rowcount)

    def delete_all_overrides(self) -> int:
        with self._connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM of_overrides").fetchone()[0]
            conn.execute("DELETE FROM of_overrides")
            if count:
                conn.execute(
                    "INSERT INTO of_events (num_of, action, payload, created_at) VALUES (?, ?, ?, ?)",
                    ("*", "reset_all", "{}", _utc_now_iso()),
                )
        return int(count)

    # ------------------------------------------------------------------
    # Journal
    # ------------------------------------------------------------------

    def list_events(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM of_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

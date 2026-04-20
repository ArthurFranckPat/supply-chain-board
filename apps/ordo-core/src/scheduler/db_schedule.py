"""
db_schedule.py
Persistence SQLite des runs d'ordonnancement et de leurs affectations.
Permet le calcul de capacite residuelle lors des re-runs intra-journee.
"""

import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "schedule_history.db"

_CREATE_RUNS_TABLE = """
CREATE TABLE IF NOT EXISTS scheduling_runs (
    run_id         TEXT PRIMARY KEY,
    created_at     TEXT NOT NULL,
    reference_date TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'running',
    score          REAL,
    taux_service   REAL,
    taux_ouverture REAL,
    parameters     TEXT
);
"""

_CREATE_ASSIGNMENTS_TABLE = """
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL REFERENCES scheduling_runs(run_id),
    num_of      TEXT NOT NULL,
    article     TEXT NOT NULL,
    line        TEXT NOT NULL,
    day         TEXT NOT NULL,
    start_hour  REAL,
    end_hour    REAL,
    charge_h    REAL NOT NULL,
    quantity    INTEGER,
    source      TEXT
);
"""

_CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_assignments_day_line
    ON schedule_assignments(day, line, run_id);
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=DELETE;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(_CREATE_RUNS_TABLE)
        conn.execute(_CREATE_ASSIGNMENTS_TABLE)
        conn.execute(_CREATE_INDEX)


def save_run(
    run_id: str,
    reference_date: date,
    parameters: dict,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO scheduling_runs (run_id, created_at, reference_date, status, parameters)
            VALUES (?, ?, ?, 'running', ?)
            """,
            (run_id, now, reference_date.isoformat(), json.dumps(parameters, default=str)),
        )


def save_assignments(
    run_id: str,
    plannings: dict[str, list],
) -> None:
    rows = []
    for line, candidates in plannings.items():
        for c in candidates:
            if c.scheduled_day is None:
                continue
            rows.append((
                run_id,
                c.num_of,
                c.article,
                line,
                c.scheduled_day.isoformat(),
                c.start_hour,
                c.end_hour,
                c.charge_hours,
                c.quantity,
                c.source,
            ))
    if not rows:
        return
    with _connect() as conn:
        conn.executemany(
            """
            INSERT INTO schedule_assignments
                (run_id, num_of, article, line, day, start_hour, end_hour, charge_h, quantity, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def update_run_status(
    run_id: str,
    status: str,
    score: float = 0.0,
    taux_service: float = 0.0,
    taux_ouverture: float = 0.0,
) -> None:
    with _connect() as conn:
        conn.execute(
            """
            UPDATE scheduling_runs
            SET status = ?, score = ?, taux_service = ?, taux_ouverture = ?
            WHERE run_id = ?
            """,
            (status, score, taux_service, taux_ouverture, run_id),
        )


def get_latest_run_id() -> Optional[str]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT run_id FROM scheduling_runs WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    return row["run_id"] if row else None


def get_assignments_for_day(run_id: str, day: date) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT num_of, article, line, day, start_hour, end_hour, charge_h, quantity, source
            FROM schedule_assignments
            WHERE run_id = ? AND day = ?
            """,
            (run_id, day.isoformat()),
        ).fetchall()
    return [dict(r) for r in rows]

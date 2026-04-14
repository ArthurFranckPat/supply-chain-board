"""
db_comments.py
Couche de persistance pour les commentaires par ligne commande/article.
Clé métier : (no_commande, article) — identique au regroupement utilisé dans le CSV.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "comments.db"

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS comments (
    no_commande  TEXT NOT NULL,
    article      TEXT NOT NULL,
    comment      TEXT NOT NULL DEFAULT '',
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (no_commande, article)
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=DELETE;")  # évite les fichiers -wal/-shm (conflits OneDrive)
    return conn


def init_db() -> None:
    """Crée la table si elle n'existe pas. Sûr à appeler à chaque démarrage."""
    with _connect() as conn:
        conn.execute(_CREATE_TABLE_SQL)


def load_all_comments() -> dict[tuple[str, str], dict]:
    """
    Retourne tous les commentaires sous forme de dict indexé par (no_commande, article).
    Valeur : {"comment": str, "updated_at": str}.
    """
    with _connect() as conn:
        rows = conn.execute(
            "SELECT no_commande, article, comment, updated_at FROM comments"
        ).fetchall()
    return {
        (row[0], row[1]): {"comment": row[2], "updated_at": row[3]}
        for row in rows
    }


def upsert_comment(no_commande: str, article: str, comment: str) -> None:
    """Insère ou met à jour un commentaire."""
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO comments (no_commande, article, comment, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(no_commande, article) DO UPDATE SET
                comment    = excluded.comment,
                updated_at = excluded.updated_at
            """,
            (str(no_commande), str(article), comment.strip(), now),
        )


def delete_comment(no_commande: str, article: str) -> None:
    """Supprime le commentaire. Sans effet si la clé n'existe pas."""
    with _connect() as conn:
        conn.execute(
            "DELETE FROM comments WHERE no_commande = ? AND article = ?",
            (str(no_commande), str(article)),
        )


def batch_upsert(rows: list[dict]) -> None:
    """
    Sauvegarde une liste de modifications en une seule transaction.
    Chaque dict doit avoir : no_commande, article, comment.
    Si comment est vide, la ligne est supprimée.
    """
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    with _connect() as conn:
        for row in rows:
            nc = str(row["no_commande"])
            art = str(row["article"])
            cmt = str(row.get("comment", "")).strip()
            if cmt:
                conn.execute(
                    """
                    INSERT INTO comments (no_commande, article, comment, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(no_commande, article) DO UPDATE SET
                        comment    = excluded.comment,
                        updated_at = excluded.updated_at
                    """,
                    (nc, art, cmt, now),
                )
            else:
                conn.execute(
                    "DELETE FROM comments WHERE no_commande = ? AND article = ?",
                    (nc, art),
                )

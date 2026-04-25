"""Production profiles — load historical day-of-week preferences per article."""

from __future__ import annotations

import csv
from collections import Counter
from datetime import datetime
from pathlib import Path


def load_article_day_profile(csv_path: str) -> dict[str, Counter]:
    """Charge les profils de production réels par article depuis le CSV historique.

    Retourne {article: Counter({weekday: qty})} où weekday=0 pour lundi, 4 pour vendredi.
    Ne charge que les jours ouvrés (lundi-vendredi).
    """
    article_profile: dict[str, Counter] = {}
    p = Path(csv_path)
    if not p.exists():
        return article_profile

    with open(p, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            date_str = row.get("Date", "").strip()
            try:
                dt = datetime.strptime(date_str, "%d/%m/%Y")
            except (ValueError, TypeError):
                continue
            dow = dt.weekday()
            if dow >= 5:
                continue
            article = row.get("Article", "").strip()
            if not article:
                continue
            cols = list(row.values())
            try:
                qte = float(cols[7].replace(",", ".").strip())
            except (ValueError, IndexError):
                qte = 0
            if article not in article_profile:
                article_profile[article] = Counter()
            article_profile[article][dow] += qte
    return article_profile

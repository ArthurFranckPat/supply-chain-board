"""Parse les réponses JSON de la WEB API Sage X3."""

from __future__ import annotations

from typing import Any


def parse_query_response(
    raw: dict[str, Any],
    fields: list[str] | None = None,
) -> dict[str, Any]:
    """Transforme une réponse SData $query en structure propre.

    Args:
        raw: Réponse JSON brute du serveur X3.
        fields: Liste des champs à extraire (None = tout extraire).

    Returns:
        Dictionnaire avec ``items`` (liste de lignes), ``count``, ``links``.
    """
    resources = raw.get("$resources", [])
    items: list[dict[str, Any]] = []

    for resource in resources:
        row: dict[str, Any] = {}
        for key, value in resource.items():
            if key.startswith("$"):
                continue
            if fields is not None and key not in fields:
                continue
            # Dé-référence les objets _REF (garde la description/title si dispo)
            if isinstance(value, dict):
                if "$description" in value:
                    row[key] = value["$description"]
                elif "$title" in value:
                    row[key] = value["$title"]
                else:
                    row[key] = value
            else:
                row[key] = value
        items.append(row)

    return {
        "count": len(items),
        "items": items,
        "links": raw.get("$links", {}),
    }


# Mapping des champs STOJOU utilisés par le module analyse historique
STOJOU_FIELDS = [
    "IPTDAT",
    "ITMREF",
    "QTYSTU",
    "QTYPCU",
    "LOC",
    "TRSTYP",
    "VCRNUMORI",
    "VCRNUM",
    "CREUSR",
    "PALNUM",
]

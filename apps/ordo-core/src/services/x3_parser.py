"""Parse les réponses JSON de la WEB API Sage X3."""

from __future__ import annotations

from typing import Any


def _parse_resource(resource: dict[str, Any], fields: list[str] | None) -> dict[str, Any]:
    """Extrait les champs pertinents d'une ressource SData."""
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
    return row


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
    items = [_parse_resource(r, fields) for r in resources]

    return {
        "count": len(items),
        "items": items,
        "links": raw.get("$links", {}),
    }


def parse_resources(
    resources: list[dict[str, Any]],
    fields: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Parse une liste de ressources SData déjà extraites.

    Args:
        resources: Liste de dicts ``$resources``.
        fields: Liste des champs à extraire.

    Returns:
        Liste de lignes parsées.
    """
    return [_parse_resource(r, fields) for r in resources]


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

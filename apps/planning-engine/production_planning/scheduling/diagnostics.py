"""Diagnostic formatting helpers for scheduling outputs."""


def format_feasibility_cause(result) -> str:
    """Render a business-readable cause from checker result."""
    details: list[str] = []
    if getattr(result, "missing_components", None):
        missing = ", ".join(
            f"{article} x{quantity}"
            for article, quantity in sorted(result.missing_components.items())
        )
        details.append(f"composants indisponibles: {missing}")
    if getattr(result, "alerts", None):
        details.extend(result.alerts[:3])
    if not details:
        return "composants indisponibles"
    return " | ".join(details)


def extract_blocking_components(reason: str) -> str:
    """Extract blocking component list from formatted reason."""
    if not reason:
        return ""

    for part in reason.split("|"):
        chunk = part.strip()
        if chunk.lower().startswith("composants indisponibles:"):
            return chunk.split(":", 1)[1].strip()
        if chunk.lower() == "composants indisponibles":
            return "non détaillé"
    return ""


def format_buffer_shortage_reason(
    requirements: dict[str, float],
    projected_buffer: dict[str, float],
) -> str:
    """Explain which BDH buffer stock is actually missing."""
    shortages = []
    for article, required_qty in sorted(requirements.items()):
        available_qty = projected_buffer.get(article, 0.0)
        if available_qty < required_qty:
            shortages.append(
                f"{article} besoin={round(required_qty, 3)} dispo={round(available_qty, 3)}"
            )
    if not shortages:
        return "stock tampon BDH insuffisant"
    return "stock tampon BDH insuffisant: " + ", ".join(shortages)

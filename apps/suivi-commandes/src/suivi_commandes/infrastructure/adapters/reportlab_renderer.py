from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

from suivi_commandes.application.report_service import ChargeItem, ReportPayload, ReportRow
from suivi_commandes.domain.ports.report_renderer_port import ReportRendererPort

BASE_FONT = "Helvetica"
BASE_FONT_BOLD = "Helvetica-Bold"


def _styles():
    s = getSampleStyleSheet()
    s.add(
        ParagraphStyle(
            name="SectionTitle",
            fontName=BASE_FONT_BOLD,
            fontSize=14,
            leading=18,
            spaceAfter=12,
        )
    )
    s.add(
        ParagraphStyle(
            name="SubSectionTitle",
            fontName=BASE_FONT_BOLD,
            fontSize=11,
            leading=14,
            spaceAfter=6,
            textColor=colors.HexColor("#2c3e50"),
        )
    )
    s.add(
        ParagraphStyle(
            name="Body",
            fontName=BASE_FONT,
            fontSize=9,
            leading=11,
        )
    )
    s.add(
        ParagraphStyle(
            name="Small",
            fontName=BASE_FONT,
            fontSize=8,
            leading=10,
        )
    )
    return s


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(BASE_FONT, 8)
    canvas.setFillColor(colors.grey)
    canvas.drawRightString(A4[0] - 1.5 * cm, 1 * cm, f"Page {doc.page}")
    canvas.drawString(
        1.5 * cm,
        1 * cm,
        f"Généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}",
    )
    canvas.restoreState()


def _build_table(data, col_widths):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("FONTNAME", (0, 0), (-1, 0), BASE_FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(data)):
        bg = colors.HexColor("#f2f2f2") if i % 2 == 0 else colors.white
        style.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style))
    return t


def _build_story(payload: ReportPayload, styles):
    story = []

    # ── Page de garde ───────────────────────────────────────────────
    story.append(Paragraph("Suivi des commandes", styles["SectionTitle"]))
    story.append(Paragraph(f"Dossier : {payload.folder or '—'}", styles["Body"]))
    story.append(
        Paragraph(
            f"Date de référence : {payload.reference_date.strftime('%d/%m/%Y')}",
            styles["Body"],
        )
    )
    story.append(
        Paragraph(
            f"Généré le : {payload.generated_at.strftime('%d/%m/%Y %H:%M')}",
            styles["Body"],
        )
    )
    story.append(Spacer(1, 0.5 * cm))

    total_data = [
        ["Statut", "Nombre"],
        ["À expédier", str(payload.totals.get("a_expedier", 0))],
        ["Allocation à faire", str(payload.totals.get("allocation_a_faire", 0))],
        ["Retard Prod", str(payload.totals.get("retard_prod", 0))],
    ]
    story.append(_build_table(total_data, [8 * cm, 4 * cm]))
    story.append(PageBreak())

    # ── À expédier ──────────────────────────────────────────────────
    if payload.sections.a_expedier:
        story.append(Paragraph("À expédier", styles["SectionTitle"]))
        data = [
            [
                "N° cmde",
                "Article",
                "Désignation",
                "Client",
                "Qté restante",
                "Date exp",
                "Zone",
                "HUM",
                "Action principale",
            ]
        ]
        for r in payload.sections.a_expedier:
            action = r.actions[0].label if r.actions else "—"
            data.append(
                [
                    r.num_commande,
                    r.article,
                    Paragraph(r.designation or "", styles["Body"]),
                    r.nom_client,
                    f"{r.qte_restante:g}",
                    r.date_expedition.strftime("%d/%m/%Y") if r.date_expedition else "—",
                    r.emplacement or "—",
                    r.hum or "—",
                    Paragraph(action, styles["Body"]),
                ]
            )
        story.append(
            _build_table(
                data,
                [
                    2.2 * cm,
                    2 * cm,
                    3 * cm,
                    2.2 * cm,
                    1.5 * cm,
                    1.8 * cm,
                    2 * cm,
                    1.5 * cm,
                    3.4 * cm,
                ],
            )
        )
        story.append(Spacer(1, 0.5 * cm))

    # ── Allocation à faire ──────────────────────────────────────────
    if payload.sections.allocation_a_faire:
        story.append(Paragraph("Allocation à faire", styles["SectionTitle"]))
        data = [
            [
                "N° cmde",
                "Article",
                "Besoin net",
                "Alloc. virtuelle",
                "Date exp",
                "CQ ?",
                "Action",
            ]
        ]
        for r in payload.sections.allocation_a_faire:
            action = r.actions[0].label if r.actions else "—"
            data.append(
                [
                    r.num_commande,
                    r.article,
                    f"{r.besoin_net:g}",
                    f"{r.qte_allouee_virtuelle:g}",
                    r.date_expedition.strftime("%d/%m/%Y") if r.date_expedition else "—",
                    "Oui" if r.alerte_cq_statut else "Non",
                    Paragraph(action, styles["Body"]),
                ]
            )
        story.append(
            _build_table(
                data,
                [2.5 * cm, 2.2 * cm, 1.8 * cm, 2 * cm, 1.8 * cm, 1.2 * cm, 4.9 * cm],
            )
        )
        story.append(Spacer(1, 0.5 * cm))

    # ── Retard Prod ─────────────────────────────────────────────────
    if payload.sections.retard_prod_groups:
        story.append(Paragraph("Retard de production", styles["SectionTitle"]))
        for cause_type, rows in payload.sections.retard_prod_groups.items():
            story.append(Paragraph(cause_type.replace("_", " ").title(), styles["SubSectionTitle"]))
            headers = [
                "N° cmde",
                "Article",
                "Désignation",
                "Client",
                "Qté restante",
                "Jours retard",
                "Action",
            ]
            extra_col = any(r.composants_manquants for r in rows)
            if extra_col:
                headers.insert(-1, "Composants manquants")
            data = [headers]
            for r in rows:
                action = r.actions[0].label if r.actions else "—"
                row_cells = [
                    r.num_commande,
                    r.article,
                    Paragraph(r.designation or "", styles["Body"]),
                    r.nom_client,
                    f"{r.qte_restante:g}",
                ]
                if extra_col:
                    row_cells.append(Paragraph(r.composants_manquants or "", styles["Small"]))
                row_cells.extend([
                    str(r.jours_retard) if r.jours_retard is not None else "—",
                    Paragraph(action, styles["Body"]),
                ])
                data.append(row_cells)
            widths = [2.2 * cm, 2 * cm, 2.8 * cm, 2.2 * cm, 1.5 * cm]
            if extra_col:
                widths.append(3 * cm)
            widths.extend([1.5 * cm, 3.4 * cm])
            story.append(_build_table(data, widths))
            story.append(Spacer(1, 0.3 * cm))

    # ── Charge retard ───────────────────────────────────────────────
    if payload.charge_retard:
        story.append(Paragraph("Charge retard par poste", styles["SectionTitle"]))
        data = [["Poste", "Libellé", "Heures"]]
        total = 0.0
        for c in payload.charge_retard:
            data.append([c.poste, c.libelle, f"{c.heures:.2f}"])
            total += c.heures
        data.append(["", "Total", f"{total:.2f}"])
        story.append(_build_table(data, [3 * cm, 10 * cm, 3 * cm]))

    return story


class ReportlabRenderer(ReportRendererPort):
    """Rendu PDF via ReportLab — un document structuré par section."""

    def render(self, payload: ReportPayload) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            rightMargin=1.5 * cm,
            leftMargin=1.5 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )
        styles = _styles()
        story = _build_story(payload, styles)
        doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
        buf.seek(0)
        return buf.read()

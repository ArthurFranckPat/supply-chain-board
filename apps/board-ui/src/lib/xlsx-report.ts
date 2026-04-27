import * as XLSX from 'xlsx'
import type { ReportPayload } from '@/types/suivi-commandes'

export function generateXlsx(payload: ReportPayload): Blob {
  const wb = XLSX.utils.book_new()

  // ── 1. À expédier ───────────────────────────────────────────────
  if (payload.sections.a_expedier.length > 0) {
    const ws = XLSX.utils.json_to_sheet(
      payload.sections.a_expedier.map((r) => ({
        'N° cmde': r.num_commande,
        Article: r.article,
        Désignation: r.designation,
        Client: r.nom_client,
        'Qté restante': r.qte_restante,
        'Date exp': r.date_expedition,
        Zone: r.emplacement,
        HUM: r.hum,
        Action: r.actions.map((a) => a.label).join(' / '),
      })),
    )
    XLSX.utils.book_append_sheet(wb, ws, 'À expédier')
  }

  // ── 2. Allocation à faire ───────────────────────────────────────
  if (payload.sections.allocation_a_faire.length > 0) {
    const ws = XLSX.utils.json_to_sheet(
      payload.sections.allocation_a_faire.map((r) => ({
        'N° cmde': r.num_commande,
        Article: r.article,
        'Besoin net': r.besoin_net,
        'Alloc. virtuelle': r.qte_allouee_virtuelle,
        'Date exp': r.date_expedition,
        'CQ ?': r.alerte_cq_statut ? 'Oui' : 'Non',
        Action: r.actions.map((a) => a.label).join(' / '),
      })),
    )
    XLSX.utils.book_append_sheet(wb, ws, 'Allocation à faire')
  }

  // ── 3. Retard Prod ──────────────────────────────────────────────
  const retardRows: Array<Record<string, unknown>> = []
  for (const [cause, rows] of Object.entries(payload.sections.retard_prod_groups)) {
    for (const r of rows) {
      retardRows.push({
        Cause: cause,
        'N° cmde': r.num_commande,
        Article: r.article,
        Désignation: r.designation,
        Client: r.nom_client,
        'Qté restante': r.qte_restante,
        'Jours retard': r.jours_retard,
        'Composants manquants': r.composants_manquants,
        Action: r.actions.map((a) => a.label).join(' / '),
      })
    }
  }
  if (retardRows.length > 0) {
    const ws = XLSX.utils.json_to_sheet(retardRows)
    XLSX.utils.book_append_sheet(wb, ws, 'Retard Prod')
  }

  // ── 4. Charge retard ────────────────────────────────────────────
  if (payload.charge_retard.length > 0) {
    const ws = XLSX.utils.json_to_sheet(
      payload.charge_retard.map((c) => ({
        Poste: c.poste,
        Libellé: c.libelle,
        Heures: c.heures,
      })),
    )
    XLSX.utils.book_append_sheet(wb, ws, 'Charge retard')
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * « Quand la matière rentre » pour les OF bloqués d'un calcul de faisabilité.
 *
 * Greffé sur `board-feasibility` : le tooltip d'un badge doit pouvoir dire la date d'entrée
 * du composant qui bloque, sans attendre l'ouverture du panneau Matières.
 *
 * L'allocation est la MÊME que celle de /ruptures et du panneau (`resolveCoveringReception`
 * avec `alreadyConsumed`), dans l'ORDRE DE LA FILE : une réception ne peut pas couvrir deux
 * OF à la fois. Deux allocations écrites séparément finiraient par diverger, et un tooltip
 * qui annonce une date que le panneau contredit est pire que pas de date du tout.
 */

import boardDataset from '#services/board_dataset'
import { buildCoverageByOf, type OfCoverage } from '#app/domain/material_shortage_summary'
import { resolveCoveringReception } from '#app/domain/shortages'
import {
  groupReceptionsByArticle,
  RECEPTION_LOOKBACK_DAYS,
  RECEPTION_OVERDUE_MIN_QTY,
} from '#repositories/reception_repository'
import type { OrderImpactResult } from '#app/domain/order_impacts'
import type { ReceptionRecord } from '#app/domain/recursive_checker'

export async function loadBoardCoverage(
  result: OrderImpactResult
): Promise<Record<string, OfCoverage>> {
  const bloques = result.ofs.filter(
    (o) => o.feasible === false && Object.keys(o.missingComponents ?? {}).length > 0
  )
  if (bloques.length === 0) return {}

  /** Date d'expédition la plus urgente servie par l'OF — c'est elle qui ordonne la file. */
  const shipment = new Map<string, string>()
  for (const order of result.orders) {
    if (!order.dateExpedition) continue
    for (const of of order.ofs) {
      const known = shipment.get(of.numOf)
      if (!known || order.dateExpedition < known) shipment.set(of.numOf, order.dateExpedition)
    }
  }

  // Réceptions NON bornées à la fenêtre : un PO qui arrive après doit donner une date, pas
  // un « rien en commande » qui ferait recommander en double. Lookback pour garder les PO
  // attendues dans le passé et non reçues.
  const receptionFrom = new Date()
  receptionFrom.setDate(receptionFrom.getDate() - RECEPTION_LOOKBACK_DAYS)
  receptionFrom.setHours(0, 0, 0, 0)
  const receptionsByArticle = await boardDataset
    .getReceptions()
    .then((flows) => groupReceptionsByArticle(flows, receptionFrom))
    .catch(() => new Map<string, ReceptionRecord[]>())

  return buildCoverageByOf(
    bloques.map((o) => ({
      numOf: o.numOf,
      shipmentIso: shipment.get(o.numOf) ?? null,
      statutNum: o.statutNum,
      missingComponents: o.missingComponents,
    })),
    receptionsByArticle,
    { overdueMinQty: RECEPTION_OVERDUE_MIN_QTY, resolve: resolveCoveringReception }
  )
}
